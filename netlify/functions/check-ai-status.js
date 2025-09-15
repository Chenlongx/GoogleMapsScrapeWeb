// 假设您使用Supabase作为数据库
const { createClient } = require('@supabase/supabase-js');

// 从Netlify环境变量中获取数据库连接信息
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // 使用service_role key，因为它有权限读取所有用户数据
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async function(event) {
    // 这个接口应该是公开的，或者通过用户自己的凭证进行验证
    // 这里我们使用一个简单的查询参数来获取用户信息
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { user_id } = event.queryStringParameters;

        if (!user_id) {
            return {
                statusCode: 400,
                body: JSON.stringify({ success: false, message: '缺少 user_id 参数' })
            };
        }

        // 在数据库中查询指定用户的信息
        let { data: user, error } = await supabase
            .from('user_accounts') // 您的用户表名
            .select('is_ai_authorized, ai_tokens_remaining') // 只查询需要的AI相关字段
            .eq('id', user_id) // 根据前端传来的用户ID查询
            .single();

        if (error || !user) {
            return {
                statusCode: 404,
                body: JSON.stringify({ success: false, message: '用户不存在或查询失败' })
            };
        }

        // 返回成功响应
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                success: true,
                authorized: user.is_ai_authorized,
                tokens_remaining: user.ai_tokens_remaining
            })
        };

    } catch (e) {
        console.error("检查AI状态时发生错误:", e);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, message: '服务器内部错误' })
        };
    }
};