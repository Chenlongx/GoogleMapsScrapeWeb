/**
 * 发送验证码接口
 * POST /api/send-verification-code
 * 
 * 发送6位数字验证码到用户邮箱
 * 
 * 请求体:
 * {
 *   "email": "user@example.com",
 *   "username": "username" (可选)
 * }
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// 生成6位随机验证码
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// 密码哈希函数（临时使用，注册时会替换）
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

// 邮件模板
const getEmailTemplate = (username, code) => {
  return {
    subject: '【智贸云梯拓客】您的验证码',
    html: `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>验证码</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f6f9; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">🔐 验证码</h1>
              <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">智贸云梯拓客</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px; text-align: center;">
              <h2 style="color: #333; margin: 0 0 20px 0; font-size: 20px;">Hi ${username}，</h2>
              <p style="color: #666; line-height: 1.6; margin: 0 0 30px 0; font-size: 15px;">
                您正在注册智贸云梯拓客账号，您的验证码是：
              </p>
              
              <!-- Verification Code -->
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 8px; margin: 30px auto; display: inline-block;">
                <div style="background: white; padding: 15px 40px; border-radius: 6px;">
                  <span style="font-size: 36px; font-weight: bold; color: #667eea; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                    ${code}
                  </span>
                </div>
              </div>
              
              <p style="color: #666; line-height: 1.6; margin: 20px 0 0 0; font-size: 14px;">
                请在注册页面输入此验证码以完成注册
              </p>
              
              <!-- Info Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0 0 0; background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; border-radius: 4px;">
                <tr>
                  <td style="text-align: left;">
                    <p style="color: #856404; margin: 0; font-size: 13px; line-height: 1.6;">
                      ⚠️ <strong>重要提示：</strong><br/>
                      • 验证码有效期：<strong>10 分钟</strong><br/>
                      • 如果您没有注册此账号，请忽略此邮件<br/>
                      • 请勿将验证码分享给他人
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px 30px; text-align: center; border-radius: 0 0 8px 8px;">
              <p style="color: #999; margin: 0; font-size: 12px; line-height: 1.6;">
                © 2025 智贸云梯拓客 | MediaMingle<br/>
                如有问题，请联系我们的技术支持
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    text: `
【智贸云梯拓客】您的验证码

Hi ${username}，

您正在注册智贸云梯拓客账号，您的验证码是：

${code}

请在注册页面输入此验证码以完成注册。

⚠️ 重要提示：
• 验证码有效期：10 分钟
• 如果您没有注册此账号，请忽略此邮件
• 请勿将验证码分享给他人

© 2025 智贸云梯拓客 | MediaMingle
    `
  };
};

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: '只允许 POST 请求' })
    };
  }

  try {
    const { email, username } = JSON.parse(event.body);

    // 验证邮箱
    if (!email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: '请输入邮箱地址' })
      };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: '邮箱格式不正确' })
      };
    }

    const supabaseAdmin = getSupabaseAdminClient();

    // 1. 检查邮箱是否已注册（改为 user_profiles 表）
    const { data: existingUser } = await supabaseAdmin
      .from('user_profiles')
      .select('email')
      .eq('email', email)
      .single();

    if (existingUser) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: '该邮箱已被注册' })
      };
    }

    // 2. 生成验证码
    const verificationCode = generateVerificationCode();
    const codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10分钟

    // 3. 检查是否已有待验证记录
    const { data: pendingUser } = await supabaseAdmin
      .from('pending_users')
      .select('*')
      .eq('email', email)
      .single();

    if (pendingUser) {
      // 更新验证码
      await supabaseAdmin
        .from('pending_users')
        .update({
          verification_code: verificationCode,
          code_expires_at: codeExpiresAt,
          attempts: 0
        })
        .eq('email', email);
    } else {
      // 创建新记录（临时密码，注册时会替换）
      await supabaseAdmin
        .from('pending_users')
        .insert([{
          email: email,
          username: username || email.split('@')[0],
          password_hash: 'temp_will_be_replaced',
          verification_code: verificationCode,
          code_expires_at: codeExpiresAt,
          attempts: 0
        }]);
    }

    // 4. 发送验证码邮件
    const emailTemplate = getEmailTemplate(username || email.split('@')[0], verificationCode);
    
    // 邮件服务配置
    const emailServiceType = process.env.EMAIL_SERVICE || 'console';
    let emailSent = false;  // 标记是否真实发送了邮件
    
    if (emailServiceType === 'resend' && process.env.RESEND_API_KEY) {
      const { Resend } = require('resend');  // ✅ 解构导入
      const resend = new Resend(process.env.RESEND_API_KEY);
      
      const { data, error } = await resend.emails.send({
        from: process.env.EMAIL_FROM || 'noreply@mediamingle.cn',
        to: email,
        subject: emailTemplate.subject,
        html: emailTemplate.html
      });
      
      if (error) {
        console.error('Resend 发送失败:', error);
        throw new Error(`邮件发送失败: ${error.message}`);
      }
      
      console.log('✅ 验证码邮件已发送:', data);
      emailSent = true;  // 标记已发送
    } else {
      // 开发模式：输出到控制台
      console.log('📧 验证码（开发模式）:');
      console.log('收件人:', email);
      console.log('验证码:', verificationCode);
      console.log('有效期:', '10分钟');
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: '验证码已发送到您的邮箱，请查收',
        // ✅ 只在开发模式（未真实发送邮件）时返回验证码
        debug: !emailSent ? { code: verificationCode } : undefined
      })
    };

  } catch (error) {
    console.error('发送验证码错误:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: '发送验证码失败，请稍后重试',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      })
    };
  }
};

