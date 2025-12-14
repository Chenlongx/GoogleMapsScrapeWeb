# PayPal 支付集成配置指南

## 概述
本项目已集成 PayPal 支付功能，支持国际用户使用美元支付。

## 新增文件

### 后端函数
1. **`netlify/functions/paypal-create-order.js`** - 创建 PayPal 订单
2. **`netlify/functions/paypal-capture-order.js`** - 确认/捕获 PayPal 支付

## 环境变量配置

在 Netlify 后台添加以下环境变量：

### 必需的 PayPal 环境变量
```
PAYPAL_CLIENT_ID=你的PayPal客户端ID
PAYPAL_CLIENT_SECRET=你的PayPal客户端密钥
PAYPAL_MODE=live  # 或 'sandbox' 用于测试
```

### 已有的环境变量（确保存在）
```
SUPABASE_URL=https://exzbshteqangjyjflhlz.supabase.co
SUPABASE_ANON_KEY=你的Supabase匿名密钥
SERVICE_ROLE_KEY=你的Supabase服务角色密钥
```

## 定价更新 (USD)

| 产品 | 标准版 | 高级版 |
|------|--------|--------|
| Google Maps Scraper | $9.90 (首月) | $20/月 |
| MailPro 邮件营销大师 | $59/年 | $99/年 |
| WhatsApp 智能营销助手 | $99/年 | $199/年 |

## 如何获取 PayPal API 密钥

1. 登录 [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/)
2. 创建一个应用（或使用现有应用）
3. 复制 **Client ID** 和 **Secret**
4. 对于生产环境，确保使用 **Live** 凭证而非 Sandbox

## API 端点

### 创建订单
```
POST /.netlify/functions/paypal-create-order
Content-Type: application/json

{
  "productId": "gmaps_premium",
  "email": "customer@example.com"
}
```

### 确认支付
```
POST /.netlify/functions/paypal-capture-order
Content-Type: application/json

{
  "orderId": "PayPal订单ID",
  "outTradeNo": "内部订单号"
}
```

## 支付流程

1. 用户选择产品并输入邮箱
2. 前端调用 `paypal-create-order` 创建订单
3. 返回 PayPal 批准链接，用户跳转到 PayPal 完成支付
4. PayPal 回调后，前端调用 `paypal-capture-order` 确认支付
5. 后端创建用户账户或生成激活码
6. 发送确认邮件给客户

## 注意事项

- PayPal 支付使用 USD 货币
- 支付宝/微信支付仍使用 CNY（使用现有的 `payment.js`）
- 前端需要根据用户语言/地区选择合适的支付方式

---
*更新时间: 2025-12-13*
