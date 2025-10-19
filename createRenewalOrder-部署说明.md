# createRenewalOrder.js 真实支付模式部署说明

## ✅ 已完成的修改（v2.1）

`createRenewalOrder.js` 已从**模拟/测试模式**升级为**真实支付模式**：

### 主要变更：
1. ✅ 引入支付宝SDK（`alipay-sdk`）
2. ✅ 强制检查环境变量（移除模拟模式兜底）
3. ✅ **使用 `alipay.trade.precreate`（扫码支付）生成二维码短链接**
4. ✅ 订单格式与 `payment.js` 统一
5. ✅ 使用 `orders` 表（而不是 `renewal_orders`）
6. ✅ 修复了支付方式（从 `wap.pay` 改为 `precreate`）

### 🔧 关键修复（v2.1）：
**问题：** QT 应用续费对话框生成的二维码扫描后没反应  
**原因：** 之前使用 `alipay.trade.wap.pay` 返回的是超长 URL（适合网页跳转），不适合二维码扫描  
**解决：** 改用 `alipay.trade.precreate`（扫码支付），返回短链接（类似 `https://qr.alipay.com/xxx`），适合二维码扫描

---

## 🚀 部署步骤

### 方式1：通过 Git 部署（推荐）

```bash
# 1. 进入项目目录
cd D:\GoogleMapsScrapeWeb

# 2. 提交修改
git add netlify/functions/createRenewalOrder.js
git commit -m "fix: 修复续费订单生成，启用真实支付模式"

# 3. 推送到远程仓库
git push origin main

# 4. Netlify 会自动检测并部署
```

### 方式2：通过 Netlify CLI 手动部署

```bash
# 1. 安装 Netlify CLI（如果还没有）
npm install -g netlify-cli

# 2. 登录 Netlify
netlify login

# 3. 部署到生产环境
netlify deploy --prod

# 4. 选择 D:\GoogleMapsScrapeWeb 作为发布目录
```

### 方式3：通过 Netlify 控制台手动上传

1. 登录 [Netlify 控制台](https://app.netlify.com)
2. 选择 `mediamingle.cn` 站点
3. 进入 **Deploys** 页面
4. 点击 **Upload deploy folder**
5. 上传整个 `D:\GoogleMapsScrapeWeb` 文件夹

---

## ⚙️ 必需的环境变量

确保在 Netlify 中配置了以下环境变量：

### Supabase 配置
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`（或 `SUPABASE_ANON_KEY`）

### 支付宝配置
- `ALIPAY_APP_ID`
- `ALIPAY_PRIVATE_KEY`
- `ALIPAY_PUBLIC_KEY`

**检查方式：**
1. 登录 Netlify 控制台
2. 进入站点设置 → Environment variables
3. 确认上述变量都已配置且值正确

---

## 🧪 测试步骤

部署完成后，按以下步骤测试：

### 1. 打开续费对话框
```
应用程序 → 菜单栏 → 续费
```

### 2. 选择续费类型
- 月付 ¥29.90
- 季付 ¥89.70
- 年付 ¥358.80

### 3. 点击"生成支付二维码"
- ✅ 应该看到真实的支付宝二维码
- ✅ 控制台应该打印："✅ 生成支付链接: 订单ID=grm-xxx, 金额=¥29.90, 商品=..."
- ❌ 如果看到错误，检查 Netlify 函数日志

### 4. 扫码支付测试
- 使用支付宝扫描二维码
- 应该跳转到真实的支付宝支付页面
- **注意：请使用小额测试（月付 ¥29.90）**

### 5. 支付成功验证
- 支付成功后，对话框应显示"🎉 支付成功！"
- 账户到期时间应自动更新
- 数据库 `orders` 表应有新订单记录（状态为 `COMPLETED`）
- 数据库 `user_accounts` 表的 `expiry_at` 应更新

---

## 🔍 调试方法

### 查看 Netlify 函数日志

```bash
# 方式1：实时日志
netlify functions:log createRenewalOrder

# 方式2：在 Netlify 控制台查看
# Functions → createRenewalOrder → Logs
```

### 常见错误及解决方法

#### ❌ 错误1：`Missing environment variables`
**原因：** 环境变量未配置或配置错误  
**解决：** 在 Netlify 控制台中配置所有必需的环境变量

#### ❌ 错误2：`创建订单失败`
**原因：** Supabase 连接失败或表结构不匹配  
**解决：** 检查 `orders` 表是否存在，字段是否包含 `out_trade_no`, `product_id`, `customer_email`, `status`

#### ❌ 错误3：`支付宝签名失败`
**原因：** 私钥或公钥格式错误  
**解决：** 确保密钥包含换行符，格式正确（使用 `formatKey` 函数）

#### ❌ 错误4：二维码显示但无法支付
**原因：** `product_code` 错误或支付宝 AppID 未通过审核  
**解决：** 
- 确认 `product_code` 为 `QUICK_WAP_PAY`
- 在支付宝开放平台检查应用状态

---

## 📝 后续工作

1. ✅ 测试小额支付（月付 ¥29.90）
2. ✅ 验证支付成功后账户到期时间自动更新
3. ✅ 测试已过期账户的续费流程
4. ✅ 检查 `business-logic.js` 续费逻辑是否正常工作
5. ✅ 测试季付、年付流程

---

## 💡 提示

- **部署时间：** Netlify 通常需要 1-3 分钟完成部署
- **缓存清除：** 如果看不到更新，尝试清除浏览器缓存或使用无痕模式
- **备份：** 建议在部署前备份当前数据库

---

## 📞 如有问题

如果遇到问题，请检查：
1. Netlify 函数日志
2. 浏览器控制台（F12）
3. 支付宝开放平台的日志

或联系我进行进一步调试。

---

**最后更新：** 2025-10-19  
**文件版本：** v2.0（真实支付模式）

