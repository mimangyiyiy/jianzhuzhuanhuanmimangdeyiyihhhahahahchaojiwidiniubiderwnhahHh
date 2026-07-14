// functions/preview/[id].js
// 预览页面 - 从 KV 读取并显示

export async function onRequest(context) {
    const { request, env, params } = context;
    const id = params.id;

    // 从 KV 读取预览 HTML
    const html = await env.PREVIEWS.get('yulan_' + id, 'text');

    if (html === null) {
        // 预览已过期
        return new Response(`<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>预览已过期</title>
    <style>
        body {
            background: #0d0d2b;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            font-family: "Segoe UI", sans-serif;
            color: #666;
            flex-direction: column;
            gap: 12px;
            margin: 0;
            padding: 20px;
        }
        .icon { font-size: 64px; }
        .title { font-size: 20px; color: #888; }
        .sub { font-size: 14px; color: #555; }
        .btn {
            margin-top: 16px;
            padding: 10px 28px;
            border: none;
            border-radius: 8px;
            background: linear-gradient(135deg, #7c4dff, #5e35e0);
            color: #fff;
            font-size: 14px;
            cursor: pointer;
            text-decoration: none;
            transition: opacity 0.2s;
        }
        .btn:hover { opacity: 0.85; }
    </style>
</head>
<body>
    <div class="icon">⏰</div>
    <div class="title">预览已过期</div>
    <div class="sub">链接有效期为 10 分钟</div>
    <a href="/" class="btn">返回首页</a>
</body>
</html>`, {
            headers: { 'Content-Type': 'text/html;charset=utf-8' }
        });
    }

    // 返回预览 HTML
    return new Response(html, {
        headers: {
            'Content-Type': 'text/html;charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
    });
}
