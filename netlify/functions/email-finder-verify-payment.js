/**
 * Email Finder - 验证支付状态并升级账号 API
 * 路径: /.netlify/functions/email-finder-verify-payment
 * 
 * 🔥 功能：主动调用支付宝API查询支付状态，支付成功后自动升级账号
 * 🔥 修复：直接从 user_profiles 表查询用户，不再依赖 auth.users
 */

const AlipaySdk = require('alipay-sdk').default || require('alipay-sdk');
const { createClient } = require('@supabase/supabase-js');

// 格式化密钥的辅助函数
function formatKey(key, type) {
  if (!key || key.includes('\n')) {
    return key;
  }
  const header = type === 'private' ? '-----BEGIN RSA PRIVATE KEY-----' : '-----BEGIN PUBLIC KEY-----';
  const footer = type === 'private' ? '-----END RSA PRIVATE KEY-----' : '-----END PUBLIC KEY-----';
  return key.replace(header, `${header}\n`).replace(footer, `\n${footer}`);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 直接从 user_profiles 表查询用户
const resolveUserProfile = async ({ supabase, userId }) => {
  if (!userId) {
    const error = new Error('缺少 userId');
    error.code = 'USER_ID_MISSING';
    throw error;
  }

  // 直接从 user_profiles 表查询用户
  const { data: userProfile, error: profileError } = await supabase
    .from('user_profiles')
    .select('id, email, username')
    .eq('id', userId)
    .single();

  if (profileError || !userProfile) {
    const error = new Error('找不到对应的用户信息');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  const email = userProfile.email;
  const username = userProfile.username || (email ? email.split('@')[0] : '');

  return {
    supabaseUserId: userProfile.id,
    email,
    username,
    legacyUser: null,
    migrated: false
  };
};

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
      resolvedUser = await resolveUserProfile({
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
          message: e.code === 'USER_NOT_FOUND'
            ? '未找到该账号的支付记录，请重新登录后再试'
            : '用户校验失败',
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
          payment_status: 'completed',
          message: '支付已完成'
        })
      };
    }

    // 3. 检查是否过期
    if (new Date() > new Date(payment.expires_at)) {
      await supabase
        .from('google_plugin_payments')
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

    // 4. 如果订单状态是 pending，主动调用支付宝API查询支付状态
    let paymentCompleted = false;
    
    if (payment.payment_status === 'pending') {
      console.log('🔍 订单状态为 pending，主动查询支付宝支付状态...');
      
      try {
        // 初始化支付宝SDK
        const alipaySdk = new AlipaySdk({
          appId: process.env.ALIPAY_APP_ID,
          privateKey: formatKey(process.env.ALIPAY_PRIVATE_KEY, 'private'),
          alipayPublicKey: formatKey(process.env.ALIPAY_PUBLIC_KEY, 'public'),
          gateway: "https://openapi.alipay.com/gateway.do",
          timeout: 30000
        });
        
        // 调用支付宝查询接口
        const alipayResult = await alipaySdk.exec('alipay.trade.query', {
          bizContent: {
            out_trade_no: order_id  // 使用我们的订单号查询
          }
        });
        
        console.log('📱 支付宝查询结果:', alipayResult);
        
        // 检查支付宝返回的交易状态
        if (alipayResult.tradeStatus === 'TRADE_SUCCESS' || alipayResult.tradeStatus === 'TRADE_FINISHED') {
          console.log('✅ 支付宝确认支付成功！');
          paymentCompleted = true;
          
          // 更新数据库中的支付状态
          await supabase
            .from('google_plugin_payments')
            .update({
              payment_status: 'completed',
              transaction_id: alipayResult.tradeNo,  // 支付宝交易号
              verified_time: new Date().toISOString()
            })
            .eq('order_id', order_id);
            
        } else {
          console.log('⏳ 支付宝订单状态:', alipayResult.tradeStatus);
        }
        
      } catch (error) {
        console.error('❌ 查询支付宝失败:', error);
        // 查询失败不影响流程，继续检查数据库状态
      }
    } else if (payment.payment_status === 'completed') {
      // 如果数据库中已经是 completed 状态
      paymentCompleted = true;
    }
    
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
        .select('duration_days, search_limit, plan_name')
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
      
      console.log('📦 套餐信息:', {
        plan_type: payment.plan_type,
        duration_days: plan.duration_days,
        plan_name: plan.plan_name
      });

      // 6. 计算订阅时间（根据套餐类型）
      const now = new Date();
      const subscriptionStart = now.toISOString();
      
      // 计算到期时间
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + plan.duration_days);
      const subscriptionEnd = expiryDate.toISOString();
      const expiryDateStr = expiryDate.toISOString().split('T')[0];
      
      console.log('📅 订阅时间:', {
        start: subscriptionStart,
        end: subscriptionEnd,
        duration_days: plan.duration_days
      });

      // 7. 如果支付状态还不是 completed，更新为 completed
      if (payment.payment_status !== 'completed') {
        await supabase
          .from('google_plugin_payments')
          .update({
            payment_status: 'completed',
            verified_time: new Date().toISOString()
          })
          .eq('order_id', order_id)
          .eq('user_id', resolvedUser.supabaseUserId);
      }

      // 8. 升级账号（设置账号类型、到期时间、搜索次数）
      // 🔥 正式会员设置为无限搜索（searches_left = -1）
      const { error: upgradeError } = await supabase
        .from('user_profiles')
        .update({
          account_type: 'premium',  // 🔥 统一设置为 premium（正式会员）
          plan_type: payment.plan_type,  // 🔥 具体套餐类型（premium_monthly/quarterly/yearly）
          daily_search_limit: plan.search_limit,
          searches_left: -1,  // 🔥 -1 表示无限次搜索
          payment_status: 'paid',
          payment_amount: payment.amount,
          payment_date: now.toISOString(),  // 🔥 使用支付时间
          expiry_date: expiryDateStr,
          subscription_start: subscriptionStart,
          subscription_end: subscriptionEnd,
          updated_at: now.toISOString()
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
          old_account_type: 'trial',
          new_account_type: payment.plan_type,  // 使用具体的套餐类型
          from_account_type: 'trial',
          to_account_type: payment.plan_type,
          payment_id: payment.id,
          upgraded_by: 'alipay_auto',  // 标识为支付宝自动升级
          upgraded_at: new Date().toISOString(),
          expiry_date: expiryDateStr
        });

      console.log('✅ Email Finder账号升级成功！', {
        user_id: resolvedUser.supabaseUserId,
        account_type: 'premium',
        plan_type: payment.plan_type,
        subscription_end: subscriptionEnd
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          payment_status: 'completed',
          account_upgraded: true,
          account_type: 'premium',  // 🔥 账号类型：premium（正式会员）
          plan_type: payment.plan_type,  // 🔥 具体套餐：premium_monthly/quarterly/yearly
          plan_name: plan.plan_name,  // 🔥 套餐名称
          daily_search_limit: plan.search_limit,  // 🔥 每日搜索限制
          searches_left: -1,  // 🔥 剩余搜索次数：-1表示无限
          payment_date: now.toISOString(),  // 🔥 付款时间
          expiry_date: expiryDateStr,  // 🔥 到期时间（YYYY-MM-DD）
          subscription_start: subscriptionStart,  // 🔥 订阅开始时间
          subscription_end: subscriptionEnd,  // 🔥 订阅结束时间
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

