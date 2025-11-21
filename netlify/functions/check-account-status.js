/**
 * 定期账号状态验证接口
 * 用于前端每2小时检查用户账号的有效性
 * 
 * 功能：
 * 1. 验证账号是否存在
 * 2. 检查账号是否过期
 * 3. 检查账号状态（active/banned等）
 * 4. 返回服务器时间（防止客户端时间作弊）
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

exports.handler = async (event) => {
    // 设置CORS头
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // 处理OPTIONS预检请求
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    // 只接受POST请求
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ success: false, message: 'Method Not Allowed' })
        };
    }

    try {
        const { user_id, username } = JSON.parse(event.body);

        // 参数验证：必须提供user_id或username之一
        if (!user_id && !username) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    success: false,
                    message: '缺少必要参数：需要提供 user_id 或 username'
                })
            };
        }

        // 获取服务器当前时间
        const serverTime = new Date();
        const serverTimeISO = serverTime.toISOString();

        // 构建查询条件
        let query = supabase
            .from('user_accounts')
            .select('id, account, user_type, expiry_at, status, device_id, os_type, trial_search_used, daily_export_count, last_export_date, is_ai_authorized, ai_tokens_remaining');

        if (user_id) {
            query = query.eq('id', user_id);
        } else {
            query = query.eq('account', username);
        }

        const { data: rows, error: fetchError } = await query.limit(1);

        if (fetchError) {
            console.error('数据库查询错误:', fetchError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({
                    success: false,
                    message: '数据库查询失败',
                    serverTime: serverTimeISO
                })
            };
        }

        // 账号不存在
        if (!rows || rows.length === 0) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({
                    success: false,
                    message: '账号不存在',
                    serverTime: serverTimeISO,
                    shouldLogout: true // 提示前端需要重新登录
                })
            };
        }

        const user = rows[0];

        // 检查账号状态
        if (user.status && user.status !== 'active') {
            return {
                statusCode: 403,
                headers,
                body: JSON.stringify({
                    success: false,
                    message: `账号状态异常: ${user.status}`,
                    status: user.status,
                    serverTime: serverTimeISO,
                    shouldLogout: true
                })
            };
        }

        // 【核心安全检查】使用服务器时间检查账号是否过期
        if (user.expiry_at) {
            const expiryDate = new Date(user.expiry_at);
            if (expiryDate < serverTime) {
                return {
                    statusCode: 403,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        message: '账号已过期，请续费',
                        expiryAt: user.expiry_at,
                        serverTime: serverTimeISO,
                        shouldLogout: true,
                        isExpired: true
                    })
                };
            }
        }

        // 计算剩余天数
        let daysRemaining = null;
        if (user.expiry_at) {
            const expiryDate = new Date(user.expiry_at);
            const diffTime = expiryDate - serverTime;
            daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }

        // 账号有效，返回详细信息
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: '账号状态正常',
                serverTime: serverTimeISO,
                timestamp: serverTime.getTime(),
                user: {
                    id: user.id,
                    username: user.account,
                    userType: user.user_type,
                    expiryAt: user.expiry_at,
                    daysRemaining: daysRemaining,
                    status: user.status,
                    deviceCode: user.device_id,
                    osType: user.os_type,
                    trial_search_used: user.trial_search_used,
                    daily_export_count: user.daily_export_count,
                    last_export_date: user.last_export_date,
                    is_ai_authorized: user.is_ai_authorized,
                    ai_tokens_remaining: user.ai_tokens_remaining
                }
            })
        };

    } catch (error) {
        console.error('服务器错误:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                message: '服务器内部错误',
                error: error.message,
                serverTime: new Date().toISOString()
            })
        };
    }
};
