-- Migração 018: Adicionar campo de imagem ilustrativa para produtos
-- Data: 2026-06-04

ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
