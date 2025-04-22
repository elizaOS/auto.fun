import { Codex } from "@codex-data/sdk";
import {
  AlertRecurrence,
  EventDisplayType,
  SwapEventData,
  TokenPairEventType,
} from "@codex-data/sdk/dist/sdk/generated/graphql";
import { Env } from "./env";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getDB, tokens } from "./db";
import { eq } from "drizzle-orm";
import { getSOLPrice } from "./mcap";
import { createLRUCache } from "./cache/lruCache";

const SOLANA_NETWORK_ID = 1399811149;

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
  timestamp: string;
};

/**
 * Use to fetch/update token, holder and swap data for an external token (either post-bond or imported).
 */
export class ExternalToken {
  private sdk: Codex;
  private mint: string;
  private db: ReturnType<typeof getDB>;
  private env: Env;

  constructor(env: Env, mint: string) {
    this.sdk = new Codex(env.CODEX_API_KEY);
    this.mint = mint;
    this.db = getDB(env);
    this.env = env;
  }

  public async registerWebhook() {
    const securityToken = this.env.CODEX_WEBHOOK_AUTH_TOKEN;
    if (!securityToken) {
      throw new Error("missing CODEX_WEBHOOK_AUTH_TOKEN env var");
    }

    try {
      await this.sdk.mutations.createWebhooks({
        input: {
          tokenPairEventWebhooksInput: {
            webhooks: [
              {
                alertRecurrence: AlertRecurrence.Indefinite,
                callbackUrl: `${this.env.API_URL}/api/codex-webhook`,
                // callbackUrl: `https://out-charitable-remain-declined.trycloudflare.com/api/codex-webhook`,
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
                securityToken,
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
    const marketData = await this.updateMarketData();

    const [swapData, holderData] = await Promise.all([
      this.updateLatestSwapData(),
      this.updateHolderData(marketData.tokenSupply),
    ]);

    return { marketData, swapData, holderData };
  }

  public async updateMarketAndHolders() {
    const marketData = await this.updateMarketData();
    const holders = await this.updateHolderData(marketData.tokenSupply);
    return { marketData, holders };
  }

  public async updateMarketData() {
    const { filterTokens } = await this.sdk.queries.filterTokens({
      tokens: [`${this.mint}:${SOLANA_NETWORK_ID}`],
    });

    const token = filterTokens?.results?.[0];
    if (!token) {
      throw new Error("failed to find token with codex");
    }
    const createdAt = token.token?.createdAt;
    // get data from codex number createdAt
    const creationTime = createdAt ? new Date(createdAt * 1000) : new Date();
    const tokenSupplyUi = token.token?.info?.circulatingSupply
      ? Number(token.token?.info?.circulatingSupply)
      : 0;
    const tokenDecimals = token.token?.decimals ?? 9;
    const tokenSupply = tokenSupplyUi
      ? Number(tokenSupplyUi) * 10 ** tokenDecimals
      : 1_000_000_000 * 1e9; // 1 billion tokens with 9 decimals
    const marketCap =
      token.token?.info?.circulatingSupply && token.priceUSD
        ? Number(token.token.info.circulatingSupply) * Number(token.priceUSD)
        : token.marketCap
          ? Number(token.marketCap)
          : 0;
    const newTokenData = {
      marketCapUSD: marketCap,
      volume24h: token.volume24 ? Number(token.volume24) : 0,
      liquidity: token.liquidity ? Number(token.liquidity) : 0,
      tokenPriceUSD: token.priceUSD ? Number(token.priceUSD) : 0,
      holderCount: token.holders,
      tokenSupplyUiAmount: tokenSupplyUi,
      tokenSupply: tokenSupply.toString(),
      tokenDecimals: tokenDecimals,
      // time of import
      createdAt: creationTime,

      // time of actual token creation
      // createdAt: token.createdAt
      //   ? new Date(token.createdAt * 1000).toISOString()
      //   : new Date().toISOString(),
    };

    // TODO: featured score for token db and websocket
    const updatedToken = (
      await this.db
        .update(tokens)
        .set(newTokenData)
        .where(eq(tokens.mint, this.mint))
        .returning()
    )[0];

    // this.wsClient.to("global").emit("updateToken", updatedToken);

    return { newTokenData, tokenSupply };
  }

  // get creator for the token
  public async getCreatorAddress() {
    const { filterTokens } = await this.sdk.queries.filterTokens({
      tokens: [`${this.mint}:${SOLANA_NETWORK_ID}`],
    });

    const token = filterTokens?.results?.[0];
    if (!token) {
      throw new Error("failed to find token with codex");
    }

    return token.token?.creatorAddress || null;
  }

  public async updateHolderData(tokenSupply: number) {
    try {
      const { holders: codexHolders } = await this.sdk.queries.holders({
        input: {
          tokenId: `${this.mint}:${SOLANA_NETWORK_ID}`,
        },
      });

      const allHolders = tokenSupply
        ? codexHolders.items.map((holder): any => ({
            id: crypto.randomUUID(),
            mint: this.mint,
            address: holder.address,
            amount: holder.shiftedBalance,
            percentage: (holder.shiftedBalance / tokenSupply) * 100,
            lastUpdated: new Date(),
          }))
        : [];

      allHolders.sort((a, b) => b.percentage - a.percentage);

      // Store full list in Redis instead of DB
      const redisCache = createLRUCache(this.env);
      const holdersListKey = redisCache.getKey(`holders:${this.mint}`);
      try {
        await redisCache.set(holdersListKey, JSON.stringify(allHolders));
        console.log(
          `MigrationBE/ExternalToken: Stored ${allHolders.length} holders in Redis list ${holdersListKey}`
        );
      } catch (redisError) {
        console.error(
          `MigrationBE/ExternalToken: Failed to store holders in Redis for ${this.mint}:`,
          redisError
        );
      }

      // Return the full list as stored in Redis
      return allHolders;
    } catch (error) {
      console.error("Error updating holder data:", error);
      throw error;
    }
  }
  // fetch and update swap data
  public async updateLatestSwapData(
    BATCH_LIMIT = 200
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
    const solPrice = await getSOLPrice(this.env);

    const processedSwaps = codexSwaps
      .filter(
        (codexSwap): codexSwap is NonNullable<typeof codexSwap> => !!codexSwap
      )
      .map((codexSwap): ProcessedSwap | null => {
        const swapData = codexSwap.data as SwapEventData;
        const commonData = {
          id: crypto.randomUUID(),
          tokenMint: this.mint,
          txId: codexSwap.transactionHash,
          timestamp: new Date(codexSwap.timestamp * 1000).toISOString(),
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
              price: swapData.priceUsd ? Number(swapData.priceUsd) : 0,
            };
          case EventDisplayType.Sell:
            return {
              ...commonData,
              type: "sell",
              direction: 1,
              amountIn: Math.abs(baseAmount),
              amountOut: SolValue * LAMPORTS_PER_SOL,
              price: swapData.priceUsd ? Number(swapData.priceUsd) : 0,
            };
          default:
            return null;
        }
      })
      .filter((swap): swap is NonNullable<typeof swap> => !!swap);

    // if (processedSwaps.length > 0) {
    //   await this.insertProcessedSwaps(processedSwaps);
    //   await this.wsClient
    //     .to(`token-${this.mint}`)
    //     .emit("newSwap", processedSwaps);
    // }

    console.log(
      `[worker] Updated latest batch for ${this.mint}. Fetched: ${processedSwaps.length} swaps.`
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
        `[worker] Historical: Fetched ${codexSwaps.length} swaps for ${this.mint}. Next cursor: ${currentCursor}`
      );

      // Exit the loop if no data or when we fetch less than the limit (end of data)
      if (codexSwaps.length === 0 || codexSwaps.length < BATCH_LIMIT) {
        hasMore = false;
      }

      // Prevent infinite loop if the cursor does not change.
      if (cursor && currentCursor === cursor) {
        console.warn(
          "[worker] Historical: Cursor did not change. Exiting to prevent infinite loop."
        );
        break;
      }

      const processedSwaps = codexSwaps
        .filter(
          (codexSwap): codexSwap is NonNullable<typeof codexSwap> => !!codexSwap
        )
        .map((codexSwap): ProcessedSwap | null => {
          const swapData = codexSwap.data as SwapEventData;
          const commonData = {
            id: crypto.randomUUID(),
            tokenMint: this.mint,
            txId: codexSwap.transactionHash,
            timestamp: new Date(codexSwap.timestamp * 1000).toISOString(),
            user: codexSwap.maker || "",
          };

          switch (codexSwap.eventDisplayType) {
            case EventDisplayType.Buy:
              return {
                ...commonData,
                type: "buy",
                direction: 0,
                amountIn: -Number(swapData.amount1 || 0) * LAMPORTS_PER_SOL,
                amountOut: Number(swapData.amount0 || 0) * 1e6,
                price: swapData.priceUsd ? Number(swapData.priceUsd) : 0,
              };
            case EventDisplayType.Sell:
              return {
                ...commonData,
                type: "sell",
                direction: 1,
                amountIn: -Number(swapData.amount0 || 0) * 1e6,
                amountOut: Number(swapData.amount1 || 0) * LAMPORTS_PER_SOL,
                price: swapData.priceUsd ? Number(swapData.priceUsd) : 0,
              };
            default:
              return null;
          }
        })
        .filter((swap): swap is NonNullable<typeof swap> => !!swap);

      if (processedSwaps.length > 0) {
        await this.insertProcessedSwaps(processedSwaps);
        // await this.wsClient
        //   .to(`token-${this.mint}`)
        //   .emit("newSwap", processedSwaps);
      }

      // Update the cursor for the next batch
      cursor = currentCursor;
    }

    console.log(`Historical update complete for ${this.mint}`);
  }

  // save the processed swaps to the database
  private async insertProcessedSwaps(
    processedSwaps: ProcessedSwap[]
  ): Promise<void> {
    if (processedSwaps.length === 0) return;

    // Instantiate Redis client (assuming local path)
    const redisCache = createLRUCache(this.env);
    const listKey = redisCache.getKey(`swapsList:${this.mint}`);
    // Define max swaps consistent with worker (can be adjusted if needed for migration)
    const MAX_SWAPS_TO_KEEP = 1000;

    // Sort swaps by ascending timestamp (oldest first for lpush)
    processedSwaps.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    console.log(
      `MigrationBE: Inserting ${processedSwaps.length} swaps into Redis list ${listKey} for ${this.mint}`
    );

    let insertedCount = 0;
    for (const swap of processedSwaps) {
      try {
        // Ensure timestamp is stringified
        const swapToStore = {
          ...swap,
          timestamp:
            typeof swap.timestamp !== "string"
              ? new Date(swap.timestamp).toISOString()
              : swap.timestamp,
        };
        await redisCache.lpush(listKey, JSON.stringify(swapToStore));
        await redisCache.ltrim(listKey, 0, MAX_SWAPS_TO_KEEP - 1);
        insertedCount++;
      } catch (redisError) {
        console.error(
          `MigrationBE: Failed to save swap to Redis list ${listKey}:`,
          redisError
        );
      }
    }

    console.log(
      `MigrationBE: Finished inserting. ${insertedCount} swaps pushed to Redis for ${this.mint}`
    );
  }
}
