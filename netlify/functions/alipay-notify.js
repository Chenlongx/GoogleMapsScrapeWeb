const AlipaySdk = require('alipay-sdk');
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const fs = require("fs");
const path = require("path");

// 生成一个简单的随机密码
function generatePassword() {
    return Math.random().toString(36).slice(-8);
}

// 核心业务逻辑处理函数
async function processBusinessLogic(orderParams) {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const resend = new Resend(process.env.RESEND_API_KEY); // ✅ 确认 .env 里是大写 RESEND_API_KEY

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

        const { error } = await supabase.from('user_accounts').insert({
            account: customerEmail,
            password: password,
            user_type: userType,
            status: 'active',
            expiry_at: expiryDate.toISOString()
        });

        if (error) {
            throw new Error(`Failed to create user account for ${customerEmail}: ${error.message}`);
        }

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

        emailSubject = '您的 Email Validator 激活码';
        emailHtml = `<h1>感谢您的购买！</h1>
                     <p>您的激活码是：<strong>${activationCode}</strong></p>
                     <p>请在软件中使用此激活码激活。</p>`;
    }

    if (!emailSubject || !customerEmail) {
        console.error('Email subject or recipient is missing.');
        return;
    }

    await resend.emails.send({
        from: 'LeadScout <noreply@mediamingle.cn>', // ✅ 换成你 Resend 里验证过的域名
        to: customerEmail,
        subject: emailSubject,
        html: emailHtml,
    });
}

// 修改后的 handler
exports.handler = async (event) => {
    console.log('--- [alipay-notify.js] Function Invoked ---');
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Request Method: ${event.httpMethod}`);

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        console.log('Raw body from Alipay:', event.body);

        const alipaySdk = new AlipaySdk({
            appId: process.env.ALIPAY_APP_ID,
            privateKey: process.env.ALIPAY_PRIVATE_KEY,
            alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY,
            gateway: process.env.ALIPAY_GATEWAY,
        });

        const params = new URLSearchParams(event.body);
        const paramsJSON = Object.fromEntries(params.entries());
        console.log('Parsed parameters (JSON):', JSON.stringify(paramsJSON, null, 2));

        let isSignVerified = false;

        if (process.env.NODE_ENV === "development") {
            console.log("⚠️ Skipping Alipay signature verification in development mode.");
            isSignVerified = true;
        } else {
            isSignVerified = alipaySdk.checkNotifySign(paramsJSON);
        }

        if (!isSignVerified) {
            return { statusCode: 200, body: 'failure' };
        }

        const tradeStatus = params.get('trade_status');
        if (tradeStatus === 'TRADE_SUCCESS') {
            const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
            const outTradeNo = params.get('out_trade_no');

            await supabase.from('orders')
                .update({ status: 'completed' })
                .eq('out_trade_no', outTradeNo);

            await processBusinessLogic(params);
        }

        return { statusCode: 200, body: 'success' };
    } catch (error) {
        console.error('Error processing Alipay notification:', error);
        return { statusCode: 200, body: 'failure' };
    }
};
