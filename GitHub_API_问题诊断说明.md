# GitHub API 403 错误诊断说明

## 问题描述
`download.html` 页面出现 403 Forbidden 错误，无法获取 GitHub 仓库的发布信息。

## 错误分析

### 1. 主要错误
```
GET https://mediamingle.cn/api/github/Chenlongx/email_validator_repo/releases/latest 403 (Forbidden)
```

### 2. 可能原因
1. **缺少 GitHub Token**: 环境变量 `GITHUB_TOKEN` 未设置或无效
2. **重定向配置问题**: `netlify.toml` 中缺少 GitHub API 的重定向规则
3. **仓库访问权限**: 仓库可能不存在或为私有仓库
4. **API 速率限制**: GitHub API 请求频率超限

## 已修复的问题

### ✅ 1. 添加了 GitHub API 重定向规则
在 `netlify.toml` 中添加了：
```toml
# GitHub API 代理
[[redirects]]
  from = "/api/github/*"
  to = "/.netlify/functions/github/:splat"
  status = 200
  force = true
```

### ✅ 2. 创建了测试页面
创建了 `test-github-api.html` 用于诊断 API 问题。

## 需要检查的配置

### 1. GitHub Token 配置
在 Netlify Dashboard 中检查环境变量：
- 变量名: `GITHUB_TOKEN`
- 值: 您的 GitHub Personal Access Token

**获取 GitHub Token 的步骤：**
1. 访问 https://github.com/settings/tokens
2. 点击 "Generate new token" -> "Generate new token (classic)"
3. 设置权限：
   - `public_repo` (访问公共仓库)
   - `repo` (如果需要访问私有仓库)
4. 复制生成的 Token

### 2. 仓库名称验证
确认以下仓库存在且为公共仓库：
- `Chenlongx/gogole_maps`
- `Chenlongx/email_validator_repo`
- `Chenlongx/whatsapp_validator_repo`

## 测试步骤

### 1. 使用测试页面
1. 访问 `test-github-api.html`
2. 点击 "测试所有仓库" 按钮
3. 查看测试结果

### 2. 直接测试 API 端点
```bash
# 测试单个仓库
curl "https://mediamingle.cn/api/github/Chenlongx/gogole_maps/releases/latest"

# 检查响应头
curl -I "https://mediamingle.cn/api/github/Chenlongx/gogole_maps/releases/latest"
```

### 3. 检查 Netlify 函数日志
1. 登录 Netlify Dashboard
2. 进入 "Functions" 页面
3. 查看 `github` 函数的日志

## 常见解决方案

### 方案 1: 配置 GitHub Token
如果测试显示 403 错误，最可能的原因是缺少 GitHub Token：

1. 在 Netlify Dashboard 中设置 `GITHUB_TOKEN` 环境变量
2. 重新部署站点
3. 测试 API 端点

### 方案 2: 检查仓库权限
如果仓库为私有或不存在：

1. 确认仓库名称正确
2. 确认仓库为公共仓库
3. 或者使用具有访问权限的 GitHub Token

### 方案 3: 处理速率限制
如果遇到 429 错误（速率限制）：

1. 代码中已实现重试机制
2. 可以增加重试延迟时间
3. 考虑使用更高级的 GitHub Token

## 部署后验证

### 1. 检查重定向规则
访问以下 URL 应该返回 GitHub API 数据：
```
https://mediamingle.cn/api/github/Chenlongx/gogole_maps/releases/latest
```

### 2. 检查下载页面
访问 `download.html` 页面，应该不再出现 403 错误。

### 3. 检查控制台
浏览器控制台应该显示成功获取版本信息，而不是错误信息。

## 故障排除

### 如果仍然出现 403 错误：
1. 检查 GitHub Token 是否正确设置
2. 确认 Token 有正确的权限
3. 检查仓库是否存在且为公共仓库
4. 查看 Netlify 函数日志获取详细错误信息

### 如果出现其他错误：
1. 检查网络连接
2. 确认 Netlify 函数部署成功
3. 检查 `netlify.toml` 配置是否正确

## 联系支持

如果问题仍然存在，请提供：
1. 测试页面的输出结果
2. Netlify 函数日志
3. 浏览器控制台的完整错误信息
