/**
 * 用户注册 API（验证码验证版本）
 * POST /api/auth/register
 * 
 * 修改说明：
 * - 用户先调用 send-verification-code 获取验证码
 * - 前端输入验证码后，提交到此接口
 * - 验证验证码正确后，创建正式用户账号
 * 
 * 请求体:
 * {
 *   "email": "user@example.com",
 *   "password": "password123",
 *   "username": "username",
 *   "verificationCode": "123456"
 * }
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// 密码哈希函数
const hashPassword = (password) => {
  return crypto.createHash('sha256').update(password).digest('hex');
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
    const { email, password, username, verificationCode } = JSON.parse(event.body);

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

    if (!verificationCode) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: '请输入验证码'
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

    // 验证验证码格式
    if (!/^\d{6}$/.test(verificationCode)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: '验证码格式不正确'
        })
      };
    }

    const supabaseAdmin = getSupabaseAdminClient();

    // 1. 检查邮箱是否已注册
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

    // 2. 查找待验证用户并验证验证码
    const { data: pendingUser, error: queryError } = await supabaseAdmin
      .from('pending_users')
      .select('*')
      .eq('email', email)
      .single();

    if (queryError || !pendingUser) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: '请先获取验证码'
        })
      };
    }

    // 3. 检查验证码是否过期
    const now = new Date();
    const expiresAt = new Date(pendingUser.code_expires_at);
    
    if (now > expiresAt) {
      // 验证码过期，删除记录
      await supabaseAdmin
        .from('pending_users')
        .delete()
        .eq('email', email);

      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: '验证码已过期，请重新获取'
        })
      };
    }

    // 4. 检查尝试次数（防止暴力破解）
    if (pendingUser.attempts >= 5) {
      await supabaseAdmin
        .from('pending_users')
        .delete()
        .eq('email', email);

      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: '验证码错误次数过多，请重新获取验证码'
        })
      };
    }

    // 5. 验证验证码
    if (verificationCode !== pendingUser.verification_code) {
      // 更新尝试次数
      await supabaseAdmin
        .from('pending_users')
        .update({ attempts: pendingUser.attempts + 1 })
        .eq('email', email);

      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: `验证码错误，还剩 ${4 - pendingUser.attempts} 次机会`
        })
      };
    }

    // 6. 验证码正确，创建正式用户
    const passwordHash = hashPassword(password);
    
    const { error: insertError } = await supabaseAdmin
      .from('email_finder_users')
      .insert([{
        email: email,
        username: username || email.split('@')[0],
        password_hash: passwordHash,
        email_verified: true,  // 验证码验证成功，标记为已验证
        verification_token: null,
        supabase_auth_user: false,
        created_at: new Date().toISOString()
      }]);

    if (insertError) {
      console.error('创建用户失败:', insertError);
      
      if (insertError.code === '23505') {
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
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          message: '注册失败，请稍后重试'
        })
      };
    }

    // 7. 删除待验证记录
    await supabaseAdmin
      .from('pending_users')
      .delete()
      .eq('email', email);

    // 8. 注册成功
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: '注册成功！现在可以登录了',
        data: {
          email: email,
          username: username || email.split('@')[0]
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
