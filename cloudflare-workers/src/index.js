/**
 * Email Finder API Proxy - Cloudflare Workers
 * 
 * 功能：
 * 1. JWT 本地验证（减少 Netlify 调用）
 * 2. 会话验证缓存（5 分钟）
 * 3. 请求转发到 Netlify
 * 4. GitHub 文件下载代理（通过自定义域名下载）
 */

// ==========================================
// 配置
// ==========================================
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const GITHUB_USERNAME = 'Chenlongx';

// ==========================================
// 主处理函数
// ==========================================
export default {
    async fetch(request, env, ctx) {
        // 处理 CORS 预检
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: CORS_HEADERS });
        }

        const url = new URL(request.url);
        const path = url.pathname;

        try {
            // 路由分发
            if (path.startsWith('/download/')) {
                // 🆕 GitHub 文件下载代理
                return await handleDownload(request, path);
            } else if (path.startsWith('/api/github/')) {
                // GitHub API 代理
                return await handleGitHubApi(request, path);
            } else if (path === '/api/auth/verify-token') {
                // 使用缓存的会话验证
                return await handleVerifyToken(request, env);
            } else if (path.startsWith('/api/')) {
                // 其他 API 直接转发到 Netlify
                return await forwardToNetlify(request, env, path);
            } else {
                return new Response(JSON.stringify({ error: 'Not Found' }), {
                    status: 404,
                    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
                });
            }
        } catch (error) {
            console.error('Worker error:', error);
            return new Response(JSON.stringify({
                success: false,
                message: '服务器错误',
                error: error.message
            }), {
                status: 500,
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
            });
        }
    }
};

// ==========================================
// 🆕 GitHub 文件下载代理
// URL 格式: /download/{repo}/{tag}/{filename}
// 例如: /download/gogole_maps/v1.0.7/Maps.Scraper.Setup.v1.0.7.exe
// ==========================================
async function handleDownload(request, path) {
    // 解析路径: /download/repo/tag/filename
    const parts = path.replace('/download/', '').split('/');

    if (parts.length < 3) {
        return new Response(JSON.stringify({
            error: 'Invalid URL format',
            expected: '/download/{repo}/{tag}/{filename}',
            example: '/download/gogole_maps/v1.0.7/Setup.exe'
        }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
    }

    const repo = parts[0];
    const tag = parts[1];
    // filename 可能包含 / (虽然不常见)，所以用 slice 拼接剩余部分
    const filename = parts.slice(2).join('/');

    // 构造 GitHub 下载 URL
    const githubUrl = `https://github.com/${GITHUB_USERNAME}/${repo}/releases/download/${tag}/${filename}`;

    console.log(`📥 Proxying download: ${githubUrl}`);

    try {
        // 向 GitHub 发起请求，跟随重定向
        const response = await fetch(githubUrl, {
            method: request.method,
            headers: {
                'User-Agent': 'Cloudflare-Worker-Download-Proxy',
            },
            redirect: 'follow', // 跟随 302 重定向到 AWS S3
        });

        if (!response.ok) {
            console.error(`GitHub download failed: ${response.status}`);
            return new Response(JSON.stringify({
                error: 'Download failed',
                status: response.status,
                url: githubUrl
            }), {
                status: response.status,
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
            });
        }

        // 创建新的响应头
        const newHeaders = new Headers();

        // 复制必要的响应头
        const headersToForward = ['content-type', 'content-length', 'content-disposition', 'etag', 'last-modified'];
        headersToForward.forEach(header => {
            const value = response.headers.get(header);
            if (value) {
                newHeaders.set(header, value);
            }
        });

        // 如果没有 Content-Disposition，添加一个以便触发下载
        if (!newHeaders.has('content-disposition')) {
            newHeaders.set('Content-Disposition', `attachment; filename="${filename}"`);
        }

        // 添加 CORS 头
        Object.entries(CORS_HEADERS).forEach(([key, value]) => {
            newHeaders.set(key, value);
        });

        // 返回文件流
        return new Response(response.body, {
            status: 200,
            headers: newHeaders
        });

    } catch (error) {
        console.error('Download proxy error:', error);
        return new Response(JSON.stringify({
            error: 'Proxy error',
            message: error.message
        }), {
            status: 500,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
    }
}

// ==========================================
// GitHub API 代理
// URL 格式: /api/github/{path}
// ==========================================
async function handleGitHubApi(request, path) {
    const githubPath = path.replace('/api/github/', '');
    const githubApiUrl = `https://api.github.com/repos/${githubPath}`;

    const response = await fetch(githubApiUrl, {
        headers: {
            'User-Agent': 'Cloudflare-Worker-Proxy',
            'Accept': 'application/vnd.github.v3+json',
        },
    });

    const newHeaders = new Headers(response.headers);
    Object.entries(CORS_HEADERS).forEach(([key, value]) => {
        newHeaders.set(key, value);
    });

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
    });
}

// ==========================================
// 会话验证（带缓存）
// ==========================================
async function handleVerifyToken(request, env) {
    const authHeader = request.headers.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({
            success: false,
            message: '缺少认证令牌'
        }), { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    const token = authHeader.substring(7);
    const cacheKey = `session:${token.substring(0, 32)}`;
    const cacheTtl = parseInt(env.CACHE_TTL) || 300;

    // 1. 先检查缓存
    try {
        const cached = await env.SESSION_CACHE.get(cacheKey);
        if (cached) {
            console.log('✅ 命中缓存');
            const cachedData = JSON.parse(cached);

            // 检查是否被踢出（每次都需要验证）
            if (cachedData.kicked) {
                return new Response(JSON.stringify(cachedData), {
                    status: 401,
                    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
                });
            }

            return new Response(cached, {
                status: 200,
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
            });
        }
    } catch (e) {
        console.error('Cache read error:', e);
    }

    // 2. 本地验证 JWT 签名
    const jwtResult = await verifyJWT(token, env.JWT_SECRET);
    if (!jwtResult.valid) {
        return new Response(JSON.stringify({
            success: false,
            message: '无效或过期的令牌'
        }), { status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
    }

    // 3. 转发到 Netlify 进行完整验证（包括单设备检查）
    const netlifyResponse = await forwardToNetlify(request, env, '/auth-verify-token');
    const responseData = await netlifyResponse.json();

    // 4. 缓存结果（除非是被踢出的情况，那不缓存）
    if (responseData.success && !responseData.kicked) {
        try {
            await env.SESSION_CACHE.put(cacheKey, JSON.stringify(responseData), {
                expirationTtl: cacheTtl
            });
            console.log('📦 已缓存验证结果');
        } catch (e) {
            console.error('Cache write error:', e);
        }
    }

    return new Response(JSON.stringify(responseData), {
        status: netlifyResponse.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
}

// ==========================================
// 转发请求到 Netlify
// ==========================================
async function forwardToNetlify(request, env, path) {
    // 构建 Netlify URL
    const netlifyPath = path.replace('/api/', '');
    const netlifyUrl = `${env.NETLIFY_API_BASE}/${netlifyPath}`;

    // 克隆请求头
    const headers = new Headers(request.headers);
    headers.set('X-Forwarded-For', request.headers.get('CF-Connecting-IP') || '');

    // 转发请求
    const response = await fetch(netlifyUrl, {
        method: request.method,
        headers: headers,
        body: request.method !== 'GET' && request.method !== 'HEAD'
            ? await request.text()
            : undefined
    });

    // 返回响应
    const responseBody = await response.text();
    return new Response(responseBody, {
        status: response.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
}

// ==========================================
// JWT 本地验证
// ==========================================
async function verifyJWT(token, secret) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) {
            return { valid: false, error: 'Invalid token format' };
        }

        const [headerB64, payloadB64, signatureB64] = parts;

        // 解码 payload
        const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));

        // 检查过期时间
        if (payload.exp && payload.exp < Date.now() / 1000) {
            return { valid: false, error: 'Token expired' };
        }

        // 验证签名（使用 Web Crypto API）
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['verify']
        );

        const signatureInput = encoder.encode(`${headerB64}.${payloadB64}`);
        const signature = Uint8Array.from(
            atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/')),
            c => c.charCodeAt(0)
        );

        const valid = await crypto.subtle.verify('HMAC', key, signature, signatureInput);

        return { valid, payload };
    } catch (error) {
        console.error('JWT verification error:', error);
        return { valid: false, error: error.message };
    }
}

