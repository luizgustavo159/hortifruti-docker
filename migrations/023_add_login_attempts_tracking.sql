-- Migração para rastrear tentativas de login e bloqueio de usuários.
-- Adiciona coluna para contagem de falhas e data de bloqueio.

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS login_attempts_count INTEGER DEFAULT 0;

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

-- Comentário técnico: A unicidade do prefixo será garantida via lógica de aplicação 
-- para permitir flexibilidade de e-mails, mas manter a segurança do login por prefixo.
