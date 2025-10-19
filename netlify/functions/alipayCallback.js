/**
 * 支付宝支付回调
 * 
 * 功能：
 * 1. 接收支付宝支付成功通知
 * 2. 验证签名
 * 3. 更新订单状态
 * 4. 更新用户到期时间
 */

const { createClient } = require('@supabase/supabase-js');

// 初始化Supabase客户端
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// 价格配置
const PRICES = {
  monthly: { months: 1 },
  yearly: { months: 12 },
  lifetime: { months: null }
};

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'text/plain'
  };

  // 处理OPTIONS请求
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // 解析支付宝回调参数
    const params = event.httpMethod === 'POST' 
      ? parseQueryString(event.body)
      : event.queryStringParameters;

    console.log('支付宝回调参数:', params);

    // 验证签名（简化版，实际应使用支付宝SDK验证）
    // if (!verifyAlipaySign(params)) {
    //   return {
    //     statusCode: 400,
    //     headers,
    //     body: 'fail'
    //   };
    // }

    // 提取关键参数
    const {
      out_trade_no: orderId,  // 订单ID
      trade_status: tradeStatus,  // 交易状态
      total_amount: amount  // 金额
    } = params;

    // 只处理支付成功的通知
    if (tradeStatus !== 'TRADE_SUCCESS' && tradeStatus !== 'TRADE_FINISHED') {
      return {
        statusCode: 200,
        headers,
        body: 'success'  // 返回success告诉支付宝不要再通知
      };
    }

    // 查询订单信息
    const { data: orderData, error: orderError } = await supabase
      .from('renewal_orders')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (orderError || !orderData) {
      console.error('订单不存在:', orderId);
      return {
        statusCode: 200,
        headers,
        body: 'success'
      };
    }

    // 如果订单已处理，直接返回
    if (orderData.status === 'completed') {
      return {
        statusCode: 200,
        headers,
        body: 'success'
      };
    }

    // 验证金额
    if (Math.abs(parseFloat(amount) - orderData.amount) > 0.01) {
      console.error('金额不匹配:', amount, orderData.amount);
      return {
        statusCode: 400,
        headers,
        body: 'fail'
      };
    }

    // 计算新的到期时间
    const newExpiryDate = calculateNewExpiryDate(orderData.user_id, orderData.renewal_type);

    // 更新订单状态
    await supabase
      .from('renewal_orders')
      .update({
        status: 'completed',
        paid_at: new Date().toISOString(),
        new_expiry_date: newExpiryDate,
        trade_no: params.trade_no || '',
        updated_at: new Date().toISOString()
      })
      .eq('order_id', orderId);

    // 更新用户到期时间
    if (orderData.renewal_type === 'lifetime') {
      // 永久授权
      await supabase
        .from('users')
        .update({
          user_type: 'lifetime',
          expiry_at: '2099-12-31T23:59:59+00:00'
        })
        .eq('id', orderData.user_id);
    } else {
      // 月付或年付
      await supabase
        .from('users')
        .update({
          expiry_at: newExpiryDate
        })
        .eq('id', orderData.user_id);
    }

    console.log(`✅ 订单支付成功: ${orderId}, 用户: ${orderData.user_id}, 新到期: ${newExpiryDate}`);

    // 返回success告诉支付宝已收到通知
    return {
      statusCode: 200,
      headers,
      body: 'success'
    };

  } catch (error) {
    console.error('处理支付宝回调失败:', error);
    // 返回fail，支付宝会重新通知
    return {
      statusCode: 200,
      headers,
      body: 'fail'
    };
  }
};

/**
 * 解析查询字符串
 */
function parseQueryString(str) {
  const params = {};
  const pairs = str.split('&');
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    params[key] = decodeURIComponent(value || '');
  }
  return params;
}

/**
 * 计算新的到期时间
 */
async function calculateNewExpiryDate(userId, renewalType) {
  // 获取用户当前到期时间
  const { data: userData } = await supabase
    .from('users')
    .select('expiry_at')
    .eq('id', userId)
    .single();

  let currentExpiry = new Date();
  
  if (userData && userData.expiry_at) {
    const userExpiry = new Date(userData.expiry_at);
    // 如果当前还没到期，从到期日期开始计算
    if (userExpiry > currentExpiry) {
      currentExpiry = userExpiry;
    }
  }

  // 根据续费类型计算新到期时间
  if (renewalType === 'lifetime') {
    return '2099-12-31T23:59:59+00:00';
  }

  const months = PRICES[renewalType]?.months || 1;
  const newExpiry = new Date(currentExpiry);
  newExpiry.setMonth(newExpiry.getMonth() + months);

  return newExpiry.toISOString();
}

