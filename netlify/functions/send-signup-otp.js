const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { Resend } = require('resend');

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
};

const OTP_EXPIRE_MS = 10 * 60 * 1000;
const EMAIL_COOLDOWN_MS = 60 * 1000;
const IP_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const IP_RATE_LIMIT_MAX_REQUESTS = 20;

// In-memory limiter: effective per function instance.
const ipRateLimitStore = new Map();

function getSupabaseClient() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const supabaseKey = serviceRoleKey || anonKey;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase credentials');
    }

    return createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false }
    });
}

function buildOtpEmailTemplate(email, code) {
    const username = String(email || '').split('@')[0] || '用户';
    return {
        subject: '【智贸云梯】注册验证码',
        html: `
            <div style="font-family:Arial,sans-serif;padding:20px;color:#333;">
                <h2 style="margin:0 0 12px;">欢迎注册智贸云梯</h2>
                <p style="margin:0 0 12px;">${username}，您的验证码是：</p>
                <div style="display:inline-block;padding:12px 16px;border-radius:8px;background:#f3f4f6;font-size:24px;font-weight:700;letter-spacing:4px;">
                    ${code}
                </div>
                <p style="margin:16px 0 0;color:#666;font-size:13px;">验证码 10 分钟内有效，请勿泄露给他人。</p>
            </div>
        `
    };
}

function getClientIp(event) {
    const forwarded = event.headers?.['x-forwarded-for'] || event.headers?.['X-Forwarded-For'] || '';
    const clientIp = event.headers?.['x-nf-client-connection-ip'] || event.headers?.['X-Nf-Client-Connection-Ip'];
    const realIp = event.headers?.['x-real-ip'] || event.headers?.['X-Real-Ip'];
    const firstForwardedIp = String(forwarded || '').split(',')[0].trim();
    return firstForwardedIp || clientIp || realIp || 'unknown';
}

function checkIpRateLimit(ip) {
    const now = Date.now();
    const key = String(ip || 'unknown');
    const existing = ipRateLimitStore.get(key);
    let bucket = existing;

    if (!bucket || now - bucket.windowStartMs >= IP_RATE_LIMIT_WINDOW_MS) {
        bucket = { windowStartMs: now, count: 0 };
    }

    bucket.count += 1;
    ipRateLimitStore.set(key, bucket);

    if (ipRateLimitStore.size > 2000) {
        for (const [storedIp, value] of ipRateLimitStore.entries()) {
            if (now - value.windowStartMs >= IP_RATE_LIMIT_WINDOW_MS) {
                ipRateLimitStore.delete(storedIp);
            }
        }
    }

    if (bucket.count > IP_RATE_LIMIT_MAX_REQUESTS) {
        const retryAfterSec = Math.max(1, Math.ceil((bucket.windowStartMs + IP_RATE_LIMIT_WINDOW_MS - now) / 1000));
        return { allowed: false, retryAfterSec };
    }

    return { allowed: true, retryAfterSec: 0 };
}

