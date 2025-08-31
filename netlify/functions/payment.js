// ▼▼▼【关键修改】▼▼▼
// 这是根据调试结果确定的唯一正确的导入方式
const { AlipaySdk } = require('alipay-sdk');
const { createClient } = require('@supabase/supabase-js');

// 允许的来源白名单
const allowedOrigins = [
    'http://localhost:8888',
    'https://google-maps-backend-master.netlify.app',
    'https://mediamingle.cn'
];

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

    // 2. 响应浏览器的 OPTIONS 预检请求
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204, // No Content
            headers: headers,
            body: ''
        };
    }

    // 3. 拒绝非 POST 请求
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405, // Method Not Allowed
            headers: headers,
            body: 'Method Not Allowed'
        };
    }
    
    // 4. 执行核心支付逻辑
    try {
        // ⚠️【严重安全警告】⚠️
        // 下方的密钥信息是直接写在代码里的（硬编码）。
        // 在您网站正式上线接受真实付款前，请【务必】将它们迁移到 Netlify 的环境变量中，以防资金被盗！
        const alipaySdk = new AlipaySdk({
            appId: "9021000151648033",
            privateKey: "MIIEpAIBAAKCAQEAuyQsu7D1lEURImiydWQSZiHmAiQsXryFGhvfrELl3m7d4QA1+tFJmqVg7EkNvkBwcjMD1j37XUZQ7Fjfpm0gcvBxK2ZVn1rww8iQq3gOcAvHwP2weVYuhpwDEYuFoVbmdeAZIp0rwAhWeGVkPLlDSOkKDEYZxBdNm5JU59d5Tu9qbC/sIix3vxuyXz+Powvc6OZ9vRcjeuIPiP6WnYvtE0SfBE/YzHxvlQE8nAUs08XfhXviXcu0ROFi9EMd9I8prcL6x5lxwW9LsgeJ+zgFoy8f6lMcVYzFEI5m68Bm5Q0HBeFm9hCVFoab4Ntq06lzC/kfJQB5qqIF2R/dnsLaYQIDAQABAoIBAHbP2Law+rlPwDkgT2zIRAYjr2vcm27qMXcKC0/KiTZXHPcksyCyjxBnvslE+Dy5nKpkSSNT5qqpYecr5ZI75kYS8UakiefKTOGADJlQd5obYI7egZQHazJ7ClexRP3Rti9QP6UCNCyPHpcBiEolNNqtWXvBZcphIRyMIuuumY3Kyj89sEu5Dygl1BWG6pUA9kOQgU4MWVtDsB935RGbEEwn1HuQ0TwjY4uqhHfI4z+JLzSPOlMRcyuv4ahrzvFWBVne3D8VuF4w+5itcJR67SQhonACWICDGuN+YHS3UQFYs9iZrC5vQuSP14Yl4n93EoZCxrdB5rbfokWGS7k/SAECgYEA+roj1FVReDKDMKznXG9UccbUo8/oIY+1bLGqc9eRoG+RL2cpEEc7a+ejjZDjLiTZfncc+N0ehcwXKxR0AKHCz14B3wIQmIyHH4oRwyMVlgr0HuwTvX67x4RCjFdmt+EXBzBPZJBSn+ZdBvTvjuHHKLXg+VRPS/uO1x/Qb2dxrTECgYEAvxOz5CiL4cNMlNK2tEkOhSSvn/PkZEPjq1ZFMaEC//Uct2goIccIzjqLaNb5d5F2NN6Ji201+nZolFv19D3ADjdQjQrgEm1OZOXmEUFMgpmRJmQnylIkjBn/JIpC6IB69p8yMf5nw1pHbxUvSdK3mm+O7/RfrjIpUzbezfRO9DECgYBYufZj9a1W88kpOIbHVz5y5QHq1nA3MDvrsxO22tpWBCVEuST29b45eUePmW5Lrg6pik1eZCGhB5BLVnmWn6fo6kOPP5PP6CsJJjsS6x+AcW/iYXi63lZlTJCgSW24NJeJm7b8x3X1z/ertpHv5kYsSfDLSuKk6OiriD6ireC0gQKBgQCMUevJof0XzlRu9k82FnCTVl2jGXigKTsImFI4IAYT8e0kw1i1dXUB/fxjAXwyUqB8MvDPc2QwisRCL0ZwFujzh6uf6FylK6BmeG58PXfycNQnXWXbLneoa27zZpW8KJ4kfsRd8nZBAAt1iBkyHYy33TUbAltBkZTHh4QXu1JAAQKBgQDQ4MwUAVxToTKDIW7YaU4aokqrtbiacoNbR5UH8DGE6LlwnP76jDggWl206gaYB269OxiRDk9w+/atqE0dN7aCv0l/tbpI6yYdCUHQ9KYrzXKpGZhNkUgb2z/53UTcMHnRf0GYFJcQcbjoJW7T7aJ3PNOfZkhrNs/hIA64MBSaAw==",
            alipayPublicKey: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAhNlncu+dbzYz0nXFFZYAkF+NolGCWOyyzTY3JoVG5IdG0DmrMSI9SJo7kV2r9yv28kMSAHyUojvX+WOh0BYCrpXbSG8DZiGCIgnxbg4IgamqtZ5y+KOdgxo4snooebcwPE2Ft1x3LLsDIA5Juo0OdD3PZYlaj3rcrzAj6MN9ckUaNLPk5A8Ta/avYVITQ3PTgLKmSpiAE8SdHLcuXmODWdromUBxXgHvaAOE9TWu7nFxBykvILHb71d//QCy2BOpngOn6rzPgI56PZAkPeMYpy1thZKkp9zRBKK1FRN0rFNa2G1uvc7Jsflp0t5c6YGGE3iO9J8AOvR4HnsY9YvdgwIDAQAB",
            gateway: "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
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

        const supabase = createClient(
            "https://hyxryxarutbesoqxcprk.supabase.co",
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5eHJ5eGFydXRiZXNvcXhjcHJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ3MjQ5MjUsImV4cCI6MjA3MDMwMDkyNX0.kK3TmssDX7WhCuslv4MOYOR9ntXgtJLWbE5ArRMRzaQ"
        );


        const { error: insertError } = await supabase.from('orders').insert([
            {
                out_trade_no: outTradeNo,
                status: 'PENDING', // 初始状态为待支付
                plan: subject, // 使用 subject 作为 plan 描述
                user_email: email,
                price: parseFloat(price) // 存储价格
            }
        ]);

        if (insertError) {
            // 如果插入数据库失败，就直接报错，不继续生成二维码
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
            headers: headers,
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
            headers: headers,
            body: JSON.stringify({ success: false, message: 'Failed to create payment order.', error: error.message })
        };
    }
};
