/**
 * Email Finder - 创建支付订单 API
 * 路径: /.netlify/functions/email-finder-create-payment
 */

const { createClient } = require('@supabase/supabase-js');

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
    try {
      const { data: userAdminRes, error: adminErr } = await supabase.auth.admin.getUserById(user_id);
      if (adminErr || !userAdminRes || !userAdminRes.user) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            message: '用户不存在或未登录，请重新登录后再试',
            code: 'USER_NOT_FOUND'
          })
        };
      }

      // 确保 user_profiles 存在（防止历史数据缺失导致后续流程报错）
      const { data: profile, error: profileErr } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('id', user_id)
        .single();

      if (profileErr && profileErr.code !== 'PGRST116') {
        // 非 not found 的错误
        console.error('查询 user_profiles 失败:', profileErr);
      }

      if (!profile) {
        const { error: upsertErr } = await supabase
          .from('user_profiles')
          .insert({
            id: user_id,
            email: userAdminRes.user.email || null,
            username: username || userAdminRes.user.email || null
          });
        if (upsertErr) {
          // 不中断主流程，但记录日志
          console.error('创建 user_profiles 失败（忽略继续）:', upsertErr);
        }
      }
    } catch (e) {
      console.error('校验用户失败:', e);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: '用户校验失败', detail: String(e) })
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

    // 2. 生成订单号
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10).toUpperCase();
    const order_id = `EMF${timestamp}${random}`;

    // 3. 生成支付URL和二维码
    // 🔴 这里需要对接您的支付服务商（微信支付/支付宝）
    // 示例：使用二维码生成服务
    const payment_info = {
      order_id,
      amount: plan.price,
      product: plan.plan_name
    };
    
    // 简单的二维码URL（实际需要调用支付接口）
    const payment_url = `wxp://f2f0${order_id}`;
    const qr_code_url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(JSON.stringify(payment_info))}`;

    // 4. 创建支付记录
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30分钟后过期
    
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        user_id,
        username: username || '',
        order_id,
        amount: plan.price,
        plan_type,
        payment_method: 'qr_code',
        payment_status: 'pending',
        qr_code_url,
        payment_url,
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

    console.log('Email Finder支付订单创建成功:', order_id);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        order_id: payment.order_id,
        amount: payment.amount,
        qr_code_url: payment.qr_code_url,
        payment_url: payment.payment_url,
        expires_in: 1800, // 30分钟 = 1800秒
        plan_name: plan.plan_name
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