function withRateLimitHeaders(baseHeaders, retryAfterSec = 0) {
    const nextHeaders = {
        ...baseHeaders,
        'X-RateLimit-Limit': String(IP_RATE_LIMIT_MAX_REQUESTS),
        'X-RateLimit-Window-Seconds': String(IP_RATE_LIMIT_WINDOW_MS / 1000)
    };

    if (retryAfterSec > 0) {
        nextHeaders['Retry-After'] = String(retryAfterSec);
    }

    return nextHeaders;
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ success: false, message: 'Method Not Allowed' })
        };
    }

    try {
        const { email } = JSON.parse(event.body || '{}');
        const normalizedEmail = String(email || '').trim().toLowerCase();
        const clientIp = getClientIp(event);

        const ipCheck = checkIpRateLimit(clientIp);
        if (!ipCheck.allowed) {
            return {
                statusCode: 429,
                headers: withRateLimitHeaders(headers, ipCheck.retryAfterSec),
                body: JSON.stringify({
                    success: false,
                    message: `请求过于频繁，请 ${ipCheck.retryAfterSec} 秒后再试`
                })
            };
        }

        if (!normalizedEmail) {
            return {
                statusCode: 400,
                headers: withRateLimitHeaders(headers),
                body: JSON.stringify({ success: false, message: '邮箱不能为空' })
            };
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(normalizedEmail)) {
            return {
                statusCode: 400,
                headers: withRateLimitHeaders(headers),
                body: JSON.stringify({ success: false, message: '邮箱格式不正确' })
            };
        }

        const supabase = getSupabaseClient();

        const { data: existingUser, error: checkError } = await supabase
            .from('user_accounts')
            .select('id')
            .eq('account', normalizedEmail)
            .maybeSingle();

        if (checkError) {
            console.error('check user existence failed:', checkError);
            return {
                statusCode: 500,
                headers: withRateLimitHeaders(headers),
                body: JSON.stringify({ success: false, message: '数据库查询失败' })
            };
        }

        if (existingUser) {
            return {
                statusCode: 409,
                headers: withRateLimitHeaders(headers),
                body: JSON.stringify({ success: false, message: '此邮箱已被注册' })
            };
        }

        const verificationCode = String(crypto.randomInt(100000, 1000000));
        const codeExpiresAt = new Date(Date.now() + OTP_EXPIRE_MS).toISOString();

        const { data: existingPending, error: pendingQueryError } = await supabase
            .from('pending_users')
            .select('email, code_expires_at')
            .eq('email', normalizedEmail)
            .maybeSingle();

        if (pendingQueryError) {
            console.error('query pending user failed:', pendingQueryError);
            return {
                statusCode: 500,
                headers: withRateLimitHeaders(headers),
                body: JSON.stringify({ success: false, message: '验证码缓存查询失败' })
            };
        }

        if (existingPending?.code_expires_at) {
            const expireMs = new Date(existingPending.code_expires_at).getTime();
            if (Number.isFinite(expireMs)) {
                const estimatedSentAtMs = expireMs - OTP_EXPIRE_MS;
                const cooldownRemainMs = EMAIL_COOLDOWN_MS - (Date.now() - estimatedSentAtMs);
                if (cooldownRemainMs > 0) {
                    const retryAfterSec = Math.max(1, Math.ceil(cooldownRemainMs / 1000));
                    return {
                        statusCode: 429,
                        headers: withRateLimitHeaders(headers, retryAfterSec),
                        body: JSON.stringify({
                            success: false,
                            message: `同一邮箱请求过快，请 ${retryAfterSec} 秒后再试`
                        })
                    };
                }
            }
        }

        if (existingPending) {
            const { error: updateError } = await supabase
                .from('pending_users')
                .update({
                    verification_code: verificationCode,
                    code_expires_at: codeExpiresAt,
                    attempts: 0
                })
                .eq('email', normalizedEmail);

            if (updateError) {
                console.error('update pending user failed:', updateError);
                return {
                    statusCode: 500,
                    headers: withRateLimitHeaders(headers),
                    body: JSON.stringify({ success: false, message: '验证码写入失败' })
                };
            }
        } else {
            const { error: insertError } = await supabase
                .from('pending_users')
                .insert([{
                    email: normalizedEmail,
                    username: normalizedEmail.split('@')[0],
                    password_hash: 'temp_signup',
                    verification_code: verificationCode,
                    code_expires_at: codeExpiresAt,
                    attempts: 0
                }]);

            if (insertError) {
                console.error('insert pending user failed:', insertError);
                return {
                    statusCode: 500,
                    headers: withRateLimitHeaders(headers),
                    body: JSON.stringify({ success: false, message: '验证码写入失败' })
                };
            }
        }

        const resendApiKey = process.env.RESEND_API_KEY;
        const emailTemplate = buildOtpEmailTemplate(normalizedEmail, verificationCode);
        let emailSent = false;

        if (resendApiKey) {
            const resend = new Resend(resendApiKey);
            const { error: sendError } = await resend.emails.send({
                from: process.env.EMAIL_FROM || 'noreply@mediamingle.cn',
                to: normalizedEmail,
                subject: emailTemplate.subject,
                html: emailTemplate.html
            });

            if (sendError) {
                console.error('resend send failed:', sendError);
                return {
                    statusCode: 500,
                    headers: withRateLimitHeaders(headers),
                    body: JSON.stringify({ success: false, message: '验证码发送失败' })
                };
            }

            emailSent = true;
        } else {
            console.log('[DEV] signup otp email:', normalizedEmail, 'code:', verificationCode);
        }

        return {
            statusCode: 200,
            headers: withRateLimitHeaders(headers),
            body: JSON.stringify({
                success: true,
                message: '验证码已发送，请检查邮箱',
                debug: emailSent ? undefined : { code: verificationCode }
            })
        };
    } catch (error) {
        console.error('send signup otp handler error:', error);
        return {
            statusCode: 500,
            headers: withRateLimitHeaders(headers),
            body: JSON.stringify({ success: false, message: '服务器内部错误' })
        };
    }
};
