// payment.js
const AlipaySdk = require('alipay-sdk').default || require('alipay-sdk');
const { createClient } = require('@supabase/supabase-js');

// 允许的来源白名单
const allowedOrigins = [
    'http://localhost:8888',
    'https://google-maps-backend-master.netlify.app',
    'https://mediamingle.cn'
];

// 格式化密钥的辅助函数
function formatKey(key, type) {
    if (!key || key.includes('\n')) {
        return key;
    }
    console.log(`[Info] Reformatting single-line ${type} key...`);
    const header = type === 'private' ? '-----BEGIN RSA PRIVATE KEY-----' : '-----BEGIN PUBLIC KEY-----';
    const footer = type === 'private' ? '-----END RSA PRIVATE KEY-----' : '-----END PUBLIC KEY-----';
    return key.replace(header, `${header}\n`).replace(footer, `\n${footer}`);
}

// 后端权威价格表 (人民币, CNY) - 支付宝支付使用
const productPriceMap = {
    // Google Maps 新购方案
    'gmaps_monthly': 49.90,       // 按月
    'gmaps_quarterly': 147.00,    // 按季
    'gmaps_yearly': 588.00,       // 按年（买一年送一年，实际2年）
    // Google Maps 续费方案
    'gmaps_renewal_monthly': 49.90,
    'gmaps_renewal_quarterly': 147.00,
    'gmaps_renewal_yearly': 588.00,
    // MailPro 邮件营销大师
    'validator_standard': 203.00, // 标准版
    'validator_premium': 553.00,  // 高级版
    // WhatsApp 智能营销助手
    'whatsapp-validator_standard': 203.00,  // 标准版
    'whatsapp-validator_premium': 343.00    // 高级版
};

