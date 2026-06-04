#!/bin/bash

# Configurações
# DATABASE_URL deve estar disponível no ambiente
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.sql"

# Criar diretório de backup se não existir
mkdir -p "$BACKUP_DIR"

# Realizar o backup usando pg_dump
if [ -n "$DATABASE_URL" ]; then
    pg_dump "$DATABASE_URL" > "$BACKUP_FILE"
    echo "Backup PostgreSQL concluído com sucesso: $BACKUP_FILE"
    
    # Compactar para economizar espaço
    gzip "$BACKUP_FILE"
    echo "Backup compactado: $BACKUP_FILE.gz"
    
    # Manter apenas os últimos 7 backups
    ls -t "$BACKUP_DIR"/backup_*.sql.gz | tail -n +8 | xargs -r rm --
    echo "Limpeza de backups antigos concluída."
else
    echo "Erro: DATABASE_URL não definida."
    exit 1
fi
