/**
 * 用户注册接口 (SC WS CMR)
 * POST /api/sc_ws_cmr/register
 */

const { createClient } = require('@supabase/supabase-js');

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
        const { email, password, code, username } = JSON.parse(event.body);
        if (!email || !password || !code) throw new Error('Missing required fields');

        const supabase = getSupabaseAdmin();

        // 1. 验证验证码
        const { data: verifyRecord, error: verifyError } = await supabase
            .from('verification_codes')
            .select('*')
            .eq('email', email)
            .eq('code', code)
            .eq('is_used', false)
            .gt('expires_at', new Date().toISOString())
            .schema('whatsapp')
            .single();

        if (verifyError || !verifyRecord) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, message: '验证码无效或已过期' })
            };
        }

        // 2. 创建 Supabase Auth 用户 (自动确认邮箱)
        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true, // 既然验证了手机/邮箱验证码，直接标记为已确认
            user_metadata: {
                full_name: username || email.split('@')[0]
            }
        });

        if (authError) {
            console.error('Auth Error:', authError);
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, message: authError.message })
            };
        }

        // 3. 标记验证码已使用
        await supabase
            .from('verification_codes')
            .update({ is_used: true })
            .eq('id', verifyRecord.id)
            .schema('whatsapp');

        // 注意：whatsapp.profiles 会通过 Trigger 自动创建

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: '注册成功',
                user: {
                    id: authUser.user.id,
                    email: authUser.user.email
                }
            })
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
