CREATE VIEW IF NOT EXISTS v_critical_stock AS
SELECT 
    id, 
    name, 
    current_stock, 
    min_stock,
    (min_stock - current_stock) as missing_quantity
FROM products 
WHERE current_stock <= min_stock AND deleted_at IS NULL;
