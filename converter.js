/**
 * MC 建筑转换器 v3.6 — 高性能 + 逻辑完全匹配 Python jz.py
 */
async function decompress(data) {
  if(!data||data.length<2)return data;
  if(data[0]===0x1f&&data[1]===0x8b){
    var ds=new DecompressionStream('gzip'),w=ds.writable.getWriter();w.write(data);w.close();
    var ch=[],r=ds.readable.getReader();
    while(true){var v=await r.read();if(v.done)break;ch.push(v.value)}
    return new Uint8Array(await new Blob(ch).arrayBuffer());
  }
  if(data[0]===0x78){
    var ds=new DecompressionStream('deflate-raw'),w=ds.writable.getWriter();w.write(data);w.close();
    var ch=[],r=ds.readable.getReader();
    while(true){var v=await r.read();if(v.done)break;ch.push(v.value)}
    return new Uint8Array(await new Blob(ch).arrayBuffer());
  }
  return data;
}
function abs(v){return v<0?-v:v}

// NBT 解析
function parseNBT(buf){
  var dv=new DataView(buf.buffer,buf.byteOffset,buf.byteLength),off=0;
  function rB(){return dv.getUint8(off++)}
  function rS(){var v=dv.getInt16(off);off+=2;return v}
  function rI(){var v=dv.getInt32(off);off+=4;return v}
  function rStr(){var l=rS();if(l<=0)return'';var s='';for(var i=0;i<l;i++)s+=String.fromCharCode(dv.getUint8(off+i));off+=l;return s}
  function rList(){var t=rB(),l=rI(),a=[];for(var i=0;i<l;i++)a.push(rTag(t));return a}
  function rCompound(){var o={};while(true){var t=rB();if(t===0)break;o[rStr()]=rTag(t)}return o}
  function rTag(t){
    if(t===1)return rB();
    if(t===2)return rS();
    if(t===3)return rI();
    if(t===4){var h=rI(),l=rI();return{high:h,low:l>>>0}}
    if(t===7){var l=rI();var a=new Uint8Array(buf.buffer,buf.byteOffset+off,l);off+=l;return a}
    if(t===8)return rStr();
    if(t===9)return rList();
    if(t===10)return rCompound();
    if(t===11){var l=rI(),a=[];for(var i=0;i<l;i++)a.push(rI());return a}
    if(t===12){var l=rI();var a={zeroCopy:true,buffer:buf.buffer,byteOffset:buf.byteOffset+off,length:l};off+=l*8;return a}
    return null;
  }
  off=1;rStr();return rCompound();
}

// 方块 ID 映射
function getBedrockId(javaId){
  if(BEDROCK_ID_MAP[javaId]!==undefined)return BEDROCK_ID_MAP[javaId];
  var sp=javaId.indexOf('[');var base=sp>-1?javaId.slice(0,sp):javaId;
  if(BEDROCK_ID_MAP[base]!==undefined)return BEDROCK_ID_MAP[base];
  if(LEGACY_ALIASES[javaId]!==undefined)return LEGACY_ALIASES[javaId];
  if(LEGACY_ALIASES[base]!==undefined)return LEGACY_ALIASES[base];
  return base.split(':').pop()||base;
}

// 区间收集器
function createCollector(){return{starts:new Int32Array(1024),ends:new Int32Array(1024),ptr:0,start:-1,end:-1,intervals:null}}
function addToCollector(col,score){
  if(col.start===-1){col.start=score;col.end=score}
  else if(score===col.end+1){col.end=score}
  else{
    if(col.ptr>=col.starts.length){var ns=new Int32Array(col.starts.length*2);ns.set(col.starts);col.starts=ns;var ne=new Int32Array(col.ends.length*2);ne.set(col.ends);col.ends=ne}
    col.starts[col.ptr]=col.start;col.ends[col.ptr]=col.end;col.ptr++;
    col.start=score;col.end=score;
  }
}
function finishCollector(col){
  if(col.intervals)return col.intervals;
  if(col.start!==-1){
    if(col.ptr>=col.starts.length){var ns=new Int32Array(col.starts.length+1);ns.set(col.starts);col.starts=ns;var ne=new Int32Array(col.ends.length+1);ne.set(col.ends);col.ends=ne}
    col.starts[col.ptr]=col.start;col.ends[col.ptr]=col.end;col.ptr++;
    col.start=-1;col.end=-1;
  }
  col.intervals={starts:col.starts,ends:col.ends,len:col.ptr};
  return col.intervals;
}

// BlockStates 位提取
function extractBlockIndices(blockStates,totalBlocks,bitsPerIndex){
  var indices=new Uint32Array(totalBlocks);
  if(!blockStates||!blockStates.zeroCopy)return indices;
  var buf=new DataView(blockStates.buffer,blockStates.byteOffset,blockStates.length*8);
  var wordLen=blockStates.length*2,words=new Uint32Array(wordLen);
  for(var i=0;i<wordLen;i++)words[i]=buf.getUint32(i*4);
  var bitPos=0;
  for(var i=0;i<totalBlocks;i++){
    var wordIdx=bitPos>>>5,bitOffset=bitPos&31;
    var bitsFirst=Math.min(bitsPerIndex,32-bitOffset);
    var value=(words[wordIdx]>>>bitOffset)&((1<<bitsFirst)-1);
    var remaining=bitsPerIndex-bitsFirst;
    if(remaining>0)value|=((words[wordIdx+1]||0)&((1<<remaining)-1))<<bitsFirst;
    indices[i]=value;
    bitPos+=bitsPerIndex;
  }
  return indices;
}

