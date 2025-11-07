/**
 * 邮箱验证 API
 * POST /api/auth/verify-email
 * 
 * 验证用户的邮箱地址，将用户从 pending_users 迁移到正式用户表
 * 
 * 请求体:
 * {
 *   "token": "verification_token_here"
 * }
 */

const { createClient } = require('@supabase/supabase-js');

const getSupabaseAdminClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('缺少 Supabase Service Role Key');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
};

const getSupabaseClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('缺少 Supabase 环境变量');
  }

  return createClient(supabaseUrl, supabaseAnonKey);
};

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // 支持 GET 和 POST 请求
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: '只允许 GET 或 POST 请求' })
    };
  }

  try {
    // 从查询参数或请求体获取 token
    let token;
    if (event.httpMethod === 'GET') {
      token = event.queryStringParameters?.token;
    } else {
      const body = JSON.parse(event.body);
      token = body.token;
    }

    if (!token) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: '缺少验证 token'
        })
      };
    }

    const supabaseAdmin = getSupabaseAdminClient();
    const supabase = getSupabaseClient();

    // 1. 查找待验证用户
    const { data: pendingUser, error: queryError } = await supabaseAdmin
      .from('pending_users')
      .select('*')
      .eq('verification_token', token)
      .single();

    if (queryError || !pendingUser) {
      console.error('查找待验证用户失败:', queryError);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: '无效的验证链接'
        })
      };
    }

    // 2. 检查 token 是否过期
    const now = new Date();
    const expiresAt = new Date(pendingUser.token_expires_at);
    
    if (now > expiresAt) {
      // Token 已过期，删除记录
      await supabaseAdmin
        .from('pending_users')
        .delete()
        .eq('id', pendingUser.id);

      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: '验证链接已过期，请重新注册'
        })
      };
    }

    // 3. 使用 Supabase Auth 创建用户（使用原始密码的哈希值）
    // 注意：由于我们已经哈希了密码，这里需要一个特殊的处理方式
    // Supabase Auth 不支持直接插入哈希密码，所以我们有两个选择：
    // 选择A: 要求用户在验证时重新输入密码（更安全）
    // 选择B: 仅使用自定义表，不使用 Supabase Auth（简单但失去 Auth 的优势）
    
    // 这里我们选择方案B：直接使用自定义表
    const { error: insertError } = await supabaseAdmin
      .from('email_finder_users')
      .insert([
        {
          email: pendingUser.email,
          username: pendingUser.username,
          password_hash: pendingUser.password_hash,
          email_verified: true,
          verification_token: null,
          supabase_auth_user: false, // 标记为非 Auth 用户
          created_at: new Date().toISOString()
        }
      ]);

    if (insertError) {
      console.error('创建用户失败:', insertError);
      
      // 检查是否是重复邮箱
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
          message: '创建用户失败，请稍后重试'
        })
      };
    }

    // 4. 删除待验证用户记录
    await supabaseAdmin
      .from('pending_users')
      .delete()
      .eq('id', pendingUser.id);

    // 5. 验证成功
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: '邮箱验证成功！您的账号已创建，现在可以登录了',
        data: {
          email: pendingUser.email,
          username: pendingUser.username
        }
      })
    };

  } catch (error) {
    console.error('验证邮箱错误:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: '验证失败，请稍后重试',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      })
    };
  }
};

