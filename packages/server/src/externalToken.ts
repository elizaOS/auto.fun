import { Codex } from "@codex-data/sdk";
import {
  AlertRecurrence,
  EventDisplayType,
  SwapEventData,
  TokenPairEventType,
} from "@codex-data/sdk/dist/sdk/generated/graphql";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getSOLPrice } from "./mcap";
import { getGlobalRedisCache, RedisCache } from "./redis";
import { logger } from "./util";
import { getWebSocketClient, WebSocketClient } from "./websocket-client";
import { getDB, tokens } from "./db";
import { eq } from "drizzle-orm";

const SOLANA_NETWORK_ID = 1399811149;

// Define max swaps to keep in Redis list (consistent with other files)
const MAX_SWAPS_TO_KEEP = 250;

// Time in seconds before refreshing market/holder data
const MARKET_HOLDER_REFRESH_INTERVAL = 60;

// Define a type for the expected structure of a processed swap
// This should match the schema of your 'swaps' table
type ProcessedSwap = {
  id: string;
  tokenMint: string;
  user: string;
  type: "buy" | "sell";
  direction: 0 | 1;
  amountIn: number;
  amountOut: number;
  price: number;
  txId: string;
  timestamp: Date;
};

// Type for combined market and holder data
type TokenDetails = {
  marketData: any; // Replace 'any' with a specific type if available
  holders: any[]; // Replace 'any' with a specific type if available
  lastUpdated: number; // Timestamp of the update
};

/**
 * Use to fetch/update token, holder and swap data for an external token (either post-bond or imported).
 */
export class ExternalToken {
  private sdk: Codex;
  private mint: string;
  private wsClient: WebSocketClient;
  private redisCache: RedisCache; // Store Redis client instance

  // Constructor is now private and requires RedisCache
  private constructor(mint: string, redisClient: RedisCache) {
    this.sdk = new Codex(process.env.CODEX_API_KEY || "");
    this.mint = mint;
    this.wsClient = getWebSocketClient();
    this.redisCache = redisClient;
  }

  // Public static async factory method
  public static async create(mint: string, redisClient?: RedisCache): Promise<ExternalToken> {
    // Await the global cache only if no client is provided
    const resolvedRedisClient = redisClient || await getGlobalRedisCache();
    return new ExternalToken(mint, resolvedRedisClient);
  }

  public async registerWebhook() {
    const securityToken = process.env.CODEX_WEBHOOK_AUTH_TOKEN;
    // if (!securityToken) {
    //   throw new Error("missing CODEX_WEBHOOK_AUTH_TOKEN env var");
    // }

    try {
      await this.sdk.mutations.createWebhooks({
        input: {
          tokenPairEventWebhooksInput: {
            webhooks: [
              {
                alertRecurrence: AlertRecurrence.Indefinite,
                callbackUrl: `${process.env.API_URL}/api/codex-webhook`,
                conditions: {
                  tokenAddress: {
                    eq: this.mint,
                  },
                  networkId: {
                    oneOf: [SOLANA_NETWORK_ID],
                  },
                  eventType: {
                    oneOf: [TokenPairEventType.Buy, TokenPairEventType.Sell],
                  },
                },
                name: this.mint,
                securityToken: securityToken as string,
                deduplicate: true,
              },
            ],
          },
        },
      });

      // Fetch and store initial data
      const updatedData = await this.updateAllData();
      return updatedData;
    } catch (error) {
      console.error(`Failed to register token ${this.mint}:`, error);
      throw error;
    }
  }

  public async updateAllData() {
    logger.info(`ExternalToken [${this.mint}]: Starting updateAllData.`);
    // Run market/holder update (forced) and latest swap fetch in parallel
    const [detailsResult, swapDataResult] = await Promise.all([
      this.updateMarketAndHolders(true), // Force update market/holders
      this.updateLatestSwapData()       // Fetch latest swaps
    ]);

    logger.info(`ExternalToken [${this.mint}]: Finished updateAllData.`);
    // Return combined results
    return {
      marketData: detailsResult?.marketData,
      swapData: swapDataResult,
      holderData: detailsResult?.holders
    };
  }

