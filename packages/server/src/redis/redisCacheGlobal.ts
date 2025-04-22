// src/redis/redisCacheGlobal.ts
import { createRedisCache } from './redisCacheService';
import { RedisCacheService } from './redisCacheService'; // Adjust if type is exported separately

let globalRedisCache: RedisCacheService | null = null;

export function getGlobalRedisCache(): RedisCacheService {
   if (!globalRedisCache) {
      globalRedisCache = createRedisCache();
      console.log("[Redis] Global Redis Cache initialized.");
   }
   return globalRedisCache;
}
