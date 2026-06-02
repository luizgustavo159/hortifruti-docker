-- Adicionar colunas de custo que podem estar faltando em instalações limpas
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='avg_cost') THEN
        ALTER TABLE products ADD COLUMN avg_cost NUMERIC(12,2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='last_cost') THEN
        ALTER TABLE products ADD COLUMN last_cost NUMERIC(12,2) DEFAULT 0;
    END IF;
END $$;
