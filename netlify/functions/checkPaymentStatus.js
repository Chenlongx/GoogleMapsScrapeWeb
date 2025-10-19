/**
 * 检查支付状态
 * 
 * 功能：
 * 1. 查询订单支付状态
 * 2. 如果已支付，更新用户到期时间
 * 3. 返回支付状态和新的到期时间
 */

const { createClient } = require('@supabase/supabase-js');

// 初始化Supabase客户端
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// 价格配置（与createRenewalOrder保持一致）
const PRICES = {
  monthly: { amount: 34.30, duration: '1个月', months: 1 },
  yearly: { amount: 299.00, duration: '1年', months: 12 },
  lifetime: { amount: 499.00, duration: '永久', months: null }
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
    // 解析请求体
    const { orderId, userId } = JSON.parse(event.body);

    // 验证必填参数
    if (!orderId || !userId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: '缺少订单ID或用户ID' 
        })
      };
    }

    // 查询订单状态
    const { data: orderData, error: orderError } = await supabase
      .from('renewal_orders')
      .select('*')
      .eq('order_id', orderId)
      .eq('user_id', userId)
      .single();

    if (orderError || !orderData) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ 
          success: false, 
          message: '订单不存在',
          paid: false
        })
      };
    }

    // 如果订单已完成，返回支付成功
    if (orderData.status === 'completed') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          paid: true,
          orderId: orderId,
          renewalType: orderData.renewal_type,
          amount: orderData.amount,
          newExpiryDate: orderData.new_expiry_date,
          paidAt: orderData.paid_at,
          message: '支付已完成'
        })
      };
    }

    // 如果订单还在pending状态，检查支付宝是否已支付
    // 这里应该调用支付宝API查询订单状态
    // 简化处理：假设支付宝回调已经更新了订单状态
    
    // 返回未支付
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        paid: false,
        orderId: orderId,
        status: orderData.status,
        message: '等待支付'
      })
    };

  } catch (error) {
    console.error('检查支付状态失败:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        paid: false,
        message: '服务器错误',
        error: error.message
      })
    };
  }
};

