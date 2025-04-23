import { and, eq, gt, lt, sql } from "drizzle-orm";
import { cachePrices, getDB } from "./db";
import { getGlobalRedisCache, RedisCacheService } from "./redis";
import { logger } from "./util";

/**
 * Unified cache system using Drizzle/D1 for all caching needs
 * Simplifies the architecture by avoiding additional services like KV
 */
export class CacheService {
  private db: ReturnType<typeof getDB>;
  private redisCache!: RedisCacheService;

  constructor() {
    this.db = getDB();


  }
  async onModuleStart() {
    // Initialize the database connection and Redis cache

    this.redisCache = await getGlobalRedisCache();
  }

  /**
   * Get SOL price from cache
   */
  async getSolPrice(): Promise<number | null> {
    const cacheKey = "solPrice";
    try {
      if (!this.redisCache) {
        logger.error("Redis cache is not initialized.");
        return null;
      }
      const cachedValue = await this.redisCache.get(cacheKey);
      if (cachedValue) {
        const price = parseFloat(cachedValue);
        if (!isNaN(price)) {
          logger.log(`Cache hit for SOL price: ${price}`);
          return price;
        }
      }
      logger.log(`Cache miss for SOL price (${cacheKey})`);
      return null;
    } catch (error) {
      logger.error(
        `Error getting SOL price from Redis cache (${cacheKey}):`,
        error,
      );
      return null;
    }
  }

  /**
   * Store SOL price in cache
   * @param price SOL price in USD
   * @param ttlSeconds How long the cache should live (in seconds)
   */
  async setSolPrice(price: number, ttlSeconds: number = 30): Promise<void> {
    const cacheKey = "solPrice";
    try {
      if (!this.redisCache) {
        logger.error("Redis cache is not initialized.");
        return;
      }
      await this.redisCache.set(cacheKey, price.toString(), ttlSeconds);
      logger.log(
        `Cached SOL price (${price}) in Redis with TTL ${ttlSeconds}s`,
      );
    } catch (error) {
      logger.error(
        `Error setting SOL price in Redis cache (${cacheKey}):`,
        error,
      );
    }
  }

  /**
   * Get token price from cache
   */
  async getTokenPrice(mint: string): Promise<number | null> {
    try {
      const cachedPrice = await this.db
        .select()
        .from(cachePrices)
        .where(
          and(
            eq(cachePrices.type, "token"),
            eq(cachePrices.symbol, mint),
            gt(cachePrices.expiresAt, new Date()),
          ),
        )
        .orderBy(sql`timestamp DESC`)
        .limit(1);

      if (cachedPrice.length > 0) {
        return parseFloat(cachedPrice[0].price);
      }

      return null;
    } catch (error) {
      logger.error(`Error getting token price for ${mint} from cache:`, error);
      return null;
    }
  }

  /**
   * Store token price in cache
   */
  async setTokenPrice(
    mint: string,
    price: number,
    ttlSeconds: number = 300,
  ): Promise<void> {
    try {
      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + ttlSeconds * 1000,
      ).toISOString();
      const expiresAtDate = new Date(expiresAt);

      await this.db
        .insert(cachePrices)
        .values([
          {
            id: crypto.randomUUID(),
            type: "sol",
            symbol: "SOL",
            price: price.toString(),
            timestamp: sql`CURRENT_TIMESTAMP`,
            expiresAt: expiresAtDate,
          },
        ])
        .execute();

      // Clean up old cache entries
      await this.cleanupOldCacheEntries("token", mint);
    } catch (error) {
      logger.error(`Error setting token price for ${mint} in cache:`, error);
    }
  }

  /**
   * Store any metadata object in cache
   */
  async setMetadata(
    key: string,
    data: any,
    ttlSeconds: number = 3600,
  ): Promise<void> {
    try {
      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + ttlSeconds * 1000,
      ).toISOString();

      // Serialize data with BigInt handling
      const serializedData = JSON.stringify(data, (_, value) =>
        typeof value === "bigint" ? value.toString() : value,
      );
      const expiresAtDate = new Date(expiresAt);

      await this.db
        .insert(cachePrices)
        .values([
          {
            id: crypto.randomUUID(),
            type: "sol",
            symbol: "SOL",
            price: serializedData.toString(),
            timestamp: sql`CURRENT_TIMESTAMP`,
            expiresAt: expiresAtDate,
          },
        ])
        .execute();
      // Clean up old cache entries
      await this.cleanupOldCacheEntries("metadata", key);
    } catch (error) {
      logger.error(`Error caching metadata for ${key}:`, error);
    }
  }

  /**
   * Get metadata from cache
   */
  async getMetadata<T = any>(key: string): Promise<T | null> {
    try {
      const cachedData = await this.db
        .select()
        .from(cachePrices)
        .where(
          and(
            eq(cachePrices.type, "metadata"),
            eq(cachePrices.symbol, key),
            gt(cachePrices.expiresAt, new Date()),
          ),
        )
        .orderBy(sql`timestamp DESC`)
        .limit(1);

      if (cachedData.length > 0) {
        try {
          // Parse the data without special handling for now
          // BigInt values will be returned as strings
          return JSON.parse(cachedData[0].price) as T;
        } catch (parseError) {
          logger.error(`Error parsing cached metadata for ${key}:`, parseError);
          return null;
        }
      }

      return null;
    } catch (error) {
      logger.error(`Error getting metadata for ${key} from cache:`, error);
      return null;
    }
  }

  /**
   * Delete expired cache entries to keep the DB size manageable
   */
  private async cleanupOldCacheEntries(
    type: string,
    symbol: string,
  ): Promise<void> {
    try {
      // Delete expired entries
      await this.db
        .delete(cachePrices)
        .where(
          and(
            eq(cachePrices.type, type),
            eq(cachePrices.symbol, symbol),
            lt(cachePrices.expiresAt, new Date()),
          ),
        );

      // Keep only the N most recent entries
      const recentEntries = await this.db
        .select({ id: cachePrices.id })
        .from(cachePrices)
        .where(and(eq(cachePrices.type, type), eq(cachePrices.symbol, symbol)))
        .orderBy(sql`timestamp DESC`)
        .limit(10);

      if (recentEntries.length > 0) {
        const keepIds = recentEntries.map((entry: { id: string }) => entry.id);

        if (keepIds.length > 0) {
          await this.db
            .delete(cachePrices)
            .where(
              and(
                eq(cachePrices.type, type),
                eq(cachePrices.symbol, symbol),
                sql`${cachePrices.id} NOT IN (${keepIds.join(",")})`,
              ),
            );
        }
      }
    } catch (error) {
      logger.error(
        `Error cleaning up cache entries for ${type}:${symbol}:`,
        error,
      );
    }
  }
}
