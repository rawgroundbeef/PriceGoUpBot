-- PriceGoUpBot Database Schema for Supabase
-- This file contains the SQL commands to create all necessary tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Volume Orders Table
CREATE TABLE volume_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(50) NOT NULL,
    username VARCHAR(100),
    token_address VARCHAR(44) NOT NULL,
    pool_address VARCHAR(44) NOT NULL,
    pool_type VARCHAR(20) NOT NULL DEFAULT 'raydium',
    volume_target INTEGER NOT NULL, -- Volume target in USD
    duration_hours INTEGER NOT NULL,
    tasks_count INTEGER NOT NULL,
    cost_per_task DECIMAL(10,2) NOT NULL,
    total_cost DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending_payment',
    payment_address VARCHAR(44) NOT NULL,
    payment_signature TEXT, -- Store multiple signatures (fees:sig1,ops:sig2)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT volume_orders_status_check CHECK (status IN (
        'pending_payment', 'payment_confirmed', 'running', 'paused', 'completed', 'cancelled', 'failed'
    )),
    CONSTRAINT volume_orders_pool_type_check CHECK (pool_type IN (
        'raydium', 'orca', 'jupiter'
    ))
);

-- Volume Tasks Table
CREATE TABLE volume_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES volume_orders(id) ON DELETE CASCADE,
    wallet_address VARCHAR(44) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    target_volume DECIMAL(12,2) NOT NULL, -- Target volume in USD
    current_volume DECIMAL(12,2) NOT NULL DEFAULT 0,
    interval_minutes INTEGER NOT NULL,
    cycles_completed INTEGER NOT NULL DEFAULT 0,
    total_cycles INTEGER NOT NULL DEFAULT 5,
    last_transaction_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT volume_tasks_status_check CHECK (status IN (
        'pending', 'running', 'paused', 'completed', 'failed'
    ))
);

-- Token Info Table
CREATE TABLE token_info (
    address VARCHAR(44) PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    decimals INTEGER NOT NULL,
    market_cap BIGINT,
    price DECIMAL(18,9),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Liquidity Pools Table
CREATE TABLE liquidity_pools (
    address VARCHAR(44) PRIMARY KEY,
    token_a VARCHAR(44) NOT NULL,
    token_b VARCHAR(44) NOT NULL,
    pool_type VARCHAR(20) NOT NULL,
    liquidity_usd DECIMAL(15,2) NOT NULL,
    volume_24h DECIMAL(15,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT liquidity_pools_pool_type_check CHECK (pool_type IN (
        'raydium', 'orca', 'jupiter'
    ))
);

-- Transactions Table
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES volume_tasks(id) ON DELETE CASCADE,
    signature VARCHAR(88) NOT NULL UNIQUE,
    type VARCHAR(10) NOT NULL,
    amount_sol DECIMAL(12,9) NOT NULL,
    amount_tokens DECIMAL(18,6) NOT NULL,
    price DECIMAL(18,9) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT transactions_type_check CHECK (type IN ('buy', 'sell'))
);

-- Indexes for better performance
CREATE INDEX idx_volume_orders_user_id ON volume_orders(user_id);
CREATE INDEX idx_volume_orders_status ON volume_orders(status);
CREATE INDEX idx_volume_orders_token_address ON volume_orders(token_address);
CREATE INDEX idx_volume_orders_created_at ON volume_orders(created_at);

CREATE INDEX idx_volume_tasks_order_id ON volume_tasks(order_id);
CREATE INDEX idx_volume_tasks_status ON volume_tasks(status);
CREATE INDEX idx_volume_tasks_last_transaction_at ON volume_tasks(last_transaction_at);

CREATE INDEX idx_liquidity_pools_token_a ON liquidity_pools(token_a);
CREATE INDEX idx_liquidity_pools_token_b ON liquidity_pools(token_b);
CREATE INDEX idx_liquidity_pools_liquidity_usd ON liquidity_pools(liquidity_usd DESC);

CREATE INDEX idx_transactions_task_id ON transactions(task_id);
CREATE INDEX idx_transactions_signature ON transactions(signature);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);

