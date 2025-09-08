// const { AlipaySdk } = require('alipay-sdk');
// const { createClient } = require('@supabase/supabase-js');

// // 允许的来源白名单
// const allowedOrigins = [
//     'http://localhost:8888',
//     'https://google-maps-backend-master.netlify.app',
//     'https://mediamingle.cn'
// ];

// // 格式化密钥的辅助函数
// function formatKey(key, type) {
//     if (!key || key.includes('\n')) {
//         return key; // 如果密钥不存在或已包含换行符，则直接返回
//     }
    
//     console.log(`[Info] Reformatting single-line ${type} key...`);
    
//     const header = type === 'private' 
//         ? '-----BEGIN RSA PRIVATE KEY-----' 
//         : '-----BEGIN PUBLIC KEY-----';
//     const footer = type === 'private' 
//         ? '-----END RSA PRIVATE KEY-----' 
//         : '-----END PUBLIC KEY-----';

//     return key.replace(header, `${header}\n`).replace(footer, `\n${footer}`);
// }

// // 后端权威价格表 (人民币, CNY)
// const productPriceMap = {
//     'gmaps_standard': 34.30,
//     'gmaps_premium': 63.00,
//     'validator_standard': 203.00,
//     'validator_premium': 553.00,
//     'whatsapp-validator_standard': 203.00,
//     'whatsapp-validator_premium': 343.00,
//     'gmaps_renewal_monthly': 29.90,
//     'gmaps_renewal_quarterly': 89.70,
//     'gmaps_renewal_yearly': 358.80
// };

// exports.handler = async (event) => {
//     const origin = event.headers.origin;

//     // 1. 统一设置CORS响应头
//     const headers = {
//         'Access-Control-Allow-Headers': 'Content-Type',
//         'Access-Control-Allow-Methods': 'POST, OPTIONS'
//     };
//     if (allowedOrigins.includes(origin)) {
//         headers['Access-Control-Allow-Origin'] = origin;
//     }

//     // 2. 响应 OPTIONS 预检请求
//     if (event.httpMethod === 'OPTIONS') {
//         return { statusCode: 204, headers, body: '' };
//     }

//     // 3. 拒绝非 POST 请求
//     if (event.httpMethod !== 'POST') {
//         return { statusCode: 405, headers, body: 'Method Not Allowed' };
//     }
    
//     // 4. 执行核心支付逻辑
//     try {
//         const alipaySdk = new AlipaySdk({
//             appId: process.env.ALIPAY_APP_ID,
//             privateKey: formatKey(process.env.ALIPAY_PRIVATE_KEY, 'private'),
//             alipayPublicKey: formatKey(process.env.ALIPAY_PUBLIC_KEY, 'public'),
//             gateway: "https://openapi.alipay.com/gateway.do",
//             timeout: 10000
//         });

//         // --- ▼▼▼ 【核心修复 1】不再接收和验证前端的价格 ▼▼▼ ---
//         // 只从前端接收 productId 和 email
//         const { productId, email } = JSON.parse(event.body);
//         if (!productId || !email) {
//             return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Missing parameters' }) };
//         }

//         // 直接从后端的权威价格表中查找价格
//         const price = productPriceMap[productId];
//         // 如果找不到对应的产品ID，说明请求无效
//         if (!price) {
//             console.error(`[Security Error] Invalid productId received: ${productId}`);
//             return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid product' }) };
//         }
//         // --- ▲▲▲ 修复结束 ▲▲▲ ---

//         const productCodeMap = {
//             'gmaps_standard': 'gs',
//             'gmaps_premium': 'gp',
//             'validator_standard': 'vs',
//             'validator_premium': 'vp',
//             'whatsapp-validator_standard': 'wvs',
//             'whatsapp-validator_premium': 'wvp',
//             'gmaps_renewal_monthly': 'grm',
//             'gmaps_renewal_quarterly': 'grq',
//             'gmaps_renewal_yearly': 'gry'
//         };
//         const productCode = productCodeMap[productId] || 'unknown';

//         const encodedEmail = Buffer.from(email).toString('base64');
//         const outTradeNo = `${productCode}-${Date.now()}-${encodedEmail}`;

