const { AlipaySdk } = require('alipay-sdk');
const { createClient } = require('@supabase/supabase-js');

// 允许的来源白名单
const allowedOrigins = [
    'http://localhost:8888',
    'https://google-maps-backend-master.netlify.app',
    'https://mediamingle.cn'
];

// ▼▼▼ 【代码修复】手动格式化被 Netlify 压成一行的密钥 ▼▼▼
function formatKey(key, type) {
    if (!key || key.includes('\n')) {
        return key; // 如果密钥不存在或已包含换行符，则直接返回
    }
    
    console.log(`[Info] Reformatting single-line ${type} key...`);
    
    const header = type === 'private' 
        ? '-----BEGIN RSA PRIVATE KEY-----' 
        : '-----BEGIN PUBLIC KEY-----';
    const footer = type === 'private' 
        ? '-----END RSA PRIVATE KEY-----' 
        : '-----END PUBLIC KEY-----';

    return key.replace(header, `${header}\n`).replace(footer, `\n${footer}`);
}

// 后端固定价格表（单位: 人民币）
const productPriceMap = {
    'gmaps_standard': 34.30,
    'gmaps_premium': 63.00,
    'validator_standard': 203.00,
    'validator_premium': 553.00,
    'whatsapp-validator_standard': 203.00, 
    'whatsapp-validator_premium': 343.00
};

exports.handler = async (event) => {
    const origin = event.headers.origin;

    // 1. 统一设置CORS响应头
    const headers = {
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };
    if (allowedOrigins.includes(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
    }

    // 2. 响应 OPTIONS 预检请求
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    // 3. 拒绝非 POST 请求
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: 'Method Not Allowed' };
    }
    
    // 4. 执行核心支付逻辑
    try {
        // ▼▼▼ 【安全修复】使用环境变量代替硬编码 ▼▼▼
        const alipaySdk = new AlipaySdk({
            appId: process.env.ALIPAY_APP_ID,
            privateKey: formatKey(process.env.ALIPAY_PRIVATE_KEY, 'private'),
            alipayPublicKey: formatKey(process.env.ALIPAY_PUBLIC_KEY, 'public'),
            gateway: "https://openapi.alipay.com/gateway.do",
            timeout: 10000 // 【超时修复】将超时时间增加到10秒
        });

        const { productId, price, email } = JSON.parse(event.body);
        // 验证必填参数
        if (!productId || !price || !email) {
            return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Missing parameters' }) };
        }

        // 验证前端传入的金额是否与后端价格表一致 
        const expectedPrice = productPriceMap[productId];
        if (!expectedPrice || parseFloat(price) !== expectedPrice) {
            console.error(`[Security Error] Invalid price for ${productId}. Expected: ${expectedPrice}, Received: ${price}`);
            return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid price' }) };
        }

        const productCodeMap = {
            'gmaps_standard': 'gs',
            'gmaps_premium': 'gp',
            'validator_standard': 'vs',
            'validator_premium': 'vp',
            'whatsapp-validator_standard': 'wvs', // 新产品的短代码
            'whatsapp-validator_premium': 'wvp'  // 新产品的短代码
        };
        const productCode = productCodeMap[productId] || 'unknown'; // 获取短代码

        const encodedEmail = Buffer.from(email).toString('base64');
        // const outTradeNo = `${productId}-${Date.now()}-${encodedEmail}`;

        const outTradeNo = `${productCode}-${Date.now()}-${encodedEmail}`;

        let subject = '未知商品';
        if (productId.startsWith('gmaps')) {
            subject = productId.includes('premium') ? 'Google Maps Scraper 高级版' : 'Google Maps Scraper 标准版';
        } else if (productId.startsWith('validator')) {
            subject = productId.includes('premium') ? 'Email Validator 高级版激活码' : 'Email Validator 标准版激活码';
        } else if (productId.startsWith('whatsapp-validator')) {
            subject = productId.includes('premium') ? 'WhatsApp Validator 高级版激活码' : 'WhatsApp Validator 标准版激活码';
        }

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

        const { error: insertError } = await supabase.from('orders').insert([
            {
                out_trade_no: outTradeNo,
                product_id: productId,
                customer_email: email,
                status: 'PENDING'
            }
        ]);

        if (insertError) {
            console.error('Supabase insert error:', insertError);
            throw new Error(`Failed to create order in database: ${insertError.message}`);
        }

        const result = await alipaySdk.exec('alipay.trade.precreate', {
            bizContent: {
                out_trade_no: outTradeNo,
                total_amount: price,
                subject: subject,
                notify_url: `https://mediamingle.cn/.netlify/functions/alipay-notify`
            },
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                qrCodeUrl: result.qrCode,
                outTradeNo: outTradeNo
            })
        };

    } catch (error) {
        console.error('Function execution error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, message: 'Failed to create payment order.', error: error.message })
        };
    }
};