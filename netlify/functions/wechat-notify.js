const { createClient } = require('@supabase/supabase-js');
const { processBusinessLogic } = require('./business-logic.js');
const {
  decryptNotifyResource,
  getNotifyConfigValidation,
  verifyNotifySignature
} = require('./utils/wechat-pay.js');
const { getSupabaseAdmin, resolvePaymentSecrets } = require('./utils/payment-secrets.js');

function getHeader(headers, name) {
  return headers?.[name] || headers?.[name.toLowerCase()] || headers?.[name.toUpperCase()] || '';
}

function buildRenewalLabel(productId) {
  const normalized = String(productId || '');
  if (normalized.includes('quarterly')) {
    return '季付';
  }
  if (normalized.includes('yearly')) {
    return '年付';
  }
  return '月付';
}

function successResponse() {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: 'SUCCESS',
      message: '成功'
    })
  };
}

function failResponse(message) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: 'FAIL',
      message: message || '失败'
    })
  };
}

exports.handler = async (event) => {
  console.log('[wechat-notify] 收到微信支付回调');

  if (event.httpMethod !== 'POST') {
    console.log('[wechat-notify] 非POST请求，拒绝');
    return {
      statusCode: 405,
      body: 'Method Not Allowed'
    };
  }

  try {
    const rawBody = event.body || '';
    const parsedBody = JSON.parse(rawBody || '{}');

    const timestamp = getHeader(event.headers, 'Wechatpay-Timestamp');
    const nonce = getHeader(event.headers, 'Wechatpay-Nonce');
    const signature = getHeader(event.headers, 'Wechatpay-Signature');

    const supabase = getSupabaseAdmin();
    const paymentSecrets = await resolvePaymentSecrets([
      'WECHAT_MCH_ID',
      'WECHAT_MCH_SERIAL_NO',
      'WECHAT_PRIVATE_KEY',
      'WECHAT_APP_ID',
      'WECHAT_NOTIFY_URL',
      'WECHATPAY_PUBLIC_KEY',
      'WECHAT_API_V3_KEY'
    ], supabase);
    const wechatConfigOverride = {
      mchId: paymentSecrets.WECHAT_MCH_ID,
      serialNo: paymentSecrets.WECHAT_MCH_SERIAL_NO,
      privateKey: paymentSecrets.WECHAT_PRIVATE_KEY,
      appId: paymentSecrets.WECHAT_APP_ID,
      notifyUrl: paymentSecrets.WECHAT_NOTIFY_URL,
      platformPublicKey: paymentSecrets.WECHATPAY_PUBLIC_KEY,
      apiV3Key: paymentSecrets.WECHAT_API_V3_KEY
    };
    const { config, missing } = getNotifyConfigValidation(wechatConfigOverride);
    if (missing.length > 0) {
      console.error(`[wechat-notify] 缺少微信回调配置: ${missing.join(', ')}`);
      return failResponse('配置错误');
    }

    if (config.platformPublicKey) {
      const verified = verifyNotifySignature({
        timestamp,
        nonce,
        body: rawBody,
        signature,
        publicKey: config.platformPublicKey
      });

      if (!verified) {
        console.error('[wechat-notify] 微信签名验证失败');
        return failResponse('签名验证失败');
      }
      console.log('[wechat-notify] 微信签名验证成功');
    } else {
      console.warn('[wechat-notify] 未配置 WECHATPAY_PUBLIC_KEY，跳过签名验证');
    }

    if (!parsedBody.resource || parsedBody.resource.algorithm !== 'AEAD_AES_256_GCM') {
      console.error('[wechat-notify] 回调资源格式无效');
      return failResponse('回调格式无效');
    }

    const resourceData = decryptNotifyResource(parsedBody.resource, config.apiV3Key);
    console.log('[wechat-notify] 解密后的回调数据:', JSON.stringify(resourceData, null, 2));

    const outTradeNo = resourceData.out_trade_no;
    const tradeState = resourceData.trade_state;
    const transactionId = resourceData.transaction_id || '';

    if (!outTradeNo) {
      console.error('[wechat-notify] 缺少 out_trade_no');
      return failResponse('缺少订单号');
    }

    const { data: orderRow, error: orderError } = await supabase
      .from('orders')
      .select('status, product_id, customer_email')
      .eq('out_trade_no', outTradeNo)
      .single();

    if (orderError || !orderRow) {
      console.error(`[wechat-notify] 未找到订单: ${outTradeNo}`, orderError?.message || '');
      return failResponse('订单不存在');
    }

    if (['completed', 'COMPLETED', 'success', 'SUCCESS'].includes(orderRow.status)) {
      console.log(`[wechat-notify] 订单 ${outTradeNo} 已处理，跳过重复回调`);
      return successResponse();
    }

    if (tradeState === 'SUCCESS') {
      const mockParams = new URLSearchParams();
      mockParams.append('out_trade_no', outTradeNo);
      mockParams.append('trade_status', 'TRADE_SUCCESS');
      mockParams.append('total_amount', ((resourceData.amount?.total || 0) / 100).toFixed(2));
      mockParams.append('trade_no', transactionId);
      mockParams.append('product_id', orderRow.product_id || '');
      mockParams.append('subject', `Google Maps Scraper - 续费 - ${buildRenewalLabel(orderRow.product_id)}`);

      console.log(`[wechat-notify] 开始处理续费业务: ${outTradeNo}`);
      const businessResult = await processBusinessLogic(mockParams);
      if (!businessResult?.success) {
        console.error(`[wechat-notify] 续费业务处理失败: ${outTradeNo}`, businessResult?.error || '');
        return failResponse(businessResult?.error || '续费处理失败');
      }

      await supabase
        .from('orders')
        .update({ status: 'COMPLETED' })
        .eq('out_trade_no', outTradeNo);

      console.log(`[wechat-notify] 续费业务处理完成: ${outTradeNo}`);
      return successResponse();
    }

    if (['CLOSED', 'REVOKED', 'PAYERROR'].includes(tradeState)) {
      await supabase
        .from('orders')
        .update({ status: tradeState })
        .eq('out_trade_no', outTradeNo);
      console.log(`[wechat-notify] 订单状态更新为 ${tradeState}: ${outTradeNo}`);
    } else {
      console.log(`[wechat-notify] 忽略未完成状态 ${tradeState}: ${outTradeNo}`);
    }

    return successResponse();
  } catch (error) {
    console.error('[wechat-notify] 回调处理失败:', error.message, error.stack);
    return failResponse('处理失败');
  }
};
