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
  // 检查是否配置了支付宝参数
  const alipayAppId = process.env.ALIPAY_APP_ID;
  
  // 如果没有配置支付宝，返回模拟支付URL（供测试）
  if (!alipayAppId) {
    console.warn('⚠️ 未配置支付宝参数，返回测试URL');
    // 返回一个可以正常显示二维码但不能真实支付的URL
    // 使用订单ID作为唯一标识
    return `https://mediamingle.cn/test-payment?orderId=${orderId}&amount=${amount}&subject=${encodeURIComponent(subject)}`;
  }
  
  // 真实支付宝支付参数
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
  
  const params = {
    // ========== 必需参数 ==========
    app_id: alipayAppId,                              // 支付宝分配的AppID
    method: 'alipay.trade.wap.pay',                   // 接口名称
    format: 'JSON',                                    // 仅支持JSON
    charset: 'utf-8',                                  // 编码格式
    sign_type: 'RSA2',                                 // 签名类型
    timestamp: new Date().toLocaleString('zh-CN', { 
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).replace(/\//g, '-').replace(/,/g, ''),          // 格式：yyyy-MM-dd HH:mm:ss
    version: '1.0',                                    // 接口版本
    
    // ========== 业务参数 ==========
    biz_content: JSON.stringify({
      out_trade_no: orderId,                          // 商户订单号
      total_amount: amount.toFixed(2),                // 订单金额
      subject: subject,                               // 订单标题
      product_code: 'QUICK_WAP_PAY',                  // 产品码（手机网站支付）
      quit_url: 'https://mediamingle.cn/pricing.html' // 用户付款中途退出返回的地址
    }),
    
    // ========== 可选参数 ==========
    notify_url: `https://mediamingle.cn/.netlify/functions/alipayCallback`,  // 异步通知地址
    return_url: `https://mediamingle.cn/payment-success.html?orderId=${orderId}` // 同步跳转地址
  };

  // 注意：实际生产环境需要对参数进行RSA2签名
  // 这里暂时返回未签名的URL（仅用于测试二维码显示）
  // 真实环境必须使用支付宝SDK进行签名
  
  const queryString = Object.entries(params)
    .filter(([key, value]) => value) // 过滤空值
    .sort(([a], [b]) => a.localeCompare(b)) // 按键名排序
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');

  // 返回支付宝网关地址
  // 注意：缺少sign参数，真实支付会失败，但可以生成二维码
  return `https://openapi.alipay.com/gateway.do?${queryString}`;
}

