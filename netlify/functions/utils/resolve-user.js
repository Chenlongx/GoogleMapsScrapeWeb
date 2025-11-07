const crypto = require('crypto');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const sanitizePasswordSeed = (seed) => seed.replace(/[^a-zA-Z0-9]/g, '');

const generateRandomPassword = () => {
  const seed = sanitizePasswordSeed(crypto.randomBytes(24).toString('base64'));
  const base = seed.slice(0, 20) || 'TempPassSeed1234';
  return `${base}Aa1!`;
};

const resolveSupabaseUser = async ({ supabase, userId, fallbackUsername = '' }) => {
  if (!userId) {
    const error = new Error('缺少 userId');
    error.code = 'USER_ID_MISSING';
    throw error;
  }

  const adminClient = supabase.auth?.admin;

  if (!adminClient) {
    const error = new Error('Supabase 管理客户端不可用');
    error.code = 'ADMIN_CLIENT_UNAVAILABLE';
    throw error;
  }

  const resolveFromAuthId = async (id) => {
    const { data, error } = await adminClient.getUserById(id);
    if (error || !data || !data.user) {
      return null;
    }
    const email = data.user.email || '';
    const username = fallbackUsername || data.user.user_metadata?.username || (email ? email.split('@')[0] : '');
    return {
      supabaseUserId: data.user.id,
      email,
      username,
      legacyUser: null,
      migrated: false
    };
  };

  // 1. 如果看起来像 UUID，则直接从 Supabase Auth 查询
  if (typeof userId === 'string' && UUID_REGEX.test(userId)) {
    const authResult = await resolveFromAuthId(userId);
    if (authResult) {
      return authResult;
    }
  }

  // 2. 如果传的是邮箱，尝试通过邮箱直接获取 Supabase 用户
  if (typeof userId === 'string' && userId.includes('@')) {
    const { data, error } = await adminClient.getUserByEmail(userId);
    if (!error && data && data.user) {
      const email = data.user.email || userId;
      const username = fallbackUsername || data.user.user_metadata?.username || (email ? email.split('@')[0] : '');
      return {
        supabaseUserId: data.user.id,
        email,
        username,
        legacyUser: null,
        migrated: false
      };
    }
  }

  // 3. 兼容旧系统：尝试从 email_finder_users 查询
  const { data: legacyUser, error: legacyError } = await supabase
    .from('email_finder_users')
    .select('id, email, username, supabase_auth_user')
    .eq('id', userId)
    .single();

  if (legacyError || !legacyUser) {
    const error = new Error('找不到对应的用户信息');
    error.code = 'LEGACY_USER_NOT_FOUND';
    throw error;
  }

  const email = legacyUser.email;
  const preferredUsername = fallbackUsername || legacyUser.username || (email ? email.split('@')[0] : '');

  // 4. 查看是否已经存在 Supabase Auth 用户（根据邮箱）
  const { data: existingAuth, error: existingAuthError } = await adminClient.getUserByEmail(email);

  let authUser = null;
  let migratedFromLegacy = false;

  if (!existingAuthError && existingAuth && existingAuth.user) {
    authUser = existingAuth.user;
  }

  // 5. 如果还没有 Auth 用户，则自动创建一个（仅用于内部标识）
  if (!authUser) {
    const tempPassword = generateRandomPassword();
    const { data: createdAuth, error: createAuthError } = await adminClient.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        username: preferredUsername,
        migrated_from: 'email_finder_users'
      },
      app_metadata: {
        legacy_user_id: legacyUser.id
      }
    });

    if (createAuthError || !createdAuth || !createdAuth.user) {
      const error = new Error(`创建 Supabase 用户失败: ${createAuthError?.message || '未知错误'}`);
      error.code = 'CREATE_AUTH_USER_FAILED';
      throw error;
    }

    authUser = createdAuth.user;
    migratedFromLegacy = true;
  }

  // 6. 更新 user_profiles（确保存在记录）
  const profilePayload = {
    id: authUser.id,
    email,
    username: preferredUsername
  };

  const { error: profileError } = await supabase
    .from('user_profiles')
    .upsert(profilePayload, { onConflict: 'id' });

  if (profileError) {
    console.error('⚠️ 同步 user_profiles 失败（忽略继续）:', profileError);
  }

  // 7. 更新旧表标记（容错处理）
  const { error: updateLegacyError } = await supabase
    .from('email_finder_users')
    .update({ supabase_auth_user: true })
    .eq('id', legacyUser.id);

  if (updateLegacyError) {
    console.error('⚠️ 更新 email_finder_users.supabase_auth_user 失败（忽略继续）:', updateLegacyError);
  }

  return {
    supabaseUserId: authUser.id,
    email,
    username: preferredUsername,
    legacyUser,
    migrated: migratedFromLegacy
  };
};

module.exports = {
  resolveSupabaseUser
};

