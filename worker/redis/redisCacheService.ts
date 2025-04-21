import { logger } from "../util";
import { RedisPool } from "./redisPool";
import { ExecutionContext } from "@cloudflare/workers-types/experimental";
import { Env } from "../env";

class RedisCacheService {
  constructor(private redisPool: RedisPool) {}

  getKey(key: string) {
    return `${process.env.NETWORK}:${key}`;
  }
  async get(key: string): Promise<string | null> {
    return this.redisPool.useClient((client) => client.get(this.getKey(key)));
  }

  async set(
    key: string,
    value: string,
    ttlInSeconds?: number
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
  return new RedisCacheService(redisPool);
}

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext) {
    const RedisCache = createRedisCache(env);
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname.startsWith("/set/")) {
      const [, , key, value] = pathname.split("/");
      if (!key || !value)
        return new Response("Key or value missing", { status: 400 });

      await RedisCache.set(key, value, 120); // TTL 2 minutes
      return new Response(`Set key "${key}" to "${value}"`);
    }

    if (pathname.startsWith("/get/")) {
      const [, , key] = pathname.split("/");
      if (!key) return new Response("Key missing", { status: 400 });

      const value = await RedisCache.get(key);
      return new Response(value ? `Value: ${value}` : `Key "${key}" not found`);
    }

    return new Response("Try /set/foo/bar or /get/foo");
  },
};