exports.handler = async (event) => {
    const origin = event.headers.origin;

    const headers = {
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };
    if (allowedOrigins.includes(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
    }

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: 'Method Not Allowed' };
    }

    try {
        // 检查必要的环境变量
        const requiredEnvVars = ['ALIPAY_APP_ID', 'ALIPAY_PRIVATE_KEY', 'ALIPAY_PUBLIC_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

        if (missingVars.length > 0) {
            console.error('Missing environment variables:', missingVars);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    success: false,
                    message: 'Server configuration error. Please contact support.',
                    error: 'Missing environment variables'
                })
            };
        }

        const alipaySdk = new AlipaySdk({
            appId: process.env.ALIPAY_APP_ID,
            privateKey: formatKey(process.env.ALIPAY_PRIVATE_KEY, 'private'),
            alipayPublicKey: formatKey(process.env.ALIPAY_PUBLIC_KEY, 'public'),
            gateway: "https://openapi.alipay.com/gateway.do",
            timeout: 30000
        });

        const { productId, email: identifierFromFrontend, referralCode, agentCode } = JSON.parse(event.body);
        if (!productId || !identifierFromFrontend) {
            return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Missing parameters' }) };
        }

        const price = productPriceMap[productId];
        if (!price) {
            console.error(`[Security Error] Invalid productId received: ${productId}`);
            return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid product' }) };
        }

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

        let finalIdentifier = identifierFromFrontend;

        // ▼▼▼【核心修改】根据您的数据库结构进行简化和修正 ▼▼▼
        if (productId.startsWith('gmaps_renewal')) {
            console.log(`[Info] Renewal check for identifier: ${identifierFromFrontend}`);

            // 1. 逻辑简化：不再区分邮箱和账号，统一在 'account' 字段中查询
            const { data: userRecord, error: dbQueryError } = await supabase
                .from('user_accounts')
                .select('account') // 只查询存在的 'account' 字段
                .eq('account', identifierFromFrontend) // 在 'account' 字段中匹配前端传来的值
                .single();

            if (dbQueryError && dbQueryError.code !== 'PGRST116') {
                console.error('Supabase query error during renewal user check:', dbQueryError);
                throw new Error('Database query failed during user validation.');
            }

            if (!userRecord) {
                console.warn(`[Renewal Blocked] User not found for identifier: ${identifierFromFrontend}`);
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ success: false, message: '续费失败：该账户不存在。' })
                };
            }

            // 2. 使用从数据库中查到的、权威的账户信息作为最终标识符
            finalIdentifier = userRecord.account;
            console.log(`[Info] User validated. Proceeding with identifier: ${finalIdentifier}`);
        }
        // ▲▲▲ 修改结束 ▲▲▲

        const productCodeMap = {
            // Google Maps 新购方案
            'gmaps_monthly': 'gm', 'gmaps_quarterly': 'gq', 'gmaps_yearly': 'gy',
            // Google Maps 续费方案
            'gmaps_renewal_monthly': 'grm', 'gmaps_renewal_quarterly': 'grq', 'gmaps_renewal_yearly': 'gry',
            // MailPro 邮件营销大师
            'validator_standard': 'vs', 'validator_premium': 'vp',
            // WhatsApp 智能营销助手
            'whatsapp-validator_standard': 'wvs', 'whatsapp-validator_premium': 'wvp'
        };
        const productCode = productCodeMap[productId] || 'unknown';

        const encodedIdentifier = Buffer.from(finalIdentifier).toString('base64');
        const outTradeNo = `${productCode}-${Date.now()}-${encodedIdentifier}`;

        let subject = '未知商品';
        if (productId.startsWith('gmaps_renewal')) {
            if (productId.includes('monthly')) subject = 'Google Maps Scraper - 月度续费';
            else if (productId.includes('quarterly')) subject = 'Google Maps Scraper - 季度续费';
            else if (productId.includes('yearly')) subject = 'Google Maps Scraper - 年度续费';
        } else if (productId.startsWith('gmaps')) {
            if (productId.includes('monthly')) subject = 'Google Maps Scraper - 按月订阅';
            else if (productId.includes('quarterly')) subject = 'Google Maps Scraper - 按季订阅';
            else if (productId.includes('yearly')) subject = 'Google Maps Scraper - 按年订阅(买一年送一年)';
        } else if (productId.startsWith('validator')) {
            subject = productId.includes('premium') ? 'Email Validator 高级版激活码' : 'Email Validator 标准版激活码';
        } else if (productId.startsWith('whatsapp-validator')) {
            subject = productId.includes('premium') ? 'WhatsApp Validator 高级版激活码' : 'WhatsApp Validator 标准版激活码';
        }

        // 构建订单数据，只包含存在的字段
        const orderData = {
            out_trade_no: outTradeNo,
            product_id: productId,
            customer_email: finalIdentifier,
            status: 'PENDING'
        };

        // 如果数据库支持推广字段，则添加
        if (referralCode) {
            orderData.referral_code = referralCode;
        }
        if (agentCode) {
            orderData.agent_code = agentCode;
        }

        const { error: insertError } = await supabase.from('orders').insert([orderData]);

        if (insertError) {
            console.error('Supabase insert error:', insertError);
            throw new Error(`Failed to create order in database: ${insertError.message}`);
        }

        // 临时存储推广信息（如果数据库不支持推广字段）
        if ((referralCode || agentCode) && (!orderData.referral_code && !orderData.agent_code)) {
            try {
                // 创建一个临时的推广信息记录
                const { error: referralError } = await supabase.from('referral_tracking').insert([{
                    out_trade_no: outTradeNo,
                    referral_code: referralCode,
                    agent_code: agentCode,
                    created_at: new Date().toISOString()
                }]);

                if (referralError) {
                    console.log('推广信息临时存储失败，但不影响订单创建:', referralError.message);
                }
            } catch (error) {
                console.log('推广信息临时存储失败，但不影响订单创建:', error.message);
            }
        }

        // 动态获取当前域名
        const host = event.headers.host || 'mediamingle.cn';
        const protocol = event.headers['x-forwarded-proto'] || 'https';
        const notifyUrl = `${protocol}://${host}/.netlify/functions/alipay-notify`;

        const result = await alipaySdk.exec('alipay.trade.precreate', {
            bizContent: {
                out_trade_no: outTradeNo,
                total_amount: price,
                subject: subject,
                notify_url: notifyUrl
            },
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                qrCodeUrl: result.qrCode,
                outTradeNo: outTradeNo
            })
        };

    } catch (error) {
        console.error('Function execution error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, message: 'Failed to create payment order.', error: error.message })
        };
    }
};