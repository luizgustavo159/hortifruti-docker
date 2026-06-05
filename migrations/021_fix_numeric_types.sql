-- Migração 021: Ajustar tipagem de INTEGER para NUMERIC para suportar pesos (KG)
-- Data: 2026-06-04

-- Alterar a tabela products
ALTER TABLE products ALTER COLUMN current_stock TYPE NUMERIC(12,3);
ALTER TABLE products ALTER COLUMN min_stock TYPE NUMERIC(12,3);

-- Alterar a tabela sales
ALTER TABLE sales ALTER COLUMN quantity TYPE NUMERIC(12,3);

-- Alterar a tabela stock_losses
ALTER TABLE stock_losses ALTER COLUMN quantity TYPE NUMERIC(12,3);

-- Alterar a tabela stock_movements
ALTER TABLE stock_movements ALTER COLUMN delta TYPE NUMERIC(12,3);

-- Atualizar a view v_product_margins para refletir as mudanças (se necessário)
-- A view já usa os campos, então o PostgreSQL deve atualizar automaticamente a tipagem de retorno.
