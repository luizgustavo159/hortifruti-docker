# ============ BUILD STAGE ============
FROM node:22-alpine AS builder

WORKDIR /app

# Copiar package files
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Instalar dependências
RUN npm ci
RUN cd frontend && npm ci

# Copiar código
COPY . .

# Build frontend
RUN cd frontend && npm run build

# ============ PRODUCTION STAGE ============
FROM node:22-alpine

WORKDIR /app

# Instalar dumb-init para melhor gerenciamento de sinais
RUN apk add --no-cache dumb-init

# Criar usuário não-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copiar package files
COPY package*.json ./

# Instalar apenas dependências de produção
RUN npm ci --only=production && \
    npm cache clean --force

# Copiar código do backend
COPY src ./src
COPY server.js ./
COPY db.js ./
COPY config.js ./
COPY migrations ./migrations
COPY scripts ./scripts

# Copiar build do frontend do stage anterior
COPY --from=builder /app/public ./public

# Mudar proprietário dos arquivos
RUN chown -R nodejs:nodejs /app

# Trocar para usuário não-root
USER nodejs

# Expor porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Usar dumb-init para iniciar a aplicação
ENTRYPOINT ["dumb-init", "--"]

# Comando padrão
CMD ["npm", "start"]

# Metadados
LABEL maintainer="GreenStore Team"
LABEL description="GreenStore - Sistema de Gestão para Hortifruti"
LABEL version="1.0.0"
