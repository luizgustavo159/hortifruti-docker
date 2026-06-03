-- Migração 015: Adicionar suporte a sangria/suprimento e controle de validade
-- Data: 2026-06-03

-- Tabela para movimentações de caixa (sangria e suprimento)
CREATE TABLE IF NOT EXISTS cash_movements (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES cash_sessions(id),
    type VARCHAR(20) NOT NULL, -- 'in' (suprimento) ou 'out' (sangria)
    amount NUMERIC(12,2) NOT NULL,
    reason TEXT NOT NULL,
    performed_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Adicionar data de validade nos produtos se não existir
ALTER TABLE products ADD COLUMN IF NOT EXISTS expiry_date DATE DEFAULT NULL;

-- View para produtos próximos ao vencimento (7 dias)
-- PostgreSQL não permite remover/alterar colunas de uma view existente com
-- CREATE OR REPLACE VIEW. Como a migração 005/009 criou esta view com outra
-- lista de colunas, removemos a versão anterior antes de recriá-la.
DROP VIEW IF EXISTS v_expiring_products;
CREATE VIEW v_expiring_products AS
SELECT 
    id, 
    name, 
    current_stock, 
    expiry_date,
    (expiry_date - CURRENT_DATE) as days_until_expiry
FROM products
WHERE expiry_date IS NOT NULL 
AND expiry_date <= (CURRENT_DATE + INTERVAL '7 days')
ORDER BY expiry_date ASC;
