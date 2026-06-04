DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='audit_logs' AND COLUMN_NAME='type') THEN
        ALTER TABLE audit_logs ADD COLUMN type TEXT DEFAULT 'info';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='audit_logs' AND COLUMN_NAME='level') THEN
        ALTER TABLE audit_logs ADD COLUMN level TEXT DEFAULT 'low';
    END IF;
END $$;

-- Índices já possuem IF NOT EXISTS ou falham silenciosamente em algumas versões, 
-- mas aqui vamos garantir a criação segura.
CREATE INDEX IF NOT EXISTS idx_audit_logs_type ON audit_logs(type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_level ON audit_logs(level);
