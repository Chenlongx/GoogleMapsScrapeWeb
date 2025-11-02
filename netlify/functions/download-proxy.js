const https = require('https');
const http = require('http');
const { URL } = require('url');
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
                'Content-Type': 'text/plain'
            },
            body: securityCheck.body
        };
    }

    // 处理预检请求
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                ...security.getSecurityHeaders()
            },
            body: ''
        };
    }

    // 只允许 GET 请求
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json',
                ...security.getSecurityHeaders()
            },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        // 从查询参数获取下载 URL
        const downloadUrl = event.queryStringParameters?.url;
        
        if (!downloadUrl) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json',
                    ...security.getSecurityHeaders()
                },
                body: JSON.stringify({ error: 'Missing url parameter' })
            };
        }

        // 验证 URL 是否为 GitHub 或允许的域名
        let parsedUrl;
        try {
            parsedUrl = new URL(downloadUrl);
        } catch (e) {
            return {
                statusCode: 400,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json',
                    ...security.getSecurityHeaders()
                },
                body: JSON.stringify({ error: 'Invalid URL format' })
            };
        }

        // 只允许从 GitHub 或 ghfast.top 下载（安全性检查）
        const allowedHosts = ['github.com', 'githubusercontent.com', 'ghfast.top'];
        if (!allowedHosts.some(host => parsedUrl.hostname.includes(host))) {
            return {
                statusCode: 403,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'application/json',
                    ...security.getSecurityHeaders()
                },
                body: JSON.stringify({ error: 'Download source not allowed' })
            };
        }

        console.log(`Proxying download from: ${downloadUrl}`);

        // 对于大文件（几百MB），Netlify Functions 无法处理
        // 我们需要先发送 HEAD 请求检查文件大小，如果太大直接重定向
        return new Promise((resolve, reject) => {
            const requestModule = parsedUrl.protocol === 'https:' ? https : http;
            
            // 先发送 HEAD 请求检查文件大小
            const headRequest = requestModule.request(downloadUrl, {
                method: 'HEAD',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; Netlify-Download-Proxy/1.0)',
                    'Accept': '*/*'
                },
                timeout: 10000 // 10秒超时
            }, (headResponse) => {
                const contentLength = parseInt(headResponse.headers['content-length'] || '0');
                const MAX_SIZE = 5 * 1024 * 1024; // 5MB - Netlify Functions 限制
                
                // 如果文件太大或无法确定大小（可能是大文件），直接重定向
                if (contentLength > MAX_SIZE || contentLength === 0) {
                    // 从 URL 提取文件名
                    const urlPath = parsedUrl.pathname;
                    let filename = 'download.exe';
                    const urlFilename = urlPath.split('/').pop();
                    if (urlFilename && urlFilename.includes('.')) {
                        filename = decodeURIComponent(urlFilename);
                    }
                    
                    console.log(`File too large (${contentLength} bytes) or size unknown, redirecting immediately`);
                    return resolve({
                        statusCode: 307,
                        headers: {
                            'Location': downloadUrl,
                            'Access-Control-Allow-Origin': '*',
                            'Content-Disposition': `attachment; filename="${filename}"`,
                            ...security.getSecurityHeaders()
                        },
                        body: ''
                    });
                }
                
                // 如果文件大小合适，继续下载
                startDownload();
            });
            
            headRequest.on('error', (error) => {
                console.warn('HEAD request failed, proceeding with GET:', error.message);
                // HEAD 失败，直接尝试下载（可能是服务器不支持 HEAD）
                startDownload();
            });
            
            headRequest.on('timeout', () => {
                headRequest.destroy();
                console.warn('HEAD request timeout, proceeding with GET');
                startDownload();
            });
            
            headRequest.end();
            
            // 实际的下载逻辑
            function startDownload() {
                const request = requestModule.get(downloadUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; Netlify-Download-Proxy/1.0)',
                        'Accept': '*/*'
                    },
                    timeout: 60000 // 60秒超时
                }, (response) => {
                // 检查响应状态（允许重定向状态码）
                if (response.statusCode < 200 || response.statusCode >= 400) {
                    // 3xx 重定向状态码应该被跟随，不应该返回错误
                    if (response.statusCode >= 300 && response.statusCode < 400) {
                        // 跟随重定向
                        const redirectUrl = response.headers.location || downloadUrl;
                        return resolve({
                            statusCode: 307,
                            headers: {
                                'Location': redirectUrl,
                                'Access-Control-Allow-Origin': '*',
                                ...security.getSecurityHeaders()
                            },
                            body: ''
                        });
                    }
                    return resolve({
                        statusCode: response.statusCode,
                        headers: {
                            'Access-Control-Allow-Origin': '*',
                            'Content-Type': 'application/json',
                            ...security.getSecurityHeaders()
                        },
                        body: JSON.stringify({ 
                            error: 'Download failed',
                            statusCode: response.statusCode
                        })
                    });
                }

                // 获取文件名（如果可能）
                const contentDisposition = response.headers['content-disposition'];
                let filename = 'download.exe';
                
                // 尝试从 URL 或 Content-Disposition 提取文件名
                if (contentDisposition) {
                    const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                    if (filenameMatch) {
                        filename = filenameMatch[1].replace(/['"]/g, '');
                    }
                } else {
                    // 从 URL 提取文件名
                    const urlPath = parsedUrl.pathname;
                    const urlFilename = urlPath.split('/').pop();
                    if (urlFilename && urlFilename.includes('.')) {
                        filename = decodeURIComponent(urlFilename);
                    }
                }

                // 检查文件大小（Netlify Functions 响应体限制约为 6MB）
                const contentLength = parseInt(response.headers['content-length'] || '0');
                const MAX_SIZE = 5 * 1024 * 1024; // 5MB - 保守限制

                // 如果文件太大，使用 307 临时重定向到原始 URL
                if (contentLength > MAX_SIZE) {
                    console.log(`File too large (${contentLength} bytes), redirecting to original URL`);
                    return resolve({
                        statusCode: 307,
                        headers: {
                            'Location': downloadUrl,
                            'Access-Control-Allow-Origin': '*',
                            'Content-Disposition': `attachment; filename="${filename}"`,
                            ...security.getSecurityHeaders()
                        },
                        body: ''
                    });
                }

                // 收集响应数据
                const chunks = [];
                let totalSize = 0;
                
                response.on('data', (chunk) => {
                    totalSize += chunk.length;
                    // 如果累积大小超过限制，中止并重定向到原始 URL
                    if (totalSize > MAX_SIZE) {
                        request.destroy();
                        console.log(`File too large during download (${totalSize} bytes), redirecting`);
                        return resolve({
                            statusCode: 307,
                            headers: {
                                'Location': downloadUrl,
                                'Access-Control-Allow-Origin': '*',
                                'Content-Disposition': `attachment; filename="${filename}"`,
                                ...security.getSecurityHeaders()
                            },
                            body: ''
                        });
                    }
                    chunks.push(chunk);
                });
                
                response.on('end', () => {
                    const buffer = Buffer.concat(chunks);
                    
                    // 最终大小检查
                    if (buffer.length > MAX_SIZE) {
                        console.log(`File too large after download (${buffer.length} bytes), redirecting`);
                        return resolve({
                            statusCode: 307,
                            headers: {
                                'Location': downloadUrl,
                                'Access-Control-Allow-Origin': '*',
                                'Content-Disposition': `attachment; filename="${filename}"`,
                                ...security.getSecurityHeaders()
                            },
                            body: ''
                        });
                    }
                    
                    // 确定 Content-Type
                    const contentType = response.headers['content-type'] || 
                                       (filename.endsWith('.exe') ? 'application/octet-stream' : 
                                        filename.endsWith('.zip') ? 'application/zip' : 
                                        'application/octet-stream');

                    // 返回文件，设置正确的下载头
                    // 关键是 Content-Disposition header，这会让浏览器将文件下载而不是阻止
                    resolve({
                        statusCode: 200,
                        headers: {
                            'Access-Control-Allow-Origin': '*',
                            'Content-Type': contentType,
                            'Content-Disposition': `attachment; filename="${filename}"`,
                            'Content-Length': buffer.length.toString(),
                            'Cache-Control': 'public, max-age=3600',
                            // 添加额外的安全头，让浏览器信任下载
                            'X-Content-Type-Options': 'nosniff',
                            ...security.getSecurityHeaders()
                        },
                        body: buffer.toString('base64'),
                        isBase64Encoded: true
                    });
                }); // 结束 response.on('end')
            }); // 结束 requestModule.get 的回调
                
            request.on('error', (error) => {
                console.error('Download proxy error:', error);
                reject({
                    statusCode: 500,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'application/json',
                        ...security.getSecurityHeaders()
                    },
                    body: JSON.stringify({ 
                        error: 'Download failed', 
                        message: error.message 
                    })
                });
            });

            request.on('timeout', () => {
                request.destroy();
                reject({
                    statusCode: 504,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Content-Type': 'application/json',
                        ...security.getSecurityHeaders()
                    },
                    body: JSON.stringify({ error: 'Download timeout' })
                });
            });
            } // 结束 startDownload 函数
        }); // 结束 Promise

    } catch (error) {
        console.error('Function error:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json',
                ...security.getSecurityHeaders()
            },
            body: JSON.stringify({ 
                error: 'Internal server error',
                message: error.message 
            })
        };
    }
};

