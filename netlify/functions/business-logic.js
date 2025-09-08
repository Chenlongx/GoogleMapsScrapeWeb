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

            if (productId.includes('续费')) {
                // --- 这是续费逻辑 ---
                console.log(`[Renewal] Processing renewal for ${customerEmail}`);

                // 1. 查找用户
                const { data: user, error: findError } = await supabase
                    .from('user_accounts')
                    .select('expiry_at')
                    .eq('account', customerEmail)
                    .single();
                
                if (findError || !user) {
                    throw new Error(`Renewal failed: User account ${customerEmail} not found.`);
                }

                // 2. 计算新的到期时间
                const currentExpiry = new Date(user.expiry_at);
                // 如果账户已过期，则从当前时间开始计算
                const startDate = currentExpiry < new Date() ? new Date() : currentExpiry;
                
                const newExpiryDate = new Date(startDate);
                if (productId.includes('月度')) {
                    newExpiryDate.setMonth(newExpiryDate.getMonth() + 1);
                } else if (productId.includes('季度')) {
                    newExpiryDate.setMonth(newExpiryDate.getMonth() + 3);
                } else if (productId.includes('年度')) {
                    newExpiryDate.setFullYear(newExpiryDate.getFullYear() + 1);
                }

                // 3. 更新数据库
                const { error: updateError } = await supabase
                    .from('user_accounts')
                    .update({ 
                        expiry_at: newExpiryDate.toISOString(),
                        status: 'active' // 确保账户状态为激活
                    })
                    .eq('account', customerEmail);
                
                if (updateError) {
                    throw new Error(`Failed to update expiry date for ${customerEmail}: ${updateError.message}`);
                }
                
                emailSubject = '【GlobalFlow】您的 Google Maps Scraper 账户已成功续费！';
                // 将 newExpiryDate 对象格式化为 YYYY-MM-DD 格式的日期字符串
                const formattedExpiry = newExpiryDate.toLocaleDateString('sv-SE'); // 使用 sv-SE 格式可以稳定地得到 YYYY-MM-DD

                emailHtml = `
                <div style="background-color: #f3f4f6; padding: 20px; font-family: Arial, sans-serif; line-height: 1.6;">
                    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; padding: 40px;">
                        <h1 style="color: #1e293b; font-size: 24px; text-align: center;">续费成功！</h1>
                        <p style="color: #475569; font-size: 16px;">您好，</p>
                        <p style="color: #475569; font-size: 16px;">您的 <strong style="color: #3b82f6;">Google Maps Scraper</strong> 账户 (<span style="color: #3b82f6;">${customerEmail}</span>) 已成功续费。</p>
                        <p style="color: #475569; font-size: 16px;">您的新服务到期日为：</p>
                        <div style="background-color: #f1f5f9; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
                            <p style="font-size: 20px; font-weight: bold; color: #1e293b; letter-spacing: 1px; margin: 0;">${formattedExpiry}</p>
                        </div>
                        <p style="color: #475569; font-size: 16px;">感谢您的支持。</p>
                        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 40px 0;">
                        <p style="color: #94a3b8; font-size: 12px; text-align: center;">如果您没有进行此操作，请忽略此邮件。这是一个自动发送的邮件，请勿直接回复。</p>
                    </div>
                </div>`;

            } else {
                const password = generatePassword();
                const userType = productId.includes('高级版') ? 'premium' : 'regular'; // 【修正】将 'standard' 修改为 'regular'
                const expiryDate = new Date();
                expiryDate.setDate(expiryDate.getDate() + 30);

                const { error } = await supabase.from('user_accounts').insert({ account: customerEmail, password, user_type: userType, status: 'active', expiry_at: expiryDate.toISOString() });
                if (error) throw new Error(`Failed to create user account: ${error.message}`);

                emailSubject = '【GlobalFlow】您的 Google Maps Scraper 账户已成功开通！';
                emailHtml = `
                <div style="background-color: #f3f4f6; padding: 20px; font-family: Arial, sans-serif; line-height: 1.6;">
                    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; padding: 40px;">
                        <h1 style="color: #1e293b; font-size: 24px; text-align: center;">账户开通成功！</h1>
                        <p style="color: #475569; font-size: 16px;">您好，</p>
                        <p style="color: #475569; font-size: 16px;">感谢您的订阅！您用于 <strong style="color: #3b82f6;">Google Maps Scraper</strong> 的账户 (<span style="color: #3b82f6;">${customerEmail}</span>) 已经成功开通。</p>
                        <p style="color: #475569; font-size: 16px;">您的初始登录密码是：</p>
                        <div style="background-color: #f1f5f9; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
                            <p style="font-size: 20px; font-weight: bold; color: #1e293b; letter-spacing: 2px; margin: 0;">${password}</p>
                        </div>
                        <p style="color: #475569; font-size: 16px;">为了您的账户安全，请登录后及时修改密码。</p>
                        <div style="text-align: center; margin-top: 30px;">
                            <a href="https://mediamingle.cn/login" target="_blank" style="background-color: #3b82f6; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold;">登录网站</a>
                        </div>
                        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 40px 0;">
                        <p style="color: #94a3b8; font-size: 12px; text-align: center;">如果您没有进行此操作，请忽略此邮件。这是一个自动发送的邮件，请勿直接回复。</p>
                    </div>
                </div>`;
            }

        } else if (productId.includes('Email Validator')) {
            const { data: license, error: findError } = await supabase.from('licenses').select('key').eq('status', 'available').limit(1).single();
            if (findError || !license) throw new Error('No available license keys.');

            const activationCode = license.key;
            const { error: updateError } = await supabase.from('licenses').update({ status: 'activated', activation_date: new Date().toISOString(), customer_email: customerEmail }).eq('key', activationCode);
            if (updateError) throw new Error(`Failed to update license key status: ${updateError.message}`);

            emailSubject = '【GlobalFlow】您的 Email Validator 激活码';
            // emailHtml = `<h1>感谢您的购买！</h1><p>您的激活码是：<strong>${activationCode}</strong></p><p>请在软件中使用此激活码激活。</p>`;
            emailHtml = `
            <div style="background-color: #f3f4f6; padding: 20px; font-family: Arial, sans-serif; line-height: 1.6;">
                <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; padding: 40px;">
                    <h1 style="color: #1e293b; font-size: 24px; text-align: center;">感谢您的购买！</h1>
                    <p style="color: #475569; font-size: 16px;">您好，</p>
                    <p style="color: #475569; font-size: 16px;">这是您购买的 <strong style="color: #3b82f6;">Email Validator</strong> 软件激活码。请在软件内使用它来激活您的产品。</p>
                    <div style="background-color: #f1f5f9; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
                        <p style="font-size: 20px; font-weight: bold; color: #1e293b; letter-spacing: 1px; margin: 0;">${activationCode}</p>
                    </div>
                    <p style="color: #475569; font-size: 16px;">如果您还没有下载软件，可以通过下方的按钮获取。</p>
                    <div style="text-align: center; margin-top: 30px;">
                        <a href="https://mediamingle.cn/products/email-validator" target="_blank" style="background-color: #3b82f6; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold;">下载软件</a>
                    </div>
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 40px 0;">
                    <p style="color: #94a3b8; font-size: 12px; text-align: center;">如果您没有进行此操作，请忽略此邮件。这是一个自动发送的邮件，请勿直接回复。</p>
                </div>
            </div>`;
        } else if (productId.includes('WhatsApp Validator')) {
            // 逻辑与 Email Validator 非常相似: 查找一个可用的激活码
            const { data: license, error: findError } = await supabase
                .from('whatsapp_activation_code') // 假设 WhatsApp Validator 激活码也存在 'licenses' 表中
                .select('key')
                .eq('status', 'available')
                .limit(1)
                .single();

            if (findError || !license) {
                // 如果没有可用的激活码，抛出错误，这将导致后续的邮件不会发送
                throw new Error('No available license keys for WhatsApp Validator.');
            }

            const activationCode = license.key;
            
            // 将激活码状态更新为已激活，并关联客户邮箱
            const { error: updateError } = await supabase
                .from('whatsapp_activation_code')
                .update({ 
                    status: 'activated', 
                    activation_date: new Date().toISOString(), 
                    customer_email: customerEmail 
                })
                .eq('key', activationCode);

            if (updateError) {
                throw new Error(`Failed to update license key status: ${updateError.message}`);
            }

            // 准备发送激活码邮件
            emailSubject = '【GlobalFlow】您的 WhatsApp Validator 激活码';
            emailHtml = `
            <div style="background-color: #f3f4f6; padding: 20px; font-family: Arial, sans-serif; line-height: 1.6;">
                <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; padding: 40px;">
                    <h1 style="color: #1e293b; font-size: 24px; text-align: center;">感谢您的购买！</h1>
                    <p style="color: #475569; font-size: 16px;">您好，</p>
                    <p style="color: #475569; font-size: 16px;">这是您购买的 <strong style="color: #3b82f6;">WhatsApp Number Validator</strong> 软件激活码。请在软件内使用它来激活您的产品。</p>
                    <div style="background-color: #f1f5f9; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
                        <p style="font-size: 20px; font-weight: bold; color: #1e293b; letter-spacing: 1px; margin: 0;">${activationCode}</p>
                    </div>
                    <p style="color: #475569; font-size: 16px;">如果您还没有下载软件，可以通过下方的按钮获取。</p>
                    <div style="text-align: center; margin-top: 30px;">
                        <a href="https://mediamingle.cn/products/whatsapp-validator" target="_blank" style="background-color: #3b82f6; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold;">下载软件</a>
                    </div>
                    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 40px 0;">
                    <p style="color: #94a3b8; font-size: 12px; text-align: center;">如果您没有进行此操作，请忽略此邮件。这是一个自动发送的邮件，请勿直接回复。</p>
                </div>
            </div>`;
        // ▲▲▲ 新增结束 ▲▲▲
        } else {
            console.warn('[Info] Unknown productId:', productId);
            return { success: false, error: `Unknown productId: ${productId}` };
        }

        await resend.emails.send({
            from: 'GlobalFlow <GlobalFlow@mediamingle.cn>',
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