/**
 * China Download Proxy for 123云盘
 * 
 * 为中国用户提供无缝下载体验：
 * 1. 服务器访问 123云盘分享页面
 * 2. 解析页面获取真实下载 URL
 * 3. 302 跳转给用户
 * 
 * 用户体验：点一下 = 直接下载，链接永远不变
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// 产品配置：分享链接映射
const PRODUCT_SHARE_LINKS = {
    'google-maps-scraper': {
        url: 'https://www.123865.com/s/71mwjv-axCl',  // EXE 下载链接
        name: '谷歌地图抓取器',
        password: ''
    },
    'google-maps-scraper-zip': {
        url: 'https://www.123865.com/s/71mwjv-fxCl',  // ZIP 备用下载链接
        name: '谷歌地图抓取器(ZIP)',
        password: ''
    },
    'whatsapp-marketing': {
        url: 'https://www.123865.com/s/71mwjv-BxCl',  // EXE 下载链接
        name: 'WhatsApp智能营销助手',
        password: ''
    },
    'whatsapp-marketing-zip': {
        url: 'https://www.123865.com/s/71mwjv-IxCl',  // ZIP 备用下载链接
        name: 'WhatsApp智能营销助手(ZIP)',
        password: ''
    }
    // 可以添加更多产品
};

// 第三方解析 API 列表（按优先级排序，会依次尝试）
const PARSE_APIS = [
    {
        name: '素颜API',
        buildUrl: (shareUrl, password) => {
            const baseUrl = 'https://api.suyanw.cn/api/123pan.php';
            const params = new URLSearchParams({ url: shareUrl });
            if (password) params.append('password', password);
            return `${baseUrl}?${params.toString()}`;
        },
        parseResponse: (data) => {
            // 素颜API 实际返回格式: { code: 200, file_name: "...", url: "..." }
            if (data.code === 200 && data.url) {
                return {
                    downloadUrl: data.url,
                    filename: data.file_name || null
                };
            }
            return null;
        }
    },
    {
        name: '觅知API',
        buildUrl: (shareUrl, password) => {
            const baseUrl = 'https://api.98dou.cn/api/pan/123pan';
            const params = new URLSearchParams({ url: shareUrl });
            if (password) params.append('pwd', password);
            return `${baseUrl}?${params.toString()}`;
        },
        parseResponse: (data) => {
            // 觅知API 返回格式: { code: 200, data: { download_url: "..." } }
            if (data.code === 200 && data.data && data.data.download_url) {
                return { downloadUrl: data.data.download_url, filename: data.data.file_name || null };
            }
            if (data.code === 200 && data.url) {
                return { downloadUrl: data.url, filename: data.file_name || null };
            }
            return null;
        }
    },
    {
        name: 'Pearktrue API',
        buildUrl: (shareUrl, password) => {
            const baseUrl = 'https://api.pearktrue.cn/api/123panparse/';
            const params = new URLSearchParams({ url: shareUrl });
            if (password) params.append('pwd', password);
            return `${baseUrl}?${params.toString()}`;
        },
        parseResponse: (data) => {
            // Pearktrue API 返回格式可能不同
            if (data.code === 200 && data.data && data.data.download_url) {
                return { downloadUrl: data.data.download_url, filename: data.data.file_name || null };
            }
            if (data.code === 200 && data.url) {
                return { downloadUrl: data.url, filename: data.file_name || null };
            }
            if (data.download_url) {
                return { downloadUrl: data.download_url, filename: data.file_name || null };
            }
            return null;
        }
    }
];

/**
 * 发送 HTTP 请求获取数据
 */
function fetchUrl(url, timeout = 15000) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const requestModule = parsedUrl.protocol === 'https:' ? https : http;

        const req = requestModule.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
            },
            timeout: timeout
        }, (response) => {
            // 处理重定向
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                return fetchUrl(response.headers.location, timeout).then(resolve).catch(reject);
            }

            if (response.statusCode < 200 || response.statusCode >= 300) {
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }

            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    // 如果不是 JSON，返回原始数据
                    resolve({ raw: data });
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

