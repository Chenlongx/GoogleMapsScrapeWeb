/**
 * 用户登录 API（自定义表版本）
 * POST /api/auth/login
 * 
 * 请求体:
 * {
 *   "email": "user@example.com",
 *   "password": "password123"
 * }
 */

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// 初始化 Supabase 客户端（使用 Service Role Key）
const getSupabaseClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('缺少 Supabase 环境变量');
  }

  return createClient(supabaseUrl, supabaseKey);
};

// 生成 JWT Token
const generateAccessToken = (userId, email) => {
  const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  const expiresIn = '1h'; // 1小时

  return jwt.sign(
    { 
      userId, 
      email,
      type: 'access'
    }, 
    secret, 
    { expiresIn }
  );
};

// 生成 Refresh Token
const generateRefreshToken = () => {
  return crypto.randomBytes(64).toString('hex');
};

exports.handler = async (event, context) => {
  // CORS 头部
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
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
    // 解析请求体
    const { email, password } = JSON.parse(event.body);

    // 验证必填字段
    if (!email || !password) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: '邮箱和密码为必填项'
        })
      };
    }

    // 初始化 Supabase
    const supabase = getSupabaseClient();

    // 查找用户
    const { data: user, error: queryError } = await supabase
      .from('email_finder_users')
      .select('*')
      .eq('email', email)
      .single();

    if (queryError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          message: '邮箱或密码错误'
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
          message: '账号已被禁用，请联系管理员'
        })
      };
    }

    // 验证密码
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          message: '邮箱或密码错误'
        })
      };
    }

    // 生成 Token
    const accessToken = generateAccessToken(user.id, user.email);
    const refreshToken = generateRefreshToken();

    // 获取客户端信息
    const ipAddress = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown';
    const userAgent = event.headers['user-agent'] || 'unknown';

    // 创建会话记录
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1小时后过期

    const { error: sessionError } = await supabase
      .from('email_finder_sessions')
      .insert([
        {
          user_id: user.id,
          access_token: accessToken,
          refresh_token: refreshToken,
          ip_address: ipAddress,
          user_agent: userAgent,
          expires_at: expiresAt.toISOString()
        }
      ]);

    if (sessionError) {
      console.error('创建会话错误:', sessionError);
      // 不影响登录流程，继续返回 token
    }

    // 更新用户登录信息
    await supabase
      .from('email_finder_users')
      .update({
        last_login_at: new Date().toISOString(),
        login_count: user.login_count + 1
      })
      .eq('id', user.id);

    // 登录成功
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: '登录成功',
        data: {
          accessToken,
          refreshToken,
          expiresIn: 3600, // 1小时（秒）
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            email_verified: user.email_verified,
            created_at: user.created_at
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
