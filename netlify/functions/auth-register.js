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

    // 1. 检查邮箱是否已注册（改为 user_profiles 表检查，不依赖 auth.users）
    console.log('🔍 检查邮箱是否已注册 (user_profiles):', email);
    const { data: existingProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('email')
      .eq('email', email)
      .single();

    if (existingProfile) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({
          success: false,
          message: '该邮箱已被注册，请直接登录'
        })
      };
    }
    console.log('✅ 邮箱可用，开始注册流程');

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

    // 6. 验证码正确，创建正式用户（仅使用 user_profiles，不使用 Supabase Auth）
    const passwordHash = hashPassword(password);
    const userId = crypto.randomUUID();
    console.log('📝 创建 user_profiles 记录...');
    const { data: createdProfiles, error: insertError } = await supabaseAdmin
      .from('user_profiles')
      .insert([{
        id: userId,
        email: email,
        username: username || email.split('@')[0],
        password_hash: passwordHash,
        email_verified: true,
        account_type: 'trial',
        daily_search_limit: 10,
        daily_search_used: 0,
        searches_left: 10,
        last_reset_date: new Date().toISOString().split('T')[0],
        payment_status: 'unpaid',
        status: 'active',
        created_at: new Date().toISOString()
      }])
      .select('*');

    if (insertError) {
      console.error('❌ 创建 user_profiles 失败:', insertError);
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
    
    const created = Array.isArray(createdProfiles) ? createdProfiles[0] : createdProfiles;
    console.log('✅ user_profiles 创建成功, id:', created?.id);
    console.log('✅ 注册完成:', email);

    // 7. 删除待验证记录
    await supabaseAdmin
      .from('pending_users')
      .delete()
      .eq('email', email);

    // 8. 删除验证码记录
    await supabaseAdmin
      .from('email_verification_codes')
      .delete()
      .eq('email', email);

    // 9. 注册成功
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: '注册成功！现在可以登录了',
        data: {
          user_id: created?.id,
          email: email,
          username: username || email.split('@')[0],
          account_type: 'trial'
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
