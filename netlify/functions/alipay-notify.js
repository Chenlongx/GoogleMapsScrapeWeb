// const { AlipaySdk } = require('alipay-sdk');
// const { createClient } = require('@supabase/supabase-js');
// const { Resend } = require('resend');

// // --- 辅助函数：生成随机密码 ---
// function generatePassword() {
//     return Math.random().toString(36).slice(-8);
// }

// // --- 核心业务逻辑 ---
// async function processBusinessLogic(orderParams) {
//     console.log('[Debug] Entered processBusinessLogic function with params:', orderParams);

//     // 验证 orderParams 是否有效
//     if (!orderParams || typeof orderParams.get !== 'function') {
//         console.error('[Critical] orderParams is invalid or missing get method. Full params:', orderParams);
//         return { success: false, error: 'Invalid orderParams' };
//     }

//     const rawSubject = orderParams.get('subject');
//     console.log('[Debug] Raw subject:', rawSubject);
//     if (!rawSubject || typeof rawSubject !== 'string') {
//         console.error('[Critical] subject is missing or invalid. Full params:', JSON.stringify(Object.fromEntries(orderParams.entries())));
//         return { success: false, error: 'Missing or invalid subject' };
//     }

//     // 解码中文和空格
//     let productId;
//     try {
//         productId = decodeURIComponent(rawSubject.replace(/\+/g, ' '));
//         console.log('[Debug] Decoded productId:', productId);
//     } catch (err) {
//         console.error('[Critical] Failed to decode subject:', err.message);
//         return { success: false, error: `Failed to decode subject: ${err.message}` };
//     }

//     if (!productId || typeof productId !== 'string') {
//         console.error('[Critical] productId is empty or invalid after decoding.');
//         return { success: false, error: 'Invalid productId' };
//     }

//     const outTradeNo = orderParams.get('out_trade_no') || '';
//     console.log('[Debug] outTradeNo:', outTradeNo);

//     if (!outTradeNo) {
//         console.error('[Critical] outTradeNo is missing. Aborting.');
//         return { success: false, error: 'Missing outTradeNo' };
//     }

//     let customerEmail;
//     try {
//         customerEmail = Buffer.from(outTradeNo.split('-')[2] || '', 'base64').toString('ascii');
//         console.log('[Debug] Decoded customerEmail:', customerEmail);
//     } catch (err) {
//         console.error('[Critical] Failed to decode customerEmail from outTradeNo:', err.message);
//         return { success: false, error: `Failed to decode customerEmail: ${err.message}` };
//     }

//     if (!customerEmail) {
//         console.error('[Critical] customerEmail is empty or invalid.');
//         return { success: false, error: 'Invalid customerEmail' };
//     }

//     const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
//     const resend = new Resend(process.env.RESEND_API_KEY);

//     let emailSubject = '';
//     let emailHtml = '';

//     try {
//         if (productId.includes('Google Maps Scraper')) {
//             const password = generatePassword();
//             const userType = productId.includes('高级版') ? 'premium' : 'standard';
//             const expiryDate = new Date();
//             expiryDate.setDate(expiryDate.getDate() + 30);

//             const { error } = await supabase.from('user_accounts').insert({
//                 account: customerEmail,
//                 password: password,
//                 user_type: userType,
//                 status: 'active',
//                 expiry_at: expiryDate.toISOString()
//             });

//             if (error) throw new Error(`Failed to create user account: ${error.message}`);

//             emailSubject = '您的 Google Maps Scraper 账户已成功开通！';
//             emailHtml = `<h1>欢迎！</h1>
//                 <p>您的账户 (${customerEmail}) 已成功开通。</p>
//                 <p><strong>登录密码:</strong> ${password}</p>
//                 <p>请登录网站开始使用，并及时修改您的密码。</p>
//                 <p>感谢您的支持！</p>`;

//         } else if (productId.includes('Email Validator')) {
//             const { data: license, error: findError } = await supabase
//                 .from('licenses')
//                 .select('key')
//                 .eq('status', 'available')
//                 .limit(1)
//                 .single();

