/**
 * Email Finder - 手机端确认支付完成 API
 * 路径: /.netlify/functions/email-finder-confirm-payment-mobile
 * 
 * 用途：用户扫码后在手机页面点击"我已完成支付"按钮调用此接口
 * 只需要订单号，不需要用户ID（从订单记录中获取）
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
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
    // 1. 参数验证
    const { order_id } = JSON.parse(event.body);
    
    if (!order_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: '缺少必要参数：order_id'
        })
      };
    }
    
    console.log('📱 手机端确认支付请求:', order_id);
    
    // 2. 查询订单信息
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from('google_plugin_payments')
      .select('*')
      .eq('order_id', order_id)
      .single();
    
    if (paymentError || !payment) {
      console.error('❌ 订单不存在:', order_id, paymentError);
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          success: false,
          message: '订单不存在，请检查订单号是否正确',
          code: 'ORDER_NOT_FOUND'
        })
      };
    }
    
    console.log('✅ 订单查询成功:', {
      order_id: payment.order_id,
      user_id: payment.user_id,
      status: payment.payment_status,
      amount: payment.amount
    });
    
    // 3. 检查订单状态
    if (payment.payment_status === 'completed') {
      console.log('ℹ️ 订单已完成，无需重复确认');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: '该订单已完成支付，账号已升级',
          already_completed: true
        })
      };
    }
    
    if (payment.payment_status === 'confirmed_by_user') {
      console.log('ℹ️ 订单已确认，等待管理员审核');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: '该订单已提交确认，请耐心等待管理员审核',
          already_confirmed: true
        })
      };
    }
    
    // 4. 检查订单是否过期
    if (payment.expires_at && new Date(payment.expires_at) < new Date()) {
      console.log('⏰ 订单已过期');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: '订单已过期，请重新创建订单',
          code: 'ORDER_EXPIRED'
        })
      };
    }
    
    // 5. 更新支付状态为"用户已确认"
    const { error: updateError } = await supabaseAdmin
      .from('google_plugin_payments')
      .update({
        payment_status: 'confirmed_by_user',
        confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('order_id', order_id);
    
    if (updateError) {
      console.error('❌ 更新支付状态失败:', updateError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          message: '更新支付状态失败，请稍后重试',
          code: 'UPDATE_FAILED'
        })
      };
    }
    
    console.log('✅ 支付状态已更新为"confirmed_by_user"');
    
    // 6. 记录确认日志（可选）
    try {
      await supabaseAdmin.from('payment_logs').insert({
        order_id: payment.order_id,
        user_id: payment.user_id,
        action: 'user_confirmed',
        details: {
          source: 'mobile',
          timestamp: new Date().toISOString()
        }
      });
    } catch (logError) {
      console.warn('⚠️ 记录日志失败（不影响主流程）:', logError);
    }
    
    // 7. 返回成功响应
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: '已收到您的支付确认，管理员将在1-5分钟内审核并升级您的账号',
        order_id: payment.order_id,
        amount: payment.amount,
        plan_type: payment.plan_type
      })
    };

  } catch (error) {
    console.error('❌ 处理支付确认失败:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: '服务器错误，请稍后重试',
        error: error.message
      })
    };
  }
};

