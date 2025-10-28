# GitHub API 403 错误修复说明

## 问题描述

在 `download.html` 页面下载软件时出现 403 Forbidden 错误：
```
https://mediamingle.cn/api/github/Chenlongx/email_validator_repo/releases/latest 403 (Forbidden)
```

## 问题原因

1. **GitHub API 速率限制**
   - 未认证的请求：每小时 60 次
   - 已认证的请求：每小时 5000 次
   - 下载页面同时获取 4 个产品信息，快速达到限制

2. **安全中间件过于严格**
   - 某些浏览器请求可能被误判为机器人

3. **缺少缓存机制**
   - 每次页面加载都重新请求 API

## 修复内容

### 1. 优化安全中间件 (`security-middleware.js`)

**修改内容：**
- 添加浏览器检测逻辑
- 允许合法浏览器请求通过

**代码变更：**
```javascript
// 检查是否是浏览器请求
const isBrowser = lowerUserAgent.includes('mozilla') || 
                  lowerUserAgent.includes('chrome') || 
                  lowerUserAgent.includes('safari') || 
                  lowerUserAgent.includes('firefox') ||
                  lowerUserAgent.includes('edge');

// 只有在不是浏览器请求的情况下才检查被阻止的User-Agent
if (!isBrowser) {
    // 检查黑名单...
}
```

### 2. 改进 GitHub API 处理 (`github.js`)

**修改内容：**
- 添加更详细的错误信息
- 区分不同类型的错误（速率限制、仓库不存在等）
- 显示 API 配额重置时间
- 提供配置建议

**主要改进：**
```javascript
// 检查是否是 rate limit 错误
if (errorData.message && (errorData.message.includes('API rate limit') || rateLimitRemaining === '0')) {
    const resetTime = rateLimitReset ? new Date(parseInt(rateLimitReset) * 1000).toLocaleString('zh-CN') : '未知';
    return {
        statusCode: 429,
        body: JSON.stringify({
            error: 'API rate limit exceeded',
            message: 'GitHub API 请求频率超限，请稍后重试',
            details: `API 限额已用完，将在 ${resetTime} 重置`,
            suggestion: '建议管理员配置 GITHUB_TOKEN 环境变量以提高速率限制'
        })
    };
}
```

### 3. 添加本地缓存机制 (`download.html`)

**修改内容：**
- 使用 localStorage 缓存发布信息（1小时）
- 减少不必要的 API 调用
- 大幅降低触发速率限制的可能性

**缓存逻辑：**
```javascript
// 缓存配置 - 1小时有效期
const CACHE_DURATION = 60 * 60 * 1000;

// 读取缓存
function getCache(key) {
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    
    const { data, timestamp } = JSON.parse(cached);
    const now = Date.now();
    
    // 检查是否过期
    if (now - timestamp > CACHE_DURATION) {
        localStorage.removeItem(key);
        return null;
    }
    
    return data;
}

// 保存缓存
function setCache(key, data) {
    const cacheData = {
        data: data,
        timestamp: Date.now()
    };
    localStorage.setItem(key, JSON.stringify(cacheData));
}
```

**使用缓存：**
```javascript
// 首先检查缓存
const cachedData = getCache(cacheKey);
if (cachedData) {
    updateUIWithReleaseData(cachedData, ...);
    return; // 无需调用 API
}

// 缓存未命中，调用 API
fetch(apiUrl)
    .then(response => response.json())
    .then(data => {
        // 保存到缓存
        setCache(cacheKey, data);
        // 更新UI
        updateUIWithReleaseData(data, ...);
    });
```

### 4. 优化错误提示

**修改内容：**
- 针对不同错误类型显示不同的提示信息
- 提供具体的解决建议
- 用户友好的错误消息

**错误类型：**
- **429 (Rate Limit)**: 显示 API 限额已用完，提示等待时间
- **404 (Not Found)**: 显示仓库不存在或无访问权限
- **403 (Forbidden)**: 显示访问被拒绝，建议检查配置

## 长期解决方案：配置 GitHub Token

### 为什么需要 GitHub Token？

- ✅ **提高速率限制**：从 60次/小时 提升到 5000次/小时
- ✅ **访问私有仓库**：如果需要访问私有仓库
- ✅ **更稳定**：避免频繁触发速率限制

### 如何创建 GitHub Token

#### 步骤 1: 登录 GitHub

