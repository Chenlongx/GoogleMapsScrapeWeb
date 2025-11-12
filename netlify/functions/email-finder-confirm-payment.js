/**
 * Email Finder - 手动确认支付完成 API
 * 路径: /.netlify/functions/email-finder-confirm-payment
 * 
 * 用途：用户扫码支付完成后，点击"我已完成支付"按钮调用此接口
 * 管理员在收到款项后，也可以在后台调用此接口标记订单已完成
 */

const { createClient } = require('@supabase/supabase-js');
const { resolveSupabaseUser } = require('./utils/resolve-user');

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
    const { order_id, user_id, confirm_code } = JSON.parse(event.body);

    if (!order_id || !user_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: '缺少必要参数' })
      };
    }

    // 验证用户
    let resolvedUser;
    try {
      resolvedUser = await resolveSupabaseUser({
        supabase,
        userId: user_id
      });
    } catch (e) {
      console.error('解析用户失败:', e);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: '用户校验失败',
          code: e.code || 'USER_RESOLVE_FAILED'
        })
      };
    }

    // 1. 查询支付记录
    const { data: payment, error: paymentError } = await supabase
      .from('google_plugin_payments')
      .select('*')
      .eq('order_id', order_id)
      .eq('user_id', resolvedUser.supabaseUserId)
      .single();

    if (paymentError || !payment) {
      console.error('查询支付记录失败:', paymentError);
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: '订单不存在' })
      };
    }

    // 2. 检查支付是否已完成
    if (payment.payment_status === 'completed') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          already_completed: true,
          message: '此订单已经完成支付'
        })
      };
    }

    // 3. 检查是否过期
    if (new Date() > new Date(payment.expires_at)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: '订单已过期，请重新创建订单'
        })
      };
    }

    // 4. 标记订单为待确认状态
    // 这里可以添加确认码验证逻辑
    // 例如：用户输入支付凭证号、或者管理员输入特殊确认码
    
    await supabase
      .from('google_plugin_payments')
      .update({
        payment_status: 'confirming',  // 待确认状态
        confirm_code: confirm_code || null,
        confirm_time: new Date().toISOString()
      })
      .eq('order_id', order_id)
      .eq('user_id', resolvedUser.supabaseUserId);

    console.log('✅ 订单已标记为待确认:', order_id);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: '支付确认请求已提交，管理员将在1-5分钟内确认您的支付',
        order_id: order_id,
        status: 'confirming',
        note: '请耐心等待，支付确认后将自动升级账号'
      })
    };
  } catch (error) {
    console.error('确认支付失败:', error);
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

