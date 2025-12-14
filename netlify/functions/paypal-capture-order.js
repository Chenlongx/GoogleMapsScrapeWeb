// paypal-capture-order.js
// PayPal 支付确认/捕获接口
const { createClient } = require('@supabase/supabase-js');

// 允许的来源白名单
const allowedOrigins = [
    'http://localhost:8888',
    'https://google-maps-backend-master.netlify.app',
    'https://mediamingle.cn',
    'https://www.smarttrade-cloudladder.com'
];

// 产品对应的有效期设置（天数）
const productValidityDays = {
    'gmaps_standard': 30,
    'gmaps_premium': 30,
    'validator_standard': 365,
    'validator_premium': 365,
    'whatsapp-validator_standard': 365,
    'whatsapp-validator_premium': 365,
    'gmaps_renewal_monthly': 30,
    'gmaps_renewal_quarterly': 90,
    'gmaps_renewal_yearly': 365
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
        const requiredEnvVars = ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'SUPABASE_URL', 'SERVICE_ROLE_KEY'];
        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

        if (missingVars.length > 0) {
            console.error('Missing environment variables:', missingVars);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    success: false,
                    message: 'Server configuration error'
                })
            };
        }

        const { orderId, outTradeNo } = JSON.parse(event.body);

        if (!orderId) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, message: 'Missing orderId' })
            };
        }

        // 获取 PayPal Access Token
        const paypalAuth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');

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
            throw new Error('Failed to get PayPal access token');
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        // 捕获订单（确认支付）
        const captureResponse = await fetch(`${paypalBaseUrl}/v2/checkout/orders/${orderId}/capture`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        const captureData = await captureResponse.json();

        if (captureData.status !== 'COMPLETED') {
            console.error('PayPal capture failed:', captureData);
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    success: false,
                    message: 'Payment capture failed',
                    status: captureData.status
                })
            };
        }

        // 使用 SERVICE_ROLE_KEY 初始化 Supabase（具有更高权限）
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SERVICE_ROLE_KEY);

        // 从 PayPal 获取订单详情
        const purchaseUnit = captureData.purchase_units[0];
        const referenceId = purchaseUnit.reference_id; // 我们的订单号 (格式: PP-productCode-timestamp-base64Email)

        // 尝试从数据库获取订单
        let orderData = null;
        const { data: dbOrder, error: orderQueryError } = await supabase
            .from('orders')
            .select('*')
            .eq('out_trade_no', referenceId || outTradeNo)
            .single();

        if (dbOrder) {
            orderData = dbOrder;
        } else {
            // 订单不在数据库中，从 reference_id 解码信息
            console.log('Order not found in DB, decoding from reference_id:', referenceId);

            // 解析 reference_id 格式: PP-productCode-timestamp-base64Email
            const parts = (referenceId || outTradeNo || '').split('-');
            if (parts.length >= 4) {
                const productCode = parts[1]; // gp, gs, vs, vp, wvs, wvp
                const base64Email = parts.slice(3).join('-'); // base64编码的邮箱

                // 解码邮箱
                let customerEmail = '';
                try {
                    customerEmail = Buffer.from(base64Email, 'base64').toString('utf8');
                } catch (e) {
                    console.error('Failed to decode email from reference_id');
                }

                // 映射 productCode 到 product_id
                const productCodeMap = {
                    'gs': 'gmaps_standard', 'gp': 'gmaps_premium',
                    'vs': 'validator_standard', 'vp': 'validator_premium',
                    'wvs': 'whatsapp-validator_standard', 'wvp': 'whatsapp-validator_premium'
                };

                const productId = productCodeMap[productCode];

                if (productId && customerEmail) {
                    orderData = {
                        out_trade_no: referenceId,
                        product_id: productId,
                        customer_email: customerEmail,
                        status: 'PENDING'
                    };

                    // 尝试保存到数据库
                    const { error: insertError } = await supabase.from('orders').insert([orderData]);
                    if (insertError) {
                        console.warn('Failed to save order to DB:', insertError);
                    }
                }
            }
        }

        if (!orderData) {
            console.error('Unable to get order data from DB or reference_id');
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: 'Payment completed but order details could not be determined. Please contact support.',
                    paypalOrderId: orderId,
                    status: 'COMPLETED'
                })
            };
        }

        // 更新订单状态为已支付 - 只更新存在的字段
        const { error: updateError } = await supabase
            .from('orders')
            .update({
                status: 'PAID'
            })
            .eq('out_trade_no', orderData.out_trade_no);

        if (updateError) {
            console.error('Failed to update order status:', updateError);
        }

        // 根据产品类型执行开通逻辑
        const productId = orderData.product_id;
        const customerEmail = orderData.customer_email;
        const validityDays = productValidityDays[productId] || 30;
        const expireDate = new Date();
        expireDate.setDate(expireDate.getDate() + validityDays);

        // 如果是 Google Maps Scraper 产品，创建用户账户
        if (productId.startsWith('gmaps')) {
            // 生成随机密码
            const generatePassword = () => {
                const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
                let password = '';
                for (let i = 0; i < 10; i++) {
                    password += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                return password;
            };

            const password = generatePassword();

            // 检查是否是续费
            if (productId.startsWith('gmaps_renewal')) {
                // 续费：更新现有账户的到期时间
                const { data: existingUser } = await supabase
                    .from('user_accounts')
                    .select('*')
                    .eq('account', customerEmail)
                    .single();

                if (existingUser) {
                    // 计算新的到期时间（从当前到期时间或现在开始）
                    const currentExpiry = new Date(existingUser.expire_time);
                    const startDate = currentExpiry > new Date() ? currentExpiry : new Date();
                    const newExpiry = new Date(startDate);
                    newExpiry.setDate(newExpiry.getDate() + validityDays);

                    await supabase
                        .from('user_accounts')
                        .update({ expire_time: newExpiry.toISOString() })
                        .eq('account', customerEmail);
                }
            } else {
                // 新购：创建新账户
                await supabase
                    .from('user_accounts')
                    .upsert({
                        account: customerEmail,
                        password: password,
                        expire_time: expireDate.toISOString(),
                        status: 'active',
                        product_type: productId.includes('premium') ? 'premium' : 'standard',
                        created_at: new Date().toISOString()
                    }, { onConflict: 'account' });

                // 发送账户信息邮件（这里可以调用邮件发送函数）
                console.log(`[PayPal] New account created: ${customerEmail}, Password: ${password}`);
            }
        } else {
            // 生成激活码
            const generateLicenseKey = () => {
                const segments = [];
                for (let i = 0; i < 4; i++) {
                    let segment = '';
                    for (let j = 0; j < 5; j++) {
                        segment += 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'.charAt(Math.floor(Math.random() * 32));
                    }
                    segments.push(segment);
                }
                return segments.join('-');
            };

            const licenseKey = generateLicenseKey();

            // 保存激活码
            await supabase
                .from('activation_keys')
                .insert({
                    license_key: licenseKey,
                    product_id: productId,
                    customer_email: customerEmail,
                    expire_date: expireDate.toISOString(),
                    status: 'active',
                    created_at: new Date().toISOString()
                });

            console.log(`[PayPal] License key generated: ${licenseKey} for ${customerEmail}`);
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Payment completed successfully',
                orderId: orderId,
                outTradeNo: orderData.out_trade_no,
                productId: productId,
                email: customerEmail,
                expireDate: expireDate.toISOString()
            })
        };

    } catch (error) {
        console.error('PayPal capture failed:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                message: 'Failed to capture payment.',
                error: error.message
            })
        };
    }
};
