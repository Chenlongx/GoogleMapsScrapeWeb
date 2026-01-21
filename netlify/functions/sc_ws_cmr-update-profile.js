/**
 * 用户资料更新接口 (SC WS CMR)
 * POST /api/sc_ws_cmr/update-profile
 * 
 * 功能：更新用户的 nickname 和 avatar_url
 * 认证：通过 session_token 验证用户身份
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
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        // 1. 验证 Authorization Header
        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: '未授权，请先登录' }) };
        }
        const sessionToken = authHeader.split(' ')[1];

        // 2. 解析请求体
        const { nickname, avatar_url } = JSON.parse(event.body || '{}');

        // 至少需要更新一个字段
        if (!nickname && !avatar_url) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: '请提供要更新的字段 (nickname 或 avatar_url)' }) };
        }

        const supabase = getSupabaseAdmin();

        // 3. 验证 session_token 并获取用户
        const { data: users, error: authError } = await supabase
            .schema('whatsapp')
            .from('profiles')
            .select('id, email, nickname, avatar_url')
            .eq('session_token', sessionToken)
            .limit(1);

        if (authError || !users || users.length === 0) {
            console.error('[Update Profile] Auth failed:', authError);
            return { statusCode: 401, headers, body: JSON.stringify({ error: '会话已过期，请重新登录' }) };
        }

        const user = users[0];
        console.log(`[Update Profile] User authenticated: ${user.id}`);

        // 4. 构建更新对象
        const updateData = {};
        if (nickname !== undefined && nickname !== null) {
            // 验证昵称长度
            if (nickname.length > 50) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: '昵称长度不能超过50个字符' }) };
            }
            updateData.nickname = nickname.trim();
        }
        if (avatar_url !== undefined && avatar_url !== null) {
            // 简单验证 URL 格式
            if (avatar_url && !avatar_url.startsWith('http://') && !avatar_url.startsWith('https://') && !avatar_url.startsWith('data:image/')) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: '头像URL格式无效' }) };
            }
            updateData.avatar_url = avatar_url;
        }

        // 5. 更新数据库
        const { data: updatedUser, error: updateError } = await supabase
            .schema('whatsapp')
            .from('profiles')
            .update(updateData)
            .eq('id', user.id)
            .select('id, email, nickname, avatar_url, account_type, ai_balance')
            .single();

        if (updateError) {
            console.error('[Update Profile] Update failed:', updateError);
            return { statusCode: 500, headers, body: JSON.stringify({ error: '更新失败，请稍后重试' }) };
        }

        console.log(`[Update Profile] Successfully updated user ${user.id}:`, updateData);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: '资料更新成功',
                user: updatedUser
            })
        };

    } catch (err) {
        console.error('[Update Profile] Exception:', err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: '服务器错误: ' + err.message })
        };
    }
};
