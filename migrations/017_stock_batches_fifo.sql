-- Migração 017: Gestão de Estoque por Lotes (FIFO)
-- Data: 2026-06-03

-- Tabela de Lotes de Produto
CREATE TABLE IF NOT EXISTS product_batches (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id),
    initial_quantity NUMERIC(12,3) NOT NULL,
    current_quantity NUMERIC(12,3) NOT NULL,
    unit_cost NUMERIC(12,2) NOT NULL,
    supplier_id INTEGER REFERENCES suppliers(id),
    received_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
);

-- Index para garantir a ordem FIFO (Primeiro que Entra, Primeiro que Sai)
CREATE INDEX IF NOT EXISTS idx_batches_fifo ON product_batches(product_id, received_at ASC);

-- Adicionar coluna batch_id em movimentos de estoque para rastreabilidade
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS batch_id INTEGER REFERENCES product_batches(id);

-- Migrar estoque atual para um lote inicial "legado"
INSERT INTO product_batches (product_id, initial_quantity, current_quantity, unit_cost, notes)
SELECT id, current_stock, current_stock, avg_cost, 'Lote inicial (migração)'
FROM products
WHERE current_stock > 0;
