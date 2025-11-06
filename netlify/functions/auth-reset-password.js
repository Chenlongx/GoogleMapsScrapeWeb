/**
 * 重置密码 API（自定义表版本）
 * POST /api/auth/reset-password
 * 
 * 请求体:
 * {
 *   "token": "reset-token-from-email",
 *   "newPassword": "newpassword123"
 * }
 */

const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');

// 初始化 Supabase 客户端（使用 Service Role Key）
const getSupabaseClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('缺少 Supabase 环境变量');
  }

  return createClient(supabaseUrl, supabaseKey);
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
    const { token, newPassword } = JSON.parse(event.body);

    // 验证必填字段
    if (!token || !newPassword) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: '令牌和新密码为必填项'
        })
      };
    }

    // 验证新密码长度
    if (newPassword.length < 6) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: '新密码长度至少6个字符'
        })
      };
    }

    // 初始化 Supabase
    const supabase = getSupabaseClient();

    // 查找令牌对应的用户
    const { data: user, error: queryError } = await supabase
      .from('email_finder_users')
      .select('*')
      .eq('reset_token', token)
      .single();

    if (queryError || !user) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: '无效的重置令牌'
        })
      };
    }

    // 检查令牌是否过期
    const now = new Date();
    const tokenExpires = new Date(user.reset_token_expires);

    if (now > tokenExpires) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: '重置令牌已过期，请重新申请'
        })
      };
    }

    // 哈希新密码
    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // 更新密码并清除重置令牌
    const { error: updateError } = await supabase
      .from('email_finder_users')
      .update({
        password_hash: newPasswordHash,
        reset_token: null,
        reset_token_expires: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('更新密码错误:', updateError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          message: '重置密码失败，请稍后重试'
        })
      };
    }

    // 清除该用户的所有会话（强制重新登录）
    await supabase
      .from('email_finder_sessions')
      .delete()
      .eq('user_id', user.id);

    // 重置成功
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: '密码重置成功，请使用新密码登录'
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