-- Functions to automatically update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to update updated_at timestamps
CREATE TRIGGER update_volume_orders_updated_at BEFORE UPDATE ON volume_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_volume_tasks_updated_at BEFORE UPDATE ON volume_tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_token_info_updated_at BEFORE UPDATE ON token_info
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_liquidity_pools_updated_at BEFORE UPDATE ON liquidity_pools
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies
-- Enable RLS on all tables
ALTER TABLE volume_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE volume_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE liquidity_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Policies for volume_orders (users can only see their own orders)
CREATE POLICY "Users can view their own orders" ON volume_orders
    FOR SELECT USING (auth.uid()::text = user_id OR auth.role() = 'service_role');

CREATE POLICY "Users can insert their own orders" ON volume_orders
    FOR INSERT WITH CHECK (auth.uid()::text = user_id OR auth.role() = 'service_role');

CREATE POLICY "Service can update orders" ON volume_orders
    FOR UPDATE USING (auth.role() = 'service_role');

-- Policies for volume_tasks (accessible via orders relationship)
CREATE POLICY "Users can view tasks for their orders" ON volume_tasks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM volume_orders 
            WHERE id = volume_tasks.order_id 
            AND (user_id = auth.uid()::text OR auth.role() = 'service_role')
        )
    );

CREATE POLICY "Service can manage tasks" ON volume_tasks
    FOR ALL USING (auth.role() = 'service_role');

-- Policies for token_info (read-only for users)
CREATE POLICY "Anyone can view token info" ON token_info
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service can manage token info" ON token_info
    FOR ALL USING (auth.role() = 'service_role');

-- Policies for liquidity_pools (read-only for users)
CREATE POLICY "Anyone can view liquidity pools" ON liquidity_pools
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service can manage liquidity pools" ON liquidity_pools
    FOR ALL USING (auth.role() = 'service_role');

-- Policies for transactions (accessible via tasks relationship)
CREATE POLICY "Users can view transactions for their tasks" ON transactions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM volume_tasks vt
            JOIN volume_orders vo ON vt.order_id = vo.id
            WHERE vt.id = transactions.task_id 
            AND (vo.user_id = auth.uid()::text OR auth.role() = 'service_role')
        )
    );

CREATE POLICY "Service can manage transactions" ON transactions
    FOR ALL USING (auth.role() = 'service_role');

-- Create a view for order analytics
CREATE VIEW order_analytics AS
SELECT 
    vo.id,
    vo.user_id,
    vo.username,
    vo.token_address,
    vo.pool_address,
    vo.volume_target,
    vo.duration_hours,
    vo.tasks_count,
    vo.total_cost,
    vo.status,
    vo.created_at,
    vo.started_at,
    vo.completed_at,
    COUNT(vt.id) as total_tasks,
    COUNT(CASE WHEN vt.status = 'completed' THEN 1 END) as completed_tasks,
    COUNT(CASE WHEN vt.status = 'running' THEN 1 END) as running_tasks,
    COALESCE(SUM(vt.current_volume), 0) as total_volume_generated,
    COUNT(t.id) as total_transactions
FROM volume_orders vo
LEFT JOIN volume_tasks vt ON vo.id = vt.order_id
LEFT JOIN transactions t ON vt.id = t.task_id
GROUP BY vo.id, vo.user_id, vo.username, vo.token_address, vo.pool_address, 
         vo.volume_target, vo.duration_hours, vo.tasks_count, vo.total_cost, 
         vo.status, vo.created_at, vo.started_at, vo.completed_at;

-- Grant permissions on the view
GRANT SELECT ON order_analytics TO authenticated;

-- Note: RLS policies cannot be applied to views directly.
-- The view inherits security from the underlying tables (volume_orders, volume_tasks, transactions)
-- Users will only see analytics for their own orders due to the RLS policies on volume_orders.
