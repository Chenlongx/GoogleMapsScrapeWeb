// 安全中间件 - 防止恶意攻击和端口滥用
// 提供速率限制、IP 过滤、请求验证等功能

// 内存存储（在生产环境中建议使用 Redis 或数据库）
const requestCounts = new Map();
const blockedIPs = new Set();
const suspiciousIPs = new Map();

// 配置参数
const SECURITY_CONFIG = {
    // 速率限制配置
    RATE_LIMIT: {
        WINDOW_MS: 15 * 60 * 1000, // 15分钟窗口
        MAX_REQUESTS: 100, // 每个IP在窗口期内最大请求数
        BURST_LIMIT: 10, // 突发请求限制（1分钟内）
        BURST_WINDOW_MS: 60 * 1000 // 1分钟突发窗口
    },
    
    // IP 黑名单配置
    IP_BLOCKING: {
        AUTO_BLOCK_THRESHOLD: 200, // 超过此数量自动封禁
        BLOCK_DURATION_MS: 60 * 60 * 1000, // 封禁1小时
        SUSPICIOUS_THRESHOLD: 50 // 可疑行为阈值
    },
    
    // 请求验证配置
    REQUEST_VALIDATION: {
        MAX_CONTENT_LENGTH: 1024 * 1024, // 1MB
        ALLOWED_METHODS: ['GET', 'POST', 'OPTIONS'],
        REQUIRED_HEADERS: ['user-agent'],
        BLOCKED_USER_AGENTS: [
            'curl', 'wget', 'python-requests', 'bot', 'crawler', 'spider'
        ]
    }
};

/**
 * 获取客户端真实IP地址
 */
function getClientIP(event) {
    // 检查各种可能的IP头
    const headers = event.headers || {};
    return headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           headers['x-real-ip'] ||
           headers['x-client-ip'] ||
           headers['cf-connecting-ip'] || // Cloudflare
           headers['x-cluster-client-ip'] ||
           event.requestContext?.identity?.sourceIp ||
           'unknown';
}

/**
 * 检查IP是否在黑名单中
 */
function isIPBlocked(ip) {
    if (blockedIPs.has(ip)) {
        return true;
    }
    
    // 检查可疑IP列表中的过期封禁
    const suspiciousData = suspiciousIPs.get(ip);
    if (suspiciousData && suspiciousData.blockedUntil > Date.now()) {
        return true;
    }
    
    return false;
}

/**
 * 记录请求并检查速率限制
 */
function checkRateLimit(ip) {
    const now = Date.now();
    
    // 清理过期的请求记录
    cleanupExpiredRequests(now);
    
    // 获取或创建IP的请求记录
    if (!requestCounts.has(ip)) {
        requestCounts.set(ip, {
            requests: [],
            burstRequests: []
        });
    }
    
    const ipData = requestCounts.get(ip);
    
    // 检查突发请求限制
    const recentBurstRequests = ipData.burstRequests.filter(
        timestamp => now - timestamp < SECURITY_CONFIG.RATE_LIMIT.BURST_WINDOW_MS
    );
    
    if (recentBurstRequests.length >= SECURITY_CONFIG.RATE_LIMIT.BURST_LIMIT) {
        return {
            allowed: false,
            reason: 'burst_limit_exceeded',
            retryAfter: Math.ceil((recentBurstRequests[0] + SECURITY_CONFIG.RATE_LIMIT.BURST_WINDOW_MS - now) / 1000)
        };
    }
    
    // 检查常规速率限制
    const recentRequests = ipData.requests.filter(
        timestamp => now - timestamp < SECURITY_CONFIG.RATE_LIMIT.WINDOW_MS
    );
    
    if (recentRequests.length >= SECURITY_CONFIG.RATE_LIMIT.MAX_REQUESTS) {
        // 标记为可疑IP
        markSuspiciousIP(ip, recentRequests.length);
        return {
            allowed: false,
            reason: 'rate_limit_exceeded',
            retryAfter: Math.ceil((recentRequests[0] + SECURITY_CONFIG.RATE_LIMIT.WINDOW_MS - now) / 1000)
        };
    }
    
    // 记录当前请求
    ipData.requests.push(now);
    ipData.burstRequests.push(now);
    
    return { allowed: true };
}

/**
 * 清理过期的请求记录
 */
function cleanupExpiredRequests(now) {
    const windowMs = SECURITY_CONFIG.RATE_LIMIT.WINDOW_MS;
    const burstWindowMs = SECURITY_CONFIG.RATE_LIMIT.BURST_WINDOW_MS;
    
    for (const [ip, data] of requestCounts.entries()) {
        data.requests = data.requests.filter(timestamp => now - timestamp < windowMs);
        data.burstRequests = data.burstRequests.filter(timestamp => now - timestamp < burstWindowMs);
        
        // 如果没有任何请求记录，删除该IP
        if (data.requests.length === 0 && data.burstRequests.length === 0) {
            requestCounts.delete(ip);
        }
    }
}

/**
 * 标记可疑IP
 */
function markSuspiciousIP(ip, requestCount) {
    const now = Date.now();
    const suspiciousData = suspiciousIPs.get(ip) || { count: 0, firstSeen: now, blockedUntil: 0 };
    
    suspiciousData.count = Math.max(suspiciousData.count, requestCount);
    suspiciousData.lastSeen = now;
    
    // 如果超过自动封禁阈值，封禁IP
    if (suspiciousData.count >= SECURITY_CONFIG.IP_BLOCKING.AUTO_BLOCK_THRESHOLD) {
        suspiciousData.blockedUntil = now + SECURITY_CONFIG.IP_BLOCKING.BLOCK_DURATION_MS;
        blockedIPs.add(ip);
        console.warn(`🚨 IP ${ip} 已被自动封禁，请求次数: ${suspiciousData.count}`);
    }
    
    suspiciousIPs.set(ip, suspiciousData);
}

/**
 * 验证请求头
 */
function validateRequest(event) {
    const headers = event.headers || {};
    const userAgent = headers['user-agent'] || '';
    
    // 检查必需的请求头
    for (const requiredHeader of SECURITY_CONFIG.REQUEST_VALIDATION.REQUIRED_HEADERS) {
        if (!headers[requiredHeader]) {
            return {
                valid: false,
                reason: `missing_header_${requiredHeader}`
            };
        }
    }
    
    // 检查被阻止的User-Agent
    const lowerUserAgent = userAgent.toLowerCase();
    for (const blockedUA of SECURITY_CONFIG.REQUEST_VALIDATION.BLOCKED_USER_AGENTS) {
        if (lowerUserAgent.includes(blockedUA)) {
            return {
                valid: false,
                reason: 'blocked_user_agent',
                details: blockedUA
            };
        }
    }
    
    // 检查内容长度
    const contentLength = parseInt(headers['content-length'] || '0');
    if (contentLength > SECURITY_CONFIG.REQUEST_VALIDATION.MAX_CONTENT_LENGTH) {
        return {
            valid: false,
            reason: 'content_too_large',
            details: contentLength
        };
    }
    
    return { valid: true };
}

/**
 * 生成安全响应头
 */
function getSecurityHeaders() {
    return {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
    };
}

/**
 * 记录安全事件
 */
function logSecurityEvent(ip, event, details) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        ip,
        event,
        details,
        userAgent: event.headers?.['user-agent'] || 'unknown'
    };
    
    console.log(`🔒 安全事件: ${JSON.stringify(logEntry)}`);
    
    // 在生产环境中，这里应该将日志发送到监控系统
    // 例如：发送到 CloudWatch、DataDog 或其他监控服务
}

/**
 * 主要安全检查函数
 */
function performSecurityCheck(event) {
    const ip = getClientIP(event);
    const timestamp = new Date().toISOString();
    
    // 1. 检查IP是否被封禁
    if (isIPBlocked(ip)) {
        logSecurityEvent(ip, 'blocked_ip_access', { ip });
        return {
            allowed: false,
            statusCode: 403,
            body: JSON.stringify({
                error: 'Access denied',
                message: '您的IP地址已被封禁',
                timestamp
            })
        };
    }
    
    // 2. 验证请求
    const validation = validateRequest(event);
    if (!validation.valid) {
        logSecurityEvent(ip, 'invalid_request', validation);
        return {
            allowed: false,
            statusCode: 400,
            body: JSON.stringify({
                error: 'Invalid request',
                message: '请求格式不正确',
                reason: validation.reason,
                timestamp
            })
        };
    }
    
    // 3. 检查速率限制
    const rateLimitCheck = checkRateLimit(ip);
    if (!rateLimitCheck.allowed) {
        logSecurityEvent(ip, 'rate_limit_exceeded', rateLimitCheck);
        return {
            allowed: false,
            statusCode: 429,
            body: JSON.stringify({
                error: 'Rate limit exceeded',
                message: '请求过于频繁，请稍后重试',
                retryAfter: rateLimitCheck.retryAfter,
                timestamp
            })
        };
    }
    
    // 4. 记录正常请求
    logSecurityEvent(ip, 'request_allowed', { ip, method: event.httpMethod });
    
    return { allowed: true };
}

/**
 * 手动封禁IP（管理员功能）
 */
function blockIP(ip, duration = SECURITY_CONFIG.IP_BLOCKING.BLOCK_DURATION_MS) {
    blockedIPs.add(ip);
    const blockedUntil = Date.now() + duration;
    
    const suspiciousData = suspiciousIPs.get(ip) || { count: 0, firstSeen: Date.now() };
    suspiciousData.blockedUntil = blockedUntil;
    suspiciousIPs.set(ip, suspiciousData);
    
    console.log(`🚫 手动封禁IP: ${ip}, 封禁至: ${new Date(blockedUntil).toISOString()}`);
}

/**
 * 获取安全统计信息
 */
function getSecurityStats() {
    const now = Date.now();
    const activeIPs = requestCounts.size;
    const blockedCount = blockedIPs.size;
    const suspiciousCount = Array.from(suspiciousIPs.values()).filter(
        data => data.count >= SECURITY_CONFIG.IP_BLOCKING.SUSPICIOUS_THRESHOLD
    ).length;
    
    return {
        activeIPs,
        blockedCount,
        suspiciousCount,
        totalRequests: Array.from(requestCounts.values()).reduce(
            (sum, data) => sum + data.requests.length, 0
        ),
        timestamp: new Date(now).toISOString()
    };
}

module.exports = {
    performSecurityCheck,
    getSecurityHeaders,
    blockIP,
    getSecurityStats,
    isIPBlocked,
    SECURITY_CONFIG
};
