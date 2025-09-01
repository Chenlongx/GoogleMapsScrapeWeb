const { createClient } = require('@supabase/supabase-js');
const { AlipaySdk } = require('alipay-sdk');
const { processBusinessLogic } = require('./business-logic.js');

const allowedOrigins = [
    'http://localhost:8888',
    'https://google-maps-backend-master.netlify.app',
    'https://mediamingle.cn'
];

function formatKey(key, type) {
    if (!key || key.includes('\n')) return key;
    const header = type === 'private' ? '-----BEGIN RSA PRIVATE KEY-----' : '-----BEGIN PUBLIC KEY-----';
    const footer = type === 'private' ? '-----END RSA PRIVATE KEY-----' : '-----END PUBLIC KEY-----';
    return key.replace(header, `${header}\n`).replace(footer, `\n${footer}`);
}

exports.handler = async (event) => {
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
        const { data: order, error } = await supabase
            .from('orders')
            .select('status, product_id, customer_email')
            .eq('out_trade_no', outTradeNo)
            .single();

        if (error || !order) {
            return { statusCode: 404, headers, body: JSON.stringify({ status: 'not_found' }) };
        }

        if (order.status === 'completed') {
            return { statusCode: 200, headers, body: JSON.stringify({ status: 'completed' }) };
        }

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

        if (alipayResult.tradeStatus === 'TRADE_SUCCESS') {
            console.log(`[check-status] Alipay confirmed ${outTradeNo} is paid. Updating database...`);
            
            await supabase.from('orders').update({ status: 'completed' }).eq('out_trade_no', outTradeNo);

            // ▼▼▼ 【核心修复】不再依赖支付宝返回的 subject ▼▼▼
            // 我们从自己的数据库中获取 product_id 来构造一个正确的 subject
            const dbProductId = order.product_id; 
            let subject = '未知商品';
             if (dbProductId.startsWith('gmaps')) {
                subject = dbProductId.includes('premium') ? 'Google Maps Scraper 高级版' : 'Google Maps Scraper 标准版';
            } else if (dbProductId.startsWith('validator')) {
                subject = dbProductId.includes('premium') ? 'Email Validator 高级版激活码' : 'Email Validator 标准版激活码';
            }
            
            const orderParams = new URLSearchParams({
                subject: subject, // 使用我们自己数据库信息构造的、可靠的 subject
                out_trade_no: outTradeNo,
            });
            // ▲▲▲ 修复结束 ▲▲▲
            
            await processBusinessLogic(orderParams);
            
            return { statusCode: 200, headers, body: JSON.stringify({ status: 'completed' }) };
        }
        
        console.log(`[check-status] Alipay status for ${outTradeNo}: ${alipayResult.tradeStatus}. Keep polling.`);
        return { statusCode: 200, headers, body: JSON.stringify({ status: 'pending' }) };

    } catch (err) {
        console.error('[Critical Error] in check-status:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal Server Error' }) };
    }
};