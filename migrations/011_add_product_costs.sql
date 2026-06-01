-- Adiciona campos de custo e margem na tabela de produtos
ALTER TABLE products ADD COLUMN IF NOT EXISTS avg_cost NUMERIC(12,2) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_cost NUMERIC(12,2) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS profit_margin NUMERIC(12,2) DEFAULT 0; -- Percentual de lucro desejado

-- Adiciona campo de custo unitário nos itens de pedido de compra
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12,2) DEFAULT 0;

-- Adiciona campo de custo unitário nas movimentações de estoque para histórico
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12,2) DEFAULT 0;

-- Atualiza a view de estoque crítico para usar o custo médio se disponível, senão o preço de venda
DROP VIEW IF EXISTS v_critical_stock;
CREATE VIEW v_critical_stock AS
SELECT 
  p.*,
  c.name as category_name,
  s.name as supplier_name,
  (p.min_stock - p.current_stock) as deficit,
  (COALESCE(NULLIF(p.avg_cost, 0), p.price) * GREATEST(p.min_stock - p.current_stock, 0)) AS reposition_cost,
  -- Preço sugerido baseado na margem de lucro
  CASE 
    WHEN p.avg_cost > 0 AND p.profit_margin > 0 THEN (p.avg_cost * (1 + (p.profit_margin / 100)))
    ELSE p.price 
  END as suggested_price
FROM products p
LEFT JOIN categories c ON p.category_id = c.id
LEFT JOIN suppliers s ON p.supplier_id = s.id
WHERE p.current_stock <= p.min_stock;
