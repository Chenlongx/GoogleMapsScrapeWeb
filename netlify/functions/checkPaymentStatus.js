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
    if (orderData.status === 'COMPLETED' || orderData.status === 'SUCCESS') {
      // 从 product_id 提取续费类型
      let renewalType = 'monthly';
      if (orderData.product_id.includes('quarterly')) renewalType = 'quarterly';
      else if (orderData.product_id.includes('yearly')) renewalType = 'yearly';
      
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

    // 🔒 【关键修复】如果订单还在 PENDING 状态，主动查询支付宝订单状态
    if (orderData.status === 'PENDING') {
      console.log(`🔍 订单状态为 PENDING，主动查询支付宝订单状态...`);
      
      try {
        // 初始化支付宝SDK
        const alipaySdk = new AlipaySdk({
          appId: process.env.ALIPAY_APP_ID,
          privateKey: formatKey(process.env.ALIPAY_PRIVATE_KEY, 'private'),
          alipayPublicKey: formatKey(process.env.ALIPAY_PUBLIC_KEY, 'public'),
          gateway: "https://openapi.alipay.com/gateway.do",
          timeout: 30000
        });
        
        // 调用支付宝订单查询接口
        const queryResult = await alipaySdk.exec('alipay.trade.query', {
          bizContent: {
            out_trade_no: orderId
          }
        });
        
        console.log(`📊 支付宝订单查询结果:`, JSON.stringify(queryResult, null, 2));
        
        // 检查支付状态
        const tradeStatus = queryResult.tradeStatus;
        
        if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
          console.log(`✅ 支付宝确认订单已支付，开始更新订单状态...`);
          
          // 更新订单状态为 COMPLETED
          await supabase
            .from('orders')
            .update({ status: 'COMPLETED' })
            .eq('out_trade_no', orderId);
          
          console.log(`✅ 订单状态已更新为 COMPLETED`);
          
          // 🔒 【关键修复】调用 business-logic.js 处理续费逻辑
          // 构建模拟的支付宝回调参数（必须包含 subject 和 product_id）
          const mockParams = new URLSearchParams();
          mockParams.append('out_trade_no', orderId);
          mockParams.append('trade_status', 'TRADE_SUCCESS');
          mockParams.append('total_amount', queryResult.totalAmount || '0');
          mockParams.append('trade_no', queryResult.tradeNo || '');
          // ✅ 关键：添加 product_id，让 business-logic.js 能正确判断续费时长
          mockParams.append('product_id', orderData.product_id);
          // ✅ 关键：添加 subject，作为备用判断方式
          mockParams.append('subject', `Google Maps Scraper - 续费`);
          
          console.log(`🔧 开始调用 business-logic.js 处理续费...`);
          console.log(`📦 传入参数: product_id=${orderData.product_id}, out_trade_no=${orderId}`);
          await processBusinessLogic(mockParams);
          console.log(`✅ business-logic.js 处理完成`);
          
          // 重新查询用户的新到期时间
          const { data: userData } = await supabase
            .from('user_accounts')
            .select('expiry_at')
            .eq('account', orderData.customer_email)
            .single();
          
          // 从 product_id 提取续费类型
          let renewalType = 'monthly';
          if (orderData.product_id.includes('quarterly')) renewalType = 'quarterly';
          else if (orderData.product_id.includes('yearly')) renewalType = 'yearly';
          
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
        
        // 订单还未支付
        console.log(`⏳ 支付宝订单状态: ${tradeStatus}，等待支付...`);
        
      } catch (alipayError) {
        console.error(`⚠️ 查询支付宝订单失败: ${alipayError.message}`);
        // 查询失败不影响返回，继续返回等待支付状态
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

