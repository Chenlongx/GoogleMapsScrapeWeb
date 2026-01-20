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

        // 2. 尝试创建用户 (默认 assume 新用户)
        let userId = null;
        let isNewUser = false;
        const randomPassword = crypto.randomBytes(16).toString('hex');

        // 尝试注册
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
            email,
            password: randomPassword,
            email_confirm: true,
            user_metadata: { full_name: username || email.split('@')[0] }
        });

        if (createError) {
            // 如果错误是 "User already registered"，说明是老用户
            // 我们需要获取这个老用户的 ID
            if (createError.message && createError.message.includes('already been registered')) {
                console.log('User exists, fetching ID via RPC...');

                // 调用 RPC 获取 ID (需要先在数据库创建函数)
                const { data: foundId, error: rpcError } = await supabase
                    .rpc('get_user_id_by_email', { email_input: email }); // schema('whatsapp') ? No, rpc is usually public or specified in function name if namespaced like whatsapp.get... wait.
                // If function is whatsapp.get_user_id_by_email, we call rpc('get_user_id_by_email') if exposed? 
                // Supabase js client rpc calls function by name. If it's in a schema, we might need to include schema in name or use exposed schema.
                // Usually functions are in public or exposed schemas. 
                // Let's assume user created it in 'whatsapp' schema and exposed it OR public.
                // My SQL script put it in 'whatsapp' schema. 
                // Client rpc: supabase.rpc('get_user_id_by_email') calls function in search_path.
                // So we might need to fix SQL to putting it in public or ensure whatsapp is in search_path.
                // Actually, the previous tool put it in whatsapp. So we should call it carefully. 
                // BUT Supabase Client RPC assumes function is in 'public' unless we specify differently? 
                // Wait, `supabase.rpc` call usually doesn't support schema chaining nicely for RPC unless it's in exposed schema.
                // If function is `whatsapp.get_user_id_by_email`...
                // Let's rely on the user running the SQL which sets it to whatsapp.
                // BUT for safety, let's try to query public if I made a mistake, or assume the function name is fully qualified? No RPC doesn't work like table.
                // *Correction*: RPC only works for functions in the "Exposed schemas". We exposed `whatsapp`.
                // So `supabase.rpc('get_user_id_by_email')` should work IF `whatsapp` is in exposed schemas.

                if (rpcError || !foundId) {
                    // Fallback: Try listUsers (slow but works if RPC missing)
                    const { data: { users } } = await supabase.auth.admin.listUsers();
                    const u = users.find(x => x.email === email);
                    if (u) userId = u.id;
                    else throw new Error('无法定位已有用户ID');
                } else {
                    userId = foundId;
                }
            } else {
                throw createError; // 其他真实错误
            }
        } else {
            userId = newUser.user.id;
            isNewUser = true;
        }

        // 3. 标记验证码已使用
        await supabase
            .schema('whatsapp')
            .from('verification_codes')
            .update({ is_used: true })
            .eq('id', verifyRecord.id);

        // 4. 确保 Profiles 存在 (Upsert)
        // 即使是老用户，可能还没有 whatsapp.profiles 数据，所以我们要 Upsert
        const { data: profile } = await supabase
            .schema('whatsapp')
            .from('profiles')
            .upsert({
                id: userId,
                email: email,
                nickname: username || email.split('@')[0],
                updated_at: new Date().toISOString()
            }, { onConflict: 'id' }) // 基于 ID 冲突更新
            .select()
            .single();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: isNewUser ? '注册成功' : '登录成功',
                user: {
                    id: userId,
                    email: email,
                    nickname: profile?.nickname,
                    avatar_url: profile?.avatar_url,
                    balance: profile?.balance || 0,
                    role: profile?.role
                }
            })
        };

    } catch (error) {
        console.error('Handler Error:', error);
        return {
            statusCode: 500,
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ success: false, message: error.message })
        };
    }
};
