import dotenv from "dotenv";
import { Env } from "../env";
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
    return `${this.env.NETWORK}:${key}`;
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
