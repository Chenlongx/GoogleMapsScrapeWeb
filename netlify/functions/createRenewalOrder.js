/**
 * 创建续费订单 - 生成支付宝支付链接
 * 
 * 功能：
 * 1. 创建续费订单记录
 * 2. 生成支付宝支付链接
 * 3. 返回订单ID和支付URL
 */

const { createClient } = require('@supabase/supabase-js');

// 初始化Supabase客户端（使用正确的环境变量名）
let supabase = null;
try {
  const supabaseUrl = process.env.SUPABASE_URL;
  // 优先使用 SUPABASE_SERVICE_ROLE_KEY，兼容其他可能的命名
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                       process.env.SUPABASE_SERVICE_KEY || 
                       process.env.SUPABASE_KEY;
  
  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase客户端初始化成功');
  } else {
    console.warn('⚠️ Supabase环境变量未配置，将使用模拟模式');
    console.warn(`SUPABASE_URL: ${supabaseUrl ? '已配置' : '未配置'}`);
    console.warn(`SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '已配置' : '未配置'}`);
  }
} catch (error) {
  console.error('❌ 初始化Supabase失败:', error);
}

// 价格配置（与payment.js保持一致）
const PRICES = {
  monthly: { amount: 29.90, duration: '1个月', months: 1 },
  quarterly: { amount: 89.70, duration: '3个月', months: 3 },
  yearly: { amount: 358.80, duration: '1年', months: 12 }
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
    // 🔧 如果Supabase未配置，返回模拟数据（用于测试）
    if (!supabase) {
      console.log('⚠️ 使用模拟模式生成订单');
      
      const body = JSON.parse(event.body || '{}');
      const orderId = `MOCK_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 生成模拟支付URL（用于测试）
      const mockPaymentUrl = `https://qr.alipay.com/bax${orderId}`;
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: '订单创建成功（测试模式）',
          orderId: orderId,
          paymentUrl: mockPaymentUrl,
          mode: 'mock',
          note: '这是测试模式，请配置Supabase环境变量以使用真实订单系统'
        })
      };
    }
    
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

    // 生成订单ID
    const orderId = `RNW-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 创建订单记录
    const { data: orderData, error: orderError } = await supabase
      .from('renewal_orders')
      .insert([
        {
          order_id: orderId,
          user_id: userId,
          username: username || '未知用户',
          renewal_type: renewalType,
          amount: amount,
          duration: duration,
          product_name: productName || '谷歌地图商家爬虫',
          status: 'pending',
          created_at: new Date().toISOString()
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

    // 生成支付宝支付链接
    // 注意：这里使用简化的URL scheme，实际生产环境需要使用支付宝SDK
    const paymentUrl = generateAlipayUrl(orderId, amount, productName || '谷歌地图商家爬虫');

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

/**
 * 生成支付宝支付URL
 * 
 * @param {string} orderId - 订单ID
 * @param {number} amount - 金额
 * @param {string} subject - 商品名称
 * @returns {string} 支付URL
 */
function generateAlipayUrl(orderId, amount, subject) {
  // 简化版：使用支付宝手机网站支付（alipays://）
  // 实际生产环境应该使用支付宝SDK生成标准的支付链接
  
  const params = {
    out_trade_no: orderId,
    total_amount: amount.toFixed(2),
    subject: subject,
    // 回调URL（支付成功后的通知地址）
    notify_url: `https://mediamingle.cn/.netlify/functions/alipayCallback`,
    // 支付完成后的跳转地址
    return_url: `https://mediamingle.cn/payment-success.html?orderId=${orderId}`
  };

  // 注意：这是简化版URL，实际应使用支付宝SDK正确签名
  // 生产环境需要配置：app_id, private_key, alipay_public_key等
  const queryString = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');

  // 返回支付宝支付链接（这里使用网页版支付链接）
  // 实际生产中应该返回正确的支付宝SDK生成的URL
  return `https://openapi.alipay.com/gateway.do?${queryString}&method=alipay.trade.wap.pay`;
}

