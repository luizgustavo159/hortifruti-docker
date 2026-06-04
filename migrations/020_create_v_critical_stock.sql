-- No PostgreSQL, CREATE OR REPLACE VIEW não permite remover colunas de uma view existente.
-- É necessário remover a view anterior antes de recriá-la com a nova estrutura.
DROP VIEW IF EXISTS v_critical_stock;

CREATE VIEW v_critical_stock AS
SELECT 
    id, 
    name, 
    current_stock, 
    min_stock,
    (min_stock - current_stock) as missing_quantity
FROM products 
WHERE current_stock <= min_stock AND deleted_at IS NULL;
