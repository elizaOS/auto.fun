import dotenv from "dotenv";
import { createPool, Pool } from "generic-pool";
import IORedis, { Redis } from "ioredis";
import { logger } from "./util";
dotenv.config();

let globalRedisCache: RedisCacheService | null = null;

export function getGlobalRedisCache(): RedisCacheService {
   if (!globalRedisCache) {
      globalRedisCache = createRedisCache();
      console.log("[Redis] Global Redis Cache initialized.");
   }
   return globalRedisCache;
}


// Singleton RedisPool instance
let sharedRedisPool: RedisPool | null = null;

// Function to initialize and/or get the shared pool
export function getSharedRedisPool(): RedisPool {
  if (!sharedRedisPool) {
    logger.info("Initializing Shared Redis Pool");
    sharedRedisPool = new RedisPool({
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
      password: process.env.REDIS_PASSWORD,
      // Consider adding pool configuration options here if your RedisPool supports them
      // e.g., minSize, maxSize, connectionTimeout
    });
    logger.info("Shared Redis Pool Initialized");
  }
  return sharedRedisPool;
}

export class RedisCacheService {
  constructor(private redisPool: RedisPool) {}

  getKey(key: string) {
    // Avoid double-prefixing if key already includes network
    const prefix = `${process.env.NETWORK}:`;
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
    ttlInSeconds?: number
  ): Promise<"OK" | null> {
    return this.redisPool.useClient((client) => {
      const prefixedKey = this.getKey(key);
      return ttlInSeconds
        ? client.set(prefixedKey, value, "EX", ttlInSeconds)
        : client.set(prefixedKey, value);
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
      client.lpush(this.getKey(key), value)
    );
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    logger.info(`LRANGE from ${this.getKey(key)} ${start} ${stop}`);
    return this.redisPool.useClient((client) =>
      client.lrange(this.getKey(key), start, stop)
    );
  }

  async llen(key: string): Promise<number> {
    logger.info(`LLEN for ${this.getKey(key)}`);
    return this.redisPool.useClient((client) => client.llen(this.getKey(key)));
  }

  async ltrim(key: string, start: number, stop: number): Promise<"OK" | null> {
    logger.info(`LTRIM on ${this.getKey(key)} ${start} ${stop}`);
    return this.redisPool.useClient((client) =>
      client.ltrim(this.getKey(key), start, stop)
    );
  }

  async lpushTrim(
    key: string,
    value: string,
    maxLength: number
  ): Promise<Array<unknown> | null> {
    logger.info(
      `LPUSH+LTRIM pipeline on ${this.getKey(key)} limit ${maxLength}`
    );
    return this.redisPool.useClient((client) =>
      client
        .multi()
        .lpush(this.getKey(key), value)
        .ltrim(this.getKey(key), 0, maxLength - 1)
        .exec()
    );
  }
  // --- END NEW LIST METHODS ---

  // --- START NEW SET METHODS ---
  async sadd(key: string, member: string | string[]): Promise<number> {
    const members = Array.isArray(member) ? member : [member];
    logger.info(`SADD to ${this.getKey(key)}`);
    // Note: ioredis sadd returns number of elements added
    return this.redisPool.useClient((client: Redis) =>
      client.sadd(this.getKey(key), ...members)
    );
  }

  async srem(key: string, member: string | string[]): Promise<number> {
    const members = Array.isArray(member) ? member : [member];
    logger.info(`SREM from ${this.getKey(key)}`);
    // Note: ioredis srem returns number of elements removed
    return this.redisPool.useClient((client: Redis) =>
      client.srem(this.getKey(key), ...members)
    );
  }

  async smembers(key: string): Promise<string[]> {
    logger.info(`SMEMBERS for ${this.getKey(key)}`);
    return this.redisPool.useClient((client: Redis) =>
      client.smembers(this.getKey(key))
    );
  }

  // Expose useClient for transactions if absolutely necessary, but prefer specific methods
  // Only uncomment if the MULTI logic cannot be encapsulated here.
  // async useClient<T>(fn: (client: Redis) => Promise<T>): Promise<T> {
  //   return this.redisPool.useClient(fn);
  // }
  // --- END NEW SET METHODS ---

  // --- START DISTRIBUTED LOCK METHODS ---
  async acquireLock(lockKey: string, lockValue: string, ttlMilliseconds: number): Promise<boolean> {
    const keyWithPrefix = this.getKey(lockKey);
    logger.info(`Attempting to acquire lock: ${keyWithPrefix} with value ${lockValue} and TTL ${ttlMilliseconds}ms`);
    try {
      const result = await this.redisPool.useClient((client) =>
        client.set(keyWithPrefix, lockValue, "PX", ttlMilliseconds, "NX")
      );
      const acquired = result === "OK";
      if (acquired) {
          logger.info(`Successfully acquired lock: ${keyWithPrefix}`);
      } else {
          logger.warn(`Failed to acquire lock (already held?): ${keyWithPrefix}`);
      }
      return acquired;
    } catch (error) {
        logger.error(`Error acquiring lock ${keyWithPrefix}:`, error);
        return false; // Assume lock not acquired on error
    }
  }

  // Lua script for safe lock release
  private releaseLockScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  // Define the script in ioredis if not already done (e.g., during initialization or first use)
  private async defineReleaseLockScript(client: Redis): Promise<void> {
    // Check if script already defined to avoid redefining on every call
    if (!(client as any).releaseLockScript) { // Check if command name exists
        try {
            // Define the script command
            (client as any).defineCommand("releaseLockScript", {
                numberOfKeys: 1,
                lua: this.releaseLockScript,
            });
            logger.info("Defined releaseLockScript Lua script for Redis client.");
        } catch (err: any) {
            // Handle cases where command might already be defined (e.g., across pool clients)
            if (err.message.includes('Command name already specified')) {
                logger.warn("releaseLockScript Lua script already defined for this client.");
            } else {
                logger.error("Failed to define releaseLockScript Lua script:", err);
                throw err; // Rethrow if it's a different error
            }
        }
    }
  }


  async releaseLock(lockKey: string, lockValue: string): Promise<boolean> {
    const keyWithPrefix = this.getKey(lockKey);
    logger.info(`Attempting to release lock: ${keyWithPrefix} with value ${lockValue}`);
    try {
      const result = await this.redisPool.useClient(async (client) => {
        // Ensure script is defined for this client connection
        await this.defineReleaseLockScript(client);
        // Execute the Lua script using the defined command name
        return await (client as any).releaseLockScript(keyWithPrefix, lockValue);
      });

      const released = result === 1;
      if (released) {
          logger.info(`Successfully released lock: ${keyWithPrefix}`);
      } else {
          logger.warn(`Failed to release lock (value mismatch or key expired?): ${keyWithPrefix}`);
      }
      return released;
    } catch (error) {
        logger.error(`Error releasing lock ${keyWithPrefix}:`, error);
        return false; // Indicate failure on error
    }
  }
  // --- END DISTRIBUTED LOCK METHODS ---
}

export function createRedisCache(): RedisCacheService {
  const pool = getSharedRedisPool();
  const instance = new RedisCacheService(pool);
  return instance;
}

interface RedisPoolOptions {
  host?: string;
  port?: number;
  password?: string;
  max?: number;
  min?: number;
  idleTimeoutMillis?: number;
}

export class RedisPool {
  private pool: Pool<Redis>;
  private publisherClient: Redis | null = null;
  private subscriberClient: Redis | null = null;
  private options: RedisPoolOptions;

