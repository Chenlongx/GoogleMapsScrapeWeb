/**
 * Google OAuth 登录接口 (SC WS CMR)
 * POST /api/sc_ws_cmr/google-login
 * 
 * 接收 Google authorization code，换取用户信息，创建/登录用户
 * 
 * 注意：Google OAuth 密钥 (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET) 需存储在 
 * Supabase 的 "whatsapp.secrets" 表中，以避免 Netlify 环境变量 4KB 限制。
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const getSupabaseAdmin = () => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) throw new Error('Missing Supabase Credentials');
    return createClient(supabaseUrl, supabaseServiceKey);
};

// 从 Supabase 获取 Google OAuth 密钥
const getGoogleCredentials = async (supabase) => {
    const { data, error } = await supabase
        .schema('whatsapp')
        .from('secrets')
        .select('key, value')
        .in('key', ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']);

    if (error) {
        console.error('[Google OAuth] Failed to fetch secrets:', error);
        throw new Error('Failed to fetch Google credentials from DB');
    }

    // 转换数组为对象
    const credentials = {};
    if (data) {
        data.forEach(item => {
            credentials[item.key] = item.value;
        });
    }

    if (!credentials.GOOGLE_CLIENT_ID || !credentials.GOOGLE_CLIENT_SECRET) {
        throw new Error('Google OAuth credentials not found in whatsapp.secrets table');
    }

    return credentials;
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
        const { code, redirect_uri } = JSON.parse(event.body);
        if (!code) throw new Error('Authorization code is required');

        const supabase = getSupabaseAdmin();

        // 1. 获取动态配置的密钥
        console.log('[Google OAuth] Fetching credentials from DB...');
        const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = await getGoogleCredentials(supabase);

        // 2. 用 authorization code 换取 tokens
        console.log('[Google OAuth] Exchanging code for tokens...');
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: redirect_uri || 'http://localhost',
                grant_type: 'authorization_code'
            })
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            console.error('[Google OAuth] Token exchange error:', tokenData);
            throw new Error(tokenData.error_description || 'Failed to exchange code');
        }

        // 3. 获取用户信息
        console.log('[Google OAuth] Fetching user info...');
        const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });

        const googleUser = await userInfoResponse.json();

        if (!googleUser.email) {
            throw new Error('Failed to get user email from Google');
        }

        console.log('[Google OAuth] User:', googleUser.email);

        // 4. 在 Supabase 中查找/创建用户
        let userId = null;
        let isNewUser = false;

        // 检查用户是否存在
        const { data: existingUserId } = await supabase
            .rpc('get_user_id_by_email', { email_input: googleUser.email });

        if (existingUserId) {
            // 用户已存在
            console.log('[Google OAuth] Existing user:', existingUserId);
            userId = existingUserId;
            isNewUser = false;
        } else {
            // 创建新用户
            console.log('[Google OAuth] Creating new user...');
            const randomPassword = crypto.randomBytes(16).toString('hex');

            const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
                email: googleUser.email,
                password: randomPassword,
                email_confirm: true,
                user_metadata: {
                    full_name: googleUser.name,
                    avatar_url: googleUser.picture,
                    provider: 'google'
                }
            });

            if (createError) {
                // 并发情况：再次检查
                const { data: retryId } = await supabase
                    .rpc('get_user_id_by_email', { email_input: googleUser.email });

                if (retryId) {
                    userId = retryId;
                    isNewUser = false;
                } else {
                    throw createError;
                }
            } else {
                userId = newUser.user.id;
                isNewUser = true;
            }
        }

        // 5. 更新 Profile 并生成 Session Token
        const sessionToken = crypto.randomBytes(32).toString('hex');

        const { data: profile } = await supabase
            .schema('whatsapp')
            .from('profiles')
            .upsert({
                id: userId,
                email: googleUser.email,
                nickname: googleUser.name || googleUser.email.split('@')[0],
                avatar_url: googleUser.picture,
                session_token: sessionToken,
                updated_at: new Date().toISOString()
            }, { onConflict: 'id' })
            .select()
            .single();

        // 6. 获取 AI 使用统计 (当月)
        let totalTokens = 0;
        try {
            const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
            const { data: usageData } = await supabase
                .schema('whatsapp')
                .from('ai_usage_logs')
                .select('total_tokens')
                .eq('user_id', userId)
                .gte('created_at', startOfMonth);

            totalTokens = usageData ? usageData.reduce((acc, curr) => acc + (curr.total_tokens || 0), 0) : 0;
        } catch (e) {
            console.warn('Failed to fetch usage stats:', e);
        }

        // 7. 获取订阅信息
        let subData = null;
        try {
            const { data: sub } = await supabase
                .schema('whatsapp')
                .from('subscriptions')
                .select('*')
                .eq('user_id', userId)
                .eq('status', 'active')
                .order('end_time', { ascending: false })
                .limit(1)
                .single();
            subData = sub;
        } catch (e) {
            console.warn('Failed to fetch subscription:', e);
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: isNewUser ? 'Google 注册成功' : 'Google 登录成功',
                token: sessionToken,
                user: {
                    id: userId,
                    email: googleUser.email,
                    nickname: profile?.nickname || googleUser.name,
                    avatar_url: profile?.avatar_url || googleUser.picture,
                    balance: profile?.balance || 0,
                    ai_balance: profile?.ai_balance,
                    role: profile?.role,
                    ai_usage: totalTokens,
                    subscription: subData || null
                }
            })
        };

    } catch (error) {
        console.error('[Google OAuth] Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, message: error.message || 'Server Error' })
        };
    }
};
