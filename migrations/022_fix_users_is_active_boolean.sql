-- Migração evolutiva para bancos PostgreSQL existentes.
-- Contexto: versões anteriores criavam users.is_active como INTEGER (0/1).
-- O código atual consulta is_active como BOOLEAN (TRUE/FALSE), causando:
--   operator does not exist: integer = boolean
-- Esta migração converte a coluna preservando os valores atuais.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'is_active'
      AND data_type <> 'boolean'
  ) THEN
    ALTER TABLE users
      ALTER COLUMN is_active DROP DEFAULT,
      ALTER COLUMN is_active TYPE BOOLEAN
        USING CASE
          WHEN is_active IS NULL THEN TRUE
          WHEN is_active::text IN ('1', 'true', 't', 'yes', 'y') THEN TRUE
          ELSE FALSE
        END,
      ALTER COLUMN is_active SET DEFAULT TRUE,
      ALTER COLUMN is_active SET NOT NULL;
  END IF;
END $$;
