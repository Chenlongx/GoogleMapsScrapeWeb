/**
 * Email Finder - 创建支付订单 API
 * 路径: /.netlify/functions/email-finder-create-payment
 * 
 * 🔥 修改：使用支付宝SDK直接生成支付二维码
 */

const AlipaySdk = require('alipay-sdk').default || require('alipay-sdk');
const { createClient } = require('@supabase/supabase-js');
const { resolveSupabaseUser } = require('./utils/resolve-user');

// 格式化密钥的辅助函数
function formatKey(key, type) {
  if (!key || key.includes('\n')) {
    return key;
  }
  console.log(`[Info] Reformatting single-line ${type} key...`);
  const header = type === 'private' ? '-----BEGIN RSA PRIVATE KEY-----' : '-----BEGIN PUBLIC KEY-----';
  const footer = type === 'private' ? '-----END RSA PRIVATE KEY-----' : '-----END PUBLIC KEY-----';
  return key.replace(header, `${header}\n`).replace(footer, `\n${footer}`);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
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
      body: JSON.stringify({ success: false, message: 'Method not allowed' })
    };
  }

  try {
    const { user_id, username, plan_type } = JSON.parse(event.body);

    if (!user_id || !plan_type) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: '缺少必要参数' })
      };
    }

    // 0. 校验 user_id 是否为有效的 Supabase 认证用户（auth.users）
    let resolvedUser;
    try {
      resolvedUser = await resolveSupabaseUser({
        supabase,
        userId: user_id,
        fallbackUsername: username
      });
    } catch (e) {
      console.error('校验用户失败:', e);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: e.code === 'LEGACY_USER_NOT_FOUND'
            ? '找不到对应的账号信息，请重新登录后再试'
            : '用户校验失败',
          code: e.code || 'USER_RESOLVE_FAILED'
        })
      };
    }

    // 1. 获取套餐信息
    const { data: plan, error: planError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('plan_code', plan_type)
      .single();

    if (planError || !plan) {
      console.error('查询套餐失败:', planError);
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: '套餐不存在' })
      };
    }

    // 2. 初始化支付宝SDK
    const alipaySdk = new AlipaySdk({
      appId: process.env.ALIPAY_APP_ID,
      privateKey: formatKey(process.env.ALIPAY_PRIVATE_KEY, 'private'),
      alipayPublicKey: formatKey(process.env.ALIPAY_PUBLIC_KEY, 'public'),
      gateway: "https://openapi.alipay.com/gateway.do",
      timeout: 30000
    });

    // 3. 生成订单号
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10).toUpperCase();
    const order_id = `EMF${timestamp}${random}`;

    // 4. 调用支付宝预下单接口（生成支付二维码）
    console.log('🔄 调用支付宝API生成支付二维码...');
    
    // 动态获取当前域名
    const host = event.headers.host || 'mediamingle.cn';
    const protocol = event.headers['x-forwarded-proto'] || 'https';
    const notifyUrl = `${protocol}://${host}/.netlify/functions/alipay-notify`;
    
    const alipayResult = await alipaySdk.exec('alipay.trade.precreate', {
      bizContent: {
        out_trade_no: order_id,
        total_amount: plan.price.toFixed(2),
        subject: `${plan.plan_name} - Email Finder`,
        notify_url: notifyUrl
      },
    });

    if (!alipayResult || !alipayResult.qrCode) {
      console.error('❌ 支付宝API调用失败:', alipayResult);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          message: '支付宝支付创建失败，请稍后重试'
        })
      };
    }

    console.log('✅ 支付宝支付二维码生成成功');
    
    // 支付宝返回的二维码URL（用户扫码后直接打开支付宝）
    const payment_url = alipayResult.qrCode;

    // 5. 创建支付记录
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30分钟后过期
    
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        user_id: resolvedUser.supabaseUserId,
        username: resolvedUser.username || '',
        order_id,
        amount: plan.price,
        plan_type,
        payment_method: 'alipay',
        payment_status: 'pending',
        qr_code_url: payment_url,  // 支付宝支付URL
        payment_url: payment_url,   // 支付宝支付URL
        expires_at: expiresAt.toISOString()
      })
      .select()
      .single();

    if (paymentError) {
      console.error('创建支付记录失败:', paymentError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          message: '创建支付失败',
          code: paymentError.code,
          detail: paymentError.message
        })
      };
    }

    console.log('✅ Email Finder支付订单创建成功:', order_id);
    console.log('💰 支付金额:', plan.price);
    console.log('📦 套餐类型:', plan.plan_name);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        order_id: payment.order_id,
        amount: payment.amount,
        qr_code_url: payment.qr_code_url,  // 支付宝支付URL
        payment_url: payment.payment_url,   // 支付宝支付URL
        expires_in: 1800, // 30分钟 = 1800秒
        plan_name: plan.plan_name,
        resolved_user_id: resolvedUser.supabaseUserId,
        payment_method: 'alipay'  // 标识为支付宝支付
      })
    };
  } catch (error) {
    console.error('创建支付失败:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: '服务器错误: ' + error.message
      })
    };
  }
};

