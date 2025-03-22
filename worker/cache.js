import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { cachePrices, getDB } from './db';
import { logger } from './logger';
/**
 * Unified cache system using Drizzle/D1 for all caching needs
 * Simplifies the architecture by avoiding additional services like KV
 */
export class CacheService {
    db;
    constructor(env) {
        this.db = getDB(env);
    }
    /**
     * Get SOL price from cache
     */
    async getSolPrice() {
        try {
            // Get from D1/Drizzle cache
            const now = new Date().toISOString();
            const cachedPrice = await this.db.select()
                .from(cachePrices)
                .where(and(eq(cachePrices.type, 'sol'), eq(cachePrices.symbol, 'SOL'), gt(cachePrices.expiresAt, now)))
                .orderBy(sql `timestamp DESC`)
                .limit(1);
            if (cachedPrice.length > 0) {
                return parseFloat(cachedPrice[0].price);
            }
            return null;
        }
        catch (error) {
            logger.error('Error getting SOL price from cache:', error);
            return null;
        }
    }
    /**
     * Store SOL price in cache
     * @param price SOL price in USD
     * @param ttlSeconds How long the cache should live (in seconds)
     */
    async setSolPrice(price, ttlSeconds = 30) {
        try {
            const now = new Date();
            const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
            await this.db.insert(cachePrices).values({
                id: crypto.randomUUID(),
                type: 'sol',
                symbol: 'SOL',
                price: price.toString(),
                timestamp: now.toISOString(),
                expiresAt
            });
            // Clean up old cache entries
            await this.cleanupOldCacheEntries('sol', 'SOL');
        }
        catch (error) {
            logger.error('Error setting SOL price in cache:', error);
        }
    }
    /**
     * Get token price from cache
     */
    async getTokenPrice(mint) {
        try {
            const now = new Date().toISOString();
            const cachedPrice = await this.db.select()
                .from(cachePrices)
                .where(and(eq(cachePrices.type, 'token'), eq(cachePrices.symbol, mint), gt(cachePrices.expiresAt, now)))
                .orderBy(sql `timestamp DESC`)
                .limit(1);
            if (cachedPrice.length > 0) {
                return parseFloat(cachedPrice[0].price);
            }
            return null;
        }
        catch (error) {
            logger.error(`Error getting token price for ${mint} from cache:`, error);
            return null;
        }
    }
    /**
     * Store token price in cache
     */
    async setTokenPrice(mint, price, ttlSeconds = 300) {
        try {
            const now = new Date();
            const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
            await this.db.insert(cachePrices).values({
                id: crypto.randomUUID(),
                type: 'token',
                symbol: mint,
                price: price.toString(),
                timestamp: now.toISOString(),
                expiresAt
            });
            // Clean up old cache entries
            await this.cleanupOldCacheEntries('token', mint);
        }
        catch (error) {
            logger.error(`Error setting token price for ${mint} in cache:`, error);
        }
    }
    /**
     * Store any metadata object in cache
     */
    async setMetadata(key, data, ttlSeconds = 3600) {
        try {
            const now = new Date();
            const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
            await this.db.insert(cachePrices).values({
                id: crypto.randomUUID(),
                type: 'metadata',
                symbol: key,
                price: JSON.stringify(data),
                timestamp: now.toISOString(),
                expiresAt
            });
            // Clean up old cache entries
            await this.cleanupOldCacheEntries('metadata', key);
        }
        catch (error) {
            logger.error(`Error caching metadata for ${key}:`, error);
        }
    }
    /**
     * Get metadata from cache
     */
    async getMetadata(key) {
        try {
            const now = new Date().toISOString();
            const cachedData = await this.db.select()
                .from(cachePrices)
                .where(and(eq(cachePrices.type, 'metadata'), eq(cachePrices.symbol, key), gt(cachePrices.expiresAt, now)))
                .orderBy(sql `timestamp DESC`)
                .limit(1);
            if (cachedData.length > 0) {
                try {
                    return JSON.parse(cachedData[0].price);
                }
                catch (parseError) {
                    logger.error(`Error parsing cached metadata for ${key}:`, parseError);
                    return null;
                }
            }
            return null;
        }
        catch (error) {
            logger.error(`Error getting metadata for ${key} from cache:`, error);
            return null;
        }
    }
    /**
     * Delete expired cache entries to keep the DB size manageable
     */
    async cleanupOldCacheEntries(type, symbol) {
        try {
            const now = new Date().toISOString();
            // Delete expired entries
            await this.db.delete(cachePrices)
                .where(and(eq(cachePrices.type, type), eq(cachePrices.symbol, symbol), lt(cachePrices.expiresAt, now)));
            // Keep only the N most recent entries
            const recentEntries = await this.db.select({ id: cachePrices.id })
                .from(cachePrices)
                .where(and(eq(cachePrices.type, type), eq(cachePrices.symbol, symbol)))
                .orderBy(sql `timestamp DESC`)
                .limit(10);
            if (recentEntries.length > 0) {
                const keepIds = recentEntries.map((entry) => entry.id);
                if (keepIds.length > 0) {
                    await this.db.delete(cachePrices)
                        .where(and(eq(cachePrices.type, type), eq(cachePrices.symbol, symbol), sql `${cachePrices.id} NOT IN (${keepIds.join(',')})`));
                }
            }
        }
        catch (error) {
            logger.error(`Error cleaning up cache entries for ${type}:${symbol}:`, error);
        }
    }
}
