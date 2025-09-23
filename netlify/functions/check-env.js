// 环境变量检查函数
exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: 'Method Not Allowed' };
    }

    // 检查环境变量
    const envVars = {
        ALIPAY_APP_ID: process.env.ALIPAY_APP_ID ? '✅ 已设置' : '❌ 未设置',
        ALIPAY_PRIVATE_KEY: process.env.ALIPAY_PRIVATE_KEY ? '✅ 已设置' : '❌ 未设置',
        ALIPAY_PUBLIC_KEY: process.env.ALIPAY_PUBLIC_KEY ? '✅ 已设置' : '❌ 未设置',
        SUPABASE_URL: process.env.SUPABASE_URL ? '✅ 已设置' : '❌ 未设置',
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? '✅ 已设置' : '❌ 未设置',
        NODE_ENV: process.env.NODE_ENV || '未设置'
    };

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            message: 'Environment Variables Check',
            environment: envVars,
            timestamp: new Date().toISOString()
        })
    };
};