  // Updated method to fetch/update market and holder data with caching and time check
  public async updateMarketAndHolders(forceUpdate = false): Promise<TokenDetails | null> {
    const detailsKey = `token:details:${this.mint}`;
    const holdersListKey = `holders:${this.mint}`;
    const now = Date.now();

    // 1. Try to get cached details
    if (!forceUpdate) {
      try {
        const cachedDetailsRaw = await this.redisCache.get(detailsKey);
        if (cachedDetailsRaw) {
          const cachedDetails = JSON.parse(cachedDetailsRaw) as TokenDetails;
          // Check if cache is recent enough
          if (now - cachedDetails.lastUpdated < MARKET_HOLDER_REFRESH_INTERVAL * 1000) {
            logger.info(`ExternalToken: Using cached market/holder details for ${this.mint} (updated ${Math.round((now - cachedDetails.lastUpdated) / 1000)}s ago)`);
            return cachedDetails;
          }
          logger.info(`ExternalToken: Cached market/holder details for ${this.mint} are stale. Refreshing.`);
        }
      } catch (err) {
        logger.error(`ExternalToken: Error reading cached details for ${this.mint}:`, err);
        // Proceed to fetch fresh data on error
      }
    } else {
      logger.info(`ExternalToken: Force refreshing market/holder details for ${this.mint}.`);
    }

    // 2. Fetch fresh data if cache is missing, stale, or forced
    logger.info(`ExternalToken: Fetching fresh market/holder details for ${this.mint}.`);
    try {
      const marketResult = await this._fetchMarketData(); // Use internal fetch method
      if (!marketResult) {
        logger.error(`ExternalToken: Failed to fetch market data for ${this.mint}. Aborting update.`);
        return null; // Or return previously cached data if available?
      }

      const holderResult = await this._fetchHolderData(marketResult.tokenSupply); // Use internal fetch method
      console.log(`ExternalToken: Fetched ${holderResult.length} holders for ${this.mint}.`);

      const combinedDetails: TokenDetails = {
        marketData: marketResult.newTokenData,
        holders: holderResult,
        lastUpdated: now,
      };

      // 3. Store combined data in Redis
      await this.redisCache.set(detailsKey, JSON.stringify(combinedDetails), MARKET_HOLDER_REFRESH_INTERVAL * 2); // Cache for double the interval?
      // add holders to a separate list
      await this.redisCache.set(holdersListKey, JSON.stringify(holderResult));
      logger.log(`ExternalToken: Stored updated market/holder details in Redis for ${this.mint}`);

      // 4. Emit WebSocket updates (consider doing this outside if possible)
      this.wsClient.to("global").emit("updateToken", combinedDetails.marketData);
      this.wsClient.to(`token-${this.mint}`).emit("newHolder", combinedDetails.holders);

      return combinedDetails;
    } catch (error) {
      logger.error(`ExternalToken: Failed to update market/holder details for ${this.mint}:`, error);
      // Maybe return the last known good cache if available?
      return null;
    }
  }

  // Internal method to fetch market data, returns data without saving to Redis
  private async _fetchMarketData(): Promise<{ newTokenData: any; tokenSupply: number } | null> {
    try {
      const { filterTokens } = await this.sdk.queries.filterTokens({
        tokens: [`${this.mint}:${SOLANA_NETWORK_ID}`],
      });

      const token = filterTokens?.results?.[0];
      if (!token) {
        throw new Error("failed to find token with codex");
      }
      const createdAt = token.token?.createdAt;
      const creationTime = createdAt ? new Date(createdAt * 1000) : new Date();
      const tokenSupplyUi = token.token?.info?.circulatingSupply
        ? Number(token.token?.info?.circulatingSupply)
        : 0;
      const tokenDecimals = token.token?.decimals ?? 9; // Default or fetch dynamically
      const tokenSupply = tokenSupplyUi
        ? Number(tokenSupplyUi) * 10 ** tokenDecimals
        : 1_000_000_000 * 10 ** tokenDecimals; // Use dynamic decimals
      const marketCap =
        token.token?.info?.circulatingSupply && token.priceUSD
          ? Number(token.token.info.circulatingSupply) * Number(token.priceUSD)
          : token.marketCap
            ? Number(token.marketCap)
            : 0;

      const newTokenData = {
        mint: this.mint, // Ensure mint is included
        marketCapUSD: marketCap,
        volume24h: token.volume24 ? Number(token.volume24) : 0,
        liquidity: token.liquidity ? Number(token.liquidity) : 0,
        tokenPriceUSD: token.priceUSD ? Number(token.priceUSD) : 0,
        holderCount: token.holders ?? 0, // Use nullish coalescing
        tokenSupplyUiAmount: tokenSupplyUi,
        tokenSupply: tokenSupply.toString(),
        tokenDecimals: tokenDecimals,
        createdAt: creationTime,
      };
      const filtered = Object.fromEntries(
        Object.entries(newTokenData).filter(
          ([, value]) => value !== 0 && value !== undefined && value !== null,
        ),
      );

      const db = await getDB();
      await db
        .update(tokens)
        .set(filtered)
        .where(eq(tokens.mint, this.mint))

      return { newTokenData, tokenSupply };
    } catch (error) {
      logger.error(`ExternalToken: Error fetching market data for ${this.mint}:`, error);
      return null;
    }
  }

