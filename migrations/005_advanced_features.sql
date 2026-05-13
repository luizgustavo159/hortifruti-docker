-- ============ ADVANCED DATABASE FEATURES ============
-- Data: 2026-05-04
-- Objetivo: adicionar índices, soft delete, colunas de perecíveis e views usando o schema real do projeto.

-- ============ ÍNDICES PARA PERFORMANCE ============

-- Produtos
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_current_stock ON products(current_stock);

-- Estoque e vendas
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_sold_by ON sales(sold_by);
CREATE INDEX IF NOT EXISTS idx_sales_total ON sales(total);
CREATE INDEX IF NOT EXISTS idx_sales_payment_method ON sales(payment_method);

-- Usuários
CREATE INDEX IF NOT EXISTS idx_users_email_lookup ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- Auditoria
CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by ON audit_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ============ COLUNAS DE VALIDADE PARA PERECÍVEIS ============

ALTER TABLE products ADD COLUMN IF NOT EXISTS expiry_date TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS expiry_alert_days INTEGER DEFAULT 7;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_perishable INTEGER NOT NULL DEFAULT 0;

-- ============ SOFT DELETE ============

ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON products(deleted_at);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);
CREATE INDEX IF NOT EXISTS idx_categories_deleted_at ON categories(deleted_at);
CREATE INDEX IF NOT EXISTS idx_discounts_deleted_at ON discounts(deleted_at);

-- ============ VIEWS PARA RELATÓRIOS ============

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

-- ============ BACKUP E RETENÇÃO ============

CREATE TABLE IF NOT EXISTS backup_history (
  id SERIAL PRIMARY KEY,
  backup_name VARCHAR(255) NOT NULL,
  backup_size BIGINT,
  backup_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'success',
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_backup_history_date ON backup_history(backup_date DESC);
