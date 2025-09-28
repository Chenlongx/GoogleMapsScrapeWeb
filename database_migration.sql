-- 数据库迁移脚本：为 orders 表添加推广相关字段
-- 请在 Supabase SQL 编辑器中执行此脚本

-- 1. 为 orders 表添加推广相关字段
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS referral_code VARCHAR(100),
ADD COLUMN IF NOT EXISTS agent_code VARCHAR(50);

-- 2. 为 orders 表添加索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_orders_referral_code ON orders(referral_code);
CREATE INDEX IF NOT EXISTS idx_orders_agent_code ON orders(agent_code);

-- 3. 验证字段是否添加成功
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'orders' 
AND column_name IN ('referral_code', 'agent_code');
