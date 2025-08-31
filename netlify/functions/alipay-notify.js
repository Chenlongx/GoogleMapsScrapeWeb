const { AlipaySdk } = require('alipay-sdk');
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

// 生成一个简单的随机密码
function generatePassword() {
    return Math.random().toString(36).slice(-8);
}

// 核心业务逻辑处理函数
async function processBusinessLogic(orderParams) {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const resend = new Resend(process.env.RESEND_API_KEY);

    const outTradeNo = orderParams.get('out_trade_no');
    const customerEmail = Buffer.from(outTradeNo.split('-')[2], 'base64').toString('ascii');
    const productId = orderParams.get('subject');

    let emailSubject = '';
    let emailHtml = '';

    if (productId.includes('Google Maps Scraper')) {
        const password = generatePassword();
        const userType = productId.includes('高级版') ? 'premium' : 'standard';
        
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30);

        const { data, error } = await supabase.from('user_accounts').insert({
            account: customerEmail,
            password: password,
            user_type: userType,
            status: 'active',
            expiry_at: expiryDate.toISOString()
        }).select();

        if (error) {
            throw new Error(`Failed to create user account for ${customerEmail}: ${error.message}`);
        }

        console.log(`Successfully created account for ${customerEmail}`);
        
        emailSubject = '您的 Google Maps Scraper 账户已成功开通！';
        emailHtml = `<h1>欢迎！</h1>
                     <p>您的账户 (${customerEmail}) 已成功开通。</p>
                     <p><strong>登录密码:</strong> ${password}</p>
                     <p>请登录网站开始使用，并及时修改您的密码。</p>
                     <p>感谢您的支持！</p>`;
    } else if (productId.includes('Email Validator')) {
        const { data: license, error: findError } = await supabase
            .from('licenses')
            .select('key')
            .eq('status', 'available')
            .limit(1)
            .single();

        if (findError || !license) {
            console.error('CRITICAL: No available license keys in the database!');
            throw new Error('No available license keys.');
        }

        const activationCode = license.key;

        const { error: updateError } = await supabase
            .from('licenses')
            .update({ 
                status: 'activated', 
                activation_date: new Date().toISOString(),
                customer_email: customerEmail 
            })
            .eq('key', activationCode);
        
        if (updateError) {
            throw new Error(`Failed to update license key status for ${activationCode}: ${updateError.message}`);
        }

        console.log(`Successfully assigned license key ${activationCode} to ${customerEmail}`);
        
        emailSubject = '您的 Email Validator 激活码';
        emailHtml = `<h1>感谢您的购买！</h1>
                     <p>您的激活码是：<strong>${activationCode}</strong></p>
                     <p>请在软件中使用此激活码激活。祝您使用愉快！</p>`;
    }

    if (!emailSubject || !customerEmail) {
        console.error('Email subject or recipient is missing.');
        return;
    }

    await resend.emails.send({
        from: 'LeadScout <your-verified-domain.com>',
        to: customerEmail,
        subject: emailSubject,
        html: emailHtml,
    });
    console.log(`Purchase notification email sent successfully to ${customerEmail}`);
}

