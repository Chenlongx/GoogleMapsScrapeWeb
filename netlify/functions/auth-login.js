/**
 * 用户登录 API（自定义密码验证版本）
 * POST /api/auth/login
 * 
 * 修改说明：
 * - 使用自定义表进行密码验证
 * - 检查邮箱验证状态
 * - 生成 JWT token
 * 
 * 请求体:
 * {
 *   "email": "user@example.com",
 *   "password": "password123"
 * }
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// 密码哈希函数（与注册时使用的相同）
const hashPassword = (password) => {
  return crypto.createHash('sha256').update(password).digest('hex');
};

// 生成 JWT token
const generateToken = (userId, email) => {
  const jwtSecret = process.env.JWT_SECRET || 'your-secret-key-please-change-in-production';
  
  return jwt.sign(
    { 
      userId: userId,
      email: email,
      type: 'access'
    },
    jwtSecret,
    { expiresIn: '7d' }
  );
};

// 生成 Refresh Token
const generateRefreshToken = (userId, email) => {
  const jwtSecret = process.env.JWT_SECRET || 'your-secret-key-please-change-in-production';
  
  return jwt.sign(
    { 
      userId: userId,
      email: email,
      type: 'refresh'
    },
    jwtSecret,
    { expiresIn: '30d' }
  );
};

// 获取管理客户端
const getSupabaseAdminClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('缺少 Supabase Service Role Key');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
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

    const supabaseAdmin = getSupabaseAdminClient();

    // 1. 查询用户信息
    const { data: user, error: queryError } = await supabaseAdmin
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

    // 2. 检查邮箱是否已验证
    if (!user.email_verified) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          success: false,
          message: '请先验证您的邮箱地址。请查收注册时发送的验证邮件并点击验证链接',
          needEmailVerification: true
        })
      };
    }

    // 3. 验证密码
    const passwordHash = hashPassword(password);
    if (passwordHash !== user.password_hash) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          message: '邮箱或密码错误'
        })
      };
    }

    // 4. 生成 token
    const accessToken = generateToken(user.id, user.email);
    const refreshToken = generateRefreshToken(user.id, user.email);

    // 5. 更新登录信息
    try {
      await supabaseAdmin
        .from('email_finder_users')
        .update({
          last_login_at: new Date().toISOString(),
          login_count: (user.login_count || 0) + 1
        })
        .eq('id', user.id);
    } catch (updateError) {
      console.error('更新登录信息失败:', updateError);
      // 不影响登录流程
    }

    // 6. 登录成功
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: '登录成功',
        data: {
          accessToken: accessToken,
          refreshToken: refreshToken,
          expiresIn: 7 * 24 * 3600, // 7天
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
