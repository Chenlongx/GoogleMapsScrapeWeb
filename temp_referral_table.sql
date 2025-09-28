-- 临时推广追踪表
-- 如果 orders 表还没有推广字段，可以使用这个临时表

CREATE TABLE IF NOT EXISTS referral_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    out_trade_no VARCHAR(128) NOT NULL,
    referral_code VARCHAR(100),
    agent_code VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_referral_tracking_out_trade_no ON referral_tracking(out_trade_no);
CREATE INDEX IF NOT EXISTS idx_referral_tracking_referral_code ON referral_tracking(referral_code);
CREATE INDEX IF NOT EXISTS idx_referral_tracking_agent_code ON referral_tracking(agent_code);
