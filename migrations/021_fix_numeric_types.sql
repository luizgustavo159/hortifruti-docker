-- Migração 021: Ajustar tipagem de INTEGER para NUMERIC para suportar pesos (KG)
-- Data: 2026-06-04

-- O PostgreSQL não permite alterar o tipo de uma coluna que é usada por uma VIEW.
-- Precisamos remover a view, alterar as colunas e recriar a view.

DROP VIEW IF EXISTS v_product_margins;

-- Alterar a tabela products
ALTER TABLE products ALTER COLUMN current_stock TYPE NUMERIC(12,3);
ALTER TABLE products ALTER COLUMN min_stock TYPE NUMERIC(12,3);

-- Alterar a tabela sales
ALTER TABLE sales ALTER COLUMN quantity TYPE NUMERIC(12,3);

-- Alterar a tabela stock_losses
ALTER TABLE stock_losses ALTER COLUMN quantity TYPE NUMERIC(12,3);

-- Alterar a tabela stock_movements
ALTER TABLE stock_movements ALTER COLUMN delta TYPE NUMERIC(12,3);

-- Recriar a view v_product_margins (baseada na migração 013)
CREATE VIEW v_product_margins AS
SELECT 
  p.id,
  p.name,
  p.sku,
  p.price,
  p.current_stock,
  p.min_stock,
  p.avg_cost,
  p.last_cost,
  COALESCE(p.product_profit_margin, CAST(COALESCE((SELECT value FROM settings WHERE key = 'default_profit_margin'), '30') AS NUMERIC)) as target_margin,
  CASE 
    WHEN p.avg_cost > 0 AND COALESCE(p.product_profit_margin, CAST(COALESCE((SELECT value FROM settings WHERE key = 'default_profit_margin'), '30') AS NUMERIC)) < 100 THEN 
      ROUND(p.avg_cost / (1 - (COALESCE(p.product_profit_margin, CAST(COALESCE((SELECT value FROM settings WHERE key = 'default_profit_margin'), '30') AS NUMERIC)) / 100)), 2)
    ELSE p.price
  END as suggested_price,
  CASE 
    WHEN p.avg_cost > 0 AND p.price > 0 THEN ROUND(((p.price - p.avg_cost) / p.price) * 100, 2)
    ELSE 0
  END as current_margin
FROM products p;
