/**
 * Email Finder - 检查用户使用次数 API
 * 路径: /.netlify/functions/email-finder-check-usage
 */

const { createClient } = require('@supabase/supabase-js');

// Supabase配置（从环境变量获取）
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // 处理 OPTIONS 请求
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: 'Method not allowed' })
    };
  }

  try {
    const { user_id } = JSON.parse(event.body);

    if (!user_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: '缺少user_id参数' })
      };
    }

    // 获取用户profile
    const { data: user, error } = await supabase
      .from('user_profiles')
      .select('account_type, daily_search_limit, daily_search_used, last_reset_date')
      .eq('id', user_id)
      .single();

    if (error) {
      console.error('查询用户失败:', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, message: '查询失败' })
      };
    }

    // 检查是否需要重置
    const today = new Date().toISOString().split('T')[0];
    if (user.last_reset_date !== today) {
      // 重置使用次数
      await supabase
        .from('user_profiles')
        .update({
          daily_search_used: 0,
          last_reset_date: today
        })
        .eq('id', user_id);

      user.daily_search_used = 0;
    }

    const canSearch = user.account_type === 'premium' || 
                     user.daily_search_used < user.daily_search_limit;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        can_search: canSearch,
        account_type: user.account_type,
        daily_limit: user.daily_search_limit,
        daily_used: user.daily_search_used,
        remaining: user.daily_search_limit - user.daily_search_used,
        message: canSearch ? 
          `今日还可搜索${user.daily_search_limit - user.daily_search_used}次` : 
          '今日搜索次数已用完'
      })
    };
  } catch (error) {
    console.error('检查使用次数失败:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: '服务器错误: ' + error.message
      })
    };
  }
};

