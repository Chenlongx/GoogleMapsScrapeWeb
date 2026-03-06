/**
 * 检查支付状态
 * 
 * 功能：
 * 1. 查询订单支付状态
 * 2. 主动调用支付宝API查询订单状态
 * 3. 如果已支付，更新用户到期时间
 * 4. 返回支付状态和新的到期时间
 */

const AlipaySdk = require('alipay-sdk').default || require('alipay-sdk');
const { createClient } = require('@supabase/supabase-js');
const { processBusinessLogic } = require('./business-logic.js');
const { getQueryConfigValidation, isWeChatOrderId, queryOrderByOutTradeNo } = require('./utils/wechat-pay.js');

// 格式化密钥的辅助函数
function formatKey(key, type) {
    if (!key || key.includes('\n')) {
        return key;
    }
    const header = type === 'private' ? '-----BEGIN RSA PRIVATE KEY-----' : '-----BEGIN PUBLIC KEY-----';
    const footer = type === 'private' ? '-----END RSA PRIVATE KEY-----' : '-----END PUBLIC KEY-----';
    return key.replace(header, `${header}\n`).replace(footer, `\n${footer}`);
}

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
  }
} catch (error) {
  console.error('❌ 初始化Supabase失败:', error);
}

// 价格配置（与createRenewalOrder保持一致）
const PRICES = {
  monthly: { amount: 49.90, duration: '1个月', months: 1 },
  quarterly: { amount: 149.70, duration: '3个月', months: 3 },
  yearly: { amount: 598.80, duration: '1年', months: 12 }
};

function getRenewalTypeByProductId(productId) {
  if (String(productId || '').includes('quarterly')) return 'quarterly';
  if (String(productId || '').includes('yearly')) return 'yearly';
  return 'monthly';
}

function getRenewalLabel(productId) {
  const renewalType = getRenewalTypeByProductId(productId);
  if (renewalType === 'quarterly') return '季付';
  if (renewalType === 'yearly') return '年付';
  return '月付';
}

