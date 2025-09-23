const https = require('https');

exports.handler = async (event, context) => {
    // 设置 CORS 头部
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
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

        // 使用 Promise 包装 https.get
        const response = await new Promise((resolve, reject) => {
            const request = https.get(githubUrl, {
                headers: {
                    'User-Agent': 'Netlify-Function',
                    'Accept': 'application/vnd.github.v3+json'
                }
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
