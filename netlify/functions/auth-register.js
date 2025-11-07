/**
 * 用户注册 API（两阶段验证版本）
 * POST /api/auth/register
 * 
 * 修改说明：
 * - 注册时不立即创建用户，而是存储到 pending_users 表
 * - 发送验证邮件，包含验证 token
 * - 用户点击验证链接后，才真正创建账号
 * 
 * 请求体:
 * {
 *   "email": "user@example.com",
 *   "password": "password123",
 *   "username": "username"
 * }
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// 生成验证 token
const generateVerificationToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// 密码哈希函数（使用 bcrypt 或简单哈希，这里用 crypto）
const hashPassword = (password) => {
  return crypto.createHash('sha256').update(password).digest('hex');
};

// 获取管理客户端（使用 Service Role Key）
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

    // 初始化管理客户端
    const supabaseAdmin = getSupabaseAdminClient();

    // 1. 检查邮箱是否已被注册（检查正式用户表和待验证表）
    const { data: existingUser } = await supabaseAdmin
      .from('email_finder_users')
      .select('email')
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

    const { data: pendingUser } = await supabaseAdmin
      .from('pending_users')
      .select('email')
      .eq('email', email)
      .single();

    if (pendingUser) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: '该邮箱已提交注册，请查收验证邮件。如未收到，请稍后重试'
        })
      };
    }

    // 2. 生成验证 token 和过期时间（24小时）
    const verificationToken = generateVerificationToken();
    const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    
    // 3. 哈希密码
    const passwordHash = hashPassword(password);

    // 4. 将用户信息存储到 pending_users 表
    const { error: insertError } = await supabaseAdmin
      .from('pending_users')
      .insert([
        {
          email: email,
          username: username || email.split('@')[0],
          password_hash: passwordHash,
          verification_token: verificationToken,
          token_expires_at: tokenExpiresAt
        }
      ]);

    if (insertError) {
      console.error('存储待验证用户失败:', insertError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          message: '注册失败，请稍后重试'
        })
      };
    }

    // 5. 发送验证邮件
    const extensionId = process.env.EXTENSION_ID || 'your-extension-id';
    const verificationUrl = `chrome-extension://${extensionId}/email-verified.html?token=${verificationToken}`;
    
    // 调用发送邮件的 Netlify Function
    try {
      const sendEmailResponse = await fetch(`${process.env.URL}/.netlify/functions/send-verification-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: email,
          username: username || email.split('@')[0],
          verificationUrl: verificationUrl,
          token: verificationToken
        })
      });

      if (!sendEmailResponse.ok) {
        console.error('发送验证邮件失败');
        // 即使发送失败，也返回成功（用户可以稍后重新发送）
      }
    } catch (emailError) {
      console.error('邮件发送错误:', emailError);
      // 不影响主流程
    }

    // 注册成功响应
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: '注册信息已提交！验证邮件已发送到您的邮箱，请查收并点击验证链接完成注册',
        data: {
          email: email,
          needEmailVerification: true,
          tokenExpiresIn: '24小时'
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
