# Cloudflare Workers 部署指南

## 快速部署步骤

### 1. 安装 Wrangler CLI
```bash
npm install -g wrangler
```

### 2. 登录 Cloudflare
```bash
wrangler login
```

### 3. 创建 KV 命名空间
```bash
cd cloudflare-workers
wrangler kv:namespace create "SESSION_CACHE"
```
复制输出的 `id`，填入 `wrangler.toml` 中

### 4. 配置环境变量
编辑 `wrangler.toml`，设置：
- `JWT_SECRET` = 与 Netlify 相同的密钥

### 5. 部署
```bash
wrangler deploy
```

### 6. 获取 Worker URL
部署后会显示类似：
```
https://email-finder-api-proxy.YOUR_SUBDOMAIN.workers.dev
```

### 7. 更新前端 API URL
修改 `popup.js` 中的 API URL：
```javascript
const SESSION_API_URL = 'https://email-finder-api-proxy.YOUR_SUBDOMAIN.workers.dev/api/auth/verify-token';
```

---

## 自定义域名（可选）
在 Cloudflare Dashboard 中可以绑定自定义域名，如 `api.mediamingle.cn`
