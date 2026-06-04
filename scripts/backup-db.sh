#!/bin/bash

# Configurações
DB_PATH="./database.sqlite"
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.sqlite"

# Criar diretório de backup se não existir
mkdir -p "$BACKUP_DIR"

# Realizar o backup usando o comando .backup do sqlite3 (seguro para arquivos em uso)
if [ -f "$DB_PATH" ]; then
    sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"
    echo "Backup concluído com sucesso: $BACKUP_FILE"
    
    # Manter apenas os últimos 7 backups para economizar espaço
    ls -t "$BACKUP_DIR"/backup_*.sqlite | tail -n +8 | xargs -r rm --
    echo "Limpeza de backups antigos concluída."
else
    echo "Erro: Arquivo de banco de dados não encontrado em $DB_PATH"
    exit 1
fi
