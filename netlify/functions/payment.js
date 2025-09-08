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




// payment.js
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
        return key;
    }
    console.log(`[Info] Reformatting single-line ${type} key...`);
    const header = type === 'private' ? '-----BEGIN RSA PRIVATE KEY-----' : '-----BEGIN PUBLIC KEY-----';
    const footer = type === 'private' ? '-----END RSA PRIVATE KEY-----' : '-----END PUBLIC KEY-----';
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

    const headers = {
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
        return { statusCode: 405, headers, body: 'Method Not Allowed' };
    }
    
    try {
        const alipaySdk = new AlipaySdk({
            appId: process.env.ALIPAY_APP_ID,
            privateKey: formatKey(process.env.ALIPAY_PRIVATE_KEY, 'private'),
            alipayPublicKey: formatKey(process.env.ALIPAY_PUBLIC_KEY, 'public'),
            gateway: "https://openapi.alipay.com/gateway.do",
            timeout: 10000
        });

        const { productId, email: identifierFromFrontend } = JSON.parse(event.body);
        if (!productId || !identifierFromFrontend) {
            return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Missing parameters' }) };
        }

        const price = productPriceMap[productId];
        if (!price) {
            console.error(`[Security Error] Invalid productId received: ${productId}`);
            return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid product' }) };
        }
        
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        
        let finalIdentifier = identifierFromFrontend; 

        // ▼▼▼【核心修改】根据您的数据库结构进行简化和修正 ▼▼▼
        if (productId.startsWith('gmaps_renewal')) {
            console.log(`[Info] Renewal check for identifier: ${identifierFromFrontend}`);

            // 1. 逻辑简化：不再区分邮箱和账号，统一在 'account' 字段中查询
            const { data: userRecord, error: dbQueryError } = await supabase
                .from('user_accounts') 
                .select('account') // 只查询存在的 'account' 字段
                .eq('account', identifierFromFrontend) // 在 'account' 字段中匹配前端传来的值
                .single();

            if (dbQueryError && dbQueryError.code !== 'PGRST116') { 
                console.error('Supabase query error during renewal user check:', dbQueryError);
                throw new Error('Database query failed during user validation.');
            }

            if (!userRecord) {
                console.warn(`[Renewal Blocked] User not found for identifier: ${identifierFromFrontend}`);
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ success: false, message: '续费失败：该账户不存在。' })
                };
            }
            
            // 2. 使用从数据库中查到的、权威的账户信息作为最终标识符
            finalIdentifier = userRecord.account;
            console.log(`[Info] User validated. Proceeding with identifier: ${finalIdentifier}`);
        }
        // ▲▲▲ 修改结束 ▲▲▲

        const productCodeMap = {
            'gmaps_standard': 'gs', 'gmaps_premium': 'gp', 'validator_standard': 'vs',
            'validator_premium': 'vp', 'whatsapp-validator_standard': 'wvs', 'whatsapp-validator_premium': 'wvp',
            'gmaps_renewal_monthly': 'grm', 'gmaps_renewal_quarterly': 'grq', 'gmaps_renewal_yearly': 'gry'
        };
        const productCode = productCodeMap[productId] || 'unknown';

        const encodedIdentifier = Buffer.from(finalIdentifier).toString('base64');
        const outTradeNo = `${productCode}-${Date.now()}-${encodedIdentifier}`;

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

        const { error: insertError } = await supabase.from('orders').insert([
            {
                out_trade_no: outTradeNo,
                product_id: productId,
                customer_email: finalIdentifier, // 将最终标识符存入订单表
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