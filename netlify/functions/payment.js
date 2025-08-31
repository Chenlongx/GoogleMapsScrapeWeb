// // ▼▼▼【关键修改】▼▼▼
// // 这是根据调试结果确定的唯一正确的导入方式
// const { AlipaySdk } = require('alipay-sdk');
// const { createClient } = require('@supabase/supabase-js');

// // 允许的来源白名单
// const allowedOrigins = [
//     'http://localhost:8888',
//     'https://google-maps-backend-master.netlify.app',
//     'https://mediamingle.cn'
// ];

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

//     // 2. 响应浏览器的 OPTIONS 预检请求
//     if (event.httpMethod === 'OPTIONS') {
//         return {
//             statusCode: 204, // No Content
//             headers: headers,
//             body: ''
//         };
//     }

//     // 3. 拒绝非 POST 请求
//     if (event.httpMethod !== 'POST') {
//         return {
//             statusCode: 405, // Method Not Allowed
//             headers: headers,
//             body: 'Method Not Allowed'
//         };
//     }
    
//     // 4. 执行核心支付逻辑
//     try {
//         // ⚠️【严重安全警告】⚠️
//         // 下方的密钥信息是直接写在代码里的（硬编码）。
//         // 在您网站正式上线接受真实付款前，请【务必】将它们迁移到 Netlify 的环境变量中，以防资金被盗！
//         const alipaySdk = new AlipaySdk({
//             appId: "9021000151648033",
//             privateKey: "MIIEpAIBAAKCAQEAuyQsu7D1lEURImiydWQSZiHmAiQsXryFGhvfrELl3m7d4QA1+tFJmqVg7EkNvkBwcjMD1j37XUZQ7Fjfpm0gcvBxK2ZVn1rww8iQq3gOcAvHwP2weVYuhpwDEYuFoVbmdeAZIp0rwAhWeGVkPLlDSOkKDEYZxBdNm5JU59d5Tu9qbC/sIix3vxuyXz+Powvc6OZ9vRcjeuIPiP6WnYvtE0SfBE/YzHxvlQE8nAUs08XfhXviXcu0ROFi9EMd9I8prcL6x5lxwW9LsgeJ+zgFoy8f6lMcVYzFEI5m68Bm5Q0HBeFm9hCVFoab4Ntq06lzC/kfJQB5qqIF2R/dnsLaYQIDAQABAoIBAHbP2Law+rlPwDkgT2zIRAYjr2vcm27qMXcKC0/KiTZXHPcksyCyjxBnvslE+Dy5nKpkSSNT5qqpYecr5ZI75kYS8UakiefKTOGADJlQd5obYI7egZQHazJ7ClexRP3Rti9QP6UCNCyPHpcBiEolNNqtWXvBZcphIRyMIuuumY3Kyj89sEu5Dygl1BWG6pUA9kOQgU4MWVtDsB935RGbEEwn1HuQ0TwjY4uqhHfI4z+JLzSPOlMRcyuv4ahrzvFWBVne3D8VuF4w+5itcJR67SQhonACWICDGuN+YHS3UQFYs9iZrC5vQuSP14Yl4n93EoZCxrdB5rbfokWGS7k/SAECgYEA+roj1FVReDKDMKznXG9UccbUo8/oIY+1bLGqc9eRoG+RL2cpEEc7a+ejjZDjLiTZfncc+N0ehcwXKxR0AKHCz14B3wIQmIyHH4oRwyMVlgr0HuwTvX67x4RCjFdmt+EXBzBPZJBSn+ZdBvTvjuHHKLXg+VRPS/uO1x/Qb2dxrTECgYEAvxOz5CiL4cNMlNK2tEkOhSSvn/PkZEPjq1ZFMaEC//Uct2goIccIzjqLaNb5d5F2NN6Ji201+nZolFv19D3ADjdQjQrgEm1OZOXmEUFMgpmRJmQnylIkjBn/JIpC6IB69p8yMf5nw1pHbxUvSdK3mm+O7/RfrjIpUzbezfRO9DECgYBYufZj9a1W88kpOIbHVz5y5QHq1nA3MDvrsxO22tpWBCVEuST29b45eUePmW5Lrg6pik1eZCGhB5BLVnmWn6fo6kOPP5PP6CsJJjsS6x+AcW/iYXi63lZlTJCgSW24NJeJm7b8x3X1z/ertpHv5kYsSfDLSuKk6OiriD6ireC0gQKBgQCMUevJof0XzlRu9k82FnCTVl2jGXigKTsImFI4IAYT8e0kw1i1dXUB/fxjAXwyUqB8MvDPc2QwisRCL0ZwFujzh6uf6FylK6BmeG58PXfycNQnXWXbLneoa27zZpW8KJ4kfsRd8nZBAAt1iBkyHYy33TUbAltBkZTHh4QXu1JAAQKBgQDQ4MwUAVxToTKDIW7YaU4aokqrtbiacoNbR5UH8DGE6LlwnP76jDggWl206gaYB269OxiRDk9w+/atqE0dN7aCv0l/tbpI6yYdCUHQ9KYrzXKpGZhNkUgb2z/53UTcMHnRf0GYFJcQcbjoJW7T7aJ3PNOfZkhrNs/hIA64MBSaAw==",
//             alipayPublicKey: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAhNlncu+dbzYz0nXFFZYAkF+NolGCWOyyzTY3JoVG5IdG0DmrMSI9SJo7kV2r9yv28kMSAHyUojvX+WOh0BYCrpXbSG8DZiGCIgnxbg4IgamqtZ5y+KOdgxo4snooebcwPE2Ft1x3LLsDIA5Juo0OdD3PZYlaj3rcrzAj6MN9ckUaNLPk5A8Ta/avYVITQ3PTgLKmSpiAE8SdHLcuXmODWdromUBxXgHvaAOE9TWu7nFxBykvILHb71d//QCy2BOpngOn6rzPgI56PZAkPeMYpy1thZKkp9zRBKK1FRN0rFNa2G1uvc7Jsflp0t5c6YGGE3iO9J8AOvR4HnsY9YvdgwIDAQAB",
//             gateway: "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
//         });

