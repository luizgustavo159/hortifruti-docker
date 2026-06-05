-- Migração 003: Hardening do backend
-- CORREÇÃO: Usar ADD COLUMN IF NOT EXISTS para compatibilidade com PostgreSQL
-- em bancos que já tiveram migrações parciais anteriores.
ALTER TABLE stock_losses ADD COLUMN IF NOT EXISTS reported_by INTEGER;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancelled_by INTEGER;
