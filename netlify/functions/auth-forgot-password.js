/**
 * 忘记密码 API（自定义表版本）
 * POST /api/auth/forgot-password
 * 
 * 请求体:
 * {
 *   "email": "user@example.com"
 * }
 */

const { createClient } = require('@supabase/supabase-js');
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

// 生成重置令牌
const generateResetToken = () => {
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
    const { email } = JSON.parse(event.body);

    // 验证必填字段
    if (!email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: '邮箱为必填项'
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

    // 初始化 Supabase
    const supabase = getSupabaseClient();

    // 查找用户
    const { data: user, error: queryError } = await supabase
      .from('email_finder_users')
      .select('id, email, username')
      .eq('email', email)
      .single();

    // 即使用户不存在，也返回成功（安全考虑，不泄露用户信息）
    if (queryError || !user) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: '如果该邮箱已注册，您将收到重置密码链接'
        })
      };
    }

    // 生成重置令牌
    const resetToken = generateResetToken();
    const resetTokenExpires = new Date();
    resetTokenExpires.setHours(resetTokenExpires.getHours() + 1); // 1小时后过期

    // 更新用户记录
    const { error: updateError } = await supabase
      .from('email_finder_users')
      .update({
        reset_token: resetToken,
        reset_token_expires: resetTokenExpires.toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('更新重置令牌错误:', updateError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          message: '生成重置令牌失败，请稍后重试'
        })
      };
    }

    // TODO: 发送重置密码邮件
    // const resetUrl = `${process.env.PASSWORD_RESET_REDIRECT_URL}?token=${resetToken}`;
    // await sendPasswordResetEmail(email, resetUrl);

    console.log(`密码重置令牌已生成 - 用户: ${email}, Token: ${resetToken}`);
    console.log(`重置链接（测试用）: chrome-extension://your-extension-id/reset-password.html?token=${resetToken}`);

    // 返回成功
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: '如果该邮箱已注册，您将收到重置密码链接',
        // 开发环境下返回 token（生产环境应删除）
        ...(process.env.NODE_ENV === 'development' && { 
          debug: { 
            resetToken,
            expiresAt: resetTokenExpires.toISOString()
          } 
        })
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
