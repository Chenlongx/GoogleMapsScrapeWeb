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
        const headers = {
            'User-Agent': 'Netlify-Function',
            'Accept': 'application/vnd.github.v3+json'
        };
        
        // 如果环境变量中有 GitHub Token，则添加到请求头中
        if (process.env.GITHUB_TOKEN) {
            headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
        }

        // 使用 Promise 包装 https.get
        const response = await new Promise((resolve, reject) => {
            const request = https.get(githubUrl, {
                headers: headers
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
            
            // 对于 403 错误，提供更友好的错误信息
            if (response.statusCode === 403) {
                try {
                    const errorData = JSON.parse(response.data);
                    if (errorData.message && errorData.message.includes('API rate limit')) {
                        return {
                            statusCode: 429,
                            headers,
                            body: JSON.stringify({
                                error: 'API rate limit exceeded',
                                message: 'GitHub API 请求频率超限，请稍后重试',
                                retry_after: errorData.retry_after || 60
                            })
                        };
                    }
                } catch (e) {
                    // 如果解析失败，继续使用原始错误
                }
                
                return {
                    statusCode: 403,
                    headers,
                    body: JSON.stringify({
                        error: 'Access forbidden',
                        message: 'GitHub API 访问被拒绝，可能是由于访问限制或仓库不存在',
                        suggestion: '请检查仓库名称是否正确，或稍后重试'
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