  // Internal method to fetch holder data, returns data without saving to Redis
  private async _fetchHolderData(tokenSupply: number): Promise<any[]> {
    try {
      const { holders: codexHolders } = await this.sdk.queries.holders({
        input: {
          tokenId: `${this.mint}:${SOLANA_NETWORK_ID}`,
        },
      });

      const now = new Date();

      // Ensure tokenSupply is valid before calculating percentage
      const hasValidSupply = typeof tokenSupply === 'number' && tokenSupply > 0;

      const allHolders = codexHolders.items.map((holder): any => ({
        mint: this.mint,
        address: holder.address,
        amount: holder.shiftedBalance,
        // Calculate percentage only if supply is valid, otherwise default to 0
        percentage: hasValidSupply ? (holder.shiftedBalance / tokenSupply) * 100 : 0,
        lastUpdated: now,
      }));

      allHolders.sort((a, b) => b.percentage - a.percentage);

      const top50Holders = allHolders.slice(0, 50);
      return top50Holders;
    } catch (error) {
      logger.error(`ExternalToken: Error fetching holder data for ${this.mint}:`, error);
      return []; // Return empty array on error
    }
  }

  // fetch and update swap data
  public async updateLatestSwapData(
    BATCH_LIMIT = 200,
  ): Promise<ProcessedSwap[]> {
    const cursor: string | undefined | null = undefined;

    const { getTokenEvents } = await this.sdk.queries.getTokenEvents({
      query: {
        address: this.mint,
        networkId: SOLANA_NETWORK_ID,
        eventDisplayType: [EventDisplayType.Buy, EventDisplayType.Sell],
      },
      limit: BATCH_LIMIT,
      ...(cursor ? { cursor } : {}),
    });

    const codexSwaps = getTokenEvents?.items ?? [];
    const solPrice = await getSOLPrice();

    const processedSwaps = codexSwaps
      .filter(
        (codexSwap): codexSwap is NonNullable<typeof codexSwap> => !!codexSwap,
      )
      .map((codexSwap): ProcessedSwap | null => {
        const swapData = codexSwap.data as SwapEventData;
        const commonData = {
          id: crypto.randomUUID(),
          tokenMint: this.mint,
          txId: codexSwap.transactionHash,
          timestamp: new Date(codexSwap.timestamp * 1000),
          user: codexSwap.maker || "",
        };
        const priceUsdtotal = swapData.priceUsdTotal || 0;
        const SolValue = priceUsdtotal
          ? Number(priceUsdtotal) / Number(solPrice)
          : 0;
        const baseAmount = Number(swapData.amount0 || 0);

        switch (codexSwap.eventDisplayType) {
          case EventDisplayType.Buy:
            return {
              ...commonData,
              type: "buy",
              direction: 0,
              amountIn: SolValue * LAMPORTS_PER_SOL,
              amountOut: Math.abs(baseAmount),
              price: swapData.priceUsd ? Math.abs(Number(swapData.priceUsd)) : 0,
              timestamp: new Date(codexSwap.timestamp * 1000),
            };
          case EventDisplayType.Sell:
            return {
              ...commonData,
              type: "sell",
              direction: 1,
              amountIn: Math.abs(baseAmount),
              amountOut: SolValue * LAMPORTS_PER_SOL,
              price: swapData.priceUsd ? Math.abs(Number(swapData.priceUsd)) : 0,

              timestamp: new Date(codexSwap.timestamp * 1000),
            };
          default:
            return null;
        }
      })
      .filter((swap): swap is NonNullable<typeof swap> => !!swap);


    if (processedSwaps.length > 0) {
      await this.insertProcessedSwaps(processedSwaps);
      for (const swap of processedSwaps) {
        await this.wsClient
          .to(`token-${this.mint}`)
          .emit("newSwap", {
            ...swap,
            tokenMint: this.mint,
            mint: this.mint,
            timestamp: new Date(swap.timestamp).toISOString(),
          });
      }

    }

    console.log(
      `[worker] Updated latest batch for ${this.mint}. Fetched: ${processedSwaps.length} swaps.`,
    );
    return processedSwaps;
  }

