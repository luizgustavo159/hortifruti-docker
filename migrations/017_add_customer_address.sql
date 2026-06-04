-- Migração 017: Adicionar campo de endereço na tabela de clientes
-- Data: 2026-06-04

ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;
