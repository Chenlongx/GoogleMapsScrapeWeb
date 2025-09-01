const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

// --- 辅助函数：生成随机密码 ---
function generatePassword() {
    return Math.random().toString(36).slice(-8);
}

// --- 核心业务逻辑 ---
async function processBusinessLogic(orderParams) {
    // ... (这部分代码与你 alipay-notify.js 中的 processBusinessLogic 完全相同)
    console.log('[Debug] Entered processBusinessLogic with params:', orderParams);

    const rawSubject = orderParams.get('subject');
    const outTradeNo = orderParams.get('out_trade_no');

    if (!rawSubject || !outTradeNo) {
        console.error('[Critical] Missing subject or out_trade_no in processBusinessLogic.');
        return { success: false, error: 'Missing subject or out_trade_no' };
    }

    let customerEmail;
    try {
        customerEmail = Buffer.from(outTradeNo.split('-')[2] || '', 'base64').toString('ascii');
    } catch (err) {
        console.error(`[Critical] Failed to decode email for ${outTradeNo}:`, err.message);
        return { success: false, error: 'Failed to decode email' };
    }

    const productId = decodeURIComponent(rawSubject.replace(/\+/g, ' '));
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const resend = new Resend(process.env.RESEND_API_KEY);

    let emailSubject = '';
    let emailHtml = '';

    try {
        if (productId.includes('Google Maps Scraper')) {
            const password = generatePassword();
            const userType = productId.includes('高级版') ? 'premium' : 'standard';
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + 30);

            const { error } = await supabase.from('user_accounts').insert({ account: customerEmail, password, user_type: userType, status: 'active', expiry_at: expiryDate.toISOString() });
            if (error) throw new Error(`Failed to create user account: ${error.message}`);

            emailSubject = '您的 Google Maps Scraper 账户已成功开通！';
            emailHtml = `<h1>欢迎！</h1><p>您的账户 (${customerEmail}) 已成功开通。</p><p><strong>登录密码:</strong> ${password}</p><p>请登录网站开始使用，并及时修改您的密码。</p><p>感谢您的支持！</p>`;

        } else if (productId.includes('Email Validator')) {
            const { data: license, error: findError } = await supabase.from('licenses').select('key').eq('status', 'available').limit(1).single();
            if (findError || !license) throw new Error('No available license keys.');

            const activationCode = license.key;
            const { error: updateError } = await supabase.from('licenses').update({ status: 'activated', activation_date: new Date().toISOString(), customer_email: customerEmail }).eq('key', activationCode);
            if (updateError) throw new Error(`Failed to update license key status: ${updateError.message}`);

            emailSubject = '您的 Email Validator 激活码';
            emailHtml = `<h1>感谢您的购买！</h1><p>您的激活码是：<strong>${activationCode}</strong></p><p>请在软件中使用此激活码激活。</p>`;
        } else {
            console.warn('[Info] Unknown productId:', productId);
            return { success: false, error: `Unknown productId: ${productId}` };
        }

        await resend.emails.send({
            from: 'LeadScout <noreply@mediamingle.cn>',
            to: customerEmail,
            subject: emailSubject,
            html: emailHtml,
        });

        console.log(`[processBusinessLogic] Email sent to ${customerEmail}`);
        return { success: true };

    } catch (err) {
        console.error(`[Critical Error] in processBusinessLogic for ${outTradeNo}:`, err.message);
        return { success: false, error: err.message };
    }
}

module.exports = { processBusinessLogic };