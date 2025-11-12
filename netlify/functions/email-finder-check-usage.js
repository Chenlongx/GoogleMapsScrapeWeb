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

// 直接从 user_profiles 表查询用户（兼容 UUID 或邮箱）
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveUserProfile({ supabase, userId }) {
  if (!userId) {
    const error = new Error('缺少user_id参数');
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
      return { supabaseUserId: data.id, email: data.email || '', username: data.username || (data.email ? data.email.split('@')[0] : '') };
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
      return { supabaseUserId: data.id, email: data.email || '', username: data.username || (data.email ? data.email.split('@')[0] : '') };
    }
  }

  // 3) 兜底：仍按 id 再查一次
  const { data: fallback, error: fbError } = await supabase
    .from('user_profiles')
    .select('id, email, username')
    .eq('id', userId)
    .single();
  if (!fbError && fallback) {
    return { supabaseUserId: fallback.id, email: fallback.email || '', username: fallback.username || (fallback.email ? fallback.email.split('@')[0] : '') };
  }

  const err = new Error('未找到该账号，请重新登录后再试');
  err.code = 'USER_NOT_FOUND';
  throw err;
}

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
      resolvedUser = await resolveUserProfile({
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
          message: e.code === 'USER_NOT_FOUND'
            ? '未找到该账号，请重新登录后再试'
            : '用户校验失败',
          code: e.code || 'USER_RESOLVE_FAILED'
        })
      };
    }

    // 获取用户profile（包含过期时间）
    const { data: user, error } = await supabase
      .from('user_profiles')
      .select('account_type, daily_search_limit, daily_search_used, last_reset_date, expiry_date, payment_status, searches_left')
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

    // 🔥 检查正式账号是否过期
    if (user.account_type === 'premium' && user.expiry_date) {
      const expiryDate = new Date(user.expiry_date);
      const now = new Date();
      
      if (now > expiryDate) {
        console.warn('⚠️ 账号已过期，自动降级为试用账号:', {
          user_id: resolvedUser.supabaseUserId,
          expiry_date: user.expiry_date
        });
        
        // 降级为试用账号
        await supabase
          .from('user_profiles')
          .update({
            account_type: 'trial',
            plan_type: null,
            payment_status: 'expired',
            searches_left: 10,
            daily_search_limit: 10,
            daily_search_used: 0,
            last_reset_date: new Date().toISOString().split('T')[0]
          })
          .eq('id', resolvedUser.supabaseUserId);
        
        // 更新本地user对象
        user.account_type = 'trial';
        user.daily_search_limit = 10;
        user.daily_search_used = 0;
        user.searches_left = 10;
        user.payment_status = 'expired';
        
        console.log('✅ 已降级为试用账号');
      }
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
        searches_left: user.searches_left,
        remaining: user.daily_search_limit - user.daily_search_used,
        payment_status: user.payment_status,
        expiry_date: user.expiry_date,
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

