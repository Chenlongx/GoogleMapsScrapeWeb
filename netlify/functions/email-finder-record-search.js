/**
 * Email Finder - 记录搜索 API
 * 路径: /.netlify/functions/email-finder-record-search
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 直接从 user_profiles 表查询用户（兼容 UUID 或邮箱）
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveUserProfile({ supabase, userId, fallbackUsername = '' }) {
  if (!userId) {
    const error = new Error('缺少 user_id');
    error.code = 'USER_ID_MISSING';
    throw error;
  }

  // 1) UUID: 通过 id 查找
  if (typeof userId === 'string' && UUID_REGEX.test(userId)) {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, email, username')
      .eq('id', userId)
      .single();
    if (!error && data) {
      return { supabaseUserId: data.id, email: data.email || '', username: data.username || fallbackUsername || (data.email ? data.email.split('@')[0] : '') };
    }
  }

  // 2) 邮箱: 通过 email 查找
  if (typeof userId === 'string' && userId.includes('@')) {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, email, username')
      .eq('email', userId)
      .single();
    if (!error && data) {
      return { supabaseUserId: data.id, email: data.email || '', username: data.username || fallbackUsername || (data.email ? data.email.split('@')[0] : '') };
    }
  }

  // 3) 兜底：仍按 id 再查一次
  const { data: fallback, error: fbError } = await supabase
    .from('user_profiles')
    .select('id, email, username')
    .eq('id', userId)
    .single();
  if (!fbError && fallback) {
    return { supabaseUserId: fallback.id, email: fallback.email || '', username: fallback.username || fallbackUsername || (fallback.email ? fallback.email.split('@')[0] : '') };
  }

  const err = new Error('未找到该账号的使用记录，请重新登录后再试');
  err.code = 'USER_NOT_FOUND';
  throw err;
}

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
      resolvedUser = await resolveUserProfile({
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
          message: e.code === 'USER_NOT_FOUND'
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

