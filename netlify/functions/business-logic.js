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
                        <p style="color: #475569; font-size: 16px;">请在您的桌面应用程序中使用以上账户和密码进行登录。为了您的账户安全，建议登录后立即修改密码。</p>
                        <p style="color: #475569; font-size: 16px;">如果您还没有安装应用程序，可以点击下方按钮下载。</p>
                        <div style="text-align: center; margin-top: 30px;">
                        <div style="text-align: center; margin-top: 30px;">
                            <a href="https://mediamingle.cn/download.html" target="_blank" style="background-color: #3b82f6; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold;">下载应用程序</a>
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
        
        // 处理推广佣金
        await this.processReferralCommission(outTradeNo, customerEmail, productId);
        
        return { success: true };

    } catch (err) {
        console.error(`[Critical Error] in processBusinessLogic for ${outTradeNo}:`, err.message);
        return { success: false, error: err.message };
    }

    // 处理推广佣金
    async processReferralCommission(outTradeNo, customerEmail, productId) {
        try {
            const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
            
            // 获取订单信息
            const { data: order, error: orderError } = await supabase
                .from('orders')
                .select('referral_code, agent_code')
                .eq('out_trade_no', outTradeNo)
                .single();

            if (orderError || !order) {
                console.log('未找到订单信息，跳过推广佣金处理');
                return;
            }

            if (!order.referral_code && !order.agent_code) {
                console.log('订单无推广信息，跳过推广佣金处理');
                return;
            }

            // 获取产品价格
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

            const orderAmount = productPriceMap[productId] || 0;
            if (orderAmount === 0) {
                console.log('无法确定订单金额，跳过推广佣金处理');
                return;
            }

            let agentId = null;
            let commissionAmount = 0;

            // 通过推广码查找代理
            if (order.referral_code) {
                const { data: promotion, error: promotionError } = await supabase
                    .from('product_promotions')
                    .select('agent_id, commission_rate')
                    .eq('promotion_code', order.referral_code)
                    .single();

                if (!promotionError && promotion) {
                    agentId = promotion.agent_id;
                    commissionAmount = orderAmount * promotion.commission_rate;
                }
            }

            // 通过代理代码查找代理
            if (!agentId && order.agent_code) {
                const { data: agent, error: agentError } = await supabase
                    .from('agent_profiles')
                    .select('id')
                    .eq('agent_code', order.agent_code)
                    .single();

                if (!agentError && agent) {
                    agentId = agent.id;
                    // 使用默认分佣比例
                    const defaultCommissionRate = 0.15; // 15%
                    commissionAmount = orderAmount * defaultCommissionRate;
                }
            }

            if (agentId && commissionAmount > 0) {
                // 创建产品订单记录
                const { data: productOrder, error: orderInsertError } = await supabase
                    .from('product_orders')
                    .insert([{
                        customer_email: customerEmail,
                        product_type: this.getProductType(productId),
                        promotion_code: order.referral_code,
                        order_amount: orderAmount,
                        commission_amount: commissionAmount,
                        agent_id: agentId,
                        status: 'paid',
                        payment_method: 'alipay',
                        payment_id: outTradeNo
                    }])
                    .select()
                    .single();

                if (orderInsertError) {
                    console.error('创建产品订单失败:', orderInsertError);
                } else {
                    console.log('产品订单创建成功:', productOrder.id);
                }

                // 更新推广记录的转化次数和佣金
                if (order.referral_code) {
                    const { error: updatePromotionError } = await supabase
                        .from('product_promotions')
                        .update({ 
                            conversions_count: supabase.sql`conversions_count + 1`,
                            total_commission: supabase.sql`total_commission + ${commissionAmount}`,
                            updated_at: new Date().toISOString()
                        })
                        .eq('promotion_code', order.referral_code);

                    if (updatePromotionError) {
                        console.error('更新推广记录失败:', updatePromotionError);
                    }
                }

                // 更新代理余额
                const { error: updateBalanceError } = await supabase
                    .from('agent_profiles')
                    .update({ 
                        total_commission: supabase.sql`total_commission + ${commissionAmount}`,
                        available_balance: supabase.sql`available_balance + ${commissionAmount}`,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', agentId);

                if (updateBalanceError) {
                    console.error('更新代理余额失败:', updateBalanceError);
                } else {
                    console.log(`代理 ${agentId} 获得佣金 ${commissionAmount} 元`);
                }
            }

        } catch (error) {
            console.error('处理推广佣金失败:', error);
        }
    }

    // 获取产品类型
    getProductType(productId) {
        if (productId.startsWith('gmaps')) return 'google-maps';
        if (productId.startsWith('validator') && !productId.includes('whatsapp')) return 'email-filter';
        if (productId.startsWith('whatsapp-validator')) return 'whatsapp-filter';
        return 'unknown';
    }
}

module.exports = { processBusinessLogic };