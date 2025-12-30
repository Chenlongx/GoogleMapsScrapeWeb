/**
 * 验证 Token API（自定义表版本）
 * POST /api/auth/verify-token
 * 
 * 请求头:
 * Authorization: Bearer <access-token>
 */

const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

// 初始化 Supabase 客户端（使用 Service Role Key）
const getSupabaseClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('缺少 Supabase 环境变量');
  }

  return createClient(supabaseUrl, supabaseKey);
};

// 验证 JWT Token
const verifyAccessToken = (token) => {
  const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

  try {
    const decoded = jwt.verify(token, secret);
    return { valid: true, payload: decoded };
  } catch (error) {
    return { valid: false, error: error.message };
  }
};

exports.handler = async (event, context) => {
  // CORS 头部
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // 处理 OPTIONS 预检请求
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // 只允许 POST 请求
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        success: false,
        message: '只允许 POST 请求'
      })
    };
  }

  try {
    // 从 Authorization 头部获取 token
    const authHeader = event.headers['authorization'] || event.headers['Authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          message: '缺少认证令牌'
        })
      };
    }

    const token = authHeader.substring(7); // 移除 "Bearer " 前缀

    // 验证 JWT Token
    const { valid, payload, error } = verifyAccessToken(token);

    if (!valid) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          message: '无效或过期的令牌',
          error: error
        })
      };
    }

    // 初始化 Supabase
    const supabase = getSupabaseClient();

    // 🆕 单设备登录验证：检查会话标识是否与数据库中的一致
    if (payload.sessionToken) {
      const { data: userProfile, error: profileError } = await supabase
        .from('user_profiles')
        .select('current_session_token')
        .eq('id', payload.userId)
        .single();

      if (profileError) {
        console.error('查询用户会话失败:', profileError);
      } else if (userProfile && userProfile.current_session_token !== payload.sessionToken) {
        // 会话标识不匹配，说明在其他设备登录了
        console.log('🚫 会话已被新登录覆盖，当前设备被踢出');
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({
            success: false,
            message: '您的账号已在其他设备登录，当前会话已失效',
            kicked: true  // 🆕 标记为被踢出
          })
        };
      }
    }

    // 🆕 跳过旧的 email_finder_sessions 表检查
    // 新的登录流程使用 user_profiles.current_session_token 进行单设备验证
    // 上面的 sessionToken 检查已经完成了会话验证

    // 获取用户信息（从 user_profiles 表）
    const { data: user, error: userError } = await supabase
      .from('user_profiles')
      .select('id, email, username, email_verified, account_type, status, created_at, last_login_at, expiry_date, subscription_end')
      .eq('id', payload.userId)
      .single();

    if (userError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          message: '用户不存在'
        })
      };
    }

    // 检查用户状态
    if (user.status && user.status !== 'active') {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          success: false,
          message: '账号已被禁用'
        })
      };
    }

    // 验证成功
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Token 有效',
        data: {
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            email_verified: user.email_verified,
            account_type: user.account_type,
            status: user.status,
            created_at: user.created_at,
            last_login_at: user.last_login_at,
            expiry_date: user.expiry_date,
            subscription_end: user.subscription_end
          }
        }
      })
    };

  } catch (error) {
    console.error('服务器错误:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: '服务器内部错误',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      })
    };
  }
};
