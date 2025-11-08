/**
 * Email Finder - 管理员批准支付 API
 * 路径: /.netlify/functions/email-finder-admin-approve-payment
 * 
 * 用途：管理员在收到款项后，调用此接口批准订单并升级用户账号
 * 
 * 安全措施：
 * 1. 需要管理员密钥验证
 * 2. 记录操作日志
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 管理员密钥（应该存储在环境变量中）
const ADMIN_SECRET = process.env.EMAIL_FINDER_ADMIN_SECRET || 'change-this-in-production';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
    const { order_id, admin_secret, transaction_id, notes } = JSON.parse(event.body);

    // 1. 验证管理员权限
    if (admin_secret !== ADMIN_SECRET) {
      console.warn('⚠️ 管理员验证失败');
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          message: '管理员验证失败'
        })
      };
    }

    if (!order_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: '缺少订单号' })
      };
    }

    // 2. 查询支付记录
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('order_id', order_id)
      .single();

    if (paymentError || !payment) {
      console.error('查询支付记录失败:', paymentError);
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ success: false, message: '订单不存在' })
      };
    }

    // 3. 检查支付是否已完成
    if (payment.payment_status === 'completed') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          already_completed: true,
          message: '此订单已经完成'
        })
      };
    }

    // 4. 获取套餐信息
    const { data: plan, error: planError } = await supabase
      .from('subscription_plans')
      .select('duration_days, search_limit')
      .eq('plan_code', payment.plan_type)
      .single();

    if (planError) {
      console.error('查询套餐失败:', planError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, message: '查询套餐失败' })
      };
    }

    // 5. 计算到期日期
    const expiry_date = new Date();
    expiry_date.setDate(expiry_date.getDate() + plan.duration_days);
    const expiryDateStr = expiry_date.toISOString().split('T')[0];

    // 6. 更新支付状态
    await supabase
      .from('payments')
      .update({
        payment_status: 'completed',
        verified_time: new Date().toISOString(),
        transaction_id: transaction_id || null,
        notes: notes || '管理员手动批准'
      })
      .eq('order_id', order_id);

    console.log('✅ 订单状态已更新为 completed:', order_id);

    // 7. 升级账号
    const { error: upgradeError } = await supabase
      .from('user_profiles')
      .update({
        account_type: 'premium',
        daily_search_limit: plan.search_limit,
        payment_status: 'paid',
        payment_amount: payment.amount,
        payment_date: new Date().toISOString(),
        expiry_date: expiryDateStr
      })
      .eq('id', payment.user_id);

    if (upgradeError) {
      console.error('升级账号失败:', upgradeError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, message: '升级账号失败' })
      };
    }

    console.log('✅ 账号已升级:', payment.user_id);

    // 8. 记录升级历史
    await supabase
      .from('account_upgrades')
      .insert({
        user_id: payment.user_id,
        username: payment.username,
        from_account_type: 'trial',
        to_account_type: 'premium',
        payment_id: payment.id,
        expiry_date: expiryDateStr,
        notes: '管理员手动批准'
      });

    console.log('✅ 管理员批准支付成功:', order_id);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: '支付已批准，账号已升级',
        order_id: order_id,
        user_id: payment.user_id,
        username: payment.username,
        expiry_date: expiryDateStr,
        new_account_type: 'premium'
      })
    };
  } catch (error) {
    console.error('批准支付失败:', error);
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

