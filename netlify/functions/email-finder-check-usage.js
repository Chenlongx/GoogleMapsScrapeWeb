/**
 * Email Finder - 检查用户使用次数 API
 * 路径: /.netlify/functions/email-finder-check-usage
 */

const { createClient } = require('@supabase/supabase-js');
const { resolveSupabaseUser } = require('./utils/resolve-user');

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

    let resolvedUser;
    try {
      resolvedUser = await resolveSupabaseUser({
        supabase,
        userId: user_id
      });
    } catch (e) {
      console.error('解析用户失败:', e);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: e.code === 'LEGACY_USER_NOT_FOUND'
            ? '未找到该账号，请重新登录后再试'
            : '用户校验失败',
          code: e.code || 'USER_RESOLVE_FAILED'
        })
      };
    }

    // 获取用户profile
    const { data: user, error } = await supabase
      .from('user_profiles')
      .select('account_type, daily_search_limit, daily_search_used, last_reset_date')
      .eq('id', resolvedUser.supabaseUserId)
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
        .eq('id', resolvedUser.supabaseUserId);

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
          '今日搜索次数已用完',
        resolved_user_id: resolvedUser.supabaseUserId
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

