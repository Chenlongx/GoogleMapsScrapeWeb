/**
 * 用户注册 API（自定义表版本）
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
const bcrypt = require('bcrypt');
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

// 生成验证令牌
const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
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

    // 初始化 Supabase
    const supabase = getSupabaseClient();

    // 检查邮箱是否已存在
    const { data: existingUser } = await supabase
      .from('email_finder_users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: '该邮箱已被注册'
        })
      };
    }

    // 哈希密码
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 生成验证令牌（如果需要邮箱验证）
    const verificationToken = generateToken();

    // 插入新用户
    const { data: newUser, error: insertError } = await supabase
      .from('email_finder_users')
      .insert([
        {
          email: email,
          username: username || email.split('@')[0],
          password_hash: passwordHash,
          email_verified: false, // 如果不需要邮箱验证，改为 true
          verification_token: verificationToken
        }
      ])
      .select()
      .single();

    if (insertError) {
      console.error('插入用户错误:', insertError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          message: '注册失败，请稍后重试'
        })
      };
    }

    // TODO: 发送验证邮件
    // await sendVerificationEmail(email, verificationToken);

    // 注册成功
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: '注册成功' + (newUser.email_verified ? '' : '，请检查邮箱验证链接'),
        data: {
          user: {
            id: newUser.id,
            email: newUser.email,
            username: newUser.username,
            email_verified: newUser.email_verified,
            created_at: newUser.created_at
          },
          needEmailVerification: !newUser.email_verified
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
