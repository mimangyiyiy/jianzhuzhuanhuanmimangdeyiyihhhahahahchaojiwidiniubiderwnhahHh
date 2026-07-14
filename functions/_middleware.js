// functions/_middleware.js
// 为所有响应添加 CORS 头

export async function onRequest(context) {
    const response = await context.next();

    // 给所有响应添加 CORS 头
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');

    return response;
}
