import Redis from 'ioredis';
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { cachePrices, getDB } from "./db";
import { Env } from './env';
import { logger } from './util';

/**
 * Unified cache system using Drizzle/D1 for all caching needs
 * Simplifies the architecture by avoiding additional services like KV
 */
export class CacheService {
  private db: ReturnType<typeof getDB>;

  constructor(env: Env) {
    this.db = getDB(env);
  }

  /**
   * Get SOL price from cache
   */
  async getSolPrice(): Promise<number | null> {
    try {
      // Get from D1/Drizzle cache
      const now = new Date();
      const cachedPrice = await this.db
        .select()
        .from(cachePrices)
        .where(
          and(
            eq(cachePrices.type, "sol"),
            eq(cachePrices.symbol, "SOL"),
            gt(cachePrices.expiresAt, now),
          ),
        )
        .orderBy(sql`timestamp DESC`)
        .limit(1);

      if (cachedPrice.length > 0) {
        return parseFloat(cachedPrice[0].price);
      }

      return null;
    } catch (error) {
      logger.error("Error getting SOL price from cache:", error);
      return null;
    }
  }

  /**
   * Store SOL price in cache
   * @param price SOL price in USD
   * @param ttlSeconds How long the cache should live (in seconds)
   */
  async setSolPrice(price: number, ttlSeconds: number = 30): Promise<void> {
    try {
      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + ttlSeconds * 1000,
      ).toISOString();
      const expiresAtDate = new Date(expiresAt);
      await this.db.insert(cachePrices)
        .values([{
          id: crypto.randomUUID(),
          type: "sol",
          symbol: "SOL",
          price: price.toString(),
          timestamp: sql`CURRENT_TIMESTAMP`,    // OK as SQL literal
          expiresAt: expiresAtDate,             // now a Date, not a string
        }])
        .execute();
      // Clean up old cache entries
      await this.cleanupOldCacheEntries("sol", "SOL");
    } catch (error) {
      logger.error("Error setting SOL price in cache:", error);
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

      await this.db.insert(cachePrices)
        .values([{
          id: crypto.randomUUID(),
          type: "sol",
          symbol: "SOL",
          price: price.toString(),
          timestamp: sql`CURRENT_TIMESTAMP`,
          expiresAt: expiresAtDate,
        }])
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

      await this.db.insert(cachePrices)
        .values([{
          id: crypto.randomUUID(),
          type: "sol",
          symbol: "SOL",
          price: serializedData.toString(),
          timestamp: sql`CURRENT_TIMESTAMP`,
          expiresAt: expiresAtDate,
        }])
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

/**
 * Redis-based cache implementation
 * Provides methods to get and set data with TTL support
 */
export class RedisCache {
  private redis: Redis;

  /**
   * Create a new RedisCache instance
   * @param redisUrl Redis connection URL (e.g., redis://user:password@host:port/db)
   */
  constructor(redisUrl: string) {
    // Initialize Redis connection using the URL
    this.redis = new Redis(redisUrl);
    
    // Set up error handling
    this.redis.on('error', (err) => {
      logger.error('Redis connection error:', err);
    });
  }

  /**
   * Get a value from cache
   * @param key The cache key
   * @returns The cached value, or null if not found or expired
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await this.redis.get(key);
      
      if (!data) {
        return null;
      }
      
      try {
        // Parse the data as JSON
        return JSON.parse(data) as T;
      } catch (parseError) {
        // If parsing fails, return the raw data if it's a string type
        return (typeof data === 'string' ? data : null) as unknown as T;
      }
    } catch (error) {
      logger.error(`Error getting data for key ${key} from cache:`, error);
      return null;
    }
  }

  /**
   * Set a value in cache with optional TTL
   * @param key The cache key
   * @param value The value to cache
   * @param ttlSeconds Time to live in seconds (optional, defaults to no expiration)
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      // Serialize the value to JSON, handling BigInt values
      const serializedValue = JSON.stringify(value, (_, v) => 
        typeof v === 'bigint' ? v.toString() : v
      );
      
      if (ttlSeconds !== undefined && ttlSeconds > 0) {
        // Set with expiration
        await this.redis.set(key, serializedValue, 'EX', ttlSeconds);
      } else {
        // Set without expiration
        await this.redis.set(key, serializedValue);
      }
    } catch (error) {
      logger.error(`Error setting data for key ${key} in cache:`, error);
    }
  }

  /**
   * Delete a key from the cache
   * @param key The cache key to delete
   * @returns true if the key was deleted, false otherwise
   */
  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.redis.del(key);
      return result > 0;
    } catch (error) {
      logger.error(`Error deleting key ${key} from cache:`, error);
      return false;
    }
  }

  /**
   * Check if a key exists in the cache
   * @param key The cache key to check
   * @returns true if the key exists, false otherwise
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Error checking if key ${key} exists in cache:`, error);
      return false;
    }
  }

  /**
   * Get the remaining TTL for a key in seconds
   * @param key The cache key
   * @returns The remaining TTL in seconds, or -1 if the key has no TTL, or -2 if the key doesn't exist
   */
  async ttl(key: string): Promise<number> {
    try {
      return await this.redis.ttl(key);
    } catch (error) {
      logger.error(`Error getting TTL for key ${key}:`, error);
      return -2;
    }
  }

  /**
   * Close the Redis connection
   */
  async close(): Promise<void> {
    try {
      await this.redis.quit();
    } catch (error) {
      logger.error('Error closing Redis connection:', error);
    }
  }
}

/**
 * Example usage:
 * 
 * // Initialize the cache
 * const cache = new RedisCache(env.REDIS_URL);
 * 
 * // Set a value with TTL
 * await cache.set('user:123', { name: 'John', role: 'admin' }, 3600); // 1 hour TTL
 * 
 * // Get a value
 * const user = await cache.get<{ name: string, role: string }>('user:123');
 * 
 * // Check if a key exists
 * const exists = await cache.exists('user:123');
 * 
 * // Get the remaining TTL
 * const ttl = await cache.ttl('user:123');
 * 
 * // Delete a key
 * await cache.delete('user:123');
 * 
 * // Close the connection when done
 * await cache.close();
 */
