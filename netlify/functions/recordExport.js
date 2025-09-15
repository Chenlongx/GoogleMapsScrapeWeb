const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed' }),
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        };
    }

    try {
        const body = JSON.parse(event.body);
        const user_id = body.user_id;
        const data_to_export = body.data_to_export;

        if (!user_id || user_id === 'undefined' || user_id === null) {
            console.error('Invalid user_id:', user_id);
            return {
                statusCode: 400,
                body: JSON.stringify({ success: false, message: '无效的用户ID。' }),
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            };
        }

        // 1. 验证用户身份
        let { data: user, error: fetchError } = await supabase
            .from('user_accounts')
            .select('*')
            .eq('id', user_id)
            .single();

        if (fetchError || !user) {
            console.error('User not found or fetch error:', fetchError);
            return {
                statusCode: 401,
                body: JSON.stringify({ success: false, message: '用户未认证或不存在。' }),
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            };
        }

        // 2. 获取并检查用户的导出配额
        const userType = user.user_type;
        let dailyExportCount = user.daily_export_count || 0;
        const lastExportDate = user.last_export_date ? new Date(user.last_export_date) : null;

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (!lastExportDate || lastExportDate.toDateString() !== today.toDateString()) {
            dailyExportCount = 0;
        }

        const EXPORT_LIMITS = {
            'trial': 2,
            'regular': 50,
            'premium': 99999
        };
        const limit = EXPORT_LIMITS[userType] || 0;

        if (dailyExportCount >= limit) {
            return {
                statusCode: 403,
                body: JSON.stringify({ success: false, message: `您今天已达到导出上限（${limit}次），请升级或明天再试。` }),
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            };
        }

        // 3. 执行导出逻辑（占位符，这里可以扩展为实际导出函数）
        console.log(`用户ID ${user_id} 正在导出数据:`, data_to_export);
        // 示例：const exportedContent = yourExportLogic(data_to_export); // 替换为实际逻辑

        // 4. 更新导出次数和日期
        const { error: updateError } = await supabase
            .from('user_accounts')
            .update({
                daily_export_count: dailyExportCount + 1,
                last_export_date: new Date().toISOString()
            })
            .eq('id', user_id);

        if (updateError) {
            console.error('Supabase update export count error:', updateError);
            return {
                statusCode: 500,
                body: JSON.stringify({ success: false, message: `导出计数更新失败: ${updateError.message}` }),
                headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
            };
        }

        // 5. 返回成功响应
        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: `数据导出成功！您今天还可以导出 ${limit - (dailyExportCount + 1)} 次。`, data: "your_exported_data_here" }), // 可以替换 data 为实际导出内容
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        };

    } catch (error) {
        console.error("导出时出错:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ success: false, error: error.message || '内部服务器错误' }),
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        };
    }
};