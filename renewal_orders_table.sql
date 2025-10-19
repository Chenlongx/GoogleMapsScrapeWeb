-- ====================================
-- 续费订单表
-- ====================================
-- 用于存储用户的续费订单信息

CREATE TABLE IF NOT EXISTS renewal_orders (
    -- 主键
    id BIGSERIAL PRIMARY KEY,
    
    -- 订单信息
    order_id VARCHAR(100) UNIQUE NOT NULL,
    user_id VARCHAR(100) NOT NULL,
    username VARCHAR(255),
    
    -- 续费方案
    renewal_type VARCHAR(20) NOT NULL, -- monthly, quarterly, yearly
    amount DECIMAL(10, 2) NOT NULL,
    duration VARCHAR(50),
    product_name VARCHAR(255),
    
    -- 订单状态
    status VARCHAR(20) DEFAULT 'pending', -- pending, paid, failed, cancelled
    trade_no VARCHAR(100), -- 支付宝交易号
    
    -- 续费信息
    new_expiry_date TIMESTAMPTZ, -- 新的到期时间
    
    -- 时间戳
    paid_at TIMESTAMPTZ, -- 支付完成时间
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================
-- 索引
-- ====================================

-- 按用户ID查询订单
CREATE INDEX IF NOT EXISTS idx_renewal_orders_user_id 
ON renewal_orders(user_id);

-- 按订单ID查询
CREATE INDEX IF NOT EXISTS idx_renewal_orders_order_id 
ON renewal_orders(order_id);

-- 按状态查询
CREATE INDEX IF NOT EXISTS idx_renewal_orders_status 
ON renewal_orders(status);

-- 按创建时间查询
CREATE INDEX IF NOT EXISTS idx_renewal_orders_created_at 
ON renewal_orders(created_at DESC);

-- ====================================
-- 触发器（自动更新 updated_at）
-- ====================================

CREATE OR REPLACE FUNCTION update_renewal_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER renewal_orders_updated_at_trigger
BEFORE UPDATE ON renewal_orders
FOR EACH ROW
EXECUTE FUNCTION update_renewal_orders_updated_at();

-- ====================================
-- 注释
-- ====================================

COMMENT ON TABLE renewal_orders IS '续费订单表';
COMMENT ON COLUMN renewal_orders.order_id IS '订单唯一标识';
COMMENT ON COLUMN renewal_orders.user_id IS '用户ID';
COMMENT ON COLUMN renewal_orders.renewal_type IS '续费类型：monthly（月付）, quarterly（季付）, yearly（年付）';
COMMENT ON COLUMN renewal_orders.amount IS '订单金额';
COMMENT ON COLUMN renewal_orders.status IS '订单状态：pending（待支付）, paid（已支付）, failed（失败）, cancelled（取消）';
COMMENT ON COLUMN renewal_orders.trade_no IS '支付宝交易号';
COMMENT ON COLUMN renewal_orders.new_expiry_date IS '支付成功后的新到期时间';