exports.handler = async (event) => {
    // --- 调试点 1: 函数是否被触发 ---
    console.log('--- [alipay-notify.js] Function Invoked ---');
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Request Method: ${event.httpMethod}`);

    if (event.httpMethod !== 'POST') {
        console.log('Request is not POST. Exiting.');
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        // 检查环境变量
         console.log('Raw body from Alipay:', event.body);

        // 初始化 Alipay SDK（公钥模式）
        const alipaySdk = new AlipaySdk({
            appId: "9021000151648033",
            privateKey: "MIIEpAIBAAKCAQEAuyQsu7D1lEURImiydWQSZiHmAiQsXryFGhvfrELl3m7d4QA1+tFJmqVg7EkNvkBwcjMD1j37XUZQ7Fjfpm0gcvBxK2ZVn1rww8iQq3gOcAvHwP2weVYuhpwDEYuFoVbmdeAZIp0rwAhWeGVkPLlDSOkKDEYZxBdNm5JU59d5Tu9qbC/sIix3vxuyXz+Powvc6OZ9vRcjeuIPiP6WnYvtE0SfBE/YzHxvlQE8nAUs08XfhXviXcu0ROFi9EMd9I8prcL6x5lxwW9LsgeJ+zgFoy8f6lMcVYzFEI5m68Bm5Q0HBeFm9hCVFoab4Ntq06lzC/kfJQB5qqIF2R/dnsLaYQIDAQABAoIBAHbP2Law+rlPwDkgT2zIRAYjr2vcm27qMXcKC0/KiTZXHPcksyCyjxBnvslE+Dy5nKpkSSNT5qqpYecr5ZI75kYS8UakiefKTOGADJlQd5obYI7egZQHazJ7ClexRP3Rti9QP6UCNCyPHpcBiEolNNqtWXvBZcphIRyMIuuumY3Kyj89sEu5Dygl1BWG6pUA9kOQgU4MWVtDsB935RGbEEwn1HuQ0TwjY4uqhHfI4z+JLzSPOlMRcyuv4ahrzvFWBVne3D8VuF4w+5itcJR67SQhonACWICDGuN+YHS3UQFYs9iZrC5vQuSP14Yl4n93EoZCxrdB5rbfokWGS7k/SAECgYEA+roj1FVReDKDMKznXG9UccbUo8/oIY+1bLGqc9eRoG+RL2cpEEc7a+ejjZDjLiTZfncc+N0ehcwXKxR0AKHCz14B3wIQmIyHH4oRwyMVlgr0HuwTvX67x4RCjFdmt+EXBzBPZJBSn+ZdBvTvjuHHKLXg+VRPS/uO1x/Qb2dxrTECgYEAvxOz5CiL4cNMlNK2tEkOhSSvn/PkZEPjq1ZFMaEC//Uct2goIccIzjqLaNb5d5F2NN6Ji201+nZolFv19D3ADjdQjQrgEm1OZOXmEUFMgpmRJmQnylIkjBn/JIpC6IB69p8yMf5nw1pHbxUvSdK3mm+O7/RfrjIpUzbezfRO9DECgYBYufZj9a1W88kpOIbHVz5y5QHq1nA3MDvrsxO22tpWBCVEuST29b45eUePmW5Lrg6pik1eZCGhB5BLVnmWn6fo6kOPP5PP6CsJJjsS6x+AcW/iYXi63lZlTJCgSW24NJeJm7b8x3X1z/ertpHv5kYsSfDLSuKk6OiriD6ireC0gQKBgQCMUevJof0XzlRu9k82FnCTVl2jGXigKTsImFI4IAYT8e0kw1i1dXUB/fxjAXwyUqB8MvDPc2QwisRCL0ZwFujzh6uf6FylK6BmeG58PXfycNQnXWXbLneoa27zZpW8KJ4kfsRd8nZBAAt1iBkyHYy33TUbAltBkZTHh4QXu1JAAQKBgQDQ4MwUAVxToTKDIW7YaU4aokqrtbiacoNbR5UH8DGE6LlwnP76jDggWl206gaYB269OxiRDk9w+/atqE0dN7aCv0l/tbpI6yYdCUHQ9KYrzXKpGZhNkUgb2z/53UTcMHnRf0GYFJcQcbjoJW7T7aJ3PNOfZkhrNs/hIA64MBSaAw==",
            alipayPublicKey: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAhNlncu+dbzYz0nXFFZYAkF+NolGCWOyyzTY3JoVG5IdG0DmrMSI9SJo7kV2r9yv28kMSAHyUojvX+WOh0BYCrpXbSG8DZiGCIgnxbg4IgamqtZ5y+KOdgxo4snooebcwPE2Ft1x3LLsDIA5Juo0OdD3PZYlaj3rcrzAj6MN9ckUaNLPk5A8Ta/avYVITQ3PTgLKmSpiAE8SdHLcuXmODWdromUBxXgHvaAOE9TWu7nFxBykvILHb71d//QCy2BOpngOn6rzPgI56PZAkPeMYpy1thZKkp9zRBKK1FRN0rFNa2G1uvc7Jsflp0t5c6YGGE3iO9J8AOvR4HnsY9YvdgwIDAQAB",
            gateway: "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
        });

        const params = new URLSearchParams(event.body);
        const paramsJSON = Object.fromEntries(params.entries());
        console.log('Parsed parameters (JSON):', JSON.stringify(paramsJSON, null, 2));

        const isSignVerified = alipaySdk.checkNotifySign(paramsJSON); // 使用公钥验证签名
        console.log('Alipay sign verification result:', isSignVerified);

        if (!isSignVerified) {
            console.error('Alipay sign verification failed.');
            return { statusCode: 200, body: 'failure' };
        }

        const tradeStatus = params.get('trade_status');
        console.log('Received trade_status:', tradeStatus);
        if (tradeStatus === 'TRADE_SUCCESS') {
            console.log('Payment successful. Processing business logic...');

            const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
            const outTradeNo = params.get('out_trade_no');

            const { error } = await supabase
                .from('orders')
                .update({ status: 'completed' })
                .eq('out_trade_no', outTradeNo);

            if (error) {
                console.error(`Failed to update order status for ${outTradeNo}:`, error.message);
            }else {
                console.log(`Supabase update successful for ${outTradeNo}.`);
            }

            await processBusinessLogic(params, supabase, resend);
        }

        return { statusCode: 200, body: 'success' };
    } catch (error) {
        console.error('Error processing Alipay notification:', error);
        return { statusCode: 200, body: 'failure' };
    }
};