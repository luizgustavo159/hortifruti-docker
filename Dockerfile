# ============ BUILD STAGE ============
FROM node:22-alpine AS builder

WORKDIR /app

# Copiar apenas os arquivos de manifesto primeiro para aproveitar o cache das camadas
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Instalar dependências (isso será cacheado se os package.json não mudarem)
RUN npm ci --no-audit --no-fund && \
    cd frontend && npm ci --no-audit --no-fund

# Copiar o restante do código
COPY . .

# Build frontend - O Vite está configurado para gerar o output em ../public (raiz do app)
# Usar flag --silent para reduzir logs excessivos
RUN cd frontend && npm run build

# ============ PRODUCTION STAGE ============
FROM node:22-alpine

WORKDIR /app

# Instalar dumb-init para melhor gerenciamento de sinais
RUN apk add --no-cache dumb-init

# Criar usuário não-root por segurança
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copiar manifestos do backend
COPY package*.json ./

# Instalar apenas dependências de produção do backend
RUN npm ci --only=production && \
    npm cache clean --force

# Copiar código do backend e outros arquivos necessários
COPY src ./src
COPY server.js ./
COPY db.js ./
COPY config.js ./
COPY migrations ./migrations
COPY scripts ./scripts

# Copiar build do frontend do stage anterior
# Como o Vite gera em ../public a partir de /app/frontend, o destino final é /app/public
COPY --from=builder /app/public ./public

# Mudar proprietário dos arquivos para o usuário não-root
RUN chown -R nodejs:nodejs /app

# Trocar para usuário não-root
USER nodejs

# Expor porta padrão
EXPOSE 3000

# Health check otimizado
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Usar dumb-init para gerenciar processos corretamente
ENTRYPOINT ["dumb-init", "--"]

# Comando de inicialização
CMD ["npm", "start"]
