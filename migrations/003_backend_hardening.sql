-- SQLite não suporta ADD COLUMN IF NOT EXISTS em algumas versões ou implementações WASM
-- Vamos usar uma abordagem direta
ALTER TABLE stock_losses ADD COLUMN reported_by INTEGER;
ALTER TABLE sales ADD COLUMN cancelled_at DATETIME;
ALTER TABLE sales ADD COLUMN cancel_reason TEXT;
ALTER TABLE sales ADD COLUMN cancelled_by INTEGER;
