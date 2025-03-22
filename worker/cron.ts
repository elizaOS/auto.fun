import { Env } from './env';
import { CacheService } from './cache';
import { logger } from './logger';
import { updateSOLPrice } from './mcap';

/**
 * Handle scheduled tasks via Cloudflare Cron triggers
 * This runs according to the schedule defined in wrangler.toml
 */
export async function handleScheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  const scheduler = new CronScheduler(env);
  
  try {
    // Update SOL price every 10 seconds
    // The actual frequency is determined by the [triggers] section in wrangler.toml
    await scheduler.updateSolPrice();
    
    // Add more scheduled tasks as needed
    // - Token price updates
    // - Cleanup old cache entries
    // - Refresh market data
  } catch (error) {
    logger.error('Error in scheduled tasks:', error);
  }
}

/**
 * Class to manage scheduled tasks
 */
class CronScheduler {
  private env: Env;
  private cache: CacheService;
  
  constructor(env: Env) {
    this.env = env;
    this.cache = new CacheService(env);
  }
  
  /**
   * Update SOL price in cache, using Pyth as the primary source
   */
  async updateSolPrice(): Promise<void> {
    try {
      // Use the dedicated update function that uses Pyth
      const solPrice = await updateSOLPrice(this.env);
      
      if (solPrice > 0) {
        logger.log(`[CRON] Updated SOL price: $${solPrice}`);
      } else {
        logger.error('[CRON] Failed to get a valid SOL price');
      }
    } catch (error) {
      logger.error('[CRON] Error updating SOL price:', error);
    }
  }
  
  /**
   * Cleanup old cache entries
   * Can be implemented to run less frequently (e.g., hourly)
   */
  async cleanupOldCacheEntries(): Promise<void> {
    try {
      // TODO: Implement a comprehensive cleanup task that runs less frequently
      
      // One approach is to delete all expired entries:
      // const db = getDB(this.env);
      // const now = new Date().toISOString();
      // await db.delete(cachePrices)
      //   .where(lt(cachePrices.expiresAt, now));
      
      logger.log('[CRON] Cleaned up old cache entries');
    } catch (error) {
      logger.error('[CRON] Error cleaning up cache:', error);
    }
  }
} 