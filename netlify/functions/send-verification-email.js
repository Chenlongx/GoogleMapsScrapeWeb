/**
 * 发送验证邮件
 * POST /api/send-verification-email
 * 
 * 使用 Supabase 的邮件服务或第三方邮件服务（Resend/SendGrid等）
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

// 邮件模板
const getEmailTemplate = (username, verificationUrl) => {
  return {
    subject: '【智贸云梯拓客】验证您的邮箱地址',
    html: `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>邮箱验证</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f6f9; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">✉️ 欢迎注册</h1>
              <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">智贸云梯拓客</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="color: #333; margin: 0 0 20px 0; font-size: 20px;">Hi ${username}，</h2>
              <p style="color: #666; line-height: 1.6; margin: 0 0 20px 0; font-size: 15px;">
                感谢您注册智贸云梯拓客！为了确保账号安全，请点击下方按钮验证您的邮箱地址：
              </p>
              
              <!-- Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="${verificationUrl}" 
                       style="display: inline-block; padding: 14px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: bold; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);">
                      🔓 验证邮箱
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="color: #666; line-height: 1.6; margin: 20px 0 0 0; font-size: 14px;">
                或者复制以下链接到浏览器打开：
              </p>
              <p style="color: #667eea; background-color: #f8f9fa; padding: 12px; border-radius: 4px; word-break: break-all; font-size: 13px; font-family: monospace; margin: 10px 0 0 0;">
                ${verificationUrl}
              </p>
              
              <!-- Info Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0 0 0; background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; border-radius: 4px;">
                <tr>
                  <td>
                    <p style="color: #856404; margin: 0; font-size: 13px; line-height: 1.6;">
                      ⚠️ <strong>重要提示：</strong><br/>
                      • 此验证链接将在 <strong>24 小时</strong>后失效<br/>
                      • 如果您没有注册此账号，请忽略此邮件<br/>
                      • 请勿将此链接分享给他人
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
欢迎注册智贸云梯拓客！

Hi ${username}，

感谢您注册智贸云梯拓客！为了确保账号安全，请点击下方链接验证您的邮箱地址：

${verificationUrl}

⚠️ 重要提示：
• 此验证链接将在 24 小时后失效
• 如果您没有注册此账号，请忽略此邮件
• 请勿将此链接分享给他人

© 2025 智贸云梯拓客 | MediaMingle
如有问题，请联系我们的技术支持
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
    const { email, username, verificationUrl, token } = JSON.parse(event.body);

    if (!email || !verificationUrl || !token) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: '缺少必填参数' })
      };
    }

    const emailTemplate = getEmailTemplate(username || email.split('@')[0], verificationUrl);

    // 方案1：使用 Supabase 内置邮件功能（如果配置了 SMTP）
    // 注意：Supabase 免费版可能没有自定义邮件模板功能
    
    // 方案2：使用第三方邮件服务（Resend, SendGrid 等）
    // 这里提供一个通用的实现框架
    
    const emailServiceType = process.env.EMAIL_SERVICE || 'resend'; // 'resend', 'sendgrid', 'supabase'
    
    if (emailServiceType === 'resend' && process.env.RESEND_API_KEY) {
      // 使用 Resend 发送邮件
      const Resend = require('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      
      const { data, error } = await resend.emails.send({
        from: process.env.EMAIL_FROM || 'noreply@mediamingle.cn',
        to: email,
        subject: emailTemplate.subject,
        html: emailTemplate.html
      });

      if (error) {
        console.error('Resend 发送失败:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ success: false, message: '邮件发送失败' })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: '验证邮件已发送', emailId: data.id })
      };
    } else {
      // 开发模式：只记录到控制台
      console.log('📧 验证邮件（开发模式）:');
      console.log('收件人:', email);
      console.log('验证链接:', verificationUrl);
      console.log('Token:', token);
      
      // 在生产环境中，您应该配置真实的邮件服务
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: '验证邮件已发送（开发模式）',
          debug: {
            verificationUrl: verificationUrl,
            token: token
          }
        })
      };
    }

  } catch (error) {
    console.error('发送邮件错误:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: '邮件发送失败',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      })
    };
  }
};

