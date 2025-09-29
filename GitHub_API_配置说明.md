# GitHub API 配置说明

## 问题描述
前端直接请求 GitHub API 时遇到 403 错误，这是因为 GitHub API 对未认证的请求有严格的速率限制。

## 解决方案
已实现后端代理功能，通过 Netlify Functions 代理 GitHub API 请求，避免前端直接暴露 Token。

## 配置步骤

### 1. 获取 GitHub Personal Access Token
1. 访问 GitHub Settings: https://github.com/settings/tokens
2. 点击 "Generate new token" -> "Generate new token (classic)"
3. 设置 Token 名称，如 "Netlify Functions API"
4. 选择权限范围：
   - `public_repo` (访问公共仓库)
   - `repo` (如果需要访问私有仓库)
5. 点击 "Generate token"
6. 复制生成的 Token（只显示一次）

### 2. 在 Netlify 中配置环境变量
1. 登录 Netlify Dashboard
2. 选择您的站点
3. 进入 "Site settings" -> "Environment variables"
4. 添加新的环境变量：
   - **Name**: `GITHUB_TOKEN`
   - **Value**: 您刚才复制的 GitHub Token
5. 点击 "Save"

### 3. 重新部署站点
配置环境变量后，需要重新部署站点以使配置生效：
1. 在 Netlify Dashboard 中点击 "Deploys"
2. 点击 "Trigger deploy" -> "Deploy site"

## 功能特性

### 后端代理功能
- ✅ 支持 GitHub API 认证
- ✅ 智能错误处理
- ✅ 速率限制检测
- ✅ CORS 支持

### 前端重试机制
- ✅ 指数退避重试策略
- ✅ 速率限制特殊处理
- ✅ 用户友好的错误提示
- ✅ 多语言支持

## API 端点
- 本地开发: `/.netlify/functions/github/{username}/{repo}/releases/latest`
- 生产环境: `/api/github/{username}/{repo}/releases/latest`

## 错误处理
- **403 Forbidden**: 访问被拒绝，可能是仓库不存在或访问限制
- **429 Too Many Requests**: API 请求频率超限，会自动重试
- **其他错误**: 通用错误处理，提供友好的错误信息

## 测试方法
1. 配置完成后，访问下载页面
2. 检查浏览器控制台，应该不再出现 403 错误
3. 版本信息应该正常显示
4. 下载链接应该正常工作

## 注意事项
- GitHub Token 请妥善保管，不要提交到代码仓库
- 定期检查 Token 的有效性
- 如果遇到问题，可以查看 Netlify Functions 的日志
