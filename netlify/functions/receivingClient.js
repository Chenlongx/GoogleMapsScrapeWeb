const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  }

  try {
    const { username, password, device_id, os_type } = JSON.parse(event.body);

    console.log("接收到:", username, password, device_id, os_type);

    // 查询用户
    let { data: user, error: fetchError } = await supabase
      .from('user_accounts')
      .select('*')
      .eq('account', username)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('数据库查询错误:', fetchError);
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, message: `数据库查询失败: ${fetchError.message}` }),
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      };
    }

    if (!user) {
      return {
        statusCode: 404,
        body: JSON.stringify({ success: false, message: '用户不存在' }),
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      };
    }

    // 明文密码比对（生产建议用哈希）
    if (password !== user.password) {
      return {
        statusCode: 401,
        body: JSON.stringify({ success: false, message: '密码错误' }),
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      };
    }

    if (!device_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, message: '设备码缺失' }),
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      };
    }

    const storedDeviceId = user.device_id;

    // 情况 1：首次绑定
    if (!storedDeviceId) {
      const { error: updateError } = await supabase
        .from('user_accounts')
        .update({ device_id, os_type })
        .eq('id', user.id);

      if (updateError) {
        return {
          statusCode: 500,
          body: JSON.stringify({ success: false, message: `绑定设备失败: ${updateError.message}` }),
          headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        };
      }

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          message: '首次登录成功，设备已绑定。',
          user: {
            id: user.id,
            username: user.account,
            userType: user.user_type,
            expiryAt: user.expiry_at,
            status: user.status,
            deviceCode: device_id,
            osType: os_type,
            trial_search_used: user.trial_search_used,
            daily_export_count: user.daily_export_count
          }
        }),
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      };
    }

    // 情况 2：已绑定设备，但设备码不一致
    if (storedDeviceId !== device_id) {
      return {
        statusCode: 403,
        body: JSON.stringify({ success: false, message: '设备码不匹配，请联系管理员。' }),
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      };
    }

    // 情况 3：已绑定且设备码一致
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: '登录成功。',
        user: {
          id: user.id,
          username: user.account,
          userType: user.user_type,
          expiryAt: user.expiry_at,
          status: user.status,
          deviceCode: storedDeviceId,
          osType: user.os_type,
          trial_search_used: user.trial_search_used,
          daily_export_count: user.daily_export_count
        }
      }),
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    };

  } catch (error) {
    console.error("登录时出错:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message || '内部服务器错误' }),
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    };
  }
};
