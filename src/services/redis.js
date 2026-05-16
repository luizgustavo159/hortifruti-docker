const { createClient } = require('redis');
const pino = require('pino');
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const client = createClient({ url: redisUrl });

client.on('error', (err) => logger.error({ err }, 'Redis Client Error'));
client.on('connect', () => logger.info('Redis Client Connected'));

async function connectRedis() {
  if (process.env.NODE_ENV === 'test') return; // Pular Redis em testes se não configurado
  try {
    if (!client.isOpen) {
      await client.connect();
    }
  } catch (err) {
    logger.error({ err }, 'Falha ao conectar no Redis, operando em modo degradado');
  }
}

module.exports = {
  client,
  connectRedis
};
