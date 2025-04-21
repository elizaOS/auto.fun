import { logger } from "./util";
import IORedis, { Redis } from "ioredis";

if (!process.env.REDIS_URL) {
  process.exit(1);
}

const connection: Redis = new IORedis(process.env.REDIS_URL as string, {
  lazyConnect: true,
  connectTimeout: 5000,
  maxRetriesPerRequest: 5,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  commandTimeout: 5000,
  enableReadyCheck: true,
  keepAlive: 10000,
  reconnectOnError(err) {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      // Only reconnect when the error contains "READONLY"
      return true;
    }
    return false;
  },
});

// Add event listeners for connection status
connection.on('connect', () => {
  logger.info('Redis connection established');
});

connection.on('ready', () => {
  logger.info('Redis connection ready to accept commands');
});

connection.on('error', (err) => {
  logger.error(`Redis connection error: ${err.message}`);
});

connection.on('close', () => {
  logger.warn('Redis connection closed');
});

connection.on('reconnecting', () => {
  logger.info('Redis attempting to reconnect');
});

connection.on('end', () => {
  logger.warn('Redis connection ended');
});

export default connection;
