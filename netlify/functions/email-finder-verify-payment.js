/**
 * Email Finder - 验证支付状态并升级账号 API
 * 路径: /.netlify/functions/email-finder-verify-payment
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
    const { order_id, user_id } = JSON.parse(event.body);

    if (!order_id || !user_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: '缺少必要参数' })
      };
    }

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
          message: e.code === 'LEGACY_USER_NOT_FOUND'
            ? '未找到该账号的支付记录，请重新登录后再试'
            : '用户校验失败',
          code: e.code || 'USER_RESOLVE_FAILED'
        })
      };
    }

    // 1. 查询支付记录
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
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
          payment_status: 'completed',
          message: '支付已完成'
        })
      };
    }

    // 3. 检查是否过期
    if (new Date() > new Date(payment.expires_at)) {
      await supabase
        .from('payments')
        .update({ payment_status: 'expired' })
        .eq('order_id', order_id)
        .eq('user_id', resolvedUser.supabaseUserId);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          payment_status: 'expired',
          message: '支付已过期'
        })
      };
    }

    // 4. 🔴 这里需要调用支付服务商API检查真实支付状态
    // 示例：检查微信支付或支付宝的支付状态
    // const actualStatus = await checkPaymentWithProvider(order_id);
    
    // 🔴 临时：自动通过验证（测试用）
    // 生产环境需要删除下面这行，改用真实的支付验证
    const paymentCompleted = true; // 模拟支付成功
    
    if (paymentCompleted) {
      // 4.1 升级前兜底：确保 user_profiles 存在（避免历史数据缺失）
      const { data: existingProfile, error: profileErr } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('id', user_id)
        .single();
      if (profileErr && profileErr.code !== 'PGRST116') {
        console.error('查询 user_profiles 失败（忽略继续）:', profileErr);
      }
      if (!existingProfile) {
        const { error: createProfileErr } = await supabase
          .from('user_profiles')
          .insert({ id: user_id, username: payment.username || null })
          .select('id')
          .single();
        if (createProfileErr) {
          console.error('创建 user_profiles 失败（忽略继续）:', createProfileErr);
        }
      }

      // 5. 获取套餐信息
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

      // 6. 计算到期日期
      const expiry_date = new Date();
      expiry_date.setDate(expiry_date.getDate() + plan.duration_days);
      const expiryDateStr = expiry_date.toISOString().split('T')[0];

      // 7. 更新支付状态
      await supabase
        .from('payments')
        .update({
          payment_status: 'completed',
          verified_time: new Date().toISOString()
        })
        .eq('order_id', order_id)
        .eq('user_id', resolvedUser.supabaseUserId);

      // 8. 升级账号
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
        .eq('id', resolvedUser.supabaseUserId);

      if (upgradeError) {
        console.error('升级账号失败:', upgradeError);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ success: false, message: '升级账号失败' })
        };
      }

      // 9. 记录升级历史
      await supabase
        .from('account_upgrades')
        .insert({
          user_id: resolvedUser.supabaseUserId,
          username: payment.username,
          from_account_type: 'trial',
          to_account_type: 'premium',
          payment_id: payment.id,
          expiry_date: expiryDateStr
        });

      console.log('Email Finder账号升级成功:', user_id);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          payment_status: 'completed',
          account_upgraded: true,
          new_account_type: 'premium',
          expiry_date: expiryDateStr,
          message: '🎉 支付成功！您的账号已升级为正式账号',
          resolved_user_id: resolvedUser.supabaseUserId
        })
      };
    } else {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          payment_status: 'pending',
          message: '支付未完成，请完成支付'
        })
      };
    }
  } catch (error) {
    console.error('验证支付失败:', error);
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

