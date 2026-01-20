/**
 * 发送验证码接口 (SC WS CMR)
 * POST /api/sc_ws_cmr/send-code
 */

const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

// 获取管理客户端
const getSupabaseAdmin = () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) throw new Error('Missing Supabase Credentials');
    return createClient(supabaseUrl, supabaseServiceKey);
};

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method Not Allowed' };

    try {
        const { email } = JSON.parse(event.body);
        if (!email) throw new Error('Email is required');

        const supabase = getSupabaseAdmin();

        // 1. 检查是否已注册 (Auth Users)
        // 注意：这里我们查询的是 whatsapp.profiles，因为它通过触发器与 auth.users 同步
        const { data: existingUser } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', email)
            .schema('whatsapp') // 指定 Schema
            .single();

        if (existingUser) {
            return {
                statusCode: 409,
                headers,
                body: JSON.stringify({ success: false, message: '该邮箱已被注册' })
            };
        }

        // 2. 生成验证码
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10分钟

        // 3. 存储验证码 (Upsert)
        // 需要确保数据库里有 whatsapp.verification_codes 表
        const { error: dbError } = await supabase
            .from('verification_codes')
            .upsert({
                email,
                code,
                type: 'register',
                expires_at: expiresAt,
                is_used: false,
                created_at: new Date().toISOString()
            }, { onConflict: 'email' })
            .schema('whatsapp');

        if (dbError) {
            console.error('DB Error:', dbError);
            throw new Error('Database Error');
        }

        // 4. 发送邮件 (Resend)
        const resendApiKey = process.env.RESEND_API_KEY;
        if (resendApiKey) {
            const resend = new Resend(resendApiKey);
            const { error: emailError } = await resend.emails.send({
                from: '智贸云梯 <noreply@mediamingle.cn>', // 需确保域名已验证
                to: email,
                subject: '【智贸云梯】注册验证码',
                html: `
                    <div style="font-family: sans-serif; padding: 20px; color: #333;">
                        <h2>欢迎注册智贸云梯</h2>
                        <p>您的验证码是：</p>
                        <div style="background: #f4f4f5; padding: 15px; font-size: 24px; letter-spacing: 5px; font-weight: bold; border-radius: 8px; display: inline-block;">
                            ${code}
                        </div>
                        <p style="color: #666; font-size: 14px; margin-top: 20px;">验证码 10 分钟内有效。如果这不是您的操作，请忽略此邮件。</p>
                    </div>
                `
            });

            if (emailError) {
                console.error('Resend Error:', emailError);
                throw new Error('Email Sending Failed');
            }
        } else {
            console.log('DEV MODE - Code:', code);
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, message: '验证码已发送' })
        };

    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, message: error.message })
        };
    }
};