/**
 * 尝试使用多个 API 解析下载链接
 */
async function parseDownloadUrl(shareUrl, password = '') {
    console.log(`开始解析 123云盘链接: ${shareUrl}`);

    for (const api of PARSE_APIS) {
        try {
            const apiUrl = api.buildUrl(shareUrl, password);
            console.log(`尝试 ${api.name}: ${apiUrl}`);

            const response = await fetchUrl(apiUrl, 10000); // 10秒超时
            console.log(`${api.name} 响应:`, JSON.stringify(response).substring(0, 200));

            const parseResult = api.parseResponse(response);

            if (parseResult) {
                // 统一处理返回格式（对象或字符串）
                const downloadUrl = typeof parseResult === 'string' ? parseResult : parseResult.downloadUrl;
                const filename = typeof parseResult === 'object' ? parseResult.filename : null;

                console.log(`✅ ${api.name} 解析成功: ${downloadUrl.substring(0, 100)}...`);
                return {
                    success: true,
                    url: downloadUrl,
                    filename: filename,
                    api: api.name
                };
            } else {
                console.log(`⚠️ ${api.name} 未返回有效下载链接`);
            }
        } catch (error) {
            console.error(`❌ ${api.name} 失败:`, error.message);
        }
    }

    return {
        success: false,
        error: '所有 API 均无法解析下载链接'
    };
}

exports.handler = async (event, context) => {
    // CORS 头
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };

    // 处理预检请求
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: ''
        };
    }

    // 只允许 GET 请求
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        // 获取产品标识
        const product = event.queryStringParameters?.product || 'google-maps-scraper';
        const action = event.queryStringParameters?.action || 'redirect'; // redirect 或 json

        // 查找产品配置
        const productConfig = PRODUCT_SHARE_LINKS[product];

        if (!productConfig) {
            return {
                statusCode: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    error: 'Product not found',
                    available: Object.keys(PRODUCT_SHARE_LINKS)
                })
            };
        }

        console.log(`处理产品下载请求: ${product} (${productConfig.name})`);

        // 解析下载链接
        const result = await parseDownloadUrl(productConfig.url, productConfig.password);

        if (!result.success) {
            console.error('解析失败:', result.error);

            // 如果所有 API 都失败，返回原始分享链接（让用户手动下载）
            if (action === 'json') {
                return {
                    statusCode: 503,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        success: false,
                        error: result.error,
                        fallback_url: productConfig.url,
                        message: '请直接访问分享链接下载'
                    })
                };
            }

            // 重定向到原始分享页面
            return {
                statusCode: 302,
                headers: {
                    ...corsHeaders,
                    'Location': productConfig.url,
                    'Cache-Control': 'no-cache, no-store, must-revalidate'
                },
                body: ''
            };
        }

        // 解析成功
        console.log(`✅ 解析成功，准备跳转: ${result.url.substring(0, 100)}...`);

        if (action === 'json') {
            return {
                statusCode: 200,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                    'Cache-Control': 'public, max-age=300' // 缓存5分钟
                },
                body: JSON.stringify({
                    success: true,
                    download_url: result.url,
                    api_used: result.api,
                    product: productConfig.name
                })
            };
        }

        // 302 跳转到真实下载链接
        // 使用 API 返回的文件名（如果有的话）
        const downloadFilename = result.filename || `${productConfig.name}.zip`;

        return {
            statusCode: 302,
            headers: {
                ...corsHeaders,
                'Location': result.url,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Content-Disposition': `attachment; filename="${encodeURIComponent(downloadFilename)}"`
            },
            body: ''
        };

    } catch (error) {
        console.error('Function error:', error);
        return {
            statusCode: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message
            })
        };
    }
};
