const https = require('https');
const crypto = require('crypto');

const WECHAT_HOST = 'api.mch.weixin.qq.com';

function normalizePemKey(key) {
  if (!key) {
    return key;
  }

  let normalized = String(key).trim().replace(/\\n/g, '\n');
  if (!normalized.includes('\n')) {
    normalized = normalized
      .replace(/(-----BEGIN [A-Z ]+-----)/, '$1\n')
      .replace(/(-----END [A-Z ]+-----)/, '\n$1');
  }

  return normalized;
}

function getWeChatBaseConfig() {
  return {
    mchId: process.env.WECHAT_MCH_ID,
    serialNo: process.env.WECHAT_MCH_SERIAL_NO,
    privateKey: normalizePemKey(process.env.WECHAT_PRIVATE_KEY),
    platformPublicKey: normalizePemKey(process.env.WECHATPAY_PUBLIC_KEY),
    apiV3Key: process.env.WECHAT_API_V3_KEY
  };
}

function getWeChatCreateConfig() {
  return {
    ...getWeChatBaseConfig(),
    appId: process.env.WECHAT_APP_ID,
    notifyUrl: process.env.WECHAT_NOTIFY_URL
  };
}

function getMissingKeys(config, requiredKeys) {
  return requiredKeys.filter((key) => !config[key]);
}

function getCreateConfigValidation() {
  const config = getWeChatCreateConfig();
  return {
    config,
    missing: getMissingKeys(config, ['mchId', 'serialNo', 'privateKey', 'appId', 'notifyUrl'])
  };
}

function getQueryConfigValidation() {
  const config = getWeChatBaseConfig();
  return {
    config,
    missing: getMissingKeys(config, ['mchId', 'serialNo', 'privateKey'])
  };
}

function getNotifyConfigValidation() {
  const config = getWeChatBaseConfig();
  return {
    config,
    missing: getMissingKeys(config, ['apiV3Key'])
  };
}

function isWeChatOrderId(orderId) {
  return String(orderId || '').toLowerCase().startsWith('wx');
}

function buildAuthorizationHeader(config, method, urlPath, bodyText) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonceStr = crypto.randomBytes(16).toString('hex');
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonceStr}\n${bodyText}\n`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(message);
  signer.end();

  const signature = signer.sign(config.privateKey, 'base64');

  return `WECHATPAY2-SHA256-RSA2048 mchid="${config.mchId}",nonce_str="${nonceStr}",signature="${signature}",timestamp="${timestamp}",serial_no="${config.serialNo}"`;
}

function requestWeChatPay(config, method, urlPath, bodyObject) {
  const bodyText = bodyObject ? JSON.stringify(bodyObject) : '';
  const authorization = buildAuthorizationHeader(config, method, urlPath, bodyText);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: WECHAT_HOST,
        path: urlPath,
        method,
        timeout: 30000,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: authorization,
          'User-Agent': 'GoogleMapsScrapeWeb/1.0'
        }
      },
      (res) => {
        let rawBody = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          rawBody += chunk;
        });
        res.on('end', () => {
          let parsed = {};
          if (rawBody) {
            try {
              parsed = JSON.parse(rawBody);
            } catch (error) {
              parsed = { raw: rawBody };
            }
          }

          if (res.statusCode >= 400) {
            const message = parsed.message || parsed.raw || `HTTP ${res.statusCode}`;
            return reject(new Error(`WeChat Pay API error (${res.statusCode}): ${message}`));
          }

          resolve({
            statusCode: res.statusCode,
            data: parsed
          });
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('WeChat Pay request timeout'));
    });

    if (bodyText) {
      req.write(bodyText);
    }
    req.end();
  });
}

async function createNativeOrder({ orderId, description, amount }) {
  const { config, missing } = getCreateConfigValidation();
  if (missing.length > 0) {
    throw new Error(`Missing WeChat Pay config: ${missing.join(', ')}`);
  }

  const response = await requestWeChatPay(config, 'POST', '/v3/pay/transactions/native', {
    appid: config.appId,
    mchid: config.mchId,
    description,
    out_trade_no: orderId,
    notify_url: config.notifyUrl,
    amount: {
      total: Math.round(Number(amount) * 100),
      currency: 'CNY'
    }
  });

  return response.data;
}

async function queryOrderByOutTradeNo(orderId) {
  const { config, missing } = getQueryConfigValidation();
  if (missing.length > 0) {
    throw new Error(`Missing WeChat Pay config: ${missing.join(', ')}`);
  }

  const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderId)}?mchid=${encodeURIComponent(config.mchId)}`;
  const response = await requestWeChatPay(config, 'GET', path, null);
  return response.data;
}

function buildNotifyMessage({ timestamp, nonce, body }) {
  return `${timestamp}\n${nonce}\n${body}\n`;
}

function verifyNotifySignature({ timestamp, nonce, body, signature, publicKey }) {
  if (!publicKey) {
    return false;
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(buildNotifyMessage({ timestamp, nonce, body }));
  verifier.end();
  return verifier.verify(publicKey, signature, 'base64');
}

function decryptNotifyResource(resource, apiV3Key) {
  const key = Buffer.from(String(apiV3Key), 'utf8');
  const nonce = Buffer.from(resource.nonce, 'utf8');
  const associatedData = Buffer.from(resource.associated_data || '', 'utf8');
  const ciphertext = Buffer.from(resource.ciphertext, 'base64');

  const authTag = ciphertext.subarray(ciphertext.length - 16);
  const encrypted = ciphertext.subarray(0, ciphertext.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAAD(associatedData);
  decipher.setAuthTag(authTag);

  const plainText = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  return JSON.parse(plainText);
}

module.exports = {
  createNativeOrder,
  getCreateConfigValidation,
  getNotifyConfigValidation,
  getQueryConfigValidation,
  isWeChatOrderId,
  queryOrderByOutTradeNo,
  verifyNotifySignature,
  decryptNotifyResource
};