  constructor(options: RedisPoolOptions = {}) {
    this.options = {
      host: options.host || "localhost",
      port: options.port || 6379,
      password: options.password,
      max: options.max || 10,
      min: options.min || 2,
      idleTimeoutMillis: options.idleTimeoutMillis || 30000,
    };

    this.pool = createPool<Redis>(
      {
        create: async () => {
          const client = new Redis({
            host: this.options.host,
            port: this.options.port,
            password: this.options.password,
            retryStrategy: (times) => {
              if (times > 10) return null;
              return Math.min(times * 100, 3000);
            },
          });

          client.on("error", (err) => console.error("Redis Client Error", err));
          client.on("connect", () => console.log("Redis Client Connected"));
          client.on("ready", () => console.log("Redis Client Ready"));

          return client;
        },
        destroy: async (client: Redis) => {
          await client.quit();
        },
        validate: async (client: Redis) => {
          try {
            await client.ping();
            return true;
          } catch {
            return false;
          }
        },
      },
      {
        max: this.options.max,
        min: this.options.min,
        idleTimeoutMillis: this.options.idleTimeoutMillis,
        testOnBorrow: true,
      }
    );
  }

  async acquire(): Promise<Redis> {
    return this.pool.acquire();
  }

  async release(client: Redis): Promise<void> {
    await this.pool.release(client);
  }

  async useClient<T>(fn: (client: Redis) => Promise<T>): Promise<T> {
    const client = await this.acquire();
    try {
      return await fn(client);
    } finally {
      await this.release(client);
    }
  }

  async destroy(): Promise<void> {
    await this.pool.drain();
    await this.pool.clear();

    if (this.publisherClient) {
      await this.publisherClient.quit();
    }

    if (this.subscriberClient) {
      await this.subscriberClient.quit();
    }
  }

  async getPublisherClient(): Promise<Redis> {
    if (!this.publisherClient) {
      this.publisherClient = new Redis({
        host: this.options.host,
        port: this.options.port,
        password: this.options.password,
      });

      this.publisherClient.on("error", (err) =>
        console.error("Redis Publisher Error", err)
      );
    }

    return this.publisherClient;
  }

  async getSubscriberClient(): Promise<Redis> {
    if (!this.subscriberClient) {
      this.subscriberClient = new Redis({
        host: this.options.host,
        port: this.options.port,
        password: this.options.password,
      });

      this.subscriberClient.on("error", (err) =>
        console.error("Redis Subscriber Error", err)
      );
    }

    return this.subscriberClient;
  }
}

const connection: Redis = new IORedis(process.env.REDIS_URL as string, {
  lazyConnect: true,
  connectTimeout: 5000,
  maxRetriesPerRequest: 5,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  commandTimeout: 5000,
  enableReadyCheck: true,
  keepAlive: 10000,
  reconnectOnError(err) {
    const targetError = "READONLY";
    if (err.message.includes(targetError)) {
      // Only reconnect when the error contains "READONLY"
      return true;
    }
    return false;
  },
});

// Add event listeners for connection status
connection.on("connect", () => {
  logger.info("Redis connection established");
});

connection.on("ready", () => {
  logger.info("Redis connection ready to accept commands");
});

connection.on("error", (err) => {
  logger.error(`Redis connection error: ${err.message}`);
});

connection.on("close", () => {
  logger.warn("Redis connection closed");
});

connection.on("reconnecting", () => {
  logger.info("Redis attempting to reconnect");
});

connection.on("end", () => {
  logger.warn("Redis connection ended");
});

export default connection;
