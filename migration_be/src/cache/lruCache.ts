import { LRUCache } from "lru-cache";
import type { Env } from "../env";

let lruCacheInstance: LRUCacheService | null = null;

interface CacheOptions {
  max?: number;
  ttl?: number;
}

export class LRUCacheService {
  private cache: LRUCache<string, string>;
  private prefix: string;

  constructor(
    private env: Env,
    options: CacheOptions = {}
  ) {
    this.prefix = `${env.NETWORK || "migration"}:`;
    this.cache = new LRUCache<string, string>({
      max: options.max || 5000, // Default max items
      ttl: options.ttl || 1000 * 60 * 60, // Default TTL: 1 hour
      updateAgeOnGet: true, // Update item age on get operations
      allowStale: false,
    });
  }

  getKey(key: string) {
    // Avoid double-prefixing if key already includes network
    if (key.startsWith(this.prefix)) {
      return key;
    }
    return `${this.prefix}${key}`;
  }

  async get(key: string): Promise<string | null> {
    const value = this.cache.get(this.getKey(key));
    return value || null;
  }

  async set(
    key: string,
    value: string,
    ttlInSeconds?: number
  ): Promise<"OK" | null> {
    const prefixedKey = this.getKey(key);
    const options = ttlInSeconds ? { ttl: ttlInSeconds * 1000 } : undefined;
    this.cache.set(prefixedKey, value, options);
    return "OK";
  }

  async del(key: string): Promise<number> {
    const prefixedKey = this.getKey(key);
    const existed = this.cache.has(prefixedKey);
    this.cache.delete(prefixedKey);
    return existed ? 1 : 0;
  }

  async exists(key: string): Promise<boolean> {
    return this.cache.has(this.getKey(key));
  }

  async ttl(key: string): Promise<number> {
    const prefixedKey = this.getKey(key);
    const remaining = this.cache.getRemainingTTL(prefixedKey);
    return remaining > 0 ? Math.floor(remaining / 1000) : -1;
  }

  // --- LIST METHODS ---
  // For list operations, we'll store lists as JSON strings
  private async getList(key: string): Promise<string[]> {
    const list = await this.get(key);
    return list ? JSON.parse(list) : [];
  }

  private async saveList(
    key: string,
    list: string[],
    ttlInSeconds?: number
  ): Promise<"OK" | null> {
    return this.set(key, JSON.stringify(list), ttlInSeconds);
  }

  async lpush(key: string, value: string): Promise<number> {
    console.log(`LPUSH to ${this.getKey(key)}`);
    const list = await this.getList(key);
    list.unshift(value);
    await this.saveList(key, list);
    return list.length;
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    console.log(`LRANGE from ${this.getKey(key)} ${start} ${stop}`);
    const list = await this.getList(key);
    // If stop is negative, convert it to a positive index from the end
    if (stop < 0) stop = list.length + stop;
    // Redis includes the stop index, so we need to add 1 for slice
    return list.slice(start, stop + 1);
  }

  async llen(key: string): Promise<number> {
    console.log(`LLEN for ${this.getKey(key)}`);
    const list = await this.getList(key);
    return list.length;
  }

  async ltrim(key: string, start: number, stop: number): Promise<"OK" | null> {
    console.log(`LTRIM on ${this.getKey(key)} ${start} ${stop}`);
    const list = await this.getList(key);
    // If stop is negative, convert it to a positive index from the end
    if (stop < 0) stop = list.length + stop;
    // Redis includes the stop index, so we need to add 1 for slice
    const trimmedList = list.slice(start, stop + 1);
    return this.saveList(key, trimmedList);
  }

  async lpushTrim(
    key: string,
    value: string,
    maxLength: number
  ): Promise<Array<unknown> | null> {
    console.log(`LPUSH+LTRIM on ${this.getKey(key)} limit ${maxLength}`);
    const list = await this.getList(key);
    list.unshift(value);
    const trimmedList = list.slice(0, maxLength);
    await this.saveList(key, trimmedList);
    return [
      [null, list.length],
      [null, "OK"],
    ];
  }
}

export function createLRUCache(env: Env, options: CacheOptions = {}) {
  if (!lruCacheInstance) {
    console.log("Creating LRU cache service");
    lruCacheInstance = new LRUCacheService(env, options);
    console.log("LRU cache service created");
  }
  return lruCacheInstance;
}
