// paypal-create-order.js
// PayPal 支付创建订单接口
const { createClient } = require('@supabase/supabase-js');

// 允许的来源白名单
const allowedOrigins = [
    'http://localhost:8888',
    'https://google-maps-backend-master.netlify.app',
    'https://mediamingle.cn',
    'https://www.smarttrade-cloudladder.com'
];

// 后端权威价格表 (USD)
const productPriceMap = {
    'gmaps_standard': 9.90,      // 首月体验版
    'gmaps_premium': 20.00,      // 高级版
    'validator_standard': 59.00,  // MailPro 标准版
    'validator_premium': 99.00,   // MailPro 高级版
    'whatsapp-validator_standard': 99.00,   // WhatsApp 标准版
    'whatsapp-validator_premium': 199.00,   // WhatsApp 高级版
    'gmaps_renewal_monthly': 20.00,
    'gmaps_renewal_quarterly': 55.00,
    'gmaps_renewal_yearly': 200.00
};

// 产品名称映射
const productNameMap = {
    'gmaps_standard': 'Google Maps Scraper - First Month Trial',
    'gmaps_premium': 'Google Maps Scraper - Premium',
    'validator_standard': 'MailPro Email Marketing Master - Standard',
    'validator_premium': 'MailPro Email Marketing Master - Premium',
    'whatsapp-validator_standard': 'WhatsApp Marketing Assistant - Standard',
    'whatsapp-validator_premium': 'WhatsApp Marketing Assistant - Premium',
    'gmaps_renewal_monthly': 'Google Maps Scraper - Monthly Renewal',
    'gmaps_renewal_quarterly': 'Google Maps Scraper - Quarterly Renewal',
    'gmaps_renewal_yearly': 'Google Maps Scraper - Annual Renewal'
};

exports.handler = async (event) => {
    const origin = event.headers.origin;

    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (allowedOrigins.includes(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
    }

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        // 检查必要的环境变量
        const requiredEnvVars = ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

        if (missingVars.length > 0) {
            console.error('Missing environment variables:', missingVars);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    success: false,
                    message: 'Server configuration error. Please contact support.',
                    error: 'Missing environment variables: ' + missingVars.join(', ')
                })
            };
        }

        const { productId, email, referralCode, agentCode } = JSON.parse(event.body);

        if (!productId || !email) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, message: 'Missing required parameters: productId and email' })
            };
        }

        const price = productPriceMap[productId];
        if (!price) {
            console.error(`[Security Error] Invalid productId received: ${productId}`);
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, message: 'Invalid product' })
            };
        }

        // 初始化 Supabase
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

        // 生成订单号
        const productCodeMap = {
            'gmaps_standard': 'gs', 'gmaps_premium': 'gp',
            'validator_standard': 'vs', 'validator_premium': 'vp',
            'whatsapp-validator_standard': 'wvs', 'whatsapp-validator_premium': 'wvp',
            'gmaps_renewal_monthly': 'grm', 'gmaps_renewal_quarterly': 'grq', 'gmaps_renewal_yearly': 'gry'
        };
        const productCode = productCodeMap[productId] || 'unknown';
        const encodedEmail = Buffer.from(email).toString('base64');
        const outTradeNo = `PP-${productCode}-${Date.now()}-${encodedEmail.substring(0, 20)}`;

        // 获取 PayPal Access Token
        const paypalAuth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');

        // 使用生产环境或沙盒环境
        const paypalBaseUrl = process.env.PAYPAL_MODE === 'sandbox'
            ? 'https://api-m.sandbox.paypal.com'
            : 'https://api-m.paypal.com';

        const tokenResponse = await fetch(`${paypalBaseUrl}/v1/oauth2/token`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${paypalAuth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=client_credentials'
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error('PayPal token error:', errorText);
            throw new Error('Failed to get PayPal access token');
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        // 动态获取当前域名用于返回URL
        const host = event.headers.host || 'www.smarttrade-cloudladder.com';
        const protocol = event.headers['x-forwarded-proto'] || 'https';
        const returnUrl = `${protocol}://${host}/payment-confirm.html?orderId=${outTradeNo}`;
        const cancelUrl = `${protocol}://${host}/checkout.html`;

        // 创建 PayPal 订单
        const orderResponse = await fetch(`${paypalBaseUrl}/v2/checkout/orders`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                intent: 'CAPTURE',
                purchase_units: [{
                    reference_id: outTradeNo,
                    description: productNameMap[productId] || 'SmartTrade CloudLadder Product',
                    amount: {
                        currency_code: 'USD',
                        value: price.toFixed(2)
                    }
                }],
                application_context: {
                    brand_name: 'SmartTrade CloudLadder',
                    landing_page: 'LOGIN',
                    user_action: 'PAY_NOW',
                    return_url: returnUrl,
                    cancel_url: cancelUrl
                }
            })
        });

        if (!orderResponse.ok) {
            const errorData = await orderResponse.json();
            console.error('PayPal order creation error:', errorData);
            throw new Error('Failed to create PayPal order');
        }

        const orderData = await orderResponse.json();

        // 保存订单到数据库
        const dbOrderData = {
            out_trade_no: outTradeNo,
            paypal_order_id: orderData.id,
            product_id: productId,
            customer_email: email,
            amount: price,
            currency: 'USD',
            status: 'PENDING',
            payment_method: 'paypal'
        };

        if (referralCode) {
            dbOrderData.referral_code = referralCode;
        }
        if (agentCode) {
            dbOrderData.agent_code = agentCode;
        }

        const { error: insertError } = await supabase.from('orders').insert([dbOrderData]);

        if (insertError) {
            console.error('Supabase insert error:', insertError);
            // 不阻止支付流程，只记录错误
            console.warn('Order saved to database failed, but continuing with PayPal...');
        }

        // 获取 PayPal 支付链接
        const approveLink = orderData.links.find(link => link.rel === 'approve');

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                orderId: orderData.id,
                outTradeNo: outTradeNo,
                approvalUrl: approveLink ? approveLink.href : null,
                status: orderData.status
            })
        };

    } catch (error) {
        console.error('PayPal order creation failed:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                message: 'Failed to create payment order.',
                error: error.message
            })
        };
    }
};