//         let subject = '未知商品';
//         if (productId.startsWith('gmaps_renewal')) {
//             if (productId.includes('monthly')) subject = '谷歌地图抓取器 - 月度续费';
//             else if (productId.includes('quarterly')) subject = '谷歌地图抓取器 - 季度续费';
//             else if (productId.includes('yearly')) subject = '谷歌地图抓取器 - 年度续费';
//         } else if (productId.startsWith('gmaps')) {
//             subject = productId.includes('premium') ? 'Google Maps Scraper 高级版' : 'Google Maps Scraper 标准版';
//         } else if (productId.startsWith('validator')) {
//             subject = productId.includes('premium') ? 'Email Validator 高级版激活码' : 'Email Validator 标准版激活码';
//         } else if (productId.startsWith('whatsapp-validator')) {
//             subject = productId.includes('premium') ? 'WhatsApp Validator 高级版激活码' : 'WhatsApp Validator 标准版激活码';
//         }

//         const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

//         let customerEmail = email;

//         const { error: insertError } = await supabase.from('orders').insert([
//             {
//                 out_trade_no: outTradeNo,
//                 product_id: productId,
//                 customer_email: email,
//                 status: 'PENDING'
//             }
//         ]);

//         if (insertError) {
//             console.error('Supabase insert error:', insertError);
//             throw new Error(`Failed to create order in database: ${insertError.message}`);
//         }

//         const result = await alipaySdk.exec('alipay.trade.precreate', {
//             bizContent: {
//                 out_trade_no: outTradeNo,
//                 total_amount: price, // 【关键】使用从后端查到的、安全的价格
//                 subject: subject,
//                 notify_url: `https://mediamingle.cn/.netlify/functions/alipay-notify`
//             },
//         });

//         return {
//             statusCode: 200,
//             headers,
//             body: JSON.stringify({
//                 success: true,
//                 qrCodeUrl: result.qrCode,
//                 outTradeNo: outTradeNo
//             })
//         };

//     } catch (error) {
//         console.error('Function execution error:', error);
//         return {
//             statusCode: 500,
//             headers,
//             body: JSON.stringify({ success: false, message: 'Failed to create payment order.', error: error.message })
//         };
//     }
// };




const { AlipaySdk } = require('alipay-sdk');
const { createClient } = require('@supabase/supabase-js');

// 允许的来源白名单
const allowedOrigins = [
    'http://localhost:8888',
    'https://google-maps-backend-master.netlify.app',
    'https://mediamingle.cn'
];

// 格式化密钥的辅助函数
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

