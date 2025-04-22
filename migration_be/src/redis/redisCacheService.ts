import dotenv from "dotenv";
import { Env } from "../env";
// Assuming logger is not available or needed in migration_be context
// import { logger } from "../util"; 
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
    // Use a specific prefix for migration data if needed, or just network
    return `${this.env.NETWORK || 'migration'}:${key}`;
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
    // console.log(`LPUSH to ${this.getKey(key)}`); // Avoid logger if unavailable
    return this.redisPool.useClient((client) =>
      client.lpush(this.getKey(key), value),
    );
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    // console.log(`LRANGE from ${this.getKey(key)} ${start} ${stop}`); // Avoid logger
    return this.redisPool.useClient((client) =>
      client.lrange(this.getKey(key), start, stop),
    );
  }

  async llen(key: string): Promise<number> {
    // console.log(`LLEN for ${this.getKey(key)}`); // Avoid logger
    return this.redisPool.useClient((client) => client.llen(this.getKey(key)));
  }

  async ltrim(key: string, start: number, stop: number): Promise<"OK" | null> {
    // console.log(`LTRIM on ${this.getKey(key)} ${start} ${stop}`); // Avoid logger
    return this.redisPool.useClient((client) =>
      client.ltrim(this.getKey(key), start, stop),
    );
  }
  // --- END NEW LIST METHODS ---
}

export function createRedisCache(env: Env) {
  // console.log("Creating Redis cache service for migration_be"); // Avoid logger
  const redisPool = new RedisPool({
    host: env.REDIS_HOST,
    port: Number(env.REDIS_PORT),
    password: env.REDIS_PASSWORD,
  });

  // console.log("Redis cache service created for migration_be"); // Avoid logger
  return new RedisCacheService(redisPool, env);
} 