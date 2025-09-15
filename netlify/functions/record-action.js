// netlify/functions/record-action.js
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ success: false, message: 'Method Not Allowed' }) };
    }

    try {
        const { user_id, action_type } = JSON.parse(event.body);

        if (!user_id || !action_type) {
            return { statusCode: 400, body: JSON.stringify({ success: false, message: '缺少必要参数' }) };
        }

        let updateData = {};
        if (action_type === 'search') {
            updateData = { trial_search_used: true };
        } else if (action_type === 'export') {
            updateData = { daily_export_count: 1, last_export_date: new Date().toISOString() };
        } else {
            return { statusCode: 400, body: JSON.stringify({ success: false, message: '无效的操作类型' }) };
        }

        const { error } = await supabase
            .from('user_accounts')
            .update(updateData)
            .eq('id', user_id);

        if (error) {
            console.error('Error updating user action:', error);
            return { statusCode: 500, body: JSON.stringify({ success: false, message: '更新用户状态失败' }) };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, message: '操作已记录' })
        };

    } catch (err) {
        console.error('Handler error:', err);
        return { statusCode: 500, body: JSON.stringify({ success: false, message: '服务器内部错误' }) };
    }
};