// 后端权威价格表 (人民币, CNY)
const productPriceMap = {
    'gmaps_standard': 34.30,
    'gmaps_premium': 63.00,
    'validator_standard': 203.00,
    'validator_premium': 553.00,
    'whatsapp-validator_standard': 203.00,
    'whatsapp-validator_premium': 343.00,
    'gmaps_renewal_monthly': 29.90,
    'gmaps_renewal_quarterly': 89.70,
    'gmaps_renewal_yearly': 358.80
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
        const alipaySdk = new AlipaySdk({
            appId: process.env.ALIPAY_APP_ID,
            privateKey: formatKey(process.env.ALIPAY_PRIVATE_KEY, 'private'),
            alipayPublicKey: formatKey(process.env.ALIPAY_PUBLIC_KEY, 'public'),
            gateway: "https://openapi.alipay.com/gateway.do",
            timeout: 10000
        });

        // 从前端接收 productId 和 identifier (字段名仍为 email)
        const { productId, email } = JSON.parse(event.body);
        if (!productId || !email) {
            return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Missing parameters' }) };
        }

        // 直接从后端的权威价格表中查找价格
        const price = productPriceMap[productId];
        // 如果找不到对应的产品ID，说明请求无效
        if (!price) {
            console.error(`[Security Error] Invalid productId received: ${productId}`);
            return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid product' }) };
        }
        
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        
        // 默认为用户输入的值，对于新购场景，该值直接使用
        let customerEmail = email; 

        // ▼▼▼【核心修改】续费时，支持邮箱或用户名，并查询数据库 ▼▼▼
        // 此逻辑仅针对续费产品触发
        if (productId.startsWith('gmaps_renewal')) {
            const identifier = email; // 为了代码清晰，我们将接收到的'email'字段值称为“标识符”
            console.log(`[Info] Renewal check for identifier: ${identifier}`);

            let userRecord = null;
            let dbQueryError = null;

            // 1. 判断标识符是邮箱还是用户名，并执行相应查询
            //    前提：Supabase中有一个名为'users'的表，且包含'email'和'username'字段
            if (identifier.includes('@')) {
                // 按邮箱查询
                const { data, error } = await supabase
                    .from('users') 
                    .select('email') // 查询真实邮箱以确保规范
                    .eq('email', identifier)
                    .single();
                userRecord = data;
                dbQueryError = error;
            } else {
                // 按用户名查询
                const { data, error } = await supabase
                    .from('users')
                    .select('email') // 核心：即使用户名登录，我们也需要获取其关联的真实邮箱
                    .eq('username', identifier) 
                    .single();
                userRecord = data;
                dbQueryError = error;
            }

            // 2. 处理查询结果
            // PGRST116 是 PostgREST "找不到行" 的错误码，这种情况我们视为用户不存在，而非服务器错误
            if (dbQueryError && dbQueryError.code !== 'PGRST116') { 
                console.error('Supabase query error during renewal user check:', dbQueryError);
                throw new Error('Database query failed during user validation.');
            }

            // 如果查询结果为空，说明用户不存在
            if (!userRecord) {
                console.warn(`[Renewal Blocked] User not found for identifier: ${identifier}`);
                return {
                    statusCode: 404, // 404 Not Found 更符合语义
                    headers,
                    body: JSON.stringify({ success: false, message: '续费失败：该账户不存在。' })
                };
            }
            
            // 3. 关键：无论用户输入的是什么（邮箱或用户名），我们都使用从数据库中查到的、真实的、规范的邮箱地址进行后续操作
            customerEmail = userRecord.email;
            console.log(`[Info] User validated. Proceeding with canonical email: ${customerEmail}`);
        }
        // ▲▲▲ 修改结束 ▲▲▲

        const productCodeMap = {
            'gmaps_standard': 'gs',
            'gmaps_premium': 'gp',
            'validator_standard': 'vs',
            'validator_premium': 'vp',
            'whatsapp-validator_standard': 'wvs',
            'whatsapp-validator_premium': 'wvp',
            'gmaps_renewal_monthly': 'grm',
            'gmaps_renewal_quarterly': 'grq',
            'gmaps_renewal_yearly': 'gry'
        };
        const productCode = productCodeMap[productId] || 'unknown';

        // 使用经过验证或新购的 customerEmail
        const encodedEmail = Buffer.from(customerEmail).toString('base64');
        const outTradeNo = `${productCode}-${Date.now()}-${encodedEmail}`;

        let subject = '未知商品';
        if (productId.startsWith('gmaps_renewal')) {
            if (productId.includes('monthly')) subject = '谷歌地图抓取器 - 月度续费';
            else if (productId.includes('quarterly')) subject = '谷歌地图抓取器 - 季度续费';
            else if (productId.includes('yearly')) subject = '谷歌地图抓取器 - 年度续费';
        } else if (productId.startsWith('gmaps')) {
            subject = productId.includes('premium') ? 'Google Maps Scraper 高级版' : 'Google Maps Scraper 标准版';
        } else if (productId.startsWith('validator')) {
            subject = productId.includes('premium') ? 'Email Validator 高级版激活码' : 'Email Validator 标准版激活码';
        } else if (productId.startsWith('whatsapp-validator')) {
            subject = productId.includes('premium') ? 'WhatsApp Validator 高级版激活码' : 'WhatsApp Validator 标准版激活码';
        }

        // 使用经过验证或新购的 customerEmail 插入订单
        const { error: insertError } = await supabase.from('orders').insert([
            {
                out_trade_no: outTradeNo,
                product_id: productId,
                customer_email: customerEmail, // 确保使用正确的邮箱
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