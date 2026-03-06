const { createClient } = require('@supabase/supabase-js');
const AlipaySdk = require('alipay-sdk').default || require('alipay-sdk');
const { processBusinessLogic } = require('./business-logic.js');
const { resolvePaymentSecrets } = require('./utils/payment-secrets.js');

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

function getSupabaseKey() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SERVICE_ROLE_KEY ||
        process.env.SUPABASE_KEY ||
        process.env.SUPABASE_ANON_KEY;
}

exports.handler = async (event) => {
    const origin = event.headers.origin;
    const headers = {
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };
    if (allowedOrigins.includes(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
    }
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                status: 'error',
                message: 'Method Not Allowed'
            })
        };
    }

    const outTradeNo = event.queryStringParameters.outTradeNo;
    if (!outTradeNo) {
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                status: 'error',
                message: 'Missing outTradeNo'
            })
        };
    }

    const supabaseKey = getSupabaseKey();
    if (!process.env.SUPABASE_URL || !supabaseKey) {
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                status: 'error',
                message: 'Supabase configuration missing'
            })
        };
    }

    const supabase = createClient(process.env.SUPABASE_URL, supabaseKey);

    try {
        const { data: order, error } = await supabase
            .from('orders')
            .select('status, product_id, customer_email')
            .eq('out_trade_no', outTradeNo)
            .single();

        if (error || !order) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    status: 'not_found',
                    message: 'Order not found'
                })
            };
        }

        if (order.status === 'completed') {
            return { statusCode: 200, headers, body: JSON.stringify({ status: 'completed' }) };
        }

        console.log(`[check-status] Order ${outTradeNo} is PENDING. Querying Alipay...`);

        const paymentSecrets = await resolvePaymentSecrets(['ALIPAY_APP_ID', 'ALIPAY_PRIVATE_KEY', 'ALIPAY_PUBLIC_KEY'], supabase);
        const alipaySdk = new AlipaySdk({
            appId: paymentSecrets.ALIPAY_APP_ID,
            privateKey: formatKey(paymentSecrets.ALIPAY_PRIVATE_KEY, 'private'),
            alipayPublicKey: formatKey(paymentSecrets.ALIPAY_PUBLIC_KEY, 'public'),
            gateway: "https://openapi.alipay.com/gateway.do",
            timeout: 30000
        });

        const alipayResult = await alipaySdk.exec('alipay.trade.query', {
            bizContent: { out_trade_no: outTradeNo },
        });

        if (alipayResult.tradeStatus === 'TRADE_SUCCESS') {
            console.log(`[check-status] Alipay confirmed ${outTradeNo} is paid. Updating database...`);

            await supabase.from('orders').update({ status: 'completed' }).eq('out_trade_no', outTradeNo);

            // ▼▼▼ 【核心修复】不再依赖支付宝返回的 subject ▼▼▼
            // 我们从自己的数据库中获取 product_id 来构造一个正确的 subject
            const productId = order.product_id;
            let subject = '未知商品';
            if (productId.startsWith('gmaps_renewal')) { // 优先判断是否为续费
                if (productId.includes('monthly')) subject = 'Google Maps Scraper - 月度续费';
                else if (productId.includes('quarterly')) subject = 'Google Maps Scraper - 季度续费';
                else if (productId.includes('yearly')) subject = 'Google Maps Scraper - 年度续费';
            } else if (productId.startsWith('gmaps')) {
                if (productId.includes('monthly')) subject = 'Google Maps Scraper - 按月订阅';
                else if (productId.includes('quarterly')) subject = 'Google Maps Scraper - 按季订阅';
                else if (productId.includes('yearly')) subject = 'Google Maps Scraper - 按年订阅(买一年送一年)';
            } else if (productId.startsWith('validator')) {
                subject = productId.includes('premium') ? 'Email Validator 高级版激活码' : 'Email Validator 标准版激活码';
            } else if (productId.startsWith('whatsapp-validator')) {
                subject = productId.includes('premium') ? 'WhatsApp Validator 高级版激活码' : 'WhatsApp Validator 标准版激活码';
            }

            const orderParams = new URLSearchParams({
                subject: subject, // 使用我们自己数据库信息构造的、可靠的 subject
                out_trade_no: outTradeNo,
                product_id: productId, // 添加product_id用于佣金计算
            });
            // ▲▲▲ 修复结束 ▲▲▲

            const businessResult = await processBusinessLogic(orderParams);

            if (businessResult.success) {
                console.log(`[check-status] Business logic completed successfully for ${outTradeNo}`);
                return { statusCode: 200, headers, body: JSON.stringify({ status: 'completed' }) };
            } else {
                console.error(`[check-status] Business logic failed for ${outTradeNo}:`, businessResult.error);
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        status: 'error',
                        message: 'Business logic failed',
                        error: businessResult.error
                    })
                };
            }
        }

        console.log(`[check-status] Alipay status for ${outTradeNo}: ${alipayResult.tradeStatus}. Keep polling.`);
        return { statusCode: 200, headers, body: JSON.stringify({ status: 'pending' }) };

    } catch (err) {
        console.error('[Critical Error] in check-status:', err.message);
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                status: 'error',
                message: 'Internal Server Error',
                error: err.message
            })
        };
    }
};
