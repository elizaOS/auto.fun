import {
  PythCluster,
  PythHttpClient,
  getPythClusterApiUrl,
  getPythProgramKeyForCluster,
} from "@pythnetwork/client";
import { Connection } from "@solana/web3.js";
import { eq, SQLWrapper, and, ne } from "drizzle-orm";
import { initSdk } from "./raydium";
import { getDB, tokens } from "./db";
import { Env } from "./env";
import { logger } from "./logger";
import { CacheService } from "./cache";
import {
  shouldUpdateSupply,
  updateTokenSupplyFromChain,
} from "./tokenSupplyHelpers";
import { BN, Program } from "@coral-xyz/anchor";

// Constants
const PYTHNET_CLUSTER_NAME: PythCluster = "pythnet";
const SOLUSD_SYMBOL = "Crypto.SOL/USD";
const MAX_CONCURRENT_TOKENS = 3; // Maximum number of tokens to process concurrently

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

  // Try Pyth Network first (most accurate source)
  // try {
  //   console.log("fetching sol price from pyth");
  //   const price = await fetchSOLPriceFromPyth();

  //   console.log("price", price);

  //   // Cache the result if env is provided
  //   if (env && price > 0) {
  //     const cacheService = new CacheService(env);
  //     await cacheService.setSolPrice(price);
  //   }

  //   if (price > 0) {
  //     return price;
  //   }
  // } catch (error) {
  //   logger.error("Error fetching SOL price from Pyth:", error);
  // }

  // If Pyth fails, try CoinGecko
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

/**
 * Fetch SOL/USD price directly from Pyth Network
 */
export async function fetchSOLPriceFromPyth(): Promise<number> {
  try {
    const pythConnection = new Connection(
      getPythClusterApiUrl(PYTHNET_CLUSTER_NAME),
    );
    const pythPublicKey = getPythProgramKeyForCluster(PYTHNET_CLUSTER_NAME);
    const pythClient = new PythHttpClient(pythConnection, pythPublicKey);

    const data = await pythClient.getData();
    const solPrice = data.productPrice.get(SOLUSD_SYMBOL);

    if (!solPrice || !solPrice.price) {
      logger.error("Unable to get SOL/USD price from Pyth");
      return 0;
    }

    return solPrice.price;
  } catch (error) {
    logger.error("Error fetching SOL price from Pyth:", error);
    return 0;
  }
}

/**
 * Calculate token market data using SOL price
 */
export async function calculateTokenMarketData(
  token: any,
  solPrice: number,
  env: Env,
): Promise<any> {
  // Copy the token to avoid modifying the original
  const tokenWithMarketData = { ...token };

  // console.log("tokenWithMarketData", tokenWithMarketData);

  // console.log("solPrice", solPrice);

  try {
    // Calculate token price in USD
    if (token.currentPrice) {
      tokenWithMarketData.tokenPriceUSD = token.currentPrice * solPrice;
    }

    if (shouldUpdateSupply(token)) {
      const updatedSupply = await updateTokenSupplyFromChain(env, token.mint);
      tokenWithMarketData.tokenSupply = updatedSupply.tokenSupply;
      tokenWithMarketData.tokenSupplyUiAmount =
        updatedSupply.tokenSupplyUiAmount;
      tokenWithMarketData.tokenDecimals = updatedSupply.tokenDecimals;
      tokenWithMarketData.lastSupplyUpdate = updatedSupply.lastSupplyUpdate;
    }

    // Calculate market cap
    if (token.tokenSupplyUiAmount) {
      if (tokenWithMarketData.tokenPriceUSD) {
        tokenWithMarketData.marketCapUSD =
          token.tokenSupplyUiAmount * tokenWithMarketData.tokenPriceUSD;
      }
    }

    // Add SOL price
    tokenWithMarketData.solPriceUSD = solPrice;

    return tokenWithMarketData;
  } catch (error) {
    logger.error("Error calculating market data:", error);
    return token; // Return original token if calculation fails
  }
}

async function calculateRaydiumTokenMarketData(token: any, env?: Env) {
  try {
    const TOKEN_DECIMALS = env ? Number(env.DECIMALS || 6) : 6;
    const solPrice = await getSOLPrice(env);
    const raydium = await initSdk({ loadToken: true, env });

    let poolInfo;
    let retries = 5;

    while (retries > 0) {
      try {
        if (raydium.cluster === "devnet") {
          const data = await raydium.cpmm.getPoolInfoFromRpc(token.marketId);
          poolInfo = data.poolInfo;
        } else {
          const data = await raydium.api.fetchPoolById({ ids: token.marketId });
          if (!data || data.length === 0) {
            logger.error("Mcap: Pool info not found");
            throw new Error("Mcap: Pool info not found");
          }
          poolInfo = data[0];
        }
        break;
      } catch (error) {
        retries--;
        if (retries === 0) {
          logger.error(
            `Mcap: Failed to fetch pool info after retries: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
        await new Promise((resolve) =>
          setTimeout(resolve, (5 - retries) * 5000),
        );
      }
    }

    if (!poolInfo || !poolInfo.mintAmountA || !poolInfo.mintAmountB) {
      logger.error("Mcap: Invalid pool info structure");
    }

    // const virtualLiquidity = env ? Number(env.VIRTUAL_RESERVES) / Math.pow(10, 9) : 0;

    if (!poolInfo) {
      throw new Error("Mcap: Invalid pool info structure");
    }

    if (!poolInfo.mintAmountA || !poolInfo.mintAmountB) {
      throw new Error("Mcap: Invalid pool info structure");
    }

    // if mintAmountA is not a number, throw an error
    if (
      typeof poolInfo.mintAmountA !== "number" ||
      typeof poolInfo.mintAmountB !== "number"
    ) {
      throw new Error("Mcap: Invalid pool info structure");
    }

    // Calculate raw price (SOL/token)
    const currentPrice =
      poolInfo.mintAmountA > 0
        ? poolInfo.mintAmountA / poolInfo.mintAmountB
        : 0;

    // Calculate token price in USD
    const tokenPriceUSD = currentPrice > 0 ? currentPrice * solPrice : 0;

    // Calculate market cap
    const marketCapUSD = env
      ? (Number(env.TOKEN_SUPPLY) / Math.pow(10, TOKEN_DECIMALS)) *
      tokenPriceUSD
      : (1000000000000000 / Math.pow(10, TOKEN_DECIMALS)) * tokenPriceUSD; // Default value if env not available

    if (marketCapUSD < 0) {
      throw new Error("Mcap: Market cap is negative");
    }

    if (!poolInfo.mintAmountA || !poolInfo.mintAmountB) {
      throw new Error("Mcap: Invalid pool info structure");
    }

    // Calculate total liquidity in USD
    const liquidity =
      poolInfo.mintAmountA > 0 && poolInfo.mintAmountB > 0
        ? // Token side: amount * price in USD (already in correct decimals)
        poolInfo.mintAmountB * tokenPriceUSD +
        // SOL side: amount * SOL price (already in correct decimals)
        poolInfo.mintAmountA * solPrice
        : 0;

    // logger.log('Raydium market data:', {
    //   mint: token.mint,
    //   currentPrice,
    //   tokenPriceUSD,
    //   marketCapUSD,
    //   solPrice,
    //   mintAmountA: poolInfo.mintAmountA.toString(),
    //   mintAmountB: poolInfo.mintAmountB.toString(),
    //   liquidity
    // });

    return {
      marketCapUSD,
      tokenPriceUSD,
      solPriceUSD: solPrice,
      currentPrice,
      liquidity,
    };
  } catch (error) {
    logger.error(
      `Error calculating Raydium token market data for ${token.mint}:`,
      error,
    );
    logger.error(
      "RPC Node issue - Consider using a paid RPC endpoint for better reliability",
    );
    failedUpdates++;
    return {
      marketCapUSD: 0,
      tokenPriceUSD: 0,
      solPriceUSD: 0,
      currentPrice: 0,
      liquidity: 0,
    };
  }
}

/**
 * Process a batch of tokens and update their market data
 * This approach is more compatible with Cloudflare Workers' stateless nature
 */
export async function updateMigratedTokenMarketData(env?: Env) {
  console.log("Updating migrated token market data");
  try {
    const startTime = Date.now();

    // Use the provided env or create a minimal fallback (no process.env)
    const workingEnv =
      env ||
      ({
        NETWORK: "devnet",
        DECIMALS: "6",
        TOKEN_SUPPLY: "1000000000000000",
        VIRTUAL_RESERVES: "28000000000",
        CURVE_LIMIT: "113000000000",
      } as Env); // Cast to Env for compatibility

    const db = getDB(workingEnv);
    const migratedTokens = await db
      .select()
      .from(tokens)
      .where(
        and(
          eq(tokens.status, "locked"),
          ne(tokens.imported, 1)
        )
      );

    const tokenCount = migratedTokens.length;
    let successCount = 0;

    // Process tokens in chunks of MAX_CONCURRENT_TOKENS to avoid overwhelming the worker
    for (let i = 0; i < migratedTokens.length; i += MAX_CONCURRENT_TOKENS) {
      const tokenBatch = migratedTokens.slice(i, i + MAX_CONCURRENT_TOKENS);

      // Process this batch of tokens concurrently
      const batchResults = await Promise.all(
        tokenBatch.map(async (token: { mint: string | SQLWrapper }) => {
          try {
            const marketData = await calculateRaydiumTokenMarketData(
              token,
              workingEnv,
            );

            await db
              .update(tokens)
              .set({
                currentPrice: marketData.currentPrice,
                marketCapUSD: marketData.marketCapUSD,
                tokenPriceUSD: marketData.tokenPriceUSD,
                liquidity: marketData.liquidity,
                solPriceUSD: marketData.solPriceUSD,
                lastUpdated: new Date().toISOString(),
              })
              .where(eq(tokens.mint, token.mint));

            return { success: true, token };
          } catch (error) {
            logger.error(
              `Error updating market data for token ${token.mint}:`,
              error,
            );
            failedUpdates++;
            return { success: false, token };
          }
        }),
      );

      // Count successes from this batch
      successCount += batchResults.filter((result) => result.success).length;

      // Sleep briefly between batches to avoid hitting rate limits
      if (i + MAX_CONCURRENT_TOKENS < migratedTokens.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    const endTime = Date.now();
    totalUpdatesProcessed += tokenCount;
    lastUpdateTime = new Date();

    logger.log(`Market data update complete:
      - Tokens processed: ${tokenCount}
      - Successful updates: ${successCount}
      - Failed updates: ${failedUpdates}
      - Time taken: ${(endTime - startTime) / 1000}s
      - Total updates lifetime: ${totalUpdatesProcessed}`);
  } catch (error) {
    logger.error("Error in updateMigratedTokenMarketData:", error);
    failedUpdates++;
  }
}

// Export metrics for monitoring - simplified without queue information
export function getMarketDataMetrics() {
  return {
    totalUpdatesProcessed,
    failedUpdates,
    lastUpdateTime,
  };
}
