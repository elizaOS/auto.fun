import { rateLimiter } from "hono-rate-limiter";
import type { Context } from "hono";
import type { RedisCacheService } from "../redis";

const WINDOW_SEC = 10;

export function createRateLimiter(redisCache: RedisCacheService) {
  return rateLimiter({
    windowMs: WINDOW_SEC * 1000,
    limit: 100,
    standardHeaders: "draft-7",
    keyGenerator: (c: Context) =>
      c.req.header("x-forwarded-for") ??
      c.req.header("cf-connecting-ip") ??
      "unknown",
    store: new (class {
      async increment(key: string) {
        const full = redisCache.getKey(`rl:${key}`);
        const [[, count]] = (await redisCache.redisPool.useClient((client) =>
          client.multi().incr(full).expire(full, WINDOW_SEC).exec()
        )) as Array<[Error | null, number]>;
        console.log("Rate limit count", count);
        return {
          totalHits: count,
          resetTime: new Date(Date.now() + WINDOW_SEC * 1000),
        };
      }
      async decrement(key: string) {
        const full = redisCache.getKey(`rl:${key}`);
        await redisCache.redisPool.useClient((client) => client.decr(full));
      }
      async resetKey(key: string) {
        const full = redisCache.getKey(`rl:${key}`);
        await redisCache.del(full);
      }
    })(),
  });
}
