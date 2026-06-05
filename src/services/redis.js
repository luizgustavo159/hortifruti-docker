const { createClient } = require('redis');
const pino = require('pino');
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// Em Docker, o host deve ser o nome do serviço (redis)
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
let client;
let isRedisAvailable = false;
// Flag para evitar múltiplas tentativas de connect() simultâneas
let isConnecting = false;

// Fallback em memória
const memoryBlacklist = new Map();

if (REDIS_URL) {
  client = createClient({
    url: REDIS_URL,
    socket: {
      connectTimeout: 5000,
      keepAlive: 5000,
      // Limitar a 3 tentativas com intervalo de 5s para não bloquear rotas fora do Docker
      reconnectStrategy: (retries) => {
        if (retries >= 3) {
          logger.warn('Redis indisponível após 3 tentativas. Usando fallback em memória.');
          isRedisAvailable = false;
          return false; // Parar de tentar reconectar
        }
        return 5000;
      }
    }
  });

  client.on('error', (err) => {
    // Log detalhado para diagnóstico
    logger.error({ err: err.message }, 'Erro de conexão Redis');
    isRedisAvailable = false;
    isConnecting = false;
  });

  client.on('ready', () => {
    logger.info('Redis está PRONTO para uso');
    isRedisAvailable = true;
    isConnecting = false;
  });

  client.on('connect', () => {
    logger.info('Conectando ao servidor Redis...');
  });
}

const clientWrapper = {
  get isOpen() {
    return isRedisAvailable;
  },
  async set(key, value, options) {
    if (isRedisAvailable) {
      try {
        return await client.set(key, value, options);
      } catch (err) {
        logger.error({ err: err.message }, 'Falha no SET do Redis');
        isRedisAvailable = false;
      }
    }
    const ttlMs = options && options.EX ? options.EX * 1000 : 3600 * 1000;
    memoryBlacklist.set(key, Date.now() + ttlMs);
    return 'OK';
  },
  async get(key) {
    if (isRedisAvailable) {
      try {
        return await client.get(key);
      } catch (err) {
        logger.error({ err: err.message }, 'Falha no GET do Redis');
        isRedisAvailable = false;
      }
    }
    const expiry = memoryBlacklist.get(key);
    if (!expiry) return null;
    if (expiry < Date.now()) {
      memoryBlacklist.delete(key);
      return null;
    }
    return '1';
  },
  on(event, handler) {
    if (client) client.on(event, handler);
    return this;
  }
};

async function connectRedis() {
  // Se já está disponível ou já está tentando conectar, não fazer nada
  if (isRedisAvailable || isConnecting) return;
  if (!client) return;

  // Se o socket já está aberto, apenas marcar como disponível
  if (client.isOpen) {
    isRedisAvailable = true;
    return;
  }

  isConnecting = true;
  try {
    await client.connect();
  } catch (err) {
    // Se o erro for "Socket already opened", podemos considerar como disponível
    if (err.message && err.message.includes('Socket already opened')) {
      isRedisAvailable = true;
    } else {
      logger.error({ err: err.message }, 'Falha na inicialização do Redis — usando fallback em memória');
      isRedisAvailable = false;
    }
  } finally {
    isConnecting = false;
  }
}

module.exports = {
  client: clientWrapper,
  connectRedis
};