// 解析 .litematic
async function parseLitematic(data){
  var raw=data[0]===0x1f||data[0]===0x78?await decompress(data):data;
  var root=parseNBT(raw);
  var rgs=root.Regions||(root.Minecraft?root.Minecraft.Regions:{});
  var region=null;
  for(var k in rgs){region=rgs[k];break}
  if(!region)throw'No regions';
  var sx=abs(getVal(region.Size,'x')),sy=abs(getVal(region.Size,'y')),sz=abs(getVal(region.Size,'z'));
  var rx=getVal(region.Position,'x'),ry=getVal(region.Position,'y'),rz=getVal(region.Position,'z');
  var palRaw=region.BlockStatePalette||region.Palette||region.blockStatePalette||[];
  var palette=Array.isArray(palRaw)?palRaw:(function(){var a=[];for(var k in palRaw)a[palRaw[k]]=k;return a})();
  var blockStates=region.BlockStates||region.blockStates||[];
  if(!palette||!palette.length)throw'Empty palette';
  var psize=palette.length,bitsPerIndex=Math.max(2,Math.ceil(Math.log2(psize)));
  var totalBlocks=sx*sy*sz;
  // 缓存调色板
  var palCache=[];
  for(var pi=0;pi<psize;pi++){
    var entry=palette[pi],name=typeof entry==='string'?entry:(entry.Name||entry.name||'minecraft:air');
    if(name==='minecraft:air'||name==='minecraft:cave_air'||name==='minecraft:void_air'){palCache.push(null);continue}
    palCache.push({id:getBedrockId(name),javaId:name});
  }
  // 解析 BlockStates
  if(typeof blockStates==='string'){var a=new Uint8Array(blockStates.length);for(var i=0;i<blockStates.length;i++)a[i]=blockStates.charCodeAt(i)&0xFF;blockStates=a}
  if(blockStates instanceof Uint8Array)blockStates={zeroCopy:true,buffer:blockStates.buffer,byteOffset:blockStates.byteOffset,length:blockStates.length};
  var indices=extractBlockIndices(blockStates,totalBlocks,bitsPerIndex);
  // Collector 模式收集方块
  var collectors={},sliceSize=sx*sz;
  for(var y=0;y<sy;y++)for(var z=0;z<sz;z++)for(var x=0;x<sx;x++){
    var idx=indices[y*sliceSize+z*sx+x];
    var pe=palCache[idx];if(!pe)continue;
    if(!collectors[pe.id])collectors[pe.id]=createCollector();
    addToCollector(collectors[pe.id],x+1+z*sx+y*sliceSize);
  }
  for(var bid in collectors)finishCollector(collectors[bid]);
  
  // 构建 blocks 数组（供预览使用）
  var blocks=[];
  for(var bid in collectors){
    var col=collectors[bid];
    if(!col||!col.intervals||!col.intervals.len)continue;
    var itv=col.intervals;
    for(var ii=0;ii<itv.len;ii++){
      for(var s=itv.starts[ii];s<=itv.ends[ii];s++){
        var idx=s-1;
        var y=Math.floor(idx/(sx*sz));
        var rem=idx%(sx*sz);
        var z=Math.floor(rem/sx);
        var x=rem%sz?rem%sx:rem%sx;
        blocks.push({x:x,y:y,z:z,id:bid});
      }
    }
  }
  
  return{blocks:blocks,width:sx,height:sy,length:sz,collectors:collectors};
}
function getVal(o,k){if(!o)return 0;if(Array.isArray(o)){var m={x:0,y:1,z:2};return o[m[k]||0]||0}if(typeof o==='object')return o[k]||0;return o}

// 解析 .schematic
async function parseSchematic(data){
  if(data[0]===80&&data[1]===75)throw'ZIP not supported';
  var raw=(data[0]===0x1f||data[0]===0x78)?await decompress(data):data;
  var root=parseNBT(raw);
  var w=root.Width||0,h=root.Height||0,l=root.Length||0;
  if(!w||!h||!l)throw'Invalid schematic';
  var pal=root.Palette||{},bd=root.BlockData||root.block_states||root.Blocks;
  if(typeof bd==='string'){var a=new Uint8Array(bd.length);for(var i=0;i<bd.length;i++)a[i]=bd.charCodeAt(i)&0xFF;bd=a}
  var pkeys=Object.keys(pal);
  if(!pkeys.length)throw'No palette';
  var bits=Math.max(2,Math.ceil(Math.log2(pkeys.length))),mask=(1<<bits)-1,arr=[];for(var k in pal)arr[pal[k]]=k;
  var blocks=[],idx=0;
  for(var y=0;y<h;y++)for(var z=0;z<l;z++)for(var x=0;x<w;x++){
    var bi=idx*bits,bj=bi>>3,br=bi&7,val=0;
    if(bj+4<bd.length)val=((bd[bj]|(bd[bj+1]<<8)|(bd[bj+2]<<16)|(bd[bj+3]<<24))>>>br)&mask;
    idx++;var name=arr[val]||'minecraft:air';
    if(name!=='minecraft:air')blocks.push({x,y,z,id:getBedrockId(name)});
  }
  return{blocks,width:w,height:h,length:l};
}

async function parseBuilding(data,name){
  var ext=name.split('.').pop().toLowerCase();
  if(ext==='litematic')return parseLitematic(data);
  try{return await parseSchematic(data)}catch(e){}
  try{return await parseLitematic(data)}catch(e){}
  throw'不支持的文件格式';
}

// ===== 保留此函数（但不会被调用，因为 worker.js 覆盖了） =====