function isCompletedStatus(status) {
  return ['COMPLETED', 'SUCCESS', 'completed', 'success'].includes(status);
}

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
      console.log('⚠️ 使用模拟模式检查支付状态');
      
      const body = JSON.parse(event.body || '{}');
      const { orderId } = body;
      
      // 模拟订单状态（pending）
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          status: 'pending',
          message: '支付状态查询中（测试模式）',
          mode: 'mock',
          note: '这是测试模式，请配置Supabase环境变量以使用真实订单系统'
        })
      };
    }
    
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

    // 🔒 【修复】查询订单状态（使用正确的表和字段）
    console.log(`🔍 查询订单状态: orderId=${orderId}, userId=${userId}`);
    
    const { data: orderData, error: orderError } = await supabase
      .from('orders')  // ✅ 使用 orders 表（与 createRenewalOrder.js 统一）
      .select('*')
      .eq('out_trade_no', orderId)  // ✅ 使用 out_trade_no 字段
      .single();

    if (orderError || !orderData) {
      console.log(`⚠️ 订单不存在: ${orderError?.message || '未找到'}`);
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

    console.log(`✅ 找到订单: status=${orderData.status}, product_id=${orderData.product_id}`);

    // 🔒 【修复】检查订单是否已完成（状态可能是 COMPLETED 或 SUCCESS）
    if (isCompletedStatus(orderData.status)) {
      const renewalType = getRenewalTypeByProductId(orderData.product_id);

      // 查询用户的新到期时间
      const { data: userData, error: userError } = await supabase
        .from('user_accounts')
        .select('expiry_at')
        .eq('account', orderData.customer_email)
        .single();
      
      const newExpiryDate = userData?.expiry_at || null;
      
      console.log(`✅ 支付已完成: renewalType=${renewalType}, newExpiry=${newExpiryDate}`);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          paid: true,
          orderId: orderId,
          renewalType: renewalType,
          amount: PRICES[renewalType]?.amount || 0,
          newExpiryDate: newExpiryDate,
          message: '支付已完成'
        })
      };
    }

    let currentStatus = orderData.status;

    // 🔒 【关键修复】如果订单还在 PENDING 状态，主动查询支付网关状态
    if (orderData.status === 'PENDING' || orderData.status === 'pending') {
      const renewalLabel = getRenewalLabel(orderData.product_id);
      const renewalType = getRenewalTypeByProductId(orderData.product_id);

      if (isWeChatOrderId(orderId)) {
        console.log(`🔍 订单状态为 PENDING，主动查询微信 Native 订单状态...`);

        try {
          const { missing } = getQueryConfigValidation();
          if (missing.length > 0) {
            console.warn(`⚠️ 微信支付配置缺失，跳过主动查单: ${missing.join(', ')}`);
          } else {
            const queryResult = await queryOrderByOutTradeNo(orderId);
            console.log(`📊 微信订单查询结果:`, JSON.stringify(queryResult, null, 2));

            const tradeState = queryResult.trade_state;
            if (tradeState === 'SUCCESS') {
              console.log(`✅ 微信支付确认订单已支付，开始更新订单状态...`);

              await supabase
                .from('orders')
                .update({ status: 'COMPLETED' })
                .eq('out_trade_no', orderId);

              const mockParams = new URLSearchParams();
              mockParams.append('out_trade_no', orderId);
              mockParams.append('trade_status', 'TRADE_SUCCESS');
              mockParams.append('total_amount', ((queryResult.amount?.total || 0) / 100).toFixed(2));
              mockParams.append('trade_no', queryResult.transaction_id || '');
              mockParams.append('product_id', orderData.product_id);
              mockParams.append('subject', `Google Maps Scraper - 续费 - ${renewalLabel}`);

              console.log(`🔧 开始调用 business-logic.js 处理微信续费...`);
              await processBusinessLogic(mockParams);
              console.log(`✅ 微信续费业务处理完成`);

              const { data: userData } = await supabase
                .from('user_accounts')
                .select('expiry_at')
                .eq('account', orderData.customer_email)
                .single();

              return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                  success: true,
                  paid: true,
                  orderId: orderId,
                  renewalType: renewalType,
                  amount: PRICES[renewalType]?.amount || 0,
                  newExpiryDate: userData?.expiry_at || null,
                  message: '支付已完成'
                })
              };
            }

            if (['CLOSED', 'REVOKED', 'PAYERROR'].includes(tradeState)) {
              await supabase
                .from('orders')
                .update({ status: tradeState })
                .eq('out_trade_no', orderId);
              currentStatus = tradeState;
            }

            console.log(`⏳ 微信订单状态: ${tradeState}，等待支付...`);
          }
        } catch (wechatError) {
          console.error(`⚠️ 查询微信订单失败: ${wechatError.message}`);
        }
      } else {
        console.log(`🔍 订单状态为 PENDING，主动查询支付宝订单状态...`);

        try {
          const alipaySdk = new AlipaySdk({
            appId: process.env.ALIPAY_APP_ID,
            privateKey: formatKey(process.env.ALIPAY_PRIVATE_KEY, 'private'),
            alipayPublicKey: formatKey(process.env.ALIPAY_PUBLIC_KEY, 'public'),
            gateway: "https://openapi.alipay.com/gateway.do",
            timeout: 30000
          });

          const queryResult = await alipaySdk.exec('alipay.trade.query', {
            bizContent: {
              out_trade_no: orderId
            }
          });

          console.log(`📊 支付宝订单查询结果:`, JSON.stringify(queryResult, null, 2));

          const tradeStatus = queryResult.tradeStatus;

          if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
            console.log(`✅ 支付宝确认订单已支付，开始更新订单状态...`);

            await supabase
              .from('orders')
              .update({ status: 'COMPLETED' })
              .eq('out_trade_no', orderId);

            const mockParams = new URLSearchParams();
            mockParams.append('out_trade_no', orderId);
            mockParams.append('trade_status', 'TRADE_SUCCESS');
            mockParams.append('total_amount', queryResult.totalAmount || '0');
            mockParams.append('trade_no', queryResult.tradeNo || '');
            mockParams.append('product_id', orderData.product_id);
            mockParams.append('subject', `Google Maps Scraper - 续费 - ${renewalLabel}`);

            console.log(`🔧 开始调用 business-logic.js 处理续费...`);
            console.log(`📦 传入参数: product_id=${orderData.product_id}, out_trade_no=${orderId}`);
            await processBusinessLogic(mockParams);
            console.log(`✅ business-logic.js 处理完成`);

            const { data: userData } = await supabase
              .from('user_accounts')
              .select('expiry_at')
              .eq('account', orderData.customer_email)
              .single();

            const newExpiryDate = userData?.expiry_at || null;

            console.log(`✅ 续费成功！renewalType=${renewalType}, newExpiry=${newExpiryDate}`);

            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({
                success: true,
                paid: true,
                orderId: orderId,
                renewalType: renewalType,
                amount: PRICES[renewalType]?.amount || 0,
                newExpiryDate: newExpiryDate,
                message: '支付已完成'
              })
            };
          }

          console.log(`⏳ 支付宝订单状态: ${tradeStatus}，等待支付...`);
        } catch (alipayError) {
          console.error(`⚠️ 查询支付宝订单失败: ${alipayError.message}`);
        }
      }
    }
    
    // 返回未支付
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        paid: false,
        orderId: orderId,
        status: currentStatus,
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

