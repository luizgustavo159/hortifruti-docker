-- Migração 017: Gestão de Estoque por Lotes (FIFO)
-- Data: 2026-06-03
-- CORREÇÃO: Migração evolutiva via ALTER TABLE para não quebrar instalação limpa.
-- A tabela product_batches já foi criada em 001_product_batches.sql com as colunas
-- (id, product_id, batch_number, quantity, initial_quantity, unit_cost, expires_at,
--  received_at, created_at). Esta migração apenas adiciona as colunas ausentes e
-- cria os índices/colunas extras necessários para o fluxo FIFO.

-- Adicionar current_quantity se ainda não existir (espelha quantity como saldo atual)
ALTER TABLE product_batches ADD COLUMN IF NOT EXISTS current_quantity NUMERIC(12,3);

-- Adicionar supplier_id se ainda não existir
ALTER TABLE product_batches ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id);

-- Adicionar notes se ainda não existir
ALTER TABLE product_batches ADD COLUMN IF NOT EXISTS notes TEXT;

-- Popularizar current_quantity a partir de quantity para lotes já existentes
UPDATE product_batches SET current_quantity = quantity WHERE current_quantity IS NULL;

-- Tornar current_quantity NOT NULL após popular os dados existentes
ALTER TABLE product_batches ALTER COLUMN current_quantity SET NOT NULL;
ALTER TABLE product_batches ALTER COLUMN current_quantity SET DEFAULT 0;

-- Index para garantir a ordem FIFO (Primeiro que Entra, Primeiro que Sai)
CREATE INDEX IF NOT EXISTS idx_batches_fifo ON product_batches(product_id, received_at ASC);

-- Adicionar coluna batch_id em movimentos de estoque para rastreabilidade
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS batch_id INTEGER REFERENCES product_batches(id);

-- Migrar estoque atual para um lote inicial "legado" (apenas para produtos sem lote ainda)
INSERT INTO product_batches (product_id, initial_quantity, current_quantity, unit_cost, notes)
SELECT id, current_stock, current_stock, COALESCE(avg_cost, 0), 'Lote inicial (migração)'
FROM products
WHERE current_stock > 0
  AND id NOT IN (SELECT DISTINCT product_id FROM product_batches WHERE product_id IS NOT NULL);