//         const { productId, price, email } = JSON.parse(event.body);

//         if (!productId || !price || !email) {
//             return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Missing parameters' }) };
//         }

//         const encodedEmail = Buffer.from(email).toString('base64');
//         const outTradeNo = `${productId}-${Date.now()}-${encodedEmail}`;
//         let subject = '未知商品';
//         if (productId.startsWith('gmaps')) {
//             subject = productId.includes('premium') ? 'Google Maps Scraper 高级版' : 'Google Maps Scraper 标准版';
//         } else if (productId.startsWith('validator')) {
//             subject = productId.includes('premium') ? 'Email Validator 高级版激活码' : 'Email Validator 标准版激活码';
//         }

//         // const supabase = createClient(
//         //     process.env.SUPABASE_URL,
//         //     process.env.SUPABASE_ANON_KEY
//         // );
//         const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);


//         const { error: insertError } = await supabase.from('orders').insert([
//             {
//                 out_trade_no: outTradeNo,
//                 product_id: productId,    // 使用 productId 对应你的 product_id 字段
//                 customer_email: email,    // 使用 email 对应你的 customer_email 字段
//                 status: 'PENDING'         // 初始状态为待支付
//                 // 移除了不存在的 price 和 plan 字段
//             }
//         ]);

//         if (insertError) {
//             // 如果插入数据库失败，就直接报错，不继续生成二维码
//             console.error('Supabase insert error:', insertError);
//             throw new Error(`Failed to create order in database: ${insertError.message}`);
//         }


//         const result = await alipaySdk.exec('alipay.trade.precreate', {
//             bizContent: {
//                 out_trade_no: outTradeNo,
//                 total_amount: price,
//                 subject: subject,
//                 notify_url: `https://mediamingle.cn/.netlify/functions/alipay-notify`
//             },
//         });

//         return {
//             statusCode: 200,
//             headers: headers,
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
//             headers: headers,
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
            gateway: "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
            timeout: 10000 // 【超时修复】将超时时间增加到10秒
        });

        const { productId, price, email } = JSON.parse(event.body);

        if (!productId || !price || !email) {
            return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Missing parameters' }) };
        }

        const encodedEmail = Buffer.from(email).toString('base64');
        const outTradeNo = `${productId}-${Date.now()}-${encodedEmail}`;
        let subject = '未知商品';
        if (productId.startsWith('gmaps')) {
            subject = productId.includes('premium') ? 'Google Maps Scraper 高级版' : 'Google Maps Scraper 标准版';
        } else if (productId.startsWith('validator')) {
            subject = productId.includes('premium') ? 'Email Validator 高级版激活码' : 'Email Validator 标准版激活码';
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