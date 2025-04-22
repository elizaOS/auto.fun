import Redis from "ioredis";
import { createPool, Pool } from "generic-pool";

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
      },
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
        console.error("Redis Publisher Error", err),
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
        console.error("Redis Subscriber Error", err),
      );
    }

    return this.subscriberClient;
  }
}
