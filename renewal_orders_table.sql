-- 创建续费订单表
CREATE TABLE IF NOT EXISTS renewal_orders (
    id BIGSERIAL PRIMARY KEY,
    order_id VARCHAR(100) UNIQUE NOT NULL,
    user_id VARCHAR(100) NOT NULL,
    username VARCHAR(255),
    renewal_type VARCHAR(20) NOT NULL CHECK (renewal_type IN ('monthly', 'yearly', 'lifetime')),
    amount DECIMAL(10, 2) NOT NULL,
    duration VARCHAR(50),
    product_name VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled', 'refunded')),
    trade_no VARCHAR(100),
    new_expiry_date TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX idx_renewal_orders_order_id ON renewal_orders(order_id);
CREATE INDEX idx_renewal_orders_user_id ON renewal_orders(user_id);
CREATE INDEX idx_renewal_orders_status ON renewal_orders(status);
CREATE INDEX idx_renewal_orders_created_at ON renewal_orders(created_at DESC);

-- 添加注释
COMMENT ON TABLE renewal_orders IS '续费订单表';
COMMENT ON COLUMN renewal_orders.order_id IS '订单ID（唯一）';
COMMENT ON COLUMN renewal_orders.user_id IS '用户ID';
COMMENT ON COLUMN renewal_orders.renewal_type IS '续费类型：monthly=月付，yearly=年付，lifetime=永久';
COMMENT ON COLUMN renewal_orders.amount IS '支付金额';
COMMENT ON COLUMN renewal_orders.status IS '订单状态：pending=待支付，completed=已完成，cancelled=已取消，refunded=已退款';
COMMENT ON COLUMN renewal_orders.trade_no IS '支付宝交易号';
COMMENT ON COLUMN renewal_orders.new_expiry_date IS '新的到期时间';
COMMENT ON COLUMN renewal_orders.paid_at IS '支付时间';

