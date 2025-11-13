// // 这个函数接收前端发来的邮箱、密码和验证码，验证通过后，在您的user_accounts表中创建新用户

// // netlify/functions/verify-and-register.js
// const { createClient } = require('@supabase/supabase-js');

// const SUPABASE_URL = process.env.SUPABASE_URL;
// const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
// const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// exports.handler = async (event) => {
//   if (event.httpMethod !== 'POST') {
//     return { statusCode: 405, body: JSON.stringify({ success: false, message: 'Method Not Allowed' }) };
//   }

//   try {
//     const { email, password, token } = JSON.parse(event.body);

//     if (!email || !password || !token) {
//       return { statusCode: 400, body: JSON.stringify({ success: false, message: '邮箱、密码和验证码不能为空' }) };
//     }

//     // 1. 验证 OTP
//     const { data: { session }, error: verifyError } = await supabase.auth.verifyOtp({
//       email: email,
//       token: token,
//       type: 'email', // 确保类型是 email OTP
//     });

//     if (verifyError) {
//       console.error('Supabase verification error:', verifyError);
//       return { statusCode: 401, body: JSON.stringify({ success: false, message: '验证码错误或已过期', error: verifyError.message }) };
//     }
    
//     if (!session) {
//         return { statusCode: 401, body: JSON.stringify({ success: false, message: '验证失败，无法获取会话' }) };
//     }

//     // 验证成功！现在可以在 `user_accounts` 表中创建用户记录了

//     // 2. 准备新用户数据 (默认试用)
//     const expiryAt = new Date();
//     expiryAt.setHours(expiryAt.getHours() + 12); // <-- 修改在这里：设置为12小时后过期

//     const newUser = {
//       account: email,
//       password: password, // 警告：生产环境中强烈建议对密码进行哈希处理！
//       user_type: 'trial', // 默认用户类型为 trial
//       created_at: new Date().toISOString(),
//       expiry_at: expiryAt.toISOString(),
//       status: 'active',
//       is_ai_authorized: false, // 默认AI权限为 false
//       ai_tokens_remaining: 0, // 默认AI token为0
//     };

//     // 3. 插入数据到 `user_accounts` 表
//     const { error: insertError } = await supabase
//       .from('user_accounts')
//       .insert(newUser);

//     if (insertError) {
//       console.error('Supabase insert error:', insertError);
//       // 如果错误是23505，表示唯一约束冲突（可能用户已存在）
//       if (insertError.code === '23505') {
//         return { statusCode: 409, body: JSON.stringify({ success: false, message: '此邮箱已被注册' }) };
//       }
//       return { statusCode: 500, body: JSON.stringify({ success: false, message: '创建用户档案失败', error: insertError.message }) };
//     }

//     return {
//       statusCode: 201,
//       body: JSON.stringify({ success: true, message: '注册成功！现在您可以登录了。' })
//     };

//   } catch (err) {
//     console.error('Handler error:', err);
//     return { statusCode: 500, body: JSON.stringify({ success: false, message: '服务器内部错误' }) };
//   }
// };



// netlify/functions/verify-and-register.js
const { createClient } = require('@supabase/supabase-js');
// const bcrypt = require('bcryptjs'); // 步骤1：移除或注释掉加密库的引用

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ success: false, message: 'Method Not Allowed' }) };
    }

    try {
        const { email, password, token, device_id, os_type } = JSON.parse(event.body);

        if (!email || !password || !token || !device_id || !os_type) {
            return { statusCode: 400, body: JSON.stringify({ success: false, message: '所有字段都不能为空' }) };
        }
        
        const { data: existingDevice, error: deviceCheckError } = await supabase
            .from('user_accounts')
            .select('id')
            .eq('device_id', device_id)
            .limit(1); // 不要 single/maybeSingle2432
            
        if (deviceCheckError) {
            console.error('Error checking device ID:', deviceCheckError);
            return { statusCode: 500, body: JSON.stringify({ success: false, message: '数据库查询失败' }) };
        }

        if (existingDevice) {
            return { statusCode: 409, body: JSON.stringify({ success: false, message: '此设备已注册过试用账号' }) };
        }

        const { data: { user }, error: verifyError } = await supabase.auth.verifyOtp({
            email: email,
            token: token,
            type: 'email', 
        });

        if (verifyError || !user) {
            console.error('Supabase OTP verification error:', verifyError);
            return { statusCode: 400, body: JSON.stringify({ success: false, message: '验证码错误或已过期' }) };
        }

        // --- 核心修改 2: 移除密码加密过程 ---
        // const saltRounds = 10;
        // const hashedPassword = await bcrypt.hash(password, saltRounds);
        // --- 密码加密过程已被移除 ---

        const now = new Date();
        const expiryDate = new Date(now.setDate(now.getDate() + 1)); 

        const newUserRecord = {
            account: email,
            // --- 核心修改 3: 直接存储原始密码 ---
            // 注意：您的数据库字段应为 password 或 password_hash，请确保此处匹配
            password: password, // 直接使用从前端传来的原始密码
            device_id: device_id,
            os_type: os_type,
            user_type: 'standard',
            status: 'active',
            expiry_at: expiryDate.toISOString(),
            is_ai_authorized: false,
            ai_tokens_remaining: 0,
            daily_export_count: 0
        };

        const { error: insertError } = await supabase
            .from('user_accounts')
            .insert([newUserRecord]);

        if (insertError) {
            console.error('Error inserting new user:', insertError);
            if (insertError.code === '23505') {
                 return { statusCode: 409, body: JSON.stringify({ success: false, message: '此邮箱已被注册' }) };
            }
            return { statusCode: 500, body: JSON.stringify({ success: false, message: '创建用户失败' }) };
        }

        return {
            statusCode: 201,
            body: JSON.stringify({ success: true, message: '试用账号注册成功！有效期一天，请及时转为正式账号。' })
        };

    } catch (err) {
        console.error('Handler error:', err);
        return { statusCode: 500, body: JSON.stringify({ success: false, message: '服务器内部错误' }) };
    }
};