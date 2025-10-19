const AlipaySdk = require('alipay-sdk').default || require('alipay-sdk');
const { createClient } = require('@supabase/supabase-js');
const { processBusinessLogic } = require('./business-logic.js'); // 引入核心业务逻辑

// 格式化密钥的辅助函数
function formatKey(key, type) {
    if (!key || key.includes('\n')) return key;
    const header = type === 'private' ? '-----BEGIN RSA PRIVATE KEY-----' : '-----BEGIN PUBLIC KEY-----';
    const footer = type === 'private' ? '-----END RSA PRIVATE KEY-----' : '-----END PUBLIC KEY-----';
    return key.replace(header, `${header}\n`).replace(footer, `\n${footer}`);
}

exports.handler = async (event) => {
    console.log('🔔 [alipay-notify] 收到支付宝回调');
    
    if (event.httpMethod !== 'POST') {
        console.log('⚠️ [alipay-notify] 非POST请求，拒绝');
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const params = new URLSearchParams(event.body);
        const paramsJSON = Object.fromEntries(params.entries());
        
        console.log('📦 [alipay-notify] 回调参数:', JSON.stringify(paramsJSON, null, 2));

        const alipaySdk = new AlipaySdk({
            appId: process.env.ALIPAY_APP_ID,
            privateKey: formatKey(process.env.ALIPAY_PRIVATE_KEY, 'private'),
            alipayPublicKey: formatKey(process.env.ALIPAY_PUBLIC_KEY, 'public'),
            gateway: process.env.ALIPAY_GATEWAY,
        });

        console.log('🔐 [alipay-notify] 开始验证签名...');
        const isSignVerified = alipaySdk.checkNotifySign(paramsJSON);
        if (!isSignVerified) {
            console.error('❌ [alipay-notify] 签名验证失败！');
            return { statusCode: 200, body: 'failure' };
        }
        
        console.log('✅ [alipay-notify] 签名验证成功！');
        
        const tradeStatus = params.get('trade_status');
        const outTradeNo = params.get('out_trade_no');
        
        console.log(`📊 [alipay-notify] 订单状态: ${tradeStatus}, 订单号: ${outTradeNo}`);

        if (tradeStatus === 'TRADE_SUCCESS') {
            const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
            
            // ▼▼▼ 防止重复处理的关键检查 ▼▼▼
            const { data: existingOrder, error } = await supabase
                .from('orders')
                .select('status')
                .eq('out_trade_no', outTradeNo)
                .single();

            if (error || !existingOrder) {
                 console.error(`[alipay-notify] Order ${outTradeNo} not found in DB.`);
                 return { statusCode: 200, body: 'failure' };
            }
            
            // 如果订单状态已经是 completed (由 check-status 主动查询处理过了)，则直接告诉支付宝成功，不再重复处理
            if (existingOrder.status === 'completed') {
                console.log(`[alipay-notify] Order ${outTradeNo} is already completed. Skipping.`);
                return { statusCode: 200, body: 'success' };
            }
            // ▲▲▲ 检查结束 ▲▲▲

            console.log(`[alipay-notify] Updating order status for ${outTradeNo}...`);
            await supabase.from('orders').update({ status: 'completed' }).eq('out_trade_no', outTradeNo);
            
            // 调用核心业务逻辑
            await processBusinessLogic(params);
        }

        return { statusCode: 200, body: 'success' };

    } catch (error) {
        console.error('[Critical Error] in alipay-notify:', error.message, error.stack);
        return { statusCode: 200, body: 'failure' };
    }
};