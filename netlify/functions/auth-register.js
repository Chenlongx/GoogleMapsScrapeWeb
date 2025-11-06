/**
 * 用户注册 API（Supabase Auth + 自定义表版本）
 * POST /api/auth/register
 * 
 * 请求体:
 * {
 *   "email": "user@example.com",
 *   "password": "password123",
 *   "username": "username"
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

// 获取管理客户端（使用 Service Role Key 操作自定义表）
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
    const { email, password, username } = JSON.parse(event.body);

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

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: '邮箱格式不正确'
        })
      };
    }

    // 验证密码长度
    if (password.length < 6) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: '密码长度至少6个字符'
        })
      };
    }

    // 初始化客户端
    const supabase = getSupabaseClient();
    const supabaseAdmin = getSupabaseAdminClient();

    // 1. 使用 Supabase Auth 注册（会自动发送验证邮件）
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        emailRedirectTo: `chrome-extension://${process.env.EXTENSION_ID || 'your-extension-id'}/email-verified.html`,
        data: {
          username: username || email.split('@')[0]
        }
      }
    });

    if (authError) {
      console.error('Supabase Auth 注册错误:', authError.message);
      
      // 处理常见错误
      if (authError.message.includes('already registered')) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            success: false, 
            message: '该邮箱已被注册' 
          })
        };
      }
      
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: authError.message 
        })
      };
    }

    // 2. 同时在自定义表中创建用户记录
    try {
      const { error: insertError } = await supabaseAdmin
        .from('email_finder_users')
        .insert([
          {
            id: authData.user.id, // 使用相同的 UUID
            email: email,
            username: username || email.split('@')[0],
            password_hash: 'managed_by_supabase_auth', // 标记密码由 Auth 管理
            email_verified: false, // 初始为未验证
            verification_token: null, // Auth 管理，不需要
            supabase_auth_user: true // 标记为 Auth 用户
          }
        ]);

      if (insertError) {
        console.error('插入自定义表错误:', insertError);
        // 如果自定义表插入失败，记录错误但不影响 Auth 注册
        // 可以选择删除 Auth 用户或在后续通过触发器同步
      }
    } catch (customTableError) {
      console.error('自定义表操作失败:', customTableError);
      // 不影响主流程
    }

    // 注册成功
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: '注册成功！验证邮件已发送到您的邮箱，请查收并点击验证链接',
        data: {
          user: {
            id: authData.user.id,
            email: authData.user.email,
            username: username || email.split('@')[0],
            email_verified: false
          },
          needEmailVerification: true,
          // 可选：返回 session（如果需要自动登录）
          // session: authData.session
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
