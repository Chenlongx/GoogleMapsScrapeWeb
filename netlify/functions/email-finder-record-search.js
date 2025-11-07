/**
 * Email Finder - 记录搜索 API
 * 路径: /.netlify/functions/email-finder-record-search
 */

const { createClient } = require('@supabase/supabase-js');
const { resolveSupabaseUser } = require('./utils/resolve-user');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: 'Method not allowed' })
    };
  }

  try {
    const { user_id, username, search_type, search_query, results_count } = JSON.parse(event.body);

    if (!user_id || !search_type) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: '缺少必要参数' })
      };
    }

    let resolvedUser;
    try {
      resolvedUser = await resolveSupabaseUser({
        supabase,
        userId: user_id,
        fallbackUsername: username
      });
    } catch (e) {
      console.error('解析用户失败:', e);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: e.code === 'LEGACY_USER_NOT_FOUND'
            ? '未找到该账号的使用记录，请重新登录后再试'
            : '用户校验失败',
          code: e.code || 'USER_RESOLVE_FAILED'
        })
      };
    }

    // 获取用户信息
    const { data: user, error: userError } = await supabase
      .from('user_profiles')
      .select('account_type, daily_search_used, daily_search_limit')
      .eq('id', resolvedUser.supabaseUserId)
      .single();

    if (userError) {
      console.error('查询用户失败:', userError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, message: '查询用户失败' })
      };
    }

    // 正式账号不需要增加使用次数
    if (user.account_type !== 'premium') {
      // 增加使用次数
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          daily_search_used: user.daily_search_used + 1
        })
        .eq('id', resolvedUser.supabaseUserId);

      if (updateError) {
        console.error('更新使用次数失败:', updateError);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ success: false, message: '更新失败' })
        };
      }
    }

    // 记录搜索日志
    const { error: logError } = await supabase
      .from('search_logs')
      .insert({
        user_id: resolvedUser.supabaseUserId,
        username: resolvedUser.username || '',
        search_type,
        search_query: search_query || '',
        results_count: results_count || 0
      });

    if (logError) {
      console.error('记录搜索日志失败:', logError);
      // 日志失败不影响主流程
    }

    const newUsedCount = user.account_type === 'premium' ? 
      user.daily_search_used : 
      user.daily_search_used + 1;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        daily_used: newUsedCount,
        remaining: user.daily_search_limit - newUsedCount,
        message: '搜索已记录',
        resolved_user_id: resolvedUser.supabaseUserId
      })
    };
  } catch (error) {
    console.error('记录搜索失败:', error);
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

