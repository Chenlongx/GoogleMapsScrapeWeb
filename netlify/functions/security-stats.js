// 安全统计信息 API - 提供基本的安全统计信息（无需管理员权限）
// 用于安全监控面板显示基本数据

const security = require('./security-middleware');

exports.handler = async (event, context) => {
    // 设置 CORS 头部
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
        // 获取基本统计信息
        const stats = security.getSecurityStats();
        
        // 添加一些额外的信息
        const enhancedStats = {
            ...stats,
            serverTime: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'production',
            version: '1.0.0'
        };

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                data: enhancedStats,
                message: '安全统计信息获取成功'
            })
        };

    } catch (error) {
        console.error('Security stats error:', error);
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
