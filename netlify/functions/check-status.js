// const { createClient } = require('@supabase/supabase-js');

// const allowedOrigins = [
//     'http://localhost:8888',
//     'https://google-maps-backend-master.netlify.app',
//     'https://mediamingle.cn'
// ];

// exports.handler = async (event) => {
//     const origin = event.headers.origin;
//     const headers = {
//         'Access-Control-Allow-Headers': 'Content-Type',
//         'Access-Control-Allow-Methods': 'GET, OPTIONS'
//     };
//      if (allowedOrigins.includes(origin)) {
//         headers['Access-Control-Allow-Origin'] = origin;
//     }
//     if (event.httpMethod === 'OPTIONS') {
//         return { statusCode: 204, headers, body: '' };
//     }
//     if (event.httpMethod !== 'GET') {
//         return { statusCode: 405, headers, body: 'Method Not Allowed' };
//     }

//     try {
//         const outTradeNo = event.queryStringParameters.outTradeNo;
//         if (!outTradeNo) {
//             return { statusCode: 400, headers, body: JSON.stringify({ message: 'Missing outTradeNo parameter' }) };
//         }

//         const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

//         const { data, error } = await supabase
//             .from('orders')
//             .select('status')
//             .eq('out_trade_no', outTradeNo)
//             .order('created_at', { ascending: false }) // 1. 按创建时间降序排序
//             .limit(1)                                 // 2. 只取最新的一条记录
//             .single();    

//         if (error || !data) {
//             return { statusCode: 404, headers, body: JSON.stringify({ status: 'not_found' }) };
//         }

//         return {
//             statusCode: 200,
//             headers: headers,
//             body: JSON.stringify({ status: data.status })
//         };

//     } catch (error) {
//         console.error('Error checking status:', error);
//         return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal Server Error' }) };
//     }
// };




const { createClient } = require('@supabase/supabase-js');
const { AlipaySdk } = require('alipay-sdk');
const { processBusinessLogic } = require('./business-logic.js'); // 引入核心业务逻辑

// 允许的来源白名单
const allowedOrigins = [
    'http://localhost:8888',
    'https://google-maps-backend-master.netlify.app',
    'https://mediamingle.cn'
];

// 格式化密钥的辅助函数
function formatKey(key, type) {
    if (!key || key.includes('\n')) return key;
    const header = type === 'private' ? '-----BEGIN RSA PRIVATE KEY-----' : '-----BEGIN PUBLIC KEY-----';
    const footer = type === 'private' ? '-----END RSA PRIVATE KEY-----' : '-----END PUBLIC KEY-----';
    return key.replace(header, `${header}\n`).replace(footer, `\n${footer}`);
}

exports.handler = async (event) => {
    // CORS and method checks
    const origin = event.headers.origin;
    const headers = { 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
    if (allowedOrigins.includes(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
    }
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: 'Method Not Allowed' };
    }

    const outTradeNo = event.queryStringParameters.outTradeNo;
    if (!outTradeNo) {
        return { statusCode: 400, headers, body: JSON.stringify({ message: 'Missing outTradeNo' }) };
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

    try {
        // 1. 先查询我们自己数据库的状态
        const { data: order, error } = await supabase
            .from('orders')
            .select('status, product_id, customer_email') // 多查询一些信息
            .eq('out_trade_no', outTradeNo)
            .single();

        if (error || !order) {
            return { statusCode: 404, headers, body: JSON.stringify({ status: 'not_found' }) };
        }

        // 如果订单已经是 'completed'，直接返回成功，前端停止轮询
        if (order.status === 'completed') {
            return { statusCode: 200, headers, body: JSON.stringify({ status: 'completed' }) };
        }

        // ▼▼▼ 主动查单逻辑 ▼▼▼
        // 2. 如果状态是 PENDING，则主动向支付宝查询
        console.log(`[check-status] Order ${outTradeNo} is PENDING. Querying Alipay...`);

        const alipaySdk = new AlipaySdk({
            appId: process.env.ALIPAY_APP_ID,
            privateKey: formatKey(process.env.ALIPAY_PRIVATE_KEY, 'private'),
            alipayPublicKey: formatKey(process.env.ALIPAY_PUBLIC_KEY, 'public'),
            gateway: "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
            timeout: 10000
        });

        const alipayResult = await alipaySdk.exec('alipay.trade.query', {
            bizContent: { out_trade_no: outTradeNo },
        });

        // 3. 如果支付宝返回支付成功 (TRADE_SUCCESS)
        if (alipayResult.tradeStatus === 'TRADE_SUCCESS') {
            console.log(`[check-status] Alipay confirmed ${outTradeNo} is paid. Updating database...`);
            
            // 更新数据库
            await supabase.from('orders').update({ status: 'completed' }).eq('out_trade_no', outTradeNo);

            // 构造一个 orderParams 对象来调用业务逻辑
            const subject = alipayResult.subject || ''; // 从支付宝的查询结果里获取 subject
            const orderParams = new URLSearchParams({
                subject: subject,
                out_trade_no: outTradeNo,
            });
            
            // 触发开通账号、发邮件等核心业务
            await processBusinessLogic(orderParams);
            
            // 向前端返回成功
            return { statusCode: 200, headers, body: JSON.stringify({ status: 'completed' }) };
        }
        
        // 4. 如果支付宝返回其他状态，则认为仍在等待支付
        console.log(`[check-status] Alipay status for ${outTradeNo}: ${alipayResult.tradeStatus}. Keep polling.`);
        return { statusCode: 200, headers, body: JSON.stringify({ status: 'pending' }) };

    } catch (err) {
        console.error('[Critical Error] in check-status:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal Server Error' }) };
    }
};