//             if (findError || !license) throw new Error('No available license keys.');

//             const activationCode = license.key;
//             const { error: updateError } = await supabase
//                 .from('licenses')
//                 .update({ status: 'activated', activation_date: new Date().toISOString(), customer_email: customerEmail })
//                 .eq('key', activationCode);

//             if (updateError) throw new Error(`Failed to update license key status: ${updateError.message}`);

//             emailSubject = '您的 Email Validator 激活码';
//             emailHtml = `<h1>感谢您的购买！</h1>
//                 <p>您的激活码是：<strong>${activationCode}</strong></p>
//                 <p>请在软件中使用此激活码激活。</p>`;
//         } else {
//             console.warn('[Info] productId does not match any known products:', productId);
//             return { success: false, error: `Unknown productId: ${productId}` };
//         }

//         await resend.emails.send({
//             from: 'LeadScout <noreply@mediamingle.cn>',
//             to: customerEmail,
//             subject: emailSubject,
//             html: emailHtml,
//         });

//         console.log(`[processBusinessLogic] Email sent to ${customerEmail}`);
//         return { success: true };

//     } catch (err) {
//         console.error('[Critical Error] in processBusinessLogic:', err.message);
//         return { success: false, error: err.message };
//     }
// }

// // --- Netlify 主函数 ---
// exports.handler = async (event) => {
//     console.log('--- [alipay-notify.js] Function Invoked ---');

//     if (event.httpMethod !== 'POST') {
//         console.error('[Error] Invalid HTTP method:', event.httpMethod);
//         return { statusCode: 405, body: 'Method Not Allowed' };
//     }

//     try {
//         console.log('Raw body from Alipay:', event.body);

//         const params = new URLSearchParams(event.body);
//         const paramsJSON = Object.fromEntries(params.entries());
//         console.log('[Debug] Parsed params:', paramsJSON);


//         // ▼▼▼ 关键修改：手动格式化被 Netlify 压成一行的密钥 ▼▼▼
//         let privateKey = process.env.ALIPAY_PRIVATE_KEY;
//         if (privateKey && !privateKey.includes('\n')) {
//             console.log('[Info] Reformatting single-line private key...');
//             privateKey = privateKey
//                 .replace('-----BEGIN RSA PRIVATE KEY-----', '-----BEGIN RSA PRIVATE KEY-----\n')
//                 .replace('-----END RSA PRIVATE KEY-----', '\n-----END RSA PRIVATE KEY-----');
//         }

//         let publicKey = process.env.ALIPAY_PUBLIC_KEY;
//         if (publicKey && !publicKey.includes('\n')) {
//             console.log('[Info] Reformatting single-line public key...');
//             publicKey = publicKey
//                 .replace('-----BEGIN PUBLIC KEY-----', '-----BEGIN PUBLIC KEY-----\n')
//                 .replace('-----END PUBLIC KEY-----', '\n-----END PUBLIC KEY-----');
//         }
//         // ▲▲▲ 修改结束 ▲▲▲


//         // 2️⃣ Alipay 签名验证
//         const alipaySdk = new AlipaySdk({
//             appId: process.env.ALIPAY_APP_ID,
//             privateKey: privateKey, // 使用修复后的 privateKey
//             alipayPublicKey: publicKey, // 使用修复后的 publicKey
//             gateway: process.env.ALIPAY_GATEWAY,
//         });

//         let isSignVerified = false;
//         if (process.env.NODE_ENV === 'development') {
//             console.log('⚠️ Skipping Alipay signature verification in development mode.');
//             isSignVerified = true;
//         } else {
//             isSignVerified = alipaySdk.checkNotifySign(paramsJSON);
//         }

//         if (!isSignVerified) {
//             console.error('Alipay sign verification failed.');
//             return { statusCode: 200, body: 'failure' };
//         }
        
//         console.log('✅ Alipay sign verification successful!');

//         const tradeStatus = params.get('trade_status');
//         console.log('Received trade_status:', tradeStatus);

//         if (tradeStatus === 'TRADE_SUCCESS') {
//             const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
//             const outTradeNo = params.get('out_trade_no');

//             console.log(`Updating order status for ${outTradeNo}...`);
//             const { error: updateOrderStatusError } = await supabase.from('orders')
//                 .update({ status: 'completed' })
//                 .eq('out_trade_no', outTradeNo);

//             if (updateOrderStatusError) {
//                 console.error(`Failed to update order status for ${outTradeNo}:`, updateOrderStatusError.message);
//             } else {
//                 console.log(`Order status updated successfully for ${outTradeNo}.`);
//             }

//             console.log('[Debug] Calling processBusinessLogic with params:', params);
//             const result = await processBusinessLogic(params);
//             if (!result.success) {
//                 console.error('[Error] processBusinessLogic failed:', result.error);
//                 // 即使业务逻辑失败，也告诉支付宝成功，避免重试
//                 return { statusCode: 200, body: 'success' };
//             }
//         }

//         return { statusCode: 200, body: 'success' };

//     } catch (error) {
//         console.error('--- CRITICAL ERROR in handler ---', error.message, error.stack);
//         return { statusCode: 200, body: 'failure' };
//     }
// };


const { AlipaySdk } = require('alipay-sdk');
const { createClient } = require('@supabase/supabase-js');
const { processBusinessLogic } = require('./business-logic.js'); // 引入核心业务逻辑

// 格式化密钥的辅助函数
function formatKey(key, type) {
    if (!key || key.includes('\n')) return key;
    const header = type === 'private' ? '-----BEGIN RSA PRIVATE KEY-----' : '-----BEGIN PUBLIC KEY-----';
    const footer = type === 'private' ? '-----END RSA PRIVATE KEY-----' : '-----END PUBLIC KEY-----';
    return key.replace(header, `${header}\n`).replace(footer, `\n${footer}`);
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const params = new URLSearchParams(event.body);
        const paramsJSON = Object.fromEntries(params.entries());

        const alipaySdk = new AlipaySdk({
            appId: process.env.ALIPAY_APP_ID,
            privateKey: formatKey(process.env.ALIPAY_PRIVATE_KEY, 'private'),
            alipayPublicKey: formatKey(process.env.ALIPAY_PUBLIC_KEY, 'public'),
            gateway: process.env.ALIPAY_GATEWAY,
        });

        const isSignVerified = alipaySdk.checkNotifySign(paramsJSON);
        if (!isSignVerified) {
            console.error('Alipay sign verification failed.');
            return { statusCode: 200, body: 'failure' };
        }
        
        console.log('[alipay-notify] Sign verification successful!');
        
        const tradeStatus = params.get('trade_status');
        const outTradeNo = params.get('out_trade_no');

        if (tradeStatus === 'TRADE_SUCCESS') {
            const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
            
            // ▼▼▼ 防止重复处理的关键检查 ▼▼▼
            const { data: existingOrder, error } = await supabase
                .from('orders')
                .select('status')
                .eq('out_trade_no', outTradeNo)
                .single();

            if (error || !existingOrder) {
                 console.error(`[alipay-notify] Order ${outTradeNo} not found in DB.`);
                 return { statusCode: 200, body: 'failure' };
            }
            
            // 如果订单状态已经是 completed (由 check-status 主动查询处理过了)，则直接告诉支付宝成功，不再重复处理
            if (existingOrder.status === 'completed') {
                console.log(`[alipay-notify] Order ${outTradeNo} is already completed. Skipping.`);
                return { statusCode: 200, body: 'success' };
            }
            // ▲▲▲ 检查结束 ▲▲▲

            console.log(`[alipay-notify] Updating order status for ${outTradeNo}...`);
            await supabase.from('orders').update({ status: 'completed' }).eq('out_trade_no', outTradeNo);
            
            // 调用核心业务逻辑
            await processBusinessLogic(params);
        }

        return { statusCode: 200, body: 'success' };

    } catch (error) {
        console.error('[Critical Error] in alipay-notify:', error.message, error.stack);
        return { statusCode: 200, body: 'failure' };
    }
};