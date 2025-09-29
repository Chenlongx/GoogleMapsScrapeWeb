// 安全管理员 API - 用于监控和管理安全策略
// 注意：此端点应该只在受信任的环境中访问

const security = require('./security-middleware');

exports.handler = async (event, context) => {
    // 基本的安全检查
    const clientIP = security.getClientIP(event);
    
    // 严格的管理员验证
    const adminKey = event.headers['x-admin-key'] || event.queryStringParameters?.admin_key;
    const expectedAdminKey = process.env.ADMIN_SECRET_KEY;
    
    // 如果没有设置管理员密钥，则完全禁用管理员功能
    if (!expectedAdminKey) {
        console.error('🚨 安全警告: ADMIN_SECRET_KEY 未设置，管理员功能已禁用');
        return {
            statusCode: 503,
            headers: {
                'Content-Type': 'application/json',
                ...security.getSecurityHeaders()
            },
            body: JSON.stringify({
                error: 'Service Unavailable',
                message: '管理员功能未配置，请联系系统管理员',
                code: 'ADMIN_NOT_CONFIGURED'
            })
        };
    }
    
    // 验证管理员密钥
    if (!adminKey || adminKey !== expectedAdminKey) {
        console.warn(`🚨 安全警告: 无效的管理员访问尝试，IP: ${security.getClientIP(event)}`);
        return {
            statusCode: 401,
            headers: {
                'Content-Type': 'application/json',
                ...security.getSecurityHeaders()
            },
            body: JSON.stringify({
                error: 'Unauthorized',
                message: '需要有效的管理员密钥',
                code: 'INVALID_ADMIN_KEY'
            })
        };
    }

    const method = event.httpMethod;
    const path = event.path;

    try {
        switch (method) {
            case 'GET':
                return handleGetRequest(path, event);
            case 'POST':
                return handlePostRequest(path, event);
            default:
                return {
                    statusCode: 405,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ error: 'Method not allowed' })
                };
        }
    } catch (error) {
        console.error('Security admin error:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message
            })
        };
    }
};

/**
 * 处理 GET 请求
 */
function handleGetRequest(path, event) {
    const headers = {
        'Content-Type': 'application/json',
        ...security.getSecurityHeaders()
    };

    if (path.includes('/stats')) {
        // 获取安全统计信息
        const stats = security.getSecurityStats();
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                data: stats,
                timestamp: new Date().toISOString()
            })
        };
    }
    
    if (path.includes('/blocked-ips')) {
        // 获取被封禁的IP列表
        const blockedIPs = Array.from(security.blockedIPs || new Set());
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                data: {
                    blockedIPs,
                    count: blockedIPs.length
                },
                timestamp: new Date().toISOString()
            })
        };
    }
    
    if (path.includes('/suspicious-ips')) {
        // 获取可疑IP列表
        const suspiciousIPs = Array.from(security.suspiciousIPs || new Map()).map(([ip, data]) => ({
            ip,
            count: data.count,
            firstSeen: data.firstSeen,
            lastSeen: data.lastSeen,
            blockedUntil: data.blockedUntil
        }));
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                data: {
                    suspiciousIPs,
                    count: suspiciousIPs.length
                },
                timestamp: new Date().toISOString()
            })
        };
    }

    return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
            error: 'Not found',
            message: '请求的端点不存在'
        })
    };
}

/**
 * 处理 POST 请求
 */
function handlePostRequest(path, event) {
    const headers = {
        'Content-Type': 'application/json',
        ...security.getSecurityHeaders()
    };

    let requestData;
    try {
        requestData = JSON.parse(event.body || '{}');
    } catch (e) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                error: 'Invalid JSON',
                message: '请求体格式不正确'
            })
        };
    }

    if (path.includes('/block-ip')) {
        // 封禁IP
        const { ip, duration } = requestData;
        
        if (!ip) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    error: 'Missing IP',
                    message: '请提供要封禁的IP地址'
                })
            };
        }

        const blockDuration = duration || security.SECURITY_CONFIG.IP_BLOCKING.BLOCK_DURATION_MS;
        security.blockIP(ip, blockDuration);
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: `IP ${ip} 已被封禁`,
                blockedUntil: new Date(Date.now() + blockDuration).toISOString()
            })
        };
    }
    
    if (path.includes('/unblock-ip')) {
        // 解封IP
        const { ip } = requestData;
        
        if (!ip) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    error: 'Missing IP',
                    message: '请提供要解封的IP地址'
                })
            };
        }

        // 从封禁列表中移除IP
        if (security.blockedIPs) {
            security.blockedIPs.delete(ip);
        }
        
        // 清除可疑记录
        if (security.suspiciousIPs) {
            security.suspiciousIPs.delete(ip);
        }
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: `IP ${ip} 已被解封`
            })
        };
    }
    
    if (path.includes('/update-config')) {
        // 更新安全配置（需要谨慎使用）
        const { rateLimit, ipBlocking } = requestData;
        
        if (rateLimit) {
            Object.assign(security.SECURITY_CONFIG.RATE_LIMIT, rateLimit);
        }
        
        if (ipBlocking) {
            Object.assign(security.SECURITY_CONFIG.IP_BLOCKING, ipBlocking);
        }
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: '安全配置已更新',
                config: security.SECURITY_CONFIG
            })
        };
    }

    return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
            error: 'Not found',
            message: '请求的端点不存在'
        })
    };
}
