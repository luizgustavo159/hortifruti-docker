const { createClient } = require('redis');
const pino = require('pino');
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const REDIS_URL = process.env.REDIS_URL;
let client;
let isRedisAvailable = false;

// Blacklist em memória como fallback quando Redis não está disponível
const memoryBlacklist = new Map();

// Limpar entradas expiradas da memória periodicamente
setInterval(() => {
  const now = Date.now();
  for (const [key, expiry] of memoryBlacklist.entries()) {
    if (expiry < now) {
      memoryBlacklist.delete(key);
    }
  }
}, 60 * 1000);

if (REDIS_URL) {
  client = createClient({
    url: REDIS_URL
  });

  client.on('error', (err) => {
    logger.error('Erro no cliente Redis:', err);
    isRedisAvailable = false;
  });

  client.on('connect', () => {
    logger.info('Conectado ao Redis com sucesso');
    isRedisAvailable = true;
  });
} else {
  logger.warn('REDIS_URL não definida. Usando modo de fallback em memória.');
}

// Wrapper para garantir que usamos Redis se disponível, senão memória
const clientWrapper = {
  get isOpen() {
    return isRedisAvailable || true;
  },
  async set(key, value, options) {
    if (isRedisAvailable) {
      try {
        return await client.set(key, value, options);
      } catch (err) {
        logger.error('Falha ao gravar no Redis, usando memória:', err);
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
        logger.error('Falha ao ler do Redis, usando memória:', err);
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
  if (client) {
    try {
      await client.connect();
    } catch (err) {
      logger.error('Não foi possível conectar ao Redis:', err);
      isRedisAvailable = false;
    }
  }
}

module.exports = {
  client: clientWrapper,
  connectRedis
};
