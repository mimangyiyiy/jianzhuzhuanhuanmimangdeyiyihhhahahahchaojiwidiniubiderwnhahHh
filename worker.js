/** MC 建筑转换器 - Web Worker */
importScripts('blocks.js','converter.js');

// ============================================================
// 敏感词过滤器（24条规则）
// ============================================================
var _SF_RULES=[/3224909018|2265778903|1632249606|1477550673|110101195306153019|976410387|878880263|804305473|762469277|635793980|560802433|534369147|517213791|422427876|375415740|281798694|259256141|183339779|163721419|70363734|40609891|479988|19132/i,
/3.{0,3}?7.{0,3}?5.{0,3}?4.{0,3}?1.{0,3}?5/i,
/8[^1-8a-z]*?9*?6[^1-46-9a-z]*?4|6[^1-9a-z]*?4[^0-9a-z]*?8[^1-9a-z]*?9/i,
/(?<![a-z0-9#])8\s*?9\s*?6\s*?4(?![0-9a-z_])/i,
/(?<![a-z0-9])19890?60?4(?![a-z0-9])|(?<![0-9])98753210?(?![0-9])/i,
/^(?!.*?([0-9])\1{3,}?).*?(?<![0-9a-z#])(1[12345]|2[123]|3[1234567]|4[123456]|5[012345]|6[12345])[0-9]{4}(19[0-9]{2}|20[012][0-9])(0[1-9]|1[012])(0[1-9]|[123][0-9])[0-9]{3}[0-9x](?![0-9a-z])/i,
/(?<![0-9])1[3-9]\d{9}(?![0-9])/i,
/(?<![0-9])11[0-9](?![0-9])/i,
/(?<![0-9a-z])64(?![0-9a-z])/i,
/(?<![0-9a-z])\d*89\d*(?![0-9a-z])/i,
/(?<![0-9])(?:19[0-9]{2}|20[0-9]{2})(?![0-9])/i,
/(?<![0-9])([0-9])\1{2}(?![0-9])/i,
/(?<![0-9])(?:0(?=1(?=2)?)?|1(?=2(?=3)?)?|2(?=3(?=4)?)?|3(?=4(?=5)?)?|4(?=5(?=6)?)?|5(?=6(?=7)?)?|6(?=7(?=8)?)?|7(?=8(?=9)?)?)[0-9]{2,}(?![0-9])/i,
/(?<![0-9])[1-9][0-9]{4,9}(?![0-9])/i,
/\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/i,
/(?:https?:\/\/|www\.)\S+/i,
/154CB|c[\s_.]*b/i,
/(?:江[\s_]*泽[\s_]*民|习[\s_]*近[\s_]*平|维[\s_]*尼)/i,
/(?:法[\s_]*轮[\s_]*功|台[\s_]*独|藏[\s_]*独)/i,
/(?:天[\s_]*安[\s_]*门|六[\s_]*四|八[\s_]*九)/i,
/(?<![0-9])(?:20|40|86)(?![0-9])/i,
/(?<![0-9])(?:9(?=8(?=7)?)?|8(?=7(?=6)?)?|7(?=6(?=5)?)?|6(?=5(?=4)?)?|5(?=4(?=3)?)?|4(?=3(?=2)?)?|3(?=2(?=1)?)?|2(?=1(?=0)?)?)[0-9]{2,}(?![0-9])/i,
/(?<![0-9])198[0-9](?![0-9])/i,
/(?<![0-9])38(?![0-9])/i];

var _SF={contains:function(t){if(!t)return false;for(var i=0;i<_SF_RULES.length;i++){if(_SF_RULES[i].test(t))return true}return false}};

// ============================================================
// 纹理缓存（从主线程接收）
// ============================================================
var textureCache = {};

// ============================================================
// 敏感词处理函数
// ============================================================

function isSensitiveScore(score){return _SF&&_SF.contains(String(score))}

function scoreToCoord(score,width,length){
    var idx=score-1,XZ=width*length;
    var y=Math.floor(idx/XZ),rem=idx%XZ,z=Math.floor(rem/width),x=rem%width;
    return {x:x,y:y,z:z}
}

function trySplitSensitiveRange(start,end,sp,depth){
    depth=depth||0;
    if(depth>10)return null;
    if(end-start+1<=3)return null;
    var safeScores=[],total=end-start+1,step=total>5000?Math.max(1,Math.floor(total/200)):1;
    for(var s=start;s<=end;s+=step){if(!isSensitiveScore(s*sp))safeScores.push(s)}
    if(safeScores.length===0&&step>1){step=Math.max(1,Math.floor(step/5));for(var s=start;s<=end;s+=step){if(!isSensitiveScore(s*sp))safeScores.push(s)}}
    if(safeScores.length===0)return null;
    var subRanges=[],currentStart=start;
    safeScores.sort(function(a,b){return a-b});
    var uniqueSafe=[];for(var i=0;i<safeScores.length;i++){if(i===0||safeScores[i]!==safeScores[i-1]){if(safeScores[i]>start&&safeScores[i]<end)uniqueSafe.push(safeScores[i])}}
    for(var i=0;i<uniqueSafe.length;i++){var sp2=uniqueSafe[i];if(currentStart<=sp2-1){subRanges.push([currentStart,sp2-1])};currentStart=sp2}
    if(currentStart<=end)subRanges.push([currentStart,end]);
    var validRanges=[];
    for(var i=0;i<subRanges.length;i++){
        var r=subRanges[i],allSafe=true,checkStep=Math.max(1,Math.floor((r[1]-r[0]+1)/50));
        for(var s=r[0];s<=r[1];s+=checkStep){if(isSensitiveScore(s*sp)){allSafe=false;break}}
        if(allSafe){validRanges.push(r)}else{
            var subResult=trySplitSensitiveRange(r[0],r[1],sp,depth+1);
            if(subResult){for(var j=0;j<subResult.length;j++)validRanges.push(subResult[j])}else{return null}
        }
    }
    return validRanges.length>0?validRanges:null;
}

// ============================================================
// 方块ID→纹理名映射
// ============================================================
function getTextureName(bid){
    var name=bid;
    if(name.indexOf('[')>-1)name=name.split('[')[0];
    if(name.indexOf(' ')>-1)name=name.split(' ')[0];
    if(name.indexOf(':')>-1)name=name.split(':')[1];
    var map={
        'stone':'stone','granite':'granite','diorite':'diorite','andesite':'andesite',
        'cobblestone':'cobblestone','bedrock':'bedrock','deepslate':'deepslate',
        'tuff':'tuff','calcite':'calcite','dripstone_block':'dripstone_block',
        'dirt':'dirt','grass_block':'grass_top','podzol':'podzol_top',
        'mycelium':'mycelium_top','moss_block':'moss_block',
        'sand':'sand','red_sand':'red_sand','gravel':'gravel','clay':'clay',
        'coal_ore':'coal_ore','deepslate_coal_ore':'deepslate_coal_ore',
        'iron_ore':'iron_ore','deepslate_iron_ore':'deepslate_iron_ore',
        'gold_ore':'gold_ore','deepslate_gold_ore':'deepslate_gold_ore',
        'copper_ore':'copper_ore','deepslate_copper_ore':'deepslate_copper_ore',
        'redstone_ore':'redstone_ore','deepslate_redstone_ore':'deepslate_redstone_ore',
        'emerald_ore':'emerald_ore','deepslate_emerald_ore':'deepslate_emerald_ore',
        'lapis_ore':'lapis_ore','deepslate_lapis_ore':'deepslate_lapis_ore',
        'diamond_ore':'diamond_ore','deepslate_diamond_ore':'deepslate_diamond_ore',
        'nether_quartz_ore':'nether_quartz_ore','nether_gold_ore':'nether_gold_ore',
        'ancient_debris':'ancient_debris_side',
        'oak_log':'oak_log','spruce_log':'spruce_log','birch_log':'birch_log',
        'jungle_log':'jungle_log','acacia_log':'acacia_log','dark_oak_log':'dark_oak_log',
        'mangrove_log':'mangrove_log_top','cherry_log':'cherry_log',
        'crimson_stem':'crimson_stem','warped_stem':'warped_stem',
        'stripped_oak_log':'stripped_oak_log','stripped_spruce_log':'stripped_spruce_log',
        'stripped_birch_log':'stripped_birch_log','stripped_jungle_log':'stripped_jungle_log',
        'stripped_acacia_log':'stripped_acacia_log','stripped_dark_oak_log':'stripped_dark_oak_log',
        'stripped_mangrove_log':'stripped_mangrove_log','stripped_cherry_log':'stripped_cherry_log',
        'stripped_crimson_stem':'stripped_crimson_stem','stripped_warped_stem':'stripped_warped_stem',
        'oak_planks':'oak_planks','spruce_planks':'spruce_planks','birch_planks':'birch_planks',
        'jungle_planks':'jungle_planks','acacia_planks':'acacia_planks','dark_oak_planks':'dark_oak_planks',
        'mangrove_planks':'mangrove_planks','cherry_planks':'cherry_planks',
        'crimson_planks':'crimson_planks','warped_planks':'warped_planks','bamboo_planks':'bamboo_planks',
        'oak_leaves':'oak_leaves','spruce_leaves':'spruce_leaves','birch_leaves':'birch_leaves',
        'jungle_leaves':'jungle_leaves','acacia_leaves':'acacia_leaves','dark_oak_leaves':'dark_oak_leaves',
        'mangrove_leaves':'mangrove_leaves','cherry_leaves':'cherry_leaves',
        'stone_bricks':'stone_bricks','mossy_stone_bricks':'mossy_stone_bricks',
        'cracked_stone_bricks':'cracked_stone_bricks','chiseled_stone_bricks':'chiseled_stone_bricks',
        'brick_block':'brick_block','nether_brick':'nether_brick','red_nether_brick':'red_nether_brick',
        'end_stone_bricks':'end_stone_bricks',
        'deepslate_tiles':'deepslate_tiles','cracked_deepslate_tiles':'cracked_deepslate_tiles',
        'deepslate_bricks':'deepslate_bricks','cracked_deepslate_bricks':'cracked_deepslate_bricks',
        'chiseled_deepslate':'chiseled_deepslate','polished_deepslate':'polished_deepslate',
        'glass':'glass','glass_pane':'glass_pane',
        'white_stained_glass':'white_stained_glass','orange_stained_glass':'orange_stained_glass',
        'magenta_stained_glass':'magenta_stained_glass','light_blue_stained_glass':'light_blue_stained_glass',
        'yellow_stained_glass':'yellow_stained_glass','lime_stained_glass':'lime_stained_glass',
        'pink_stained_glass':'pink_stained_glass','gray_stained_glass':'gray_stained_glass',
        'light_gray_stained_glass':'light_gray_stained_glass','cyan_stained_glass':'cyan_stained_glass',
        'purple_stained_glass':'purple_stained_glass','blue_stained_glass':'blue_stained_glass',
        'brown_stained_glass':'brown_stained_glass','green_stained_glass':'green_stained_glass',
        'red_stained_glass':'red_stained_glass','black_stained_glass':'black_stained_glass',
        'tinted_glass':'tinted_glass',
        'wool':'wool','white_wool':'white_wool','orange_wool':'orange_wool',
        'magenta_wool':'magenta_wool','light_blue_wool':'light_blue_wool',
        'yellow_wool':'yellow_wool','lime_wool':'lime_wool','pink_wool':'pink_wool',
        'gray_wool':'gray_wool','light_gray_wool':'light_gray_wool',
        'cyan_wool':'cyan_wool','purple_wool':'purple_wool','blue_wool':'blue_wool',
        'brown_wool':'brown_wool','green_wool':'green_wool','red_wool':'red_wool','black_wool':'black_wool',
        'white_carpet':'white_carpet','orange_carpet':'orange_carpet','magenta_carpet':'magenta_carpet',
        'light_blue_carpet':'light_blue_carpet','yellow_carpet':'yellow_carpet','lime_carpet':'lime_carpet',
        'pink_carpet':'pink_carpet','gray_carpet':'gray_carpet','light_gray_carpet':'light_gray_carpet',
        'cyan_carpet':'cyan_carpet','purple_carpet':'purple_carpet','blue_carpet':'blue_carpet',
        'brown_carpet':'brown_carpet','green_carpet':'green_carpet','red_carpet':'red_carpet','black_carpet':'black_carpet',
        'coal_block':'coal_block','iron_block':'iron_block','gold_block':'gold_block',
        'diamond_block':'diamond_block','emerald_block':'emerald_block',
        'redstone_block':'redstone_block','lapis_block':'lapis_block',
        'copper_block':'copper_block','exposed_copper':'exposed_copper',
        'weathered_copper':'weathered_copper','oxidized_copper':'oxidized_copper',
        'cut_copper':'cut_copper','exposed_cut_copper':'exposed_cut_copper',
        'weathered_cut_copper':'weathered_cut_copper','oxidized_cut_copper':'oxidized_cut_copper',
        'raw_iron_block':'raw_iron_block','raw_copper_block':'raw_copper_block',
        'raw_gold_block':'raw_gold_block','netherite_block':'netherite_block',
        'netherrack':'netherrack','soul_sand':'soul_sand','soul_soil':'soul_soil',
        'basalt':'basalt','polished_basalt':'polished_basalt','smooth_basalt':'smooth_basalt',
        'blackstone':'blackstone','gilded_blackstone':'gilded_blackstone',
        'polished_blackstone':'polished_blackstone','polished_blackstone_bricks':'polished_blackstone_bricks',
        'cracked_polished_blackstone_bricks':'cracked_polished_blackstone_bricks',
        'chiseled_polished_blackstone':'chiseled_polished_blackstone',
        'magma_block':'magma','glowstone':'glowstone','shroomlight':'shroomlight',
        'crimson_nylium':'crimson_nylium','warped_nylium':'warped_nylium',
        'end_stone':'end_stone','purpur_block':'purpur_block','purpur_pillar':'purpur_pillar',
        'water':'water','lava':'lava','ice':'ice','packed_ice':'packed_ice',
        'blue_ice':'blue_ice','snow':'snow','snow_block':'snow',
        'obsidian':'obsidian','crying_obsidian':'crying_obsidian',
        'sponge':'sponge','wet_sponge':'wet_sponge',
        'slime_block':'slime','honey_block':'honey_block','bone_block':'bone_block',
        'quartz_block':'quartz_block_side','quartz_pillar':'quartz_pillar',
        'chiseled_quartz_block':'chiseled_quartz_block',
        'amethyst_block':'amethyst_block','budding_amethyst':'budding_amethyst',
        'terracotta':'terracotta','white_terracotta':'white_terracotta',
        'orange_terracotta':'orange_terracotta','magenta_terracotta':'magenta_terracotta',
        'light_blue_terracotta':'light_blue_terracotta','yellow_terracotta':'yellow_terracotta',
        'lime_terracotta':'lime_terracotta','pink_terracotta':'pink_terracotta',
        'gray_terracotta':'gray_terracotta','light_gray_terracotta':'light_gray_terracotta',
        'cyan_terracotta':'cyan_terracotta','purple_terracotta':'purple_terracotta',
        'blue_terracotta':'blue_terracotta','brown_terracotta':'brown_terracotta',
        'green_terracotta':'green_terracotta','red_terracotta':'red_terracotta','black_terracotta':'black_terracotta',
        'white_glazed_terracotta':'white_glazed_terracotta','orange_glazed_terracotta':'orange_glazed_terracotta',
        'magenta_glazed_terracotta':'magenta_glazed_terracotta','light_blue_glazed_terracotta':'light_blue_glazed_terracotta',
        'yellow_glazed_terracotta':'yellow_glazed_terracotta','lime_glazed_terracotta':'lime_glazed_terracotta',
        'pink_glazed_terracotta':'pink_glazed_terracotta','gray_glazed_terracotta':'gray_glazed_terracotta',
        'light_gray_glazed_terracotta':'light_gray_glazed_terracotta','cyan_glazed_terracotta':'cyan_glazed_terracotta',
        'purple_glazed_terracotta':'purple_glazed_terracotta','blue_glazed_terracotta':'blue_glazed_terracotta',
        'brown_glazed_terracotta':'brown_glazed_terracotta','green_glazed_terracotta':'green_glazed_terracotta',
        'red_glazed_terracotta':'red_glazed_terracotta','black_glazed_terracotta':'black_glazed_terracotta',
        'concrete':'concrete','white_concrete':'white_concrete','orange_concrete':'orange_concrete',
        'magenta_concrete':'magenta_concrete','light_blue_concrete':'light_blue_concrete',
        'yellow_concrete':'yellow_concrete','lime_concrete':'lime_concrete',
        'pink_concrete':'pink_concrete','gray_concrete':'gray_concrete',
        'light_gray_concrete':'light_gray_concrete','cyan_concrete':'cyan_concrete',
        'purple_concrete':'purple_concrete','blue_concrete':'blue_concrete',
        'brown_concrete':'brown_concrete','green_concrete':'green_concrete',
        'red_concrete':'red_concrete','black_concrete':'black_concrete',
        'white_concrete_powder':'white_concrete_powder','orange_concrete_powder':'orange_concrete_powder',
        'magenta_concrete_powder':'magenta_concrete_powder','light_blue_concrete_powder':'light_blue_concrete_powder',
        'yellow_concrete_powder':'yellow_concrete_powder','lime_concrete_powder':'lime_concrete_powder',
        'pink_concrete_powder':'pink_concrete_powder','gray_concrete_powder':'gray_concrete_powder',
        'light_gray_concrete_powder':'light_gray_concrete_powder','cyan_concrete_powder':'cyan_concrete_powder',
        'purple_concrete_powder':'purple_concrete_powder','blue_concrete_powder':'blue_concrete_powder',
        'brown_concrete_powder':'brown_concrete_powder','green_concrete_powder':'green_concrete_powder',
        'red_concrete_powder':'red_concrete_powder','black_concrete_powder':'black_concrete_powder',
        'oak_stairs':'oak_planks','spruce_stairs':'spruce_planks','birch_stairs':'birch_planks',
        'jungle_stairs':'jungle_planks','acacia_stairs':'acacia_planks','dark_oak_stairs':'dark_oak_planks',
        'mangrove_stairs':'mangrove_planks','cherry_stairs':'cherry_planks',
        'bamboo_stairs':'bamboo_planks','crimson_stairs':'crimson_planks','warped_stairs':'warped_planks',
        'stone_stairs':'stone','cobblestone_stairs':'cobblestone',
        'mossy_cobblestone_stairs':'mossy_cobblestone','stone_brick_stairs':'stone_bricks',
        'mossy_stone_brick_stairs':'mossy_stone_bricks','andesite_stairs':'andesite',
        'polished_andesite_stairs':'andesite','diorite_stairs':'diorite',
        'polished_diorite_stairs':'diorite','granite_stairs':'granite','polished_granite_stairs':'granite',
        'sandstone_stairs':'sandstone','smooth_sandstone_stairs':'sandstone_top',
        'red_sandstone_stairs':'red_sandstone','smooth_red_sandstone_stairs':'red_sandstone_top',
        'brick_stairs':'brick_block','nether_brick_stairs':'nether_brick',
        'red_nether_brick_stairs':'red_nether_brick','quartz_stairs':'quartz_block_side',
        'smooth_quartz_stairs':'quartz_block_bottom','purpur_stairs':'purpur_block',
        'prismarine_stairs':'prismarine','prismarine_brick_stairs':'prismarine_bricks',
        'dark_prismarine_stairs':'dark_prismarine','blackstone_stairs':'blackstone',
        'polished_blackstone_stairs':'polished_blackstone',
        'polished_blackstone_brick_stairs':'polished_blackstone_bricks',
        'end_stone_brick_stairs':'end_stone_bricks','deepslate_tile_stairs':'deepslate_tiles',
        'deepslate_brick_stairs':'deepslate_bricks','cobbled_deepslate_stairs':'cobbled_deepslate',
        'polished_deepslate_stairs':'polished_deepslate','cut_copper_stairs':'cut_copper',
        'exposed_cut_copper_stairs':'exposed_cut_copper',
        'weathered_cut_copper_stairs':'weathered_cut_copper',
        'oxidized_cut_copper_stairs':'oxidized_cut_copper',
        'bamboo_mosaic_stairs':'bamboo_mosaic',
        'oak_slab':'oak_planks','spruce_slab':'spruce_planks','birch_slab':'birch_planks',
        'jungle_slab':'jungle_planks','acacia_slab':'acacia_planks','dark_oak_slab':'dark_oak_planks',
        'mangrove_slab':'mangrove_planks','cherry_slab':'cherry_planks',
        'bamboo_slab':'bamboo_planks','crimson_slab':'crimson_planks','warped_slab':'warped_planks',
        'stone_slab':'stone','cobblestone_slab':'cobblestone',
        'mossy_cobblestone_slab':'mossy_cobblestone','stone_brick_slab':'stone_bricks',
        'mossy_stone_brick_slab':'mossy_stone_bricks','andesite_slab':'andesite',
        'polished_andesite_slab':'andesite','diorite_slab':'diorite',
        'polished_diorite_slab':'diorite','granite_slab':'granite','polished_granite_slab':'granite',
        'sandstone_slab':'sandstone','cut_sandstone_slab':'sandstone_top',
        'smooth_sandstone_slab':'sandstone_top','red_sandstone_slab':'red_sandstone',
        'cut_red_sandstone_slab':'red_sandstone_top','smooth_red_sandstone_slab':'red_sandstone_top',
        'brick_slab':'brick_block','nether_brick_slab':'nether_brick',
        'red_nether_brick_slab':'red_nether_brick','quartz_slab':'quartz_block_side',
        'smooth_quartz_slab':'quartz_block_bottom','purpur_slab':'purpur_block',
        'prismarine_slab':'prismarine','prismarine_brick_slab':'prismarine_bricks',
        'dark_prismarine_slab':'dark_prismarine','blackstone_slab':'blackstone',
        'polished_blackstone_slab':'polished_blackstone',
        'polished_blackstone_brick_slab':'polished_blackstone_bricks',
        'end_stone_brick_slab':'end_stone_bricks','deepslate_tile_slab':'deepslate_tiles',
        'deepslate_brick_slab':'deepslate_bricks','cobbled_deepslate_slab':'cobbled_deepslate',
        'polished_deepslate_slab':'polished_deepslate','cut_copper_slab':'cut_copper',
        'exposed_cut_copper_slab':'exposed_cut_copper',
        'weathered_cut_copper_slab':'weathered_cut_copper',
        'oxidized_cut_copper_slab':'oxidized_cut_copper',
        'bamboo_mosaic_slab':'bamboo_mosaic',
        'oak_fence':'oak_planks','spruce_fence':'spruce_planks','birch_fence':'birch_planks',
        'jungle_fence':'jungle_planks','acacia_fence':'acacia_planks','dark_oak_fence':'dark_oak_planks',
        'mangrove_fence':'mangrove_planks','cherry_fence':'cherry_planks',
        'bamboo_fence':'bamboo_planks','crimson_fence':'crimson_planks','warped_fence':'warped_planks',
        'nether_brick_fence':'nether_brick',
        'oak_fence_gate':'oak_planks','spruce_fence_gate':'spruce_planks','birch_fence_gate':'birch_planks',
        'jungle_fence_gate':'jungle_planks','acacia_fence_gate':'acacia_planks','dark_oak_fence_gate':'dark_oak_planks',
        'mangrove_fence_gate':'mangrove_planks','cherry_fence_gate':'cherry_planks',
        'bamboo_fence_gate':'bamboo_planks','crimson_fence_gate':'crimson_planks','warped_fence_gate':'warped_planks',
        'cobblestone_wall':'cobblestone','mossy_cobblestone_wall':'mossy_cobblestone',
        'stone_brick_wall':'stone_bricks','mossy_stone_brick_wall':'mossy_stone_bricks',
        'andesite_wall':'andesite','diorite_wall':'diorite','granite_wall':'granite',
        'sandstone_wall':'sandstone','red_sandstone_wall':'red_sandstone',
        'brick_wall':'brick_block','nether_brick_wall':'nether_brick',
        'red_nether_brick_wall':'red_nether_brick','end_stone_brick_wall':'end_stone_bricks',
        'prismarine_wall':'prismarine','blackstone_wall':'blackstone',
        'polished_blackstone_wall':'polished_blackstone',
        'polished_blackstone_brick_wall':'polished_blackstone_bricks',
        'deepslate_tile_wall':'deepslate_tiles','deepslate_brick_wall':'deepslate_bricks',
        'cobbled_deepslate_wall':'cobbled_deepslate','polished_deepslate_wall':'polished_deepslate',
        'oak_door':'oak_planks','spruce_door':'spruce_planks','birch_door':'birch_planks',
        'jungle_door':'jungle_planks','acacia_door':'acacia_planks','dark_oak_door':'dark_oak_planks',
        'mangrove_door':'mangrove_planks','cherry_door':'cherry_planks',
        'bamboo_door':'bamboo_planks','crimson_door':'crimson_planks','warped_door':'warped_planks',
        'iron_door':'iron_block',
        'trapdoor':'oak_planks','iron_trapdoor':'iron_block',
        'oak_button':'oak_planks','spruce_button':'spruce_planks','birch_button':'birch_planks',
        'jungle_button':'jungle_planks','acacia_button':'acacia_planks','dark_oak_button':'dark_oak_planks',
        'mangrove_button':'mangrove_planks','cherry_button':'cherry_planks',
        'bamboo_button':'bamboo_planks','crimson_button':'crimson_planks','warped_button':'warped_planks',
        'stone_button':'stone','polished_blackstone_button':'polished_blackstone',
        'oak_pressure_plate':'oak_planks','spruce_pressure_plate':'spruce_planks',
        'birch_pressure_plate':'birch_planks','jungle_pressure_plate':'jungle_planks',
        'acacia_pressure_plate':'acacia_planks','dark_oak_pressure_plate':'dark_oak_planks',
        'mangrove_pressure_plate':'mangrove_planks','cherry_pressure_plate':'cherry_planks',
        'bamboo_pressure_plate':'bamboo_planks','crimson_pressure_plate':'crimson_planks',
        'warped_pressure_plate':'warped_planks','stone_pressure_plate':'stone',
        'polished_blackstone_pressure_plate':'polished_blackstone',
        'light_weighted_pressure_plate':'gold_block','heavy_weighted_pressure_plate':'iron_block',
        'redstone_torch':'redstone_torch','redstone_lamp':'redstone_lamp',
        'piston':'piston_top','sticky_piston':'piston_top',
        'dispenser':'dispenser_front','dropper':'dropper_front',
        'observer':'observer_front','hopper':'hopper_inside',
        'repeater':'repeater_side','comparator':'comparator_side',
        'note_block':'note_block','tnt':'tnt_top',
        'lever':'lever','daylight_detector':'daylight_detector_top',
        'tripwire_hook':'tripwire_hook','target':'target_top',
        'sculk_sensor':'sculk_sensor_top',
        'torch':'torch','soul_torch':'soul_torch',
        'lantern':'lantern','soul_lantern':'soul_lantern',
        'sea_lantern':'sea_lantern','jack_o_lantern':'jack_o_lantern',
        'campfire':'campfire','soul_campfire':'soul_campfire',
        'candle':'candle','end_rod':'end_rod',
        'froglight':'verdant_froglight_top','bamboo_block':'bamboo_block',
        'stripped_bamboo_block':'stripped_bamboo_block','bamboo_mosaic':'bamboo_mosaic',
        'bamboo_wall_sign':'bamboo_planks',
        'bookshelf':'bookshelf','crafting_table':'crafting_table_top',
        'furnace':'furnace_front_off','blast_furnace':'blast_furnace_front',
        'smoker':'smoker_front','barrel':'barrel_top',
        'chest':'chest_front','trapped_chest':'trapped_chest_front',
        'ender_chest':'ender_chest_front','shulker_box':'shulker_top',
        'enchanting_table':'enchanting_table_top','anvil':'anvil_top',
        'chipped_anvil':'anvil_top','damaged_anvil':'anvil_top',
        'jukebox':'jukebox_top','lodestone':'lodestone_top',
        'respawn_anchor':'respawn_anchor_side0','beacon':'beacon',
        'conduit':'conduit','scaffolding':'scaffolding_top',
        'ladder':'ladder','pointed_dripstone':'pointed_dripstone',
        'chain':'chain','iron_bars':'iron_bars',
        'lightning_rod':'lightning_rod','bell':'bell',
        'grindstone':'grindstone_side','stonecutter':'stonecutter_side',
        'loom':'loom_front','cartography_table':'cartography_table_top',
        'fletching_table':'fletching_table_top','smithing_table':'smithing_table_top',
        'cauldron':'cauldron_top','composter':'composter_top',
        'beehive':'beehive_front','bee_nest':'bee_nest_front',
        'hay_block':'hay_block','melon_block':'melon_top',
        'pumpkin':'pumpkin_top','carved_pumpkin':'carved_pumpkin_top'
    };
    return map[name]||name;
}

// ============================================================
// 生成带纹理的3D预览
// ============================================================
function generatePreviewHTML(p, fn, textures){
    var w=p.width,h=p.height,l=p.length;
    var totalBlocks=0,blockTypes={};
    var collectors=p.collectors;

    if(collectors){
        for(var bid in collectors){
            var col=collectors[bid];
            if(!col||!col.intervals||!col.intervals.len)continue;
            blockTypes[bid]=col.intervals.len;
            var itv=col.intervals;
            for(var ii=0;ii<itv.len;ii++){totalBlocks+=itv.ends[ii]-itv.starts[ii]+1}
        }
    }else{
        for(var i=0;i<p.blocks.length;i++){var b=p.blocks[i];totalBlocks++;if(!blockTypes[b.id])blockTypes[b.id]=0;blockTypes[b.id]++}
    }
    var types=Object.keys(blockTypes).length;

    // 大建筑只显示统计
    if(totalBlocks>6000){
        return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>'+fn+' 预览</title><style>body{background:#1a1a2e;color:#ccc;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;flex-direction:column;text-align:center;padding:20px}pre{background:rgba(0,0,0,0.4);padding:20px;border-radius:8px;font-size:14px;line-height:1.8}.info{color:#7c4dff;font-size:24px;font-weight:bold}.warn{color:#f39c12}</style></head><body><div class="info">'+fn+'</div><pre>尺寸: '+w+' x '+h+' x '+l+'\n方块: '+totalBlocks+' 个\n种类: '+types+' 种\n\n建筑较大('+totalBlocks+'个方块)，请使用"转换指令"功能</pre></body></html>';
    }

    // 收集方块数据（限制4000个）
    var blocksData=[];var idx=0;
    if(collectors){
        for(var bid in collectors){
            var col=collectors[bid];
            if(!col||!col.intervals||!col.intervals.len)continue;
            var itv=col.intervals;
            for(var ii=0;ii<itv.len;ii++){
                for(var s=itv.starts[ii];s<=itv.ends[ii];s++){
                    var coord=scoreToCoord(s,w,l);
                    blocksData.push({x:coord.x,y:coord.y,z:coord.z,id:bid});
                    idx++;
                    if(idx>4000)break;
                }
                if(idx>4000)break;
            }
            if(idx>4000)break;
        }
    }else{
        for(var i=0;i<p.blocks.length&&i<4000;i++){var b=p.blocks[i];blocksData.push({x:b.x,y:b.y,z:b.z,id:b.id})}
    }

    // 构建纹理映射
    var texMap={};
    var texList=[];
    for(var bid in blockTypes){
        var texName=getTextureName(bid);
        var texData=textures[texName];
        if(!texData) texData=textures[texName+'_top'];
        if(!texData) texData=textures[texName+'_side'];
        if(!texData) texData=textures[texName+'_front'];
        if(!texData) texData=textures['stone']||null;
        if(texData){texMap[bid]=texData;texList.push(texData)}
    }

    // 没有任何纹理，回退到彩色
    if(texList.length===0){
        return generateColorPreview(p,fn);
    }

    var texSize=16;
    var texCount=Object.keys(texMap).length;
    var cols=Math.ceil(Math.sqrt(texCount));
    if(cols<1)cols=1;
    var rows=Math.ceil(texCount/cols);
    var atlasW=cols*texSize;
    var atlasH=rows*texSize;

    var texIndexMap={};var ti=0;
    for(var bid in texMap){texIndexMap[bid]=ti;ti++}

    var finalData=blocksData.map(function(b){
        var tidx=texIndexMap[b.id]!==undefined?texIndexMap[b.id]:0;
        return {x:b.x,y:b.y,z:b.z,texIdx:tidx};
    });

    var cx=w/2,cz=l/2,cy=h/2;
    var maxDim=Math.max(w,h,l);
    var posJson=JSON.stringify(finalData);
    var texDataArray=[];for(var bid in texMap){texDataArray.push(texMap[bid])}
    var texDataJson=JSON.stringify(texDataArray);

    var html='<!DOCTYPE html><html><head><meta charset="utf-8"><title>'+fn+' 预览</title><style>body{margin:0;overflow:hidden;background:#1a1a2e}#info{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);color:#ccc;font:14px monospace;background:rgba(0,0,0,0.7);padding:8px 20px;border-radius:10px;pointer-events:none;z-index:10;white-space:nowrap}#loading{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#888;font:20px sans-serif;z-index:20}</style></head><body><div id="loading">加载中...</div><div id="info">'+fn+' | '+blocksData.length+' / '+totalBlocks+' 方块</div>';
    html+='<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>';
    html+='<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>';
    html+='<script>document.getElementById("loading").style.display="none";';
    html+='var scene=new THREE.Scene();scene.fog=new THREE.Fog(0x1a1a2e,Math.max('+maxDim+'*1.5,40),Math.max('+maxDim+'*3,80));';
    html+='var camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,0.1,5000);camera.position.set('+maxDim+'*1.2,Math.max('+h+'*0.8,8),'+maxDim+'*1.2);';
    html+='var renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setClearColor(0x1a1a2e);document.body.appendChild(renderer.domElement);';
    html+='var controls=new THREE.OrbitControls(camera,renderer.domElement);controls.target.set(0,0,0);controls.enableDamping=true;controls.dampingFactor=0.1;controls.update();';
    html+='var ambient=new THREE.AmbientLight(0x404070,0.6);scene.add(ambient);';
    html+='var sun=new THREE.DirectionalLight(0xffeedd,1.2);sun.position.set(80,150,60);scene.add(sun);';
    html+='scene.add(new THREE.DirectionalLight(0x8888ff,0.3).position.set(-60,80,-40));';
    html+='var gridSize=Math.max('+maxDim+',20);var gridHelper=new THREE.GridHelper(gridSize+10,Math.floor((gridSize+10)/2),0x444488,0x333366);gridHelper.position.y=-0.51;scene.add(gridHelper);';
    html+='var data='+posJson+';';
    html+='var texData='+texDataJson+';';
    html+='var cols='+cols+';var texSize='+texSize+';var atlasW='+atlasW+';var atlasH='+atlasH+';var texCount='+texCount+';';
    html+='var canvas=document.createElement("canvas");canvas.width=atlasW;canvas.height=atlasH;var ctx=canvas.getContext("2d");var loaded=0;var totalTex=texData.length;';
    html+='if(totalTex===0){alert("没有纹理数据");}';
    html+='for(var i=0;i<texData.length;i++){var img=new Image();img.crossOrigin="anonymous";var idx=i;img.onload=function(){var x=(idx%cols)*texSize;var y=Math.floor(idx/cols)*texSize;ctx.drawImage(this,x,y,texSize,texSize);loaded++;if(loaded===totalTex){buildScene();}};img.onerror=function(){loaded++;if(loaded===totalTex){buildScene();}};img.src=texData[i];}';
    html+='function buildScene(){var tex=new THREE.CanvasTexture(canvas);tex.wrapS=THREE.ClampToEdgeWrapping;tex.wrapT=THREE.ClampToEdgeWrapping;tex.magFilter=THREE.NearestFilter;tex.minFilter=THREE.NearestFilter;var uPerBlock=texSize/atlasW;var vPerBlock=texSize/atlasH;var geo=new THREE.BoxGeometry(0.9,0.9,0.9);var cx='+cx+';var cy='+cy+';var cz='+cz+';for(var i=0;i<data.length;i++){var b=data[i];var u=(b.texIdx%cols)*uPerBlock;var v=(Math.floor(b.texIdx/cols))*vPerBlock;var mat=new THREE.MeshStandardMaterial({map:tex,roughness:0.7,metalness:0.05,side:THREE.DoubleSide,alphaTest:0.5});var mesh=new THREE.Mesh(geo,mat);mesh.position.set((b.x-cx)*1.2,(b.y-cy)*1.2,(b.z-cz)*1.2);scene.add(mesh);}animate();}';
    html+='function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);}';
    html+='window.addEventListener("resize",function(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});';
    html+='</script></body></html>';
    return html;
}

// ============================================================
// 回退：彩色方块预览
// ============================================================
function generateColorPreview(p, fn){
    var w=p.width,h=p.height,l=p.length;
    var totalBlocks=0,blockTypes={};
    var collectors=p.collectors;

    if(collectors){
        for(var bid in collectors){
            var col=collectors[bid];
            if(!col||!col.intervals||!col.intervals.len)continue;
            blockTypes[bid]=col.intervals.len;
            var itv=col.intervals;
            for(var ii=0;ii<itv.len;ii++){totalBlocks+=itv.ends[ii]-itv.starts[ii]+1}
        }
    }else{
        for(var i=0;i<p.blocks.length;i++){var b=p.blocks[i];totalBlocks++;if(!blockTypes[b.id])blockTypes[b.id]=0;blockTypes[b.id]++}
    }
    var types=Object.keys(blockTypes).length;

    if(totalBlocks>6000){
        return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>'+fn+' 预览</title><style>body{background:#1a1a2e;color:#ccc;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;flex-direction:column;text-align:center;padding:20px}pre{background:rgba(0,0,0,0.4);padding:20px;border-radius:8px;font-size:14px;line-height:1.8}.info{color:#7c4dff;font-size:24px;font-weight:bold}.warn{color:#f39c12}</style></head><body><div class="info">'+fn+'</div><pre>尺寸: '+w+' x '+h+' x '+l+'\n方块: '+totalBlocks+' 个\n种类: '+types+' 种\n\n建筑较大('+totalBlocks+'个方块)，请使用"转换指令"功能</pre></body></html>';
    }

    var colors=['#e74c3c','#3498db','#2ecc71','#f1c40f','#9b59b6','#1abc9c','#e67e22','#34495e','#ecf0f1','#95a5a6','#c0392b','#2980b9','#27ae60','#d4ac0d','#8e44ad','#16a085','#d35400','#2c3e50','#7f8c8d','#bdc3c7'];
    var colorMap={};var ci=0;
    for(var bid in blockTypes){colorMap[bid]=colors[ci%colors.length];ci++}

    var blocksData=[];var idx=0;
    if(collectors){
        for(var bid in collectors){
            var col=collectors[bid];
            if(!col||!col.intervals||!col.intervals.len)continue;
            var itv=col.intervals;
            for(var ii=0;ii<itv.len;ii++){
                for(var s=itv.starts[ii];s<=itv.ends[ii];s++){
                    var coord=scoreToCoord(s,w,l);
                    blocksData.push({x:coord.x,y:coord.y,z:coord.z,color:colorMap[bid]});
                    idx++;
                    if(idx>4000)break;
                }
                if(idx>4000)break;
            }
            if(idx>4000)break;
        }
    }else{
        for(var i=0;i<p.blocks.length&&i<4000;i++){var b=p.blocks[i];blocksData.push({x:b.x,y:b.y,z:b.z,color:colorMap[b.id]||'#888'})}
    }

    var cx=w/2,cz=l/2,cy=h/2;
    var maxDim=Math.max(w,h,l);
    var posJson=JSON.stringify(blocksData.map(function(b){return [(b.x-cx)*1.2,(b.y-cy)*1.2,(b.z-cz)*1.2,b.color]}));

    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>'+fn+' 预览</title><style>body{margin:0;overflow:hidden;background:#1a1a2e}#info{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);color:#ccc;font:14px monospace;background:rgba(0,0,0,0.7);padding:8px 20px;border-radius:10px;pointer-events:none;z-index:10;white-space:nowrap}#loading{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#888;font:20px sans-serif;z-index:20}</style></head><body><div id="loading">加载中...</div><div id="info">'+fn+' | '+blocksData.length+' / '+totalBlocks+' 方块</div><script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script><script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script><script>document.getElementById("loading").style.display="none";var scene=new THREE.Scene();scene.fog=new THREE.Fog(0x1a1a2e,Math.max('+maxDim+'*1.5,40),Math.max('+maxDim+'*3,80));var camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,0.1,5000);camera.position.set('+maxDim+'*1.2,Math.max('+h+'*0.8,8),'+maxDim+'*1.2);var renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setClearColor(0x1a1a2e);document.body.appendChild(renderer.domElement);var controls=new THREE.OrbitControls(camera,renderer.domElement);controls.target.set(0,0,0);controls.enableDamping=true;controls.dampingFactor=0.1;controls.update();var ambient=new THREE.AmbientLight(0x404070,0.6);scene.add(ambient);var sun=new THREE.DirectionalLight(0xffeedd,1.2);sun.position.set(80,150,60);scene.add(sun);scene.add(new THREE.DirectionalLight(0x8888ff,0.3).position.set(-60,80,-40));var gridSize=Math.max('+maxDim+',20);var gridHelper=new THREE.GridHelper(gridSize+10,Math.floor((gridSize+10)/2),0x444488,0x333366);gridHelper.position.y=-0.51;scene.add(gridHelper);var data='+posJson+';var geo=new THREE.BoxGeometry(0.9,0.9,0.9);for(var i=0;i<data.length;i++){var b=data[i];var mat=new THREE.MeshStandardMaterial({color:b[3],roughness:0.7,metalness:0.05});var mesh=new THREE.Mesh(geo,mat);mesh.position.set(b[0],b[1],b[2]);scene.add(mesh)}function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera)}animate();window.addEventListener("resize",function(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});</script></body></html>';
}

// ============================================================
// 生成指令（优化版，限制递归）
// ============================================================
async function generateCommands(blocks,fn,w,l){
    var gs=(typeof self!=='undefined'&&self._gs)||{};
    var sb=gs.sb||'dr',sp=gs.sp||1,ht=gs.ht||'h',bt=gs.bt||'b',mc=gs.mc||10000;
    var cmds=[],totalBlocks=w*l,totalHeight=blocks.height||1;
    function _c(cmd,comment){if(comment)cmds.push('#'+comment);cmds.push(cmd)}

    cmds.push('# [脉冲] [无条件] [红石控制] 一次性执行');
    _c('scoreboard objectives add '+sb+' dummy','创建 '+sb+' 计分板');
    _c('summon armor_stand ~ ~ ~','召唤 h 高度扫描器');
    _c('tag @e[type=armor_stand,c=1,r=2.5,tag=!b] add '+ht,'标记 h');
    _c('tp @e[tag='+ht+',type=armor_stand] ~ ~0 ~','传送 h 到 y=0');
    _c('summon armor_stand ~ ~ ~','召唤 b 位置扫描器');
    _c('tag @e[type=armor_stand,c=1,r=2.5,tag=!h] add '+bt,'标记 b');
    _c('tp @e[tag='+bt+',type=armor_stand] ~ ~0 ~','传送 b 到 y=0');
    _c('scoreboard players set @e[tag='+ht+',type=armor_stand] '+sb+' 0','h 计数归零');
    _c('scoreboard players set @e[tag='+bt+',type=armor_stand] '+sb+' 0','b 计数归零');
    cmds.push('');
    cmds.push('# [循环] [无条件] [保持开启] 速度'+sp+'x');
    _c('scoreboard players add @e[tag='+ht+',type=armor_stand] '+sb+' '+sp,'h 计数 +'+sp);
    _c('scoreboard players add @e[tag='+bt+',type=armor_stand] '+sb+' '+sp,'b 计数 +'+sp);
    cmds.push('');
    cmds.push('# [连锁] [无条件] [保持开启]');

    var collectors=blocks.collectors;
    if(!collectors){collectors={};var ss=w*l;for(var bi=0;bi<blocks.length;bi++){var b=blocks[bi];if(!collectors[b.id])collectors[b.id]=createCollector();addToCollector(collectors[b.id],b.z*w+b.x+b.y*ss+1)}for(var k in collectors)finishCollector(collectors[k])}

    var allBatch=[],allSingle=[];
    for(var bid in collectors){
        var col=collectors[bid];
        if(!col||!col.intervals||!col.intervals.len)continue;
        var itv=col.intervals,ranges=[];for(var ii=0;ii<itv.len;ii++)ranges.push([itv.starts[ii],itv.ends[ii]]);
        for(var ri=0;ri<ranges.length;ri++){
            var start=ranges[ri][0],end=ranges[ri][1],total=end-start+1;
            var allSafe=true,checkStep=total>1000?Math.max(1,Math.floor(total/100)):1;
            for(var s=start;s<=end;s+=checkStep){if(isSensitiveScore(s*sp)){allSafe=false;break}}
            if(allSafe){allBatch.push({start:start,end:end,blockId:bid});continue}
            var splitResult=trySplitSensitiveRange(start,end,sp);
            if(splitResult){for(var si=0;si<splitResult.length;si++){allBatch.push({start:splitResult[si][0],end:splitResult[si][1],blockId:bid})}}else{
                for(var s=start;s<=end;s++){if(isSensitiveScore(s*sp)){allSingle.push({score:s,blockId:bid})}else{allBatch.push({start:s,end:s,blockId:bid})}}
            }
        }
    }

    // 批量生成
    var batchByBlock={};
    for(var i=0;i<allBatch.length;i++){var item=allBatch[i];if(!batchByBlock[item.blockId])batchByBlock[item.blockId]=[];batchByBlock[item.blockId].push([item.start,item.end])}
    for(var bid in batchByBlock){
        var ranges2=batchByBlock[bid];ranges2.sort(function(a,b){return a[0]-b[0]});
        var merged=[];for(var i=0;i<ranges2.length;i++){if(merged.length===0||ranges2[i][0]>merged[merged.length-1][1]+1){merged.push([ranges2[i][0],ranges2[i][1]])}else{if(ranges2[i][1]>merged[merged.length-1][1]){merged[merged.length-1][1]=ranges2[i][1]}}}
        var temp=[];for(var i=0;i<merged.length;i++){var test=temp.concat([merged[i]]);var segStr=test.map(function(x){return x[0]===x[1]?sb+'=!'+x[0]*sp:sb+'=!'+x[0]*sp+'..'+x[1]*sp}).join(',');if(segStr.length>mc&&temp.length){var tempStr=temp.map(function(x){return x[0]===x[1]?sb+'=!'+x[0]*sp:sb+'=!'+x[0]*sp+'..'+x[1]*sp}).join(',');cmds.push('execute as @e[tag='+bt+',type=armor_stand] at @s unless entity @s[scores={'+tempStr+'}] run setblock ~ ~ ~ '+bid);temp=[]}temp.push(merged[i])}
        if(temp.length){var tempStr=temp.map(function(x){return x[0]===x[1]?sb+'=!'+x[0]*sp:sb+'=!'+x[0]*sp+'..'+x[1]*sp}).join(',');cmds.push('execute as @e[tag='+bt+',type=armor_stand] at @s unless entity @s[scores={'+tempStr+'}] run setblock ~ ~ ~ '+bid)}
    }

    // 单独处理
    if(allSingle.length>0){
        cmds.push('');cmds.push('# ===== [手动执行] 以下 '+allSingle.length+' 个方块含敏感分值 =====');
        cmds.push('# 站在盔甲架起始位置，逐条输入以下 setblock 指令');
        var singleByBlock={};for(var i=0;i<allSingle.length;i++){var item=allSingle[i];if(!singleByBlock[item.blockId])singleByBlock[item.blockId]=[];singleByBlock[item.blockId].push(item.score)}
        for(var bid in singleByBlock){var scores=singleByBlock[bid];scores.sort(function(a,b){return a-b});for(var i=0;i<scores.length;i++){var coord=scoreToCoord(scores[i],w,l);cmds.push('setblock ~'+coord.x+' ~'+coord.y+' ~'+coord.z+' '+bid)}}
        cmds.push('# ===== [手动执行结束] =====');
    }

    // 换行换层
    cmds.push('');cmds.push('# ===== b 移动 =====');
    _c('execute as @e[tag='+bt+',type=armor_stand] at @s run tp @s ~1 ~ ~','b 向右移动 1 格');
    cmds.push('');cmds.push('# ===== 换行/换层 =====');
    var wrapScores=[];for(var i=1;i<l;i++)wrapScores.push(i*w*sp);
    if(wrapScores.length>0){var wrapStr=wrapScores.map(function(x){return sb+'='+x+'..'+x}).join(',');cmds.push('execute as @e[tag='+bt+',type=armor_stand] if entity @s[scores={'+wrapStr+'}] run tp @s ~-'+w+' ~ ~1')}
    var layerScores=[];for(var i=1;i<totalHeight;i++)layerScores.push(i*totalBlocks*sp);
    if(layerScores.length>0){var layerStr=layerScores.map(function(x){return sb+'='+x+'..'+x}).join(',');cmds.push('execute as @e[tag='+ht+',type=armor_stand] if entity @s[scores={'+layerStr+'}] run tp @s ~ ~1 ~');cmds.push('execute as @e[tag='+ht+',type=armor_stand] if entity @s[scores={'+layerStr+'}] at @s run tp @e[tag='+bt+',type=armor_stand] ~ ~ ~')}
    cmds.push('');_c('titleraw @a actionbar {"rawtext":[{"text":"文件 '+fn+' 加载完成"}]}','加载完成提示');
    cmds.push('');

    // 重置
    cmds.push('# ===== 重置 =====');
    _c('scoreboard players set @e[tag='+ht+',type=armor_stand] '+sb+' 0','h 计数归零');
    _c('scoreboard players set @e[tag='+bt+',type=armor_stand] '+sb+' 0','b 计数归零');
    _c('tp @e[tag='+ht+',type=armor_stand] ~ ~0 ~','传送 h 回 y=0');
    _c('tp @e[tag='+bt+',type=armor_stand] ~ ~0 ~','传送 b 回 y=0');
    _c('kill @e[tag='+ht+',type=armor_stand]','移除 h');
    _c('kill @e[tag='+bt+',type=armor_stand]','移除 b');
    cmds.push('');
    cmds.push('# ===== 使用说明 =====');
    cmds.push('# 1. 在命令方块中(按顺序)粘贴以上指令');
    cmds.push('# 2. [脉冲]一次性执行 -> [循环]保持开启 -> [连锁]保持开启');
    cmds.push('# 3. 确保建筑区域已清空再运行');
    return cmds;
}

// ============================================================
// 主消息处理
// ============================================================
self.onmessage=async function(e){
    var m=e.data,i=m._id;

    // 接收纹理
    if(m.type==='textures'){
        textureCache = m.textures || {};
        self.postMessage({_id:i, type:'textures_ready'});
        return;
    }

    try{
        var p=await parseBuilding(new Uint8Array(m.d),m.n);
        if(m.c==='preview'){
            var html=generatePreviewHTML(p,m.fn||'building',textureCache);
            self.postMessage({_id:i,ok:1,html:html});
        }else if(m.c==='c'){
            self._gs={sb:m.sb||'dr',sp:m.sp||1,ht:m.ht||'h',bt:m.bt||'b',mc:m.mc||10000};
            var cmds=await generateCommands(p,m.fn||'building',p.width,p.length);
            var tt=Object.keys(p.blocks.reduce(function(o,b){o[b.id]=1;return o},{})).length;
            self.postMessage({_id:i,ok:1,blk:p.blocks.length,typ:tt,cmds:cmds,w:p.width,h:p.height,l:p.length});
        }else{
            var tt=Object.keys(p.blocks.reduce(function(o,b){o[b.id]=1;return o},{})).length;
            self.postMessage({_id:i,ok:1,blk:p.blocks.length,typ:tt,w:p.width,h:p.height,l:p.length});
        }
    }catch(e){
        self.postMessage({_id:i,ok:0,err:e.message||String(e)});
    }
};

// Worker启动通知
self.postMessage({type:'worker_ready'});