

import { Env } from "./env";
import { logger } from "./logger";
import { CacheService } from "./cache";

// Monitoring metrics
let totalUpdatesProcessed = 0;
let failedUpdates = 0;
let lastUpdateTime: Date | null = null;

/**
 * Get the current SOL price in USD
 * Prioritizes cache, then Pyth, then fallback APIs
 */
export async function getSOLPrice(env?: Env): Promise<number> {
  console.log("getting sol price");
  // If env is provided, try to get price from cache first
  if (env) {
    const cacheService = new CacheService(env);
    const cachedPrice = await cacheService.getSolPrice();
    console.log("cachedPrice", cachedPrice);
    if (cachedPrice !== null) {
      return cachedPrice;
    }
  }

  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
    );
    const data = (await response.json()) as any;

    if (data && data.solana && data.solana.usd) {
      const price = data.solana.usd;

      // If env is provided, cache the price
      if (env) {
        const cacheService = new CacheService(env);
        await cacheService.setSolPrice(price);
      }

      return price;
    }
  } catch (error) {
    logger.error("Error fetching SOL price from Coingecko:", error);
  }

  // If CoinGecko fails, try Binance
  try {
    const response = await fetch(
      "https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT",
    );
    const data = (await response.json()) as any;

    if (data && data.price) {
      const price = parseFloat(data.price);

      // If env is provided, cache the price
      if (env) {
        const cacheService = new CacheService(env);
        await cacheService.setSolPrice(price);
      }

      return price;
    }
  } catch (error) {
    logger.error("Error fetching SOL price from Binance:", error);
  }

  // Fallback to fixed price if all sources fail
  return 135.0; // Fallback price
}





// Export metrics for monitoring - simplified without queue information
export function getMarketDataMetrics() {
  return {
    totalUpdatesProcessed,
    failedUpdates,
    lastUpdateTime,
  };
}
