// 这个函数负责接收前端发来的邮箱地址，并请求Supabase向该邮箱发送一个验证码。

// netlify/functions/send-signup-otp.js
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ success: false, message: 'Method Not Allowed' }) };
    }

    try {
        const { email } = JSON.parse(event.body);

        if (!email) {
            return { statusCode: 400, body: JSON.stringify({ success: false, message: 'Email is required' }) };
        }

        // 1. 检查账号是否已在您的 `user_accounts` 表中存在
        const { data: existingUser, error: checkError } = await supabase
            .from('user_accounts')
            .select('id')
            .eq('account', email)
            .maybeSingle();

        if (checkError) {
            console.error('Error checking user existence:', checkError);
            return { statusCode: 500, body: JSON.stringify({ success: false, message: 'Database query failed' }) };
        }

        if (existingUser) {
            return { statusCode: 409, body: JSON.stringify({ success: false, message: '此邮箱已被注册' }) };
        }

        // 2. 使用 Supabase Auth 发送 OTP 验证码
        // shouldCreateUser: false 表示如果用户不存在于 auth.users 中，暂时不创建，等验证成功后再说。
        const { error: otpError } = await supabase.auth.signInWithOtp({
            email: email,
            options: {
                // --- 修改这里 ---
                shouldCreateUser: false,
            },
        });

        if (otpError) {
            console.error('Supabase OTP error:', otpError);
            return { statusCode: 500, body: JSON.stringify({ success: false, message: '验证码发送失败', error: otpError.message }) };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: '验证码已发送，请检查您的邮箱。' })
        };

    } catch (err) {
        console.error('Handler error:', err);
        return { statusCode: 500, body: JSON.stringify({ success: false, message: '服务器内部错误' }) };
    }
};




