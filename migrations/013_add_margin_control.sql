-- Migração 013: Adicionar controle de margem de lucro e preço sugerido
-- Data: 2026-06-02

ALTER TABLE products ADD COLUMN IF NOT EXISTS product_profit_margin NUMERIC(5,2) DEFAULT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_suggested_price_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_manually_adjusted INTEGER DEFAULT 0;

INSERT INTO settings (key, value, updated_at) 
VALUES ('default_profit_margin', '30.00', CURRENT_TIMESTAMP)
ON CONFLICT (key) DO NOTHING;

DROP VIEW IF EXISTS v_product_margins CASCADE;
CREATE VIEW v_product_margins AS
SELECT 
  p.id,
  p.name,
  p.sku,
  p.current_stock,
  p.price as current_price,
  p.avg_cost,
  p.last_cost,
  COALESCE(p.product_profit_margin, CAST(COALESCE((SELECT value FROM settings WHERE key = 'default_profit_margin'), '30') AS NUMERIC)) as target_margin,
  CASE 
    WHEN p.avg_cost > 0 THEN ROUND(p.avg_cost * (1 + (COALESCE(p.product_profit_margin, CAST(COALESCE((SELECT value FROM settings WHERE key = 'default_profit_margin'), '30') AS NUMERIC)) / 100)), 2)
    ELSE p.price
  END as suggested_price,
  CASE 
    WHEN p.avg_cost > 0 AND p.price > 0 THEN ROUND(((p.price - p.avg_cost) / p.price) * 100, 2)
    ELSE 0
  END as current_margin_percent,
  CASE 
    WHEN p.avg_cost > 0 AND p.price > 0 THEN 
      ROUND(((p.price - p.avg_cost) / p.price) * 100, 2) - COALESCE(p.product_profit_margin, CAST(COALESCE((SELECT value FROM settings WHERE key = 'default_profit_margin'), '30') AS NUMERIC))
    ELSE 0
  END as margin_difference,
  CASE 
    WHEN p.avg_cost > 0 AND p.price > 0 THEN
      CASE 
        WHEN ROUND(((p.price - p.avg_cost) / p.price) * 100, 2) < COALESCE(p.product_profit_margin, CAST(COALESCE((SELECT value FROM settings WHERE key = 'default_profit_margin'), '30') AS NUMERIC)) THEN 'low_margin'
        ELSE 'ok'
      END
    ELSE 'no_cost'
  END as margin_status,
  CASE 
    WHEN p.avg_cost > 0 THEN ROUND(p.price - p.avg_cost, 2)
    ELSE 0
  END as profit_per_unit,
  CASE 
    WHEN p.avg_cost > 0 THEN ROUND((p.price - p.avg_cost) * p.current_stock, 2)
    ELSE 0
  END as total_profit_in_stock,
  p.category_id,
  p.supplier_id,
  c.name as category_name,
  s.name as supplier_name,
  p.created_at,
  p.last_suggested_price_at,
  p.price_manually_adjusted
FROM products p
LEFT JOIN categories c ON p.category_id = c.id
LEFT JOIN suppliers s ON p.supplier_id = s.id;

CREATE INDEX IF NOT EXISTS idx_products_avg_cost ON products(avg_cost);
CREATE INDEX IF NOT EXISTS idx_products_margin_status ON products(product_profit_margin);
