/**
 * 用户统一登录/注册接口 (SC WS CMR)
 * POST /api/sc_ws_cmr/register
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

    try {
        const { email, code, username } = JSON.parse(event.body);
        const supabase = getSupabaseAdmin();

        // 1. 验证验证码
        const { data: verifyRecord, error: verifyError } = await supabase
            .schema('whatsapp')
            .from('verification_codes')
            .select('*')
            .eq('email', email)
            .eq('code', code)
            .eq('is_used', false)
            .gt('expires_at', new Date().toISOString())
            .single();

        if (verifyError || !verifyRecord) throw new Error('验证码无效或已过期');

        // 2. 核心逻辑：先检查用户是否存在 (通过 RPC 安全检查)
        // 这种Check-First模式比Try-Catch-Create更稳定，不受错误信息语言/格式影响
        let userId = null;
        let isNewUser = false;

        console.log('Checking if user exists via RPC...');
        // 注意：get_user_id_by_email 必须在 public schema 中或被正确授权
        const { data: existingUserId, error: rpcError } = await supabase
            .rpc('get_user_id_by_email', { email_input: email });

        if (existingUserId) {
            // [A] 用户已存在 -> 登录流程
            console.log('User exists (RPC found ID):', existingUserId);
            userId = existingUserId;
            isNewUser = false;
        } else {
            // [B] 用户不存在 -> 注册流程
            console.log('User not found, creating new user...');
            const { password: userPassword } = JSON.parse(event.body); // 获取前端传来的密码
            const randomPassword = crypto.randomBytes(16).toString('hex');
            const finalPassword = userPassword || randomPassword; // 优先使用用户密码

            const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
                email,
                password: finalPassword,
                email_confirm: true,
                user_metadata: { full_name: username || email.split('@')[0] }
            });

            if (createError) {
                // 极罕见并发情况：RPC 没查到，但 Create 说已存在
                console.error('Create User Error:', createError);

                // 尝试最后的兜底检查 (不论错误消息是什么，只要是创建失败，我们再试一次 RPC)
                const { data: retryId } = await supabase
                    .rpc('get_user_id_by_email', { email_input: email });

                if (retryId) {
                    userId = retryId;
                    isNewUser = false;
                } else {
                    // 真的失败了
                    throw createError;
                }
            } else {
                userId = newUser.user.id;
                isNewUser = true;
            }
        }

        // 3. 标记验证码已使用
        await supabase
            .schema('whatsapp')
            .from('verification_codes')
            .update({ is_used: true })
            .eq('id', verifyRecord.id);

        // 4. 确保 Profiles 存在 (Upsert) 并更新 Session Token
        const sessionToken = crypto.randomBytes(32).toString('hex');

        const { data: profile } = await supabase
            .schema('whatsapp')
            .from('profiles')
            .upsert({
                id: userId,
                email: email,
                nickname: username || email.split('@')[0],
                session_token: sessionToken, // <--- New Token
                updated_at: new Date().toISOString()
            }, { onConflict: 'id' })
            .select()
            .single();

        // 5. 获取 AI 使用统计 (当月)
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

        // 6. 获取订阅信息
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
                message: isNewUser ? '注册成功' : '登录成功',
                token: sessionToken, // <--- Return to Client
                user: {
                    id: userId,
                    email: email,
                    nickname: profile?.nickname,
                    avatar_url: profile?.avatar_url,
                    balance: profile?.balance || 0,
                    ai_balance: profile?.ai_balance,
                    role: profile?.role,
                    ai_usage: totalTokens,
                    subscription: subData || null
                }
            })
        };

    } catch (error) {
        console.error('Handler Error:', error);
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ success: false, message: error.message || 'Server Error' })
        };
    }
};
