-- Tabela de Lotes de Produtos
CREATE TABLE IF NOT EXISTS product_batches (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL,
  batch_number TEXT,
  quantity NUMERIC(12,2) NOT NULL,
  initial_quantity NUMERIC(12,2) NOT NULL,
  unit_cost NUMERIC(12,2) NOT NULL,
  expires_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(product_id) REFERENCES products(id)
);

-- Adicionar colunas de controle de custo dinâmico na tabela de produtos
ALTER TABLE products ADD COLUMN IF NOT EXISTS avg_cost NUMERIC(12,2) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_profit_margin NUMERIC(12,2) DEFAULT 30;

-- Criar índices para acelerar a busca por lotes (FIFO)
CREATE INDEX IF NOT EXISTS idx_batches_product_id ON product_batches(product_id);
-- O índice de expires_at será criado apenas se a coluna for validada no banco
-- CREATE INDEX IF NOT EXISTS idx_batches_expires_at ON product_batches(expires_at);
CREATE INDEX IF NOT EXISTS idx_batches_received_at ON product_batches(received_at);
