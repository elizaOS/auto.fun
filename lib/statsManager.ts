import { Token } from '../schemas';
import { logger } from '../logger';

/**
 * In-memory singleton for tracking max stats across all tokens
 * Used for calculating featured scores without additional DB queries
 */
class StatsManager {
  private static instance: StatsManager;
  private maxVolume24h: number = 1;
  private maxHolderCount: number = 1;
  private maxMarketCap: number = 1;
  private initialized: boolean = false;

  private constructor() {}

  /**
   * Get the singleton instance
   */
  public static getInstance(): StatsManager {
    if (!StatsManager.instance) {
      StatsManager.instance = new StatsManager();
    }
    return StatsManager.instance;
  }

  /**
   * Initialize with values from database
   * Should be called once at server startup
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Get initial max values from database
      const [maxStats] = await Token.aggregate([
        { $match: { status: { $ne: 'pending' } } },
        { 
          $group: { 
            _id: null, 
            maxVolume24h: { $max: '$volume24h' },
            maxHolderCount: { $max: '$holderCount' },
            maxMarketCap: { $max: '$marketCapUSD' }
          } 
        }
      ]);

      if (maxStats) {
        this.maxVolume24h = maxStats.maxVolume24h || 1;
        this.maxHolderCount = maxStats.maxHolderCount || 1;
        this.maxMarketCap = maxStats.maxMarketCap || 1;
      }

      this.initialized = true;
      logger.log('StatsManager initialized with values:', {
        maxVolume24h: this.maxVolume24h,
        maxHolderCount: this.maxHolderCount,
        maxMarketCap: this.maxMarketCap
      });
    } catch (error) {
      logger.error('Failed to initialize StatsManager:', error);
      // Set default values in case of failure
      this.maxVolume24h = 1;
      this.maxHolderCount = 1;
      this.maxMarketCap = 1;
      this.initialized = true; // Mark as initialized to avoid repeated failures
    }
  }

  /**
   * Update all stats at once from a token update
   */
  public updateStats(stats: {
    volume24h?: number;
    holderCount?: number;
    marketCap?: number;
  }): void {
    if (stats.volume24h && stats.volume24h > this.maxVolume24h) {
      this.maxVolume24h = stats.volume24h;
      logger.log(`Updated maxVolume24h to ${stats.volume24h}`);
    }

    if (stats.holderCount && stats.holderCount > this.maxHolderCount) {
      this.maxHolderCount = stats.holderCount;
      logger.log(`Updated maxHolderCount to ${stats.holderCount}`);
    }

    if (stats.marketCap && stats.marketCap > this.maxMarketCap) {
      this.maxMarketCap = stats.marketCap;
      logger.log(`Updated maxMarketCap to ${stats.marketCap}`);
    }
  }

  /**
   * Update maxHolderCount if the new value is greater
   */
  public updateMaxHolderCount(count: number): void {
    if (count > this.maxHolderCount) {
      this.maxHolderCount = count;
      logger.log(`Updated maxHolderCount to ${count}`);
    }
  }

  /**
   * Get current max stats
   */
  public getMaxStats(): { maxVolume24h: number; maxHolderCount: number; maxMarketCap: number } {
    return {
      maxVolume24h: this.maxVolume24h,
      maxHolderCount: this.maxHolderCount,
      maxMarketCap: this.maxMarketCap
    };
  }

  /**
   * Calculate featured score for a token using in-memory max stats
   * Uses the same formula as the API endpoints
   */
  public calculateFeaturedScore(token: { volume24h?: number; holderCount?: number }): number {
    const volume = token.volume24h || 0;
    const holders = token.holderCount || 0;
    
    // Same formula as used in the API
    return (volume / this.maxVolume24h) * Number(process.env.FEATURED_SCORE_VOLUME_WEIGHT) + 
           (holders / this.maxHolderCount) * Number(process.env.FEATURED_SCORE_HOLDER_WEIGHT);
  }

  /**
   * Enrich a token object with featuredScore
   * Does not modify the original object
   */
  public enrichTokenWithScore<T extends { volume24h?: number; holderCount?: number }>(token: T): T & { featuredScore: number } {
    const featuredScore = this.calculateFeaturedScore(token);
    return { ...token, featuredScore };
  }
}

export const statsManager = StatsManager.getInstance();
