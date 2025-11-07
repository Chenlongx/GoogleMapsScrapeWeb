-- ==========================================
-- 待验证用户表设置
-- 用于存储等待邮箱验证的用户信息
-- ==========================================

-- 1. 创建 pending_users 表
CREATE TABLE IF NOT EXISTS public.pending_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  username TEXT,
  password_hash TEXT NOT NULL,
  verification_token TEXT UNIQUE NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 索引
  CONSTRAINT pending_users_email_key UNIQUE (email),
  CONSTRAINT pending_users_token_key UNIQUE (verification_token)
);

-- 2. 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_pending_users_email ON public.pending_users(email);
CREATE INDEX IF NOT EXISTS idx_pending_users_token ON public.pending_users(verification_token);
CREATE INDEX IF NOT EXISTS idx_pending_users_expires ON public.pending_users(token_expires_at);

-- 3. 启用 RLS（Row Level Security）
ALTER TABLE public.pending_users ENABLE ROW LEVEL SECURITY;

-- 4. 创建 RLS 策略（只允许服务角色访问）
CREATE POLICY "Service role can do anything on pending_users"
  ON public.pending_users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 5. 创建自动清理过期记录的函数
CREATE OR REPLACE FUNCTION cleanup_expired_pending_users()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 删除超过 24 小时的过期记录
  DELETE FROM public.pending_users
  WHERE token_expires_at < NOW();
  
  RAISE NOTICE '已清理过期的待验证用户记录';
END;
$$;

-- 6. 创建定时任务（每小时清理一次过期记录）
-- 注意：需要安装 pg_cron 扩展，如果没有可以手动定期执行
-- SELECT cron.schedule('cleanup-pending-users', '0 * * * *', 'SELECT cleanup_expired_pending_users()');

-- 7. 授予必要的权限
GRANT ALL ON public.pending_users TO service_role;

-- 完成提示
DO $$
BEGIN
  RAISE NOTICE '✅ pending_users 表创建成功！';
  RAISE NOTICE '📝 请在 Supabase Dashboard 的 SQL Editor 中执行此脚本';
  RAISE NOTICE '⚠️  记得定期清理过期记录：SELECT cleanup_expired_pending_users();';
END $$;

