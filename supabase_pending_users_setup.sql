-- ==========================================
-- 待验证用户表设置（验证码方式）
-- 用于存储等待验证码验证的用户信息
-- ==========================================

-- 1. 创建 pending_users 表
CREATE TABLE IF NOT EXISTS public.pending_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  username TEXT,
  password_hash TEXT NOT NULL,
  verification_code TEXT NOT NULL,  -- 6位验证码
  code_expires_at TIMESTAMPTZ NOT NULL,  -- 验证码过期时间（10分钟）
  attempts INT DEFAULT 0,  -- 验证尝试次数
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 约束
  CONSTRAINT pending_users_email_key UNIQUE (email),
  CONSTRAINT pending_users_code_length CHECK (length(verification_code) = 6)
);

-- 2. 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_pending_users_email ON public.pending_users(email);
CREATE INDEX IF NOT EXISTS idx_pending_users_code ON public.pending_users(verification_code);
CREATE INDEX IF NOT EXISTS idx_pending_users_expires ON public.pending_users(code_expires_at);

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
  -- 删除超过 1 小时的过期记录
  DELETE FROM public.pending_users
  WHERE code_expires_at < NOW();
  
  RAISE NOTICE '已清理过期的待验证用户记录';
END;
$$;

-- 6. 授予必要的权限
GRANT ALL ON public.pending_users TO service_role;

-- 完成提示
DO $$
BEGIN
  RAISE NOTICE '✅ pending_users 表创建成功（验证码方式）！';
  RAISE NOTICE '📝 验证码有效期：10分钟';
  RAISE NOTICE '🔢 验证码长度：6位数字';
  RAISE NOTICE '⚠️  记得定期清理过期记录：SELECT cleanup_expired_pending_users();';
END $$;

