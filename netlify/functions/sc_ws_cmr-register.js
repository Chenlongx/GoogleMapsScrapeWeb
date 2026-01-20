/**
 * 用户统一登录/注册接口 (SC WS CMR)
 * POST /api/sc_ws_cmr/register
 * 
 * 逻辑：
 * 1. 验证邮箱验证码
 * 2. 如果用户不存在 -> 注册
 * 3. 如果用户已存在 -> 登录 (返回用户信息)
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

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
        const { email, code, username } = JSON.parse(event.body);
        if (!email || !code) throw new Error('Missing email or verification code');

        const supabase = getSupabaseAdmin();

        // 1. 验证验证码
        const { data: verifyRecord, error: verifyError } = await supabase
            .from('verification_codes')
            .select('*')
            .eq('email', email)
            .eq('code', code)
            .eq('is_used', false)
            .gt('expires_at', new Date().toISOString())
            .schema('whatsapp') // Schema is critical
            .single();

        if (verifyError || !verifyRecord) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, message: '验证码无效或已过期' })
            };
        }

        // 2. 检查用户是否存在 (Auth Users)
        const { data: { users }, error: searchError } = await supabase.auth.admin.listUsers();
        let authUser = users.find(u => u.email === email);

        if (!authUser) {
            // A. 不存在 -> 创建新用户 (注册)
            const randomPassword = crypto.randomBytes(16).toString('hex'); // 生成复杂随机密码
            const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
                email,
                password: randomPassword,
                email_confirm: true,
                user_metadata: {
                    full_name: username || email.split('@')[0],
                    avatar_url: ''
                }
            });

            if (createError) throw createError;
            authUser = newUser.user;
        }

        // 3. 标记验证码已使用
        await supabase
            .from('verification_codes')
            .update({ is_used: true })
            .eq('id', verifyRecord.id)
            .schema('whatsapp');

        // 4. 获取详细资料 (Profiles)
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', authUser.id)
            .schema('whatsapp')
            .single();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: '登录成功',
                user: {
                    id: authUser.id,
                    email: authUser.email,
                    nickname: profile?.nickname || authUser.user_metadata.full_name,
                    avatar_url: profile?.avatar_url,
                    balance: profile?.balance || 0,
                    role: profile?.role || 'user'
                },
                // 若需要 Token，通常是在前端用 Supabase Client 登录，或者这里返回 Custom Token
                // 暂时仅返回 User Info 用于客户端状态显示
            })
        };

    } catch (error) {
        console.error('Login Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, message: error.message || 'Internal Server Error' })
        };
    }
};
