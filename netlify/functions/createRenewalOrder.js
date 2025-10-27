/**
 * 创建续费订单 - 生成支付宝支付链接
 * 
 * 功能：
 * 1. 创建续费订单记录
 * 2. 生成支付宝支付链接（使用真实的支付宝SDK）
 * 3. 返回订单ID和支付URL
 */

const AlipaySdk = require('alipay-sdk').default || require('alipay-sdk');
const { createClient } = require('@supabase/supabase-js');

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

// 初始化Supabase客户端
let supabase = null;
try {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                       process.env.SUPABASE_SERVICE_KEY || 
                       process.env.SUPABASE_KEY ||
                       process.env.SUPABASE_ANON_KEY;
  
  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase客户端初始化成功');
  } else {
    console.error('❌ Supabase环境变量未配置');
    console.error(`SUPABASE_URL: ${supabaseUrl ? '已配置' : '未配置'}`);
    console.error(`SUPABASE_KEY: ${supabaseKey ? '已配置' : '未配置'}`);
  }
} catch (error) {
  console.error('❌ 初始化Supabase失败:', error);
}

// 价格配置（与payment.js保持一致）
const PRICES = {
  monthly: { amount: 49.90, duration: '1个月', months: 1 },
  quarterly: { amount: 149.70, duration: '3个月', months: 3 },
  yearly: { amount: 598.80, duration: '1年', months: 12 }
};

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // 处理OPTIONS请求
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // 只允许POST请求
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, message: 'Method Not Allowed' })
    };
  }

  try {
    // 🔒 【真实支付模式】检查必要的环境变量
    if (!supabase) {
      console.error('❌ Supabase未配置，无法创建订单');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          message: '服务器配置错误，请联系管理员',
          error: 'Supabase未配置'
        })
      };
    }

    const requiredEnvVars = ['ALIPAY_APP_ID', 'ALIPAY_PRIVATE_KEY', 'ALIPAY_PUBLIC_KEY'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.error('❌ 缺少支付宝配置:', missingVars);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          message: '支付配置错误，请联系管理员',
          error: '缺少支付宝配置'
        })
      };
    }

    // 初始化支付宝SDK
    const alipaySdk = new AlipaySdk({
      appId: process.env.ALIPAY_APP_ID,
      privateKey: formatKey(process.env.ALIPAY_PRIVATE_KEY, 'private'),
      alipayPublicKey: formatKey(process.env.ALIPAY_PUBLIC_KEY, 'public'),
      gateway: "https://openapi.alipay.com/gateway.do",
      timeout: 30000
    });
    
    // 解析请求体
    const { userId, username, renewalType, amount, duration, productName } = JSON.parse(event.body);

    // 验证必填参数
    if (!userId || !renewalType || !amount) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: '缺少必要参数' 
        })
      };
    }

    // 验证续费类型
    if (!PRICES[renewalType]) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: '无效的续费类型' 
        })
      };
    }

    // 验证金额
    const expectedAmount = PRICES[renewalType].amount;
    if (Math.abs(amount - expectedAmount) > 0.01) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: '金额不匹配' 
        })
      };
    }

    // 生成订单ID（与payment.js格式统一）
    const productIdMap = {
      'monthly': 'gmaps_renewal_monthly',
      'quarterly': 'gmaps_renewal_quarterly',
      'yearly': 'gmaps_renewal_yearly'
    };
    const productId = productIdMap[renewalType] || 'gmaps_renewal_monthly';
    
    const productCodeMap = {
      'gmaps_renewal_monthly': 'grm',
      'gmaps_renewal_quarterly': 'grq',
      'gmaps_renewal_yearly': 'gry'
    };
    const productCode = productCodeMap[productId] || 'grm';
    
    const encodedIdentifier = Buffer.from(username || userId).toString('base64');
    const orderId = `${productCode}-${Date.now()}-${encodedIdentifier}`;

    // 🔒 【真实支付】创建订单记录（使用与payment.js相同的orders表）
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert([
        {
          out_trade_no: orderId,
          product_id: productId,
          customer_email: username || userId,
          status: 'PENDING'
        }
      ])
      .select();

    if (orderError) {
      console.error('创建订单失败:', orderError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: '创建订单失败',
          error: orderError.message 
        })
      };
    }

    // 🔒 【真实支付】使用支付宝扫码支付（与payment.js保持一致）
    const productSubject = productName || `谷歌地图商家爬虫-${PRICES[renewalType]?.duration || ''}续费`;
    
    console.log(`✅ 开始生成支付二维码: 订单ID=${orderId}, 金额=¥${amount.toFixed(2)}, 商品=${productSubject}`);

    // 🔒 【修复】使用 alipay.trade.precreate（扫码支付）生成二维码URL
    // 回调 URL 改为 alipay-notify（它会调用 business-logic.js 处理续费）
    const result = await alipaySdk.exec('alipay.trade.precreate', {
      bizContent: {
        out_trade_no: orderId,
        total_amount: amount.toFixed(2),
        subject: productSubject,
        notify_url: 'https://mediamingle.cn/.netlify/functions/alipay-notify'
      }
    });

    // precreate 返回的是一个短链接，适合生成二维码
    const paymentUrl = result.qrCode;
    
    console.log(`✅ 支付二维码生成成功: ${paymentUrl}`);

    // 返回成功响应
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        orderId: orderId,
        paymentUrl: paymentUrl,
        amount: amount,
        renewalType: renewalType,
        message: '订单创建成功'
      })
    };

  } catch (error) {
    console.error('处理请求失败:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: '服务器错误',
        error: error.message
      })
    };
  }
};

// ✅ 真实支付模式：使用支付宝SDK生成带签名的支付URL
// 不再需要手动构建URL，SDK会自动处理签名

