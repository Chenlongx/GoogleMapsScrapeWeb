// 使用 service role，避免 RLS 拦截
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // 新增
const supabase = createClient(supabaseUrl, supabaseServiceKey);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  }

  try {
    const { username, password, device_id, os_type } = JSON.parse(event.body);
    if (!username || !password || !device_id || !os_type) {
      return { statusCode: 400, body: JSON.stringify({ message: '缺少必要字段' }) };
    }

    // 仅取必要字段，避免拉太多
    const { data: rows, error: fetchError } = await supabase
      .from('user_accounts')
      .select('id, account, password, user_type, created_at, expiry_at, status, device_id, os_type, daily_export_count, last_export_date, is_ai_authorized, ai_tokens_remaining, trial_search_used')
      .eq('account', username)
      .limit(1); // 不用 single/maybeSingle

    if (fetchError) {
      console.error('数据库查询错误:', fetchError);
      return { statusCode: 500, body: JSON.stringify({ success:false, message: '数据库查询失败' }) };
    }

    if (!rows || rows.length === 0) {
      return { statusCode: 401, body: JSON.stringify({ success:false, message: '账号不存在' }) };
    }

    const user = rows[0];

    // 简单明文校验（后续建议改为哈希）
    if (user.password !== password) {
      return { statusCode: 401, body: JSON.stringify({ success:false, message: '密码错误' }) };
    }

    // 账户状态校验
    if (user.status && user.status !== 'active') {
      return { statusCode: 403, body: JSON.stringify({ success:false, message: '账号未激活或已被禁用' }) };
    }

    // 有效期校验（如有）
    if (user.expiry_at && new Date(user.expiry_at) < new Date()) {
      return { statusCode: 403, body: JSON.stringify({ success:false, message: '账号已过期，请续费' }) };
    }

    // 设备绑定策略：如果库里没绑定设备，则首登绑定；若已绑定且不一致，拒绝
    if (!user.device_id) {
      const { error: bindErr } = await supabase
        .from('user_accounts')
        .update({ device_id, os_type })
        .eq('id', user.id);

      if (bindErr) {
        console.error('绑定设备失败:', bindErr);
        return { statusCode: 500, body: JSON.stringify({ success:false, message: '绑定设备失败' }) };
      }
    } else if (user.device_id !== device_id) {
      return { statusCode: 409, body: JSON.stringify({ success:false, message: '此账号已绑定到其他设备' }) };
    }

    // 一切正常
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: '登录成功',
        user: {
          id: user.id,
          username: user.account,
          userType: user.user_type,
          expiryAt: user.expiry_at,
          status: user.status,
          deviceCode: user.device_id,
          osType: user.os_type,
          trial_search_used: user.trial_search_used,
          daily_export_count: user.daily_export_count
        }
      })
    };

  } catch (e) {
    console.error('服务器错误:', e);
    return { statusCode: 500, body: JSON.stringify({ success:false, message: '服务器内部错误' }) };
  }
};