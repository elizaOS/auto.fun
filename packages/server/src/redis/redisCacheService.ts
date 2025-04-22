import dotenv from "dotenv";
import type { Env } from "../env"; 
import { logger } from "../util";
import { RedisPool } from "./redisPool"; 
import { Redis } from "ioredis";
dotenv.config();

// Singleton RedisPool instance
let sharedRedisPool: RedisPool | null = null;

// Function to initialize and/or get the shared pool
export function getSharedRedisPool(env: Env): RedisPool {
  if (!sharedRedisPool) {
    logger.info("Initializing Shared Redis Pool");
    sharedRedisPool = new RedisPool({
      host: env.REDIS_HOST,
      port: Number(env.REDIS_PORT),
      password: env.REDIS_PASSWORD,
      // Consider adding pool configuration options here if your RedisPool supports them
      // e.g., minSize, maxSize, connectionTimeout
    });
    logger.info("Shared Redis Pool Initialized");
  }
  return sharedRedisPool;
}

export class RedisCacheService {
  constructor(
    private redisPool: RedisPool,
    private env: Env,
  ) {
    this.env = env;
  }

  getKey(key: string) {
    // Avoid double-prefixing if key already includes network
    const prefix = `${this.env.NETWORK}:`;
    if (key.startsWith(prefix)) {
      return key;
    }
    return `${prefix}${key}`;
  }
  async get(key: string): Promise<string | null> {
    return this.redisPool.useClient((client) => client.get(this.getKey(key)));
  }

  async set(
    key: string,
    value: string,
    ttlInSeconds?: number,
  ): Promise<"OK" | null> {
    return this.redisPool.useClient((client) => {
      return ttlInSeconds
        ? client.set(this.getKey(key), value, "EX", ttlInSeconds)
        : client.set(this.getKey(key), value);
    });
  }

  async del(key: string): Promise<number> {
    return this.redisPool.useClient((client) => client.del(this.getKey(key)));
  }

  async exists(key: string): Promise<boolean> {
    return this.redisPool.useClient(async (client) => {
      const result = await client.exists(this.getKey(key));
      return result === 1;
    });
  }

  async ttl(key: string): Promise<number> {
    return this.redisPool.useClient((client) => client.ttl(this.getKey(key)));
  }

  // --- START NEW LIST METHODS ---
  async lpush(key: string, value: string): Promise<number> {
    logger.info(`LPUSH to ${this.getKey(key)}`);
    return this.redisPool.useClient((client) =>
      client.lpush(this.getKey(key), value),
    );
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    logger.info(`LRANGE from ${this.getKey(key)} ${start} ${stop}`);
    return this.redisPool.useClient((client) =>
      client.lrange(this.getKey(key), start, stop),
    );
  }

  async llen(key: string): Promise<number> {
    logger.info(`LLEN for ${this.getKey(key)}`);
    return this.redisPool.useClient((client) => client.llen(this.getKey(key)));
  }

  async ltrim(key: string, start: number, stop: number): Promise<"OK" | null> {
    logger.info(`LTRIM on ${this.getKey(key)} ${start} ${stop}`);
    return this.redisPool.useClient((client) =>
      client.ltrim(this.getKey(key), start, stop),
    );
  }

  async lpushTrim(
    key: string,
    value: string,
    maxLength: number,
  ): Promise<Array<unknown> | null> {
    logger.info(`LPUSH+LTRIM pipeline on ${this.getKey(key)} limit ${maxLength}`);
    return this.redisPool.useClient((client) =>
      client
        .multi()
        .lpush(this.getKey(key), value)
        .ltrim(this.getKey(key), 0, maxLength - 1)
        .exec(),
    );
  }
  // --- END NEW LIST METHODS ---

  // --- START NEW SET METHODS ---
  async sadd(key: string, member: string | string[]): Promise<number> {
    const members = Array.isArray(member) ? member : [member];
    logger.info(`SADD to ${this.getKey(key)}`);
    // Note: ioredis sadd returns number of elements added
    return this.redisPool.useClient((client: Redis) => client.sadd(this.getKey(key), ...members));
  }

  async srem(key: string, member: string | string[]): Promise<number> {
    const members = Array.isArray(member) ? member : [member];
    logger.info(`SREM from ${this.getKey(key)}`);
    // Note: ioredis srem returns number of elements removed
    return this.redisPool.useClient((client: Redis) => client.srem(this.getKey(key), ...members));
  }

  async smembers(key: string): Promise<string[]> {
    logger.info(`SMEMBERS for ${this.getKey(key)}`);
    return this.redisPool.useClient((client: Redis) => client.smembers(this.getKey(key)));
  }

  // Expose useClient for transactions if absolutely necessary, but prefer specific methods
  // Only uncomment if the MULTI logic cannot be encapsulated here.
  // async useClient<T>(fn: (client: Redis) => Promise<T>): Promise<T> {
  //   return this.redisPool.useClient(fn);
  // }
  // --- END NEW SET METHODS ---
}

export function createRedisCache(env: Env): RedisCacheService {
  const pool = getSharedRedisPool(env);
  const instance = new RedisCacheService(pool, env);
  return instance;
}
