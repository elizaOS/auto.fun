import dotenv from "dotenv";
import type { Env } from "../env"; 
import { logger } from "../util";
import { RedisPool } from "./redisPool"; 
dotenv.config();

class RedisCacheService {
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
}

export function createRedisCache(env: Env) {
  logger.info("Creating Redis cache service");
  const redisPool = new RedisPool({
    host: env.REDIS_HOST,
    port: Number(env.REDIS_PORT),
    password: env.REDIS_PASSWORD,
  });

  logger.info("Redis cache service created");
  return new RedisCacheService(redisPool, env);
}
