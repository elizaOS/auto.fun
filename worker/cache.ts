import Redis from "ioredis";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { cachePrices, getDB } from "./db";
import { Env } from "./env";
import { logger } from "./util";

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
      await this.db
        .insert(cachePrices)
        .values([
          {
            id: crypto.randomUUID(),
            type: "sol",
            symbol: "SOL",
            price: price.toString(),
            timestamp: sql`CURRENT_TIMESTAMP`, // OK as SQL literal
            expiresAt: expiresAtDate, // now a Date, not a string
          },
        ])
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

/**
 * Redis-based cache implementation
 * Provides methods to get and set data with TTL support
 */
export class RedisCache {
  private redis: Redis;
  private isConnected: boolean = false;
  private connectionPromise: Promise<void> | null = null;
  private static instances: Map<string, RedisCache> = new Map();
  // No custom timeouts - rely on Redis client's built-in timeout handling

  /**
   * Create a new RedisCache instance or return an existing one for the same URL
   * @param redisUrl Redis connection URL (e.g., redis://user:password@host:port/db)
   */
  constructor(redisUrl: string) {
    // Check if we already have an instance for this URL
    const existingInstance = RedisCache.instances.get(redisUrl);
    if (existingInstance) {
      return existingInstance;
    }

    // Initialize Redis connection options with very generous timeouts
    const options = {
      connectTimeout: 30000, // 30 seconds
      commandTimeout: 60000, // 60 seconds - much longer timeout for commands
      maxRetriesPerRequest: 5, // Increased retries
      enableOfflineQueue: true, // Queue commands when disconnected
      enableReadyCheck: false, // Disable ready check to avoid timeouts
      retryStrategy: (times: number) => {
        logger.log(`Redis retry attempt ${times}`);
        if (times > 5) {
          logger.error(`Redis connection failed after ${times} retries`);
          return null; // Stop retrying
        }
        return Math.min(times * 500, 5000); // Longer exponential backoff
      },
      reconnectOnError: (err: Error) => {
        logger.error("Redis reconnect on error:", err);
        return true; // Always try to reconnect
      }
    };
    
    logger.log(`Initializing Redis connection to ${redisUrl} with timeout ${options.commandTimeout}ms`);

    // Initialize Redis connection using the URL with options
    this.redis = new Redis(redisUrl, options);
    
    // Set up event handlers
    this.setupEventHandlers();
    
    // Store this instance for reuse
    RedisCache.instances.set(redisUrl, this);
    
    // Initialize connection
    this.connectionPromise = this.connect();
  }

  /**
   * Set up event handlers for the Redis client
   */
  private setupEventHandlers(): void {
    this.redis.on("connect", () => {
      logger.log("Redis connected");
      this.isConnected = true;
    });

    this.redis.on("ready", () => {
      logger.log("Redis ready");
      this.isConnected = true;
    });

    this.redis.on("error", (err) => {
      logger.error("Redis connection error:", err);
      this.isConnected = false;
    });

    this.redis.on("close", () => {
      logger.log("Redis connection closed");
      this.isConnected = false;
    });

    this.redis.on("reconnecting", () => {
      logger.log("Redis reconnecting");
      this.isConnected = false;
    });

    this.redis.on("end", () => {
      logger.log("Redis connection ended");
      this.isConnected = false;
    });
  }

  /**
   * Connect to Redis with timeout
   */
  private async connect(): Promise<void> {
    if (this.isConnected) return;

    try {
      // Wait for the connection to be ready with a timeout
      await Promise.race([
        new Promise<void>((resolve) => {
          this.redis.once("ready", () => {
            this.isConnected = true;
            resolve();
          });
        }),
        new Promise<void>((_, reject) => {
          setTimeout(() => {
            reject(new Error("Redis connection timeout"));
          }, 10000); // 10 seconds timeout
        }),
      ]);
    } catch (error) {
      logger.error("Redis connection failed:", error);
      throw error;
    }
  }

  /**
   * Ensure the Redis connection is ready before performing operations
   */
  private async ensureConnection(): Promise<void> {
    if (this.isConnected) return;
    
    if (this.connectionPromise) {
      await this.connectionPromise;
    } else {
      this.connectionPromise = this.connect();
      await this.connectionPromise;
    }
  }

  /**
   * Get a value from cache
   * @param key The cache key
   * @returns The cached value, or null if not found or expired
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      await this.ensureConnection();
      const data = await this.redis.get(key);

      if (!data) {
        return null;
      }

      try {
        // Parse the data as JSON
        return JSON.parse(data) as T;
      } catch (parseError) {
        // If parsing fails, return the raw data if it's a string type
        return (typeof data === "string" ? data : null) as unknown as T;
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
    // Check if this is the problematic tokens list key
    const isTokensListKey = key.startsWith('tokens:') && key.includes('createdAt');
    
    try {
      await this.ensureConnection();
      
      // Serialize the value to JSON, handling BigInt values
      const serializedValue = JSON.stringify(value, (_, v) =>
        typeof v === "bigint" ? v.toString() : v,
      );

      if (ttlSeconds !== undefined && ttlSeconds > 0) {
        // Use setex for setting with expiration
        if (isTokensListKey) {
          // For token lists, don't wait for the result
          this.redis.setex(key, ttlSeconds, serializedValue)
            .then(() => logger.log(`Successfully cached tokens list with key ${key}`))
            .catch(err => logger.warn(`Non-critical error caching tokens list: ${err.message}`));
        } else {
          // For other keys, wait for the result
          await this.redis.setex(key, ttlSeconds, serializedValue);
        }
      } else {
        // Use set for setting without expiration
        if (isTokensListKey) {
          // For token lists, don't wait for the result
          this.redis.set(key, serializedValue)
            .then(() => logger.log(`Successfully cached tokens list with key ${key}`))
            .catch(err => logger.warn(`Non-critical error caching tokens list: ${err.message}`));
        } else {
          // For other keys, wait for the result
          await this.redis.set(key, serializedValue);
        }
      }
    } catch (error) {
      // For token lists, just log a warning
      if (isTokensListKey) {
        logger.warn(`Non-critical error preparing to cache tokens list: ${error}`);
      } else {
        // For other keys, log an error
        logger.error(`Error setting data for key ${key} in cache:`, error);
      }
    }
  }

  /**
   * Delete a key from the cache
   * @param key The cache key to delete
   * @returns true if the key was deleted, false otherwise
   */
  async delete(key: string): Promise<boolean> {
    try {
      await this.ensureConnection();
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
      await this.ensureConnection();
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
      await this.ensureConnection();
      return await this.redis.ttl(key);
    } catch (error) {
      logger.error(`Error getting TTL for key ${key}:`, error);
      return -2;
    }
  }

  /**
   * Close the Redis connection
   * Note: This should only be called when shutting down the application
   */
  async close(): Promise<void> {
    try {
      // Remove this instance from the instances map
      for (const [url, instance] of RedisCache.instances.entries()) {
        if (instance === this) {
          RedisCache.instances.delete(url);
          break;
        }
      }
      
      // Quit the Redis client
      await this.redis.quit();
      this.isConnected = false;
    } catch (error) {
      logger.error("Error closing Redis connection:", error);
    }
  }

  /**
   * Close all Redis connections
   * This should be called when the application is shutting down
   */
  static async closeAll(): Promise<void> {
    for (const instance of RedisCache.instances.values()) {
      await instance.close();
    }
    RedisCache.instances.clear();
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
