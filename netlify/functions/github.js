const https = require('https');
const security = require('./security-middleware');

exports.handler = async (event, context) => {
    // 执行安全检查
    const securityCheck = security.performSecurityCheck(event);
    if (!securityCheck.allowed) {
        return {
            statusCode: securityCheck.statusCode,
            headers: {
                ...security.getSecurityHeaders(),
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: securityCheck.body
        };
    }

    // 设置 CORS 头部和安全头部
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json',
        ...security.getSecurityHeaders()
    };

    // 处理预检请求
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    // 只允许 GET 请求
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        // 从路径中提取用户名和仓库名
        // 处理不同的路径格式：/.netlify/functions/github/username/repo/... 或 /api/github/username/repo/...
        let path = event.path;
        
        // 移除函数路径前缀
        if (path.startsWith('/.netlify/functions/github/')) {
            path = path.replace('/.netlify/functions/github/', '');
        } else if (path.startsWith('/api/github/')) {
            path = path.replace('/api/github/', '');
        } else {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid path format. Expected: /api/github/username/repo/releases/latest' })
            };
        }
        
        const pathParts = path.split('/').filter(part => part.length > 0);
        
        if (pathParts.length < 3) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Invalid path format. Expected: /api/github/username/repo/releases/latest' })
            };
        }

        const username = pathParts[0];
        const repo = pathParts[1];
        const endpoint = pathParts.slice(2).join('/');

        // 构建 GitHub API URL
        const githubUrl = `https://api.github.com/repos/${username}/${repo}/${endpoint}`;
        
        console.log(`Fetching GitHub API: ${username}/${repo}/${endpoint}`);

        // 准备请求头，包含认证 Token（如果存在）
        const requestHeaders = {
            'User-Agent': 'Netlify-Function',
            'Accept': 'application/vnd.github.v3+json'
        };
        
        // 如果环境变量中有 GitHub Token，则添加到请求头中
        if (process.env.GITHUB_TOKEN) {
            requestHeaders['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
            console.log('Using authenticated GitHub API request');
        } else {
            console.warn('⚠️ No GITHUB_TOKEN found, using unauthenticated API (rate limit: 60 req/hour)');
        }

        // 使用 Promise 包装 https.get
        const response = await new Promise((resolve, reject) => {
            const request = https.get(githubUrl, {
                headers: requestHeaders
            }, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        data: data
                    });
                });
            });

            request.on('error', (error) => {
                reject(error);
            });

            request.setTimeout(10000, () => {
                request.destroy();
                reject(new Error('Request timeout'));
            });
        });

        // 如果 GitHub API 返回错误状态码
        if (response.statusCode >= 400) {
            console.error('GitHub API error:', response.statusCode, response.data);
            
            // 提取 GitHub 的 rate limit 信息
            const rateLimitRemaining = response.headers['x-ratelimit-remaining'];
            const rateLimitReset = response.headers['x-ratelimit-reset'];
            
            // 对于 403 错误，提供更友好的错误信息
            if (response.statusCode === 403) {
                try {
                    const errorData = JSON.parse(response.data);
                    
                    // 检查是否是 rate limit 错误
                    if (errorData.message && (errorData.message.includes('API rate limit') || rateLimitRemaining === '0')) {
                        const resetTime = rateLimitReset ? new Date(parseInt(rateLimitReset) * 1000).toLocaleString('zh-CN') : '未知';
                        return {
                            statusCode: 429,
                            headers,
                            body: JSON.stringify({
                                error: 'API rate limit exceeded',
                                message: 'GitHub API 请求频率超限，请稍后重试',
                                details: `API 限额已用完，将在 ${resetTime} 重置`,
                                retry_after: rateLimitReset ? Math.max(60, parseInt(rateLimitReset) - Math.floor(Date.now() / 1000)) : 60,
                                suggestion: '建议管理员配置 GITHUB_TOKEN 环境变量以提高速率限制'
                            })
                        };
                    }
                    
                    // 检查是否是私有仓库或不存在的仓库
                    if (errorData.message && errorData.message.includes('Not Found')) {
                        return {
                            statusCode: 404,
                            headers,
                            body: JSON.stringify({
                                error: 'Repository not found',
                                message: '仓库不存在或无法访问',
                                suggestion: '请检查仓库名称是否正确，或确认仓库是公开的'
                            })
                        };
                    }
                } catch (e) {
                    // 如果解析失败，继续使用原始错误
                    console.error('Failed to parse error response:', e);
                }
                
                return {
                    statusCode: 403,
                    headers,
                    body: JSON.stringify({
                        error: 'Access forbidden',
                        message: 'GitHub API 访问被拒绝',
                        suggestion: '可能是由于访问限制或仓库不存在，建议检查仓库设置或稍后重试',
                        rateLimitRemaining: rateLimitRemaining || 'unknown'
                    })
                };
            }
            
            // 对于 404 错误
            if (response.statusCode === 404) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({
                        error: 'Not found',
                        message: '请求的资源不存在',
                        suggestion: '请检查仓库名称和发布版本是否正确'
                    })
                };
            }
            
            return {
                statusCode: response.statusCode,
                headers,
                body: response.data
            };
        }

        // 返回成功响应
        return {
            statusCode: 200,
            headers,
            body: response.data
        };

    } catch (error) {
        console.error('Function error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Internal server error',
                message: error.message 
            })
        };
    }
};
