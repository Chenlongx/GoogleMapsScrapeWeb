/**
 * 用户登录 API（Supabase Auth + 自定义表版本）
 * POST /api/auth/login
 * 
 * 请求体:
 * {
 *   "email": "user@example.com",
 *   "password": "password123"
 * }
 */

const { createClient } = require('@supabase/supabase-js');

// 初始化 Supabase 客户端（使用 ANON_KEY 访问 Auth）
const getSupabaseClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('缺少 Supabase 环境变量');
  }

  return createClient(supabaseUrl, supabaseAnonKey);
};

// 获取管理客户端（用于更新自定义表）
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

    const supabase = getSupabaseClient();
    const supabaseAdmin = getSupabaseAdminClient();

    // 使用 Supabase Auth 登录
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (authError) {
      console.error('登录错误:', authError.message);
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: '邮箱或密码错误' 
        })
      };
    }

    // 检查邮箱是否已验证
    if (!authData.user.email_confirmed_at) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          success: false,
          message: '请先验证您的邮箱地址。验证邮件已发送到您的邮箱，请查收并点击验证链接',
          needEmailVerification: true
        })
      };
    }

    // 更新自定义表中的登录信息（可选）
    try {
      const { data: customUser } = await supabaseAdmin
        .from('email_finder_users')
        .select('login_count')
        .eq('id', authData.user.id)
        .single();

      if (customUser) {
        await supabaseAdmin
          .from('email_finder_users')
          .update({
            last_login_at: new Date().toISOString(),
            login_count: (customUser.login_count || 0) + 1,
            email_verified: true // 同步验证状态
          })
          .eq('id', authData.user.id);
      }
    } catch (updateError) {
      console.error('更新自定义表错误:', updateError);
      // 不影响登录流程
    }

    // 登录成功
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: '登录成功',
        data: {
          accessToken: authData.session.access_token,
          refreshToken: authData.session.refresh_token,
          expiresIn: authData.session.expires_in || 3600,
          user: {
            id: authData.user.id,
            email: authData.user.email,
            username: authData.user.user_metadata?.username || authData.user.email.split('@')[0],
            email_verified: true,
            created_at: authData.user.created_at
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
