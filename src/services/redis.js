const { createClient } = require('redis');
const pino = require('pino');
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const REDIS_URL = process.env.REDIS_URL;
let client;
let isRedisAvailable = false;
let isConnecting = false;

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
    url: REDIS_URL,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          logger.warn('Redis indisponível após 10 tentativas. Mantendo modo de fallback.');
          return false; // Para de tentar reconectar agressivamente
        }
        return Math.min(retries * 100, 3000);
      }
    }
  });

  client.on('error', (err) => {
    // Apenas loga erro se o Redis estava disponível anteriormente (evita spam no boot)
    if (isRedisAvailable) {
      logger.error('Conexão com Redis perdida. Usando memória.');
    }
    isRedisAvailable = false;
  });

  client.on('connect', () => {
    logger.info('Conectado ao Redis com sucesso');
    isRedisAvailable = true;
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
  if (client && !isRedisAvailable && !isConnecting) {
    isConnecting = true;
    try {
      await client.connect();
    } catch (err) {
      // Loga apenas uma vez no início se falhar
      logger.warn('Aviso: Redis não responde no momento. O sistema funcionará usando a memória local.');
    } finally {
      isConnecting = false;
    }
  }
}

module.exports = {
  client: clientWrapper,
  connectRedis
};