  // fetch and update historical swap data
  // call only once when we import the token
  public async fetchHistoricalSwapData(): Promise<void> {
    const BATCH_LIMIT = 200;
    let hasMore = true;
    let cursor: string | undefined | null = undefined;

    console.log(`Starting historical update for ${this.mint}`);
    const solPrice = await getSOLPrice();
    while (hasMore) {
      const { getTokenEvents } = await this.sdk.queries.getTokenEvents({
        query: {
          address: this.mint,
          networkId: SOLANA_NETWORK_ID,
          eventDisplayType: [EventDisplayType.Buy, EventDisplayType.Sell],
        },
        limit: BATCH_LIMIT,
        ...(cursor ? { cursor } : {}),
      });

      const codexSwaps = getTokenEvents?.items ?? [];
      const currentCursor = getTokenEvents?.cursor;

      console.log(
        `[worker] Historical: Fetched ${codexSwaps.length} swaps for ${this.mint}. Next cursor: ${currentCursor}`,
      );

      // Exit the loop if no data or when we fetch less than the limit (end of data)
      if (codexSwaps.length === 0 || codexSwaps.length < BATCH_LIMIT) {
        hasMore = false;
      }

      // Prevent infinite loop if the cursor does not change.
      if (cursor && currentCursor === cursor) {
        console.warn(
          "[worker] Historical: Cursor did not change. Exiting to prevent infinite loop.",
        );
        break;
      }

      const processedSwaps = codexSwaps
        .filter(
          (codexSwap): codexSwap is NonNullable<typeof codexSwap> =>
            !!codexSwap,
        )
        .map((codexSwap): ProcessedSwap | null => {
          const swapData = codexSwap.data as SwapEventData;
          const commonData = {
            id: crypto.randomUUID(),
            tokenMint: this.mint,
            txId: codexSwap.transactionHash,
            timestamp: new Date(codexSwap.timestamp * 1000),
            user: codexSwap.maker || "",
          };

          const priceUsdtotal = swapData.priceUsdTotal || 0;
          const SolValue = priceUsdtotal
            ? Number(priceUsdtotal) / Number(solPrice)
            : 0;
          const baseAmount = Number(swapData.amount0 || 0);

          switch (codexSwap.eventDisplayType) {
            case EventDisplayType.Buy:
              return {
                ...commonData,
                type: "buy",
                direction: 0,
                amountIn: SolValue * LAMPORTS_PER_SOL,
                amountOut: Math.abs(baseAmount),
                price: swapData.priceUsd ? Math.abs(Number(swapData.priceUsd)) : 0,
                timestamp: new Date(codexSwap.timestamp * 1000),
              };
            case EventDisplayType.Sell:
              return {
                ...commonData,
                type: "sell",
                direction: 1,
                amountIn: Math.abs(baseAmount),
                amountOut: SolValue * LAMPORTS_PER_SOL,
                price: swapData.priceUsd ? Math.abs(Number(swapData.priceUsd)) : 0,
                timestamp: new Date(codexSwap.timestamp * 1000),

              };
            default:
              return null;
          }
        })
        .filter((swap): swap is NonNullable<typeof swap> => !!swap);

      if (processedSwaps.length > 0) {
        await this.insertProcessedSwaps(processedSwaps);
        for (const swap of processedSwaps) {
          await this.wsClient
            .to(`token-${this.mint}`)
            .emit("newSwap", {
              ...swap,
              tokenMint: this.mint,
              mint: this.mint,
              timestamp: new Date(swap.timestamp).toISOString(),
            });
        }

      }

      // Update the cursor for the next batch
      cursor = currentCursor;
    }

    console.log(`Historical update complete for ${this.mint}`);
  }

  // save the processed swaps to the database
  public async insertProcessedSwaps(
    processedSwaps: ProcessedSwap[],
  ): Promise<void> {
    if (processedSwaps.length === 0) return;

    // Instantiate Redis client
    const redisCache = await getGlobalRedisCache();
    const listKey = `swapsList:${this.mint}`;

    // Sort swaps by ascending timestamp (oldest first)
    // Important: We push to the START of the list (lpush),
    // so processing oldest first ensures the list maintains newest-at-the-start order.
    processedSwaps.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    logger.log(
      `Inserting ${processedSwaps.length} swaps into Redis list ${listKey} for ${this.mint}`,
    );

    let insertedCount = 0;
    // Loop and push individually (lpush doesn't easily handle large arrays in ioredis types)
    for (const swap of processedSwaps) {
      try {
        // Ensure timestamp is stringified correctly if it's a Date object
        const swapToStore = {
          ...swap,
          timestamp:
            swap.timestamp instanceof Date
              ? swap.timestamp.toISOString()
              : swap.timestamp,
        };
        await redisCache.lpush(listKey, JSON.stringify(swapToStore));
        // Trim after each push to keep the list size controlled
        await redisCache.ltrim(listKey, 0, MAX_SWAPS_TO_KEEP - 1);
        insertedCount++;
      } catch (redisError) {
        logger.error(
          `ExternalToken: Failed to save swap to Redis list ${listKey}:`,
          redisError,
        );
        // Optionally break or continue on error
        // break;
      }
    }

    console.log(
      `Finished inserting. ${insertedCount} swaps pushed to Redis for ${this.mint}`,
    );
  }
}
