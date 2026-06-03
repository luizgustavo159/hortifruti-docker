-- Migração 016: Sistema de Fiado (Caderneta)
-- Data: 2026-06-03

-- Tabela de Clientes
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    credit_limit NUMERIC(12,2) DEFAULT 500.00,
    current_debt NUMERIC(12,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Adicionar coluna customer_id na tabela de vendas
ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id);

-- Tabela de Pagamentos de Dívida (Baixas de Fiado)
CREATE TABLE IF NOT EXISTS customer_payments (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    amount NUMERIC(12,2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    received_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Index para busca rápida de clientes
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
