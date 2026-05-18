# Tutorial de Instalação do GreenStore (Hortifruti)

Este guia fornece instruções detalhadas para instalar e configurar o sistema GreenStore em um servidor Linux (Ubuntu 22.04+).

## 1. Pré-requisitos

Certifique-se de ter as seguintes ferramentas instaladas:
- **Node.js** (v18 ou superior)
- **pnpm** ou **npm**
- **PostgreSQL** (v14 ou superior)
- **Redis** (v6 ou superior)

## 2. Instalação de Dependências do Sistema

```bash
sudo apt update
sudo apt install -y nodejs npm postgresql postgresql-contrib redis-server git
```

## 3. Configuração do Banco de Dados (PostgreSQL)

1. Acesse o terminal do Postgres:
   ```bash
   sudo -u postgres psql
   ```
2. Crie o usuário e o banco de dados:
   ```sql
   CREATE USER greenstore WITH PASSWORD 'sua_senha_aqui';
   CREATE DATABASE greenstore OWNER greenstore;
   GRANT ALL PRIVILEGES ON DATABASE greenstore TO greenstore;
   \q
   ```
3. **Importante:** Edite o arquivo de configuração do PostgreSQL (`/etc/postgresql/<versao>/main/pg_hba.conf`) para permitir conexões locais com o método `trust` ou `md5` para o usuário `greenstore`.
   Exemplo (adicione no início do arquivo):
   ```
   local   all             greenstore                               trust
   host    all             greenstore        127.0.0.1/32          trust
   ```
   Reinicie o PostgreSQL após a alteração:
   ```bash
   sudo service postgresql restart
   ```

## 4. Clonagem e Configuração do Projeto

1. Clone o repositório:
   ```bash
   git clone https://github.com/luizgustavo159/hortifruti.git
   cd hortifruti
   ```
2. Instale as dependências do backend:
   ```bash
   npm install
   ```
3. Configure as variáveis de ambiente:
   - Copie o arquivo de exemplo: `cp .env.example .env`
   - Edite o `.env` e configure a `DATABASE_URL`:
     `DATABASE_URL=postgres://greenstore:sua_senha_aqui@localhost:5432/greenstore`
   - Configure o `JWT_SECRET` com uma chave segura.
   - **Para usar o PostgreSQL, defina `USE_IN_MEMORY_DB=false`. Para testes rápidos com banco em memória, defina `USE_IN_MEMORY_DB=true`.**

## 5. Migrações e Inicialização

1. Execute as migrações do banco de dados:
   ```bash
   npm run migrate
   ```
2. Crie um usuário administrador inicial (se não existir):
   ```bash
   curl -X POST http://localhost:3000/api/auth/bootstrap \
     -H "Content-Type: application/json" \
     -d 
   ```
   **Credenciais Padrão:**
   - **E-mail:** `admin@admin.com`
   - **Senha:** `admin123456`

3. Inicie o servidor backend:
   ```bash
   npm start
   ```

## 6. Configuração do Frontend (Produção)

O frontend já vem pré-compilado na pasta `public` do backend. Se desejar recompilar:
1. Vá para a pasta frontend: `cd frontend`
2. Instale as dependências: `npm install`
3. Gere o build: `npm run build`
4. O resultado estará em `../public`, servido automaticamente pelo backend.

## 7. Acesso ao Sistema

Por padrão, o sistema estará disponível em `http://seu-ip:3000`.
Recomenda-se o uso de um proxy reverso como **Nginx** para produção.
