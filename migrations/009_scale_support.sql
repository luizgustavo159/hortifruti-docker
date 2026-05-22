-- Migração 009: Suporte a balança e produtos por kilo
-- Altera colunas de estoque e quantidade de vendas para NUMERIC(12,3)
-- permitindo valores decimais (ex: 0.500 kg, 1.250 kg)
-- Nota: em SQLite o ALTER COLUMN TYPE é ignorado silenciosamente (SQLite é typeless),
-- portanto esta migração é segura para ambos os ambientes.

-- Produtos: estoque passa a aceitar decimais
ALTER TABLE products
  ALTER COLUMN current_stock TYPE NUMERIC(12,3);

ALTER TABLE products
  ALTER COLUMN min_stock TYPE NUMERIC(12,3);

ALTER TABLE products
  ALTER COLUMN max_stock TYPE NUMERIC(12,3);

-- Vendas: quantidade passa a aceitar decimais
ALTER TABLE sales
  ALTER COLUMN quantity TYPE NUMERIC(12,3);

-- Perdas de estoque: quantidade passa a aceitar decimais
ALTER TABLE stock_losses
  ALTER COLUMN quantity TYPE NUMERIC(12,3);

-- Pedidos de compra: quantidade passa a aceitar 3 casas decimais
ALTER TABLE purchase_order_items
  ALTER COLUMN quantity TYPE NUMERIC(12,3);
