-- Migração 014: Funcionalidades Inteligentes de Estoque e Preços (Auto-Pilot)
-- Data: 2026-06-03

-- 1. Adicionar margem alvo nas categorias
ALTER TABLE categories ADD COLUMN IF NOT EXISTS target_margin NUMERIC(5,2) DEFAULT 30.00;

-- 2. Adicionar flag de auto-piloto nos produtos
ALTER TABLE products ADD COLUMN IF NOT EXISTS auto_update_price INTEGER DEFAULT 0;

-- 3. Atualizar a view de margens para considerar a margem da categoria como fallback
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
  p.auto_update_price,
  -- Prioridade de margem: 1. Produto, 2. Categoria, 3. Configuração Global
  COALESCE(
    p.product_profit_margin, 
    c.target_margin,
    CAST(COALESCE((SELECT value FROM settings WHERE key = 'default_profit_margin'), '30') AS NUMERIC)
  ) as effective_target_margin,
  -- Preço sugerido baseado no ÚLTIMO CUSTO (mais seguro para hortifruti)
  CASE 
    WHEN p.last_cost > 0 THEN ROUND(p.last_cost * (1 + (
      COALESCE(
        p.product_profit_margin, 
        c.target_margin,
        CAST(COALESCE((SELECT value FROM settings WHERE key = 'default_profit_margin'), '30') AS NUMERIC)
      ) / 100)), 2)
    ELSE p.price
  END as suggested_price_by_last_cost,
  -- Margem atual baseada no custo médio
  CASE 
    WHEN p.avg_cost > 0 AND p.price > 0 THEN ROUND(((p.price - p.avg_cost) / p.price) * 100, 2)
    ELSE 0
  END as current_margin_percent,
  p.category_id,
  p.supplier_id,
  c.name as category_name,
  s.name as supplier_name,
  p.created_at,
  p.price_manually_adjusted
FROM products p
LEFT JOIN categories c ON p.category_id = c.id
LEFT JOIN suppliers s ON p.supplier_id = s.id;
