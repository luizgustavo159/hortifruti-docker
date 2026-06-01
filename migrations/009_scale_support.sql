-- Migração 009: Suporte a balança e produtos por kilo
-- Altera colunas de estoque e quantidade de vendas para NUMERIC(12,3)
-- permitindo valores decimais (ex: 0.500 kg, 1.250 kg)

-- No PostgreSQL, não é possível alterar o tipo de uma coluna usada por uma view.
-- Precisamos remover as views dependentes e recriá-las após a alteração.

-- Remover views dependentes
DROP VIEW IF EXISTS v_expiring_products;
DROP VIEW IF EXISTS v_critical_stock;
DROP VIEW IF EXISTS v_daily_sales;
DROP VIEW IF EXISTS v_operator_performance;

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

-- Recriar views dependentes (mantendo a lógica original da migração 005)
CREATE OR REPLACE VIEW v_expiring_products AS
SELECT
  p.id,
  p.name,
  p.sku,
  p.expiry_date,
  p.expiry_alert_days,
  p.current_stock,
  p.price
FROM products p
WHERE p.is_perishable = 1
  AND p.deleted_at IS NULL
  AND p.expiry_date IS NOT NULL
ORDER BY p.expiry_date ASC;

CREATE OR REPLACE VIEW v_critical_stock AS
SELECT
  p.id,
  p.name,
  p.sku,
  p.min_stock,
  p.current_stock,
  (p.min_stock - p.current_stock) AS deficit,
  p.price,
  (p.price * GREATEST(p.min_stock - p.current_stock, 0)) AS reposition_cost
FROM products p
WHERE p.current_stock <= p.min_stock
  AND p.deleted_at IS NULL
ORDER BY deficit DESC;

CREATE OR REPLACE VIEW v_daily_sales AS
SELECT
  s.id,
  s.created_at,
  u.name AS operator_name,
  s.total,
  s.discount_amount,
  s.final_total,
  s.payment_method,
  s.quantity AS items_count
FROM sales s
LEFT JOIN users u ON s.sold_by = u.id
WHERE CAST(s.created_at AS DATE) = CURRENT_DATE
ORDER BY s.created_at DESC;

CREATE OR REPLACE VIEW v_operator_performance AS
SELECT
  u.id,
  u.name,
  COUNT(s.id) AS total_sales,
  COALESCE(SUM(s.final_total), 0) AS total_revenue,
  COALESCE(AVG(s.final_total), 0) AS avg_sale_value,
  COALESCE(SUM(s.discount_amount), 0) AS total_discounts,
  CAST(MAX(s.created_at) AS DATE) AS last_sale_date
FROM users u
LEFT JOIN sales s ON u.id = s.sold_by AND CAST(s.created_at AS DATE) = CURRENT_DATE
WHERE u.deleted_at IS NULL AND u.role = 'operator'
GROUP BY u.id, u.name
ORDER BY total_revenue DESC;
