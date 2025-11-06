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

    // 从数据库验证会话是否存在且未过期
    const { data: session, error: sessionError } = await supabase
      .from('email_finder_sessions')
      .select('*')
      .eq('access_token', token)
      .single();

    if (sessionError || !session) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          message: '会话不存在或已失效'
        })
      };
    }

    // 检查会话是否过期
    const now = new Date();
    const expiresAt = new Date(session.expires_at);

    if (now > expiresAt) {
      // 删除过期会话
      await supabase
        .from('email_finder_sessions')
        .delete()
        .eq('id', session.id);

      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          message: '会话已过期，请重新登录'
        })
      };
    }

    // 更新会话最后使用时间
    await supabase
      .from('email_finder_sessions')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', session.id);

    // 获取用户信息
    const { data: user, error: userError } = await supabase
      .from('email_finder_users')
      .select('id, email, username, email_verified, status, created_at, last_login_at')
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
    if (user.status !== 'active') {
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
            status: user.status,
            created_at: user.created_at,
            last_login_at: user.last_login_at
          },
          session: {
            expires_at: session.expires_at
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