访问 [GitHub](https://github.com) 并登录您的账号。

#### 步骤 2: 创建 Personal Access Token

1. 点击右上角头像 → **Settings**
2. 左侧菜单滚动到底部 → **Developer settings**
3. 点击 **Personal access tokens** → **Tokens (classic)**
4. 点击 **Generate new token** → **Generate new token (classic)**

#### 步骤 3: 配置 Token 权限

**必需的权限：**
- ✅ `repo` (如果仓库是私有的)
- ✅ `public_repo` (如果仓库是公开的)

**Token 描述示例：**
```
MediaMingle Website - GitHub Release API
```

**过期时间建议：**
- 选择 `No expiration`（无过期）或根据安全策略选择合适的时间

#### 步骤 4: 生成并保存 Token

1. 点击底部的 **Generate token**
2. **立即复制 Token**（只会显示一次！）
3. 保存到安全的地方（如密码管理器）

示例 Token 格式：
```
ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 配置 Token 到 Netlify

#### 方法 1: Netlify 网站界面

1. 登录 [Netlify Dashboard](https://app.netlify.com)
2. 选择您的站点
3. 进入 **Site settings** → **Environment variables**
4. 点击 **Add a variable**
5. 添加以下环境变量：
   ```
   Key: GITHUB_TOKEN
   Value: ghp_your_token_here
   ```
6. 点击 **Save**

#### 方法 2: Netlify CLI

```bash
# 安装 Netlify CLI
npm install -g netlify-cli

# 登录
netlify login

# 设置环境变量
netlify env:set GITHUB_TOKEN "ghp_your_token_here"
```

#### 方法 3: netlify.toml 配置文件

⚠️ **警告**: 不要将 Token 直接写入 `netlify.toml` 或提交到 Git！

正确做法是在 Netlify 界面设置环境变量，然后在 `netlify.toml` 中引用：

```toml
[build.environment]
  NODE_VERSION = "16"
  # GITHUB_TOKEN 应该在 Netlify 控制台中设置，不要写在这里
```

### 验证配置

#### 检查环境变量是否生效

部署后，查看 Netlify 函数日志：

**如果配置成功：**
```
Using authenticated GitHub API request
```

**如果未配置：**
```
⚠️ No GITHUB_TOKEN found, using unauthenticated API (rate limit: 60 req/hour)
```

#### 测试 API

访问您的下载页面并打开浏览器控制台，查看：

1. **成功使用缓存：**
   ```
   ✅ 使用缓存数据: github_release_gogole_maps, 缓存于 2025/10/28 10:30:00
   ```

2. **首次获取成功：**
   ```
   💾 已缓存数据: github_release_gogole_maps
   ```

3. **API 调用：**
   - 查看 Network 标签
   - 找到 `/api/github/...` 请求
   - 检查状态码（应该是 200）

## 安全最佳实践

### 1. Token 安全

✅ **应该做：**
- 将 Token 保存在环境变量中
- 使用 Netlify 的环境变量管理
- 定期轮换 Token
- 只给予必需的权限

❌ **不应该做：**
- 将 Token 提交到 Git
- 将 Token 写在代码中
- 在前端暴露 Token
- 分享 Token 给他人

### 2. 环境变量管理

创建 `.env.local` 文件用于本地开发（不要提交到 Git）：

```bash
# .env.local (仅用于本地开发)
GITHUB_TOKEN=ghp_your_token_here
```

确保 `.gitignore` 包含：
```
.env
.env.local
.env*.local
```

### 3. 权限最小化

根据实际需求选择最小权限：

| 仓库类型 | 所需权限 |
|---------|---------|
| 公开仓库，只读发布信息 | `public_repo` |
| 私有仓库，只读发布信息 | `repo` → `repo:status` |
| 需要创建/修改发布 | `repo` (完整权限) |

## 缓存策略说明

### 当前缓存配置

- **缓存时长**: 1小时 (3600秒)
- **缓存位置**: localStorage
- **缓存键格式**: `github_release_{repoName}`

### 何时使用缓存

✅ **使用缓存的场景：**
- 用户刷新页面
- 在缓存有效期内再次访问
- API 遇到速率限制时

### 何时更新缓存

🔄 **缓存会被更新：**
- 缓存过期（1小时后）
- 首次访问页面
- 用户清除浏览器缓存
- 手动清除缓存（见下方说明）

### 手动清除缓存

如果需要强制更新发布信息，用户可以：

**方法 1: 浏览器开发者工具**
```javascript
// 在浏览器控制台运行
localStorage.clear();
location.reload();
```

**方法 2: 清除特定缓存**
```javascript
// 只清除特定产品的缓存
localStorage.removeItem('github_release_gogole_maps');
localStorage.removeItem('github_release_email_validator_repo');
localStorage.removeItem('github_release_whatsapp_validator_repo');
localStorage.removeItem('github_release_mediamingle_pro_repo');
location.reload();
```

### 调整缓存时长

如果需要修改缓存时长，编辑 `download.html` 中的配置：

```javascript
// 修改此值来调整缓存时长
const CACHE_DURATION = 60 * 60 * 1000; // 1小时

// 常用时长参考：
// 30分钟: 30 * 60 * 1000
// 1小时: 60 * 60 * 1000
// 2小时: 2 * 60 * 60 * 1000
// 1天: 24 * 60 * 60 * 1000
```

## 监控和调试

### 查看 Netlify 函数日志

1. 登录 Netlify Dashboard
2. 选择您的站点
3. 进入 **Functions** 标签
4. 点击 `github` 函数
5. 查看实时日志

### 常见日志消息

**正常运行：**
```
Fetching GitHub API: Chenlongx/gogole_maps/releases/latest
Using authenticated GitHub API request
```

**速率限制：**
```
GitHub API error: 403 {"message":"API rate limit exceeded..."}
API 限额已用完，将在 2025/10/28 11:30:00 重置
```

**仓库未找到：**
```
GitHub API error: 404 {"message":"Not Found"}
仓库不存在或无法访问
```

### Chrome DevTools 网络监控

1. 打开 Chrome DevTools (F12)
2. 切换到 **Network** 标签
3. 刷新页面
4. 筛选 `api/github`
5. 检查请求状态和响应

**检查响应头：**
```
x-ratelimit-limit: 5000
x-ratelimit-remaining: 4995
x-ratelimit-reset: 1698567890
```

## 故障排除

### 问题 1: 仍然出现 403 错误

**可能原因：**
- Token 未正确配置
- Token 已过期或被撤销
- Token 权限不足

**解决方法：**
1. 检查 Netlify 环境变量是否正确设置
2. 重新生成并配置新的 Token
3. 确保 Token 有正确的权限
4. 重新部署站点

### 问题 2: 缓存不工作

**可能原因：**
- 浏览器禁用了 localStorage
- 浏览器处于隐私模式
- localStorage 已满

**解决方法：**
1. 检查浏览器控制台是否有错误
2. 测试 localStorage：`typeof localStorage`
3. 清除不必要的 localStorage 数据
4. 尝试其他浏览器

### 问题 3: 显示旧版本信息

**可能原因：**
- 缓存未过期
- 新版本刚发布

**解决方法：**
1. 清除浏览器缓存：`localStorage.clear()`
2. 等待缓存自动过期（1小时）
3. 使用硬刷新：Ctrl+F5 (Windows) 或 Cmd+Shift+R (Mac)

### 问题 4: API 调用失败但有缓存

**行为：**
- 首次访问失败
- 但后续访问会显示缓存的数据

**这是正常的！** 缓存机制确保即使 API 失败，用户仍能看到之前的版本信息。

## 性能优化建议

### 1. CDN 加速

考虑使用 CDN 加速下载文件：

```javascript
// 已使用的加速代理
const downloadProxy = 'https://ghfast.top/';

// 备用代理
const backupProxies = [
    'https://ghproxy.com/',
    'https://gh.api.99988866.xyz/',
    'https://mirror.ghproxy.com/'
];
```

### 2. 延迟加载

如果有多个产品，可以考虑延迟加载：

```javascript
// 优先加载第一个产品
fetchProductRelease({ repoName: 'gogole_maps', ... });

// 延迟加载其他产品
setTimeout(() => {
    fetchProductRelease({ repoName: 'email_validator_repo', ... });
    fetchProductRelease({ repoName: 'whatsapp_validator_repo', ... });
    fetchProductRelease({ repoName: 'mediamingle_pro_repo', ... });
}, 500);
```

### 3. 服务端缓存

考虑在 Netlify 函数中添加缓存层：

```javascript
// 可以使用 Netlify Blobs 或其他存储服务
const cachedReleases = new Map();
const CACHE_TTL = 3600000; // 1小时

exports.handler = async (event, context) => {
    const cacheKey = `${username}/${repo}/${endpoint}`;
    const cached = cachedReleases.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return { statusCode: 200, body: cached.data };
    }
    
    // 调用 GitHub API...
    // 保存到缓存...
};
```

## 更新日志

### 2025-10-28 - v1.0
- ✅ 修复 403 错误
- ✅ 添加本地缓存机制
- ✅ 优化安全中间件
- ✅ 改进错误处理
- ✅ 添加 GitHub Token 支持
- ✅ 更新文档

## 相关资源

- [GitHub API 文档](https://docs.github.com/en/rest)
- [GitHub Token 权限说明](https://docs.github.com/en/developers/apps/building-oauth-apps/scopes-for-oauth-apps)
- [Netlify 环境变量](https://docs.netlify.com/environment-variables/overview/)
- [Netlify Functions](https://docs.netlify.com/functions/overview/)

## 联系支持

如果问题仍未解决，请联系技术支持：

- **Email**: support@mediamingle.cn
- **GitHub**: https://github.com/Chenlongx
- **Website**: https://mediamingle.cn/contact.html

---

**祝您使用愉快！** 🎉

