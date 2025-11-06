-- ===========================
-- Supabase Auth + 自定义表集成 SQL
-- ===========================
-- 这个脚本用于设置 Supabase Auth 与自定义用户表的集成
-- 执行位置：Supabase Dashboard → SQL Editor

-- ===========================
-- 1. 修改自定义表结构
-- ===========================

-- 添加标记字段，区分 Auth 用户和自定义用户
ALTER TABLE public.email_finder_users
ADD COLUMN IF NOT EXISTS supabase_auth_user BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.email_finder_users.supabase_auth_user 
IS '是否使用 Supabase Auth 管理（true）或自定义密码（false）';

-- ===========================
-- 2. 创建函数：手动同步邮箱验证状态
-- ===========================

-- 注意：由于权限限制，我们无法直接在 auth.users 上创建触发器
-- 改为提供手动同步函数，在登录时调用

CREATE OR REPLACE FUNCTION public.sync_user_email_verification(user_id UUID)
RETURNS VOID AS $$
DECLARE
  auth_user_email_verified BOOLEAN;
BEGIN
  -- 从 auth.users 获取验证状态
  SELECT (email_confirmed_at IS NOT NULL) INTO auth_user_email_verified
  FROM auth.users
  WHERE id = user_id;
  
  -- 更新自定义表
  IF auth_user_email_verified IS NOT NULL THEN
    UPDATE public.email_finder_users
    SET 
      email_verified = auth_user_email_verified,
      updated_at = NOW()
    WHERE id = user_id;
    
    RAISE NOTICE '已同步用户 % 的邮箱验证状态: %', user_id, auth_user_email_verified;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.sync_user_email_verification(UUID) 
IS '手动同步函数：从 auth.users 同步邮箱验证状态到 email_finder_users';

-- ===========================
-- 3. 创建函数：批量同步所有用户验证状态
-- ===========================

CREATE OR REPLACE FUNCTION public.sync_all_email_verifications()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  -- 批量更新所有用户的验证状态
  WITH updated AS (
    UPDATE public.email_finder_users efu
    SET 
      email_verified = (au.email_confirmed_at IS NOT NULL),
      updated_at = NOW()
    FROM auth.users au
    WHERE efu.id = au.id
      AND efu.supabase_auth_user = true
      AND efu.email_verified != (au.email_confirmed_at IS NOT NULL)
    RETURNING efu.id
  )
  SELECT COUNT(*) INTO updated_count FROM updated;
  
  RAISE NOTICE '已同步 % 个用户的邮箱验证状态', updated_count;
  
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.sync_all_email_verifications() 
IS '批量同步函数：同步所有用户的邮箱验证状态';

-- ===========================
-- 4. 注意事项
-- ===========================

-- ⚠️ 由于 auth.users 是系统表，普通用户无法在其上创建触发器
-- 因此我们采用以下方案：
-- 
-- 1. 在后端 API (auth-register.js) 中手动创建自定义表记录
-- 2. 在后端 API (auth-login.js) 中调用 sync_user_email_verification() 同步验证状态
-- 3. 可以定期运行 sync_all_email_verifications() 批量同步
-- 
-- 这样虽然不是完全自动化，但更加可控和安全

-- ===========================
-- 5. 创建查询函数：获取用户完整信息
-- ===========================

CREATE OR REPLACE FUNCTION public.get_user_info(user_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'id', u.id,
    'email', u.email,
    'username', u.username,
    'email_verified', u.email_verified,
    'supabase_auth_user', u.supabase_auth_user,
    'created_at', u.created_at,
    'last_login_at', u.last_login_at,
    'login_count', u.login_count,
    'status', u.status
  ) INTO result
  FROM public.email_finder_users u
  WHERE u.id = user_id;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_user_info(UUID) 
IS '查询函数：获取用户完整信息';

-- ===========================
-- 6. 创建清理函数：删除未验证的过期用户
-- ===========================

