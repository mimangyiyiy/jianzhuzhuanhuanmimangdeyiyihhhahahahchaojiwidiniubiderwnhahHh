// functions/api/upload.js
// 上传预览 HTML 到 KV，10分钟自动过期

// 生成随机 ID (8位)
function generateRandomId(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

export async function onRequest(context) {
    const { request, env } = context;

    // CORS 预检
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400'
            }
        });
    }

    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const data = await request.json();
        const html = data.html;
        const fileName = data.fileName || 'preview';

        if (!html) {
            return new Response(JSON.stringify({ error: '缺少 HTML 内容' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 生成随机 ID
        const randomId = generateRandomId(8);
        const key = 'yulan_' + randomId;

        // 存储到 KV，10分钟自动过期
        await env.PREVIEWS.put(key, html, {
            expirationTtl: 600
        });

        // 存储元数据
        await env.PREVIEWS.put(key + '_meta', JSON.stringify({
            fileName: fileName,
            created: Date.now()
        }), {
            expirationTtl: 600
        });

        const baseUrl = new URL(request.url).origin;
        const link = baseUrl + '/preview/' + randomId;

        return new Response(JSON.stringify({
            success: true,
            url: link,
            id: randomId,
            expiresIn: '10分钟'
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });

    } catch (e) {
        return new Response(JSON.stringify({
            success: false,
            error: e.message
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
}
