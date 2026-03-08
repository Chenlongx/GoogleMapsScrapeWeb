const { createClient } = require('@supabase/supabase-js');

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

function getSupabaseClient() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const supabaseKey = serviceRoleKey || anonKey;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase credentials');
    }

    return createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false }
    });
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ success: false, message: 'Method Not Allowed' })
        };
    }

    try {
        const { email, password, token, device_id, os_type } = JSON.parse(event.body || '{}');
        const normalizedEmail = String(email || '').trim().toLowerCase();
        const verificationCode = String(token || '').trim();

        if (!normalizedEmail || !password || !verificationCode || !device_id || !os_type) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, message: '所有字段都不能为空' })
            };
        }

        if (!/^\d{6}$/.test(verificationCode)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, message: '验证码格式不正确' })
            };
        }

        const supabase = getSupabaseClient();

        const { count: deviceCount, error: deviceCheckError } = await supabase
            .from('user_accounts')
            .select('id', { count: 'exact', head: true })
            .eq('device_id', device_id);

        if (deviceCheckError) {
            console.error('check device failed:', deviceCheckError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ success: false, message: '设备校验失败' })
            };
        }

        if ((deviceCount || 0) > 0) {
            return {
                statusCode: 409,
                headers,
                body: JSON.stringify({ success: false, message: '此设备已注册过试用账号' })
            };
        }

        const { data: pendingUser, error: pendingQueryError } = await supabase
            .from('pending_users')
            .select('email, verification_code, code_expires_at, attempts')
            .eq('email', normalizedEmail)
            .maybeSingle();

        if (pendingQueryError) {
            console.error('query pending user failed:', pendingQueryError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ success: false, message: '验证码校验失败' })
            };
        }

        if (!pendingUser) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, message: '请先获取验证码' })
            };
        }

        const attempts = Number(pendingUser.attempts || 0);
        if (attempts >= 5) {
            await supabase.from('pending_users').delete().eq('email', normalizedEmail);
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, message: '验证码错误次数过多，请重新获取' })
            };
        }

        const expiresAtMs = new Date(pendingUser.code_expires_at || 0).getTime();
        if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) {
            await supabase.from('pending_users').delete().eq('email', normalizedEmail);
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, message: '验证码已过期，请重新获取' })
            };
        }

        if (String(pendingUser.verification_code || '') !== verificationCode) {
            await supabase
                .from('pending_users')
                .update({ attempts: attempts + 1 })
                .eq('email', normalizedEmail);

            const remaining = Math.max(0, 4 - attempts);
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, message: `验证码错误，还剩 ${remaining} 次机会` })
            };
        }

        const expiryDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const newUserRecord = {
            account: normalizedEmail,
            password: password,
            device_id: device_id,
            os_type: os_type,
            user_type: 'standard',
            status: 'active',
            expiry_at: expiryDate.toISOString(),
            is_ai_authorized: false,
            ai_tokens_remaining: 0,
            daily_export_count: 0
        };

        const { error: insertError } = await supabase
            .from('user_accounts')
            .insert([newUserRecord]);

        if (insertError) {
            console.error('insert user failed:', insertError);
            if (insertError.code === '23505') {
                return {
                    statusCode: 409,
                    headers,
                    body: JSON.stringify({ success: false, message: '此邮箱已被注册' })
                };
            }

            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ success: false, message: '创建用户失败' })
            };
        }

        await supabase.from('pending_users').delete().eq('email', normalizedEmail);

        return {
            statusCode: 201,
            headers,
            body: JSON.stringify({
                success: true,
                message: '试用账号注册成功，有效期一天，请及时转为正式账号。'
            })
        };
    } catch (error) {
        console.error('verify and register handler error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, message: '服务器内部错误' })
        };
    }
};