CREATE OR REPLACE FUNCTION public.cleanup_unverified_users()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- 删除 7 天前注册但未验证的用户
  WITH deleted AS (
    DELETE FROM public.email_finder_users
    WHERE 
      email_verified = false
      AND supabase_auth_user = true
      AND created_at < NOW() - INTERVAL '7 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RAISE NOTICE '已清理 % 个未验证的过期用户', deleted_count;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.cleanup_unverified_users() 
IS '清理函数：删除 7 天前注册但未验证的用户';

-- ===========================
-- 7. 创建索引（优化查询性能）
-- ===========================

-- 为 supabase_auth_user 字段创建索引
CREATE INDEX IF NOT EXISTS idx_email_finder_users_auth_user 
ON public.email_finder_users(supabase_auth_user);

-- 为 email_verified 字段创建索引
CREATE INDEX IF NOT EXISTS idx_email_finder_users_email_verified 
ON public.email_finder_users(email_verified);

-- 复合索引：未验证的 Auth 用户
CREATE INDEX IF NOT EXISTS idx_email_finder_users_unverified_auth 
ON public.email_finder_users(supabase_auth_user, email_verified)
WHERE supabase_auth_user = true AND email_verified = false;

-- ===========================
-- 8. 测试和维护（可选）
-- ===========================

-- 查看所有 Auth 用户（需要服务角色权限）
-- SELECT id, email, email_confirmed_at, created_at 
-- FROM auth.users
-- ORDER BY created_at DESC;

-- 查看所有自定义表用户
-- SELECT id, email, username, email_verified, supabase_auth_user, created_at 
-- FROM public.email_finder_users
-- ORDER BY created_at DESC;

-- 手动同步单个用户验证状态
-- SELECT public.sync_user_email_verification('user-uuid-here');

-- 批量同步所有用户验证状态
-- SELECT public.sync_all_email_verifications();

-- 清理未验证用户（手动执行）
-- SELECT public.cleanup_unverified_users();

-- ===========================
-- 9. 权限设置（RLS）
-- ===========================

-- 确保 email_finder_users 表的 RLS 已启用
ALTER TABLE public.email_finder_users ENABLE ROW LEVEL SECURITY;

-- 删除旧策略（如果存在）
DROP POLICY IF EXISTS "Service role can do anything" ON public.email_finder_users;
DROP POLICY IF EXISTS "Users can view their own data" ON public.email_finder_users;

-- 允许服务角色完全访问
CREATE POLICY "Service role can do anything"
  ON public.email_finder_users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 用户只能查看自己的记录
CREATE POLICY "Users can view their own data"
  ON public.email_finder_users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- ===========================
-- 完成提示
-- ===========================

DO $$
BEGIN
  RAISE NOTICE '====================================';
  RAISE NOTICE 'Supabase Auth 集成设置完成！';
  RAISE NOTICE '====================================';
  RAISE NOTICE '已创建的对象：';
  RAISE NOTICE '  ✅ 同步函数: sync_user_email_verification()';
  RAISE NOTICE '  ✅ 批量同步: sync_all_email_verifications()';
  RAISE NOTICE '  ✅ 查询函数: get_user_info()';
  RAISE NOTICE '  ✅ 清理函数: cleanup_unverified_users()';
  RAISE NOTICE '  ✅ 索引: 3 个新索引';
  RAISE NOTICE '  ✅ RLS 策略: 2 个策略';
  RAISE NOTICE '====================================';
  RAISE NOTICE '⚠️  重要提示：';
  RAISE NOTICE '  - 无法在 auth.users 上创建触发器（权限限制）';
  RAISE NOTICE '  - 用户注册在后端 API 中手动创建记录';
  RAISE NOTICE '  - 登录时自动同步验证状态';
  RAISE NOTICE '====================================';
  RAISE NOTICE '下一步：';
  RAISE NOTICE '  1. 在 Supabase Dashboard 启用 Email Auth';
  RAISE NOTICE '  2. 配置邮件模板';
  RAISE NOTICE '  3. 更新 Netlify 环境变量';
  RAISE NOTICE '  4. 部署后端 API';
  RAISE NOTICE '  5. （可选）定期运行 sync_all_email_verifications()';
  RAISE NOTICE '====================================';
END $$;

