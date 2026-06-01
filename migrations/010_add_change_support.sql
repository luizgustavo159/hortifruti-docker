-- Migração 010: Suporte a troco no PDV
-- Adiciona colunas para registrar o valor recebido e o troco devolvido

ALTER TABLE sales ADD COLUMN IF NOT EXISTS amount_received NUMERIC(12,2) DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS change_amount NUMERIC(12,2) DEFAULT 0;

-- Comentários para documentação
COMMENT ON COLUMN sales.amount_received IS 'Valor total entregue pelo cliente';
COMMENT ON COLUMN sales.change_amount IS 'Valor devolvido como troco';
