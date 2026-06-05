-- Migração 021: Ajustar tipagem de INTEGER para NUMERIC para suportar pesos (KG)
-- Data: 2026-06-04

-- O PostgreSQL não permite alterar o tipo de uma coluna que é usada por uma VIEW.
-- Precisamos remover a view, alterar as colunas e recriar a view.

-- Remover views que dependem das colunas de estoque e quantidade
DROP VIEW IF EXISTS v_product_margins CASCADE;
DROP VIEW IF EXISTS v_critical_stock CASCADE;
DROP VIEW IF EXISTS v_restock_suggestions CASCADE;
DROP VIEW IF EXISTS v_expiring_products CASCADE;

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

-- Recriar a view v_critical_stock (baseada na migração 020)
CREATE VIEW v_critical_stock AS
SELECT 
    id, 
    name, 
    current_stock, 
    min_stock,
    (min_stock - current_stock) as missing_quantity
FROM products
WHERE current_stock <= min_stock AND deleted_at IS NULL;

-- Recriar a view v_restock_suggestions (baseada na migração 009)
CREATE VIEW v_restock_suggestions AS
SELECT 
    p.id,
    p.name,
    p.min_stock,
    p.current_stock,
    (p.min_stock - p.current_stock) AS deficit,
    p.price,
    (p.price * GREATEST(p.min_stock - p.current_stock, 0)) AS reposition_cost
FROM products p
WHERE p.current_stock <= p.min_stock AND p.deleted_at IS NULL;

-- Recriar a view v_expiring_products (baseada na migração 015)
CREATE VIEW v_expiring_products AS
SELECT 
    id, 
    name, 
    expiry_date, 
    current_stock, 
    (expiry_date - CURRENT_DATE) as days_until_expiry
FROM products
WHERE expiry_date IS NOT NULL AND deleted_at IS NULL;
