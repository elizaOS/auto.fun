import { Codex } from "@codex-data/sdk";
import {
  AlertRecurrence,
  EventDisplayType,
  SwapEventData,
  TokenPairEventType,
} from "@codex-data/sdk/dist/sdk/generated/graphql";
import { Env } from "./env";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getDB, swaps, TokenHolderInsert, tokenHolders, tokens } from "./db";
import { getWebSocketClient, WebSocketClient } from "./websocket-client";
import { eq } from "drizzle-orm";
import { getSOLPrice } from "./mcap";

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
  private wsClient: WebSocketClient;
  private env: Env;

  constructor(env: Env, mint: string) {
    this.sdk = new Codex(env.CODEX_API_KEY);
    this.mint = mint;
    this.db = getDB(env);
    this.wsClient = getWebSocketClient(env);
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
    const creationTime = createdAt
      ? new Date(createdAt * 1000).toISOString()
      : new Date().toISOString();
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

    this.wsClient.to("global").emit("updateToken", updatedToken);

    return { newTokenData, tokenSupply };
  }

  public async updateHolderData(tokenSupply: number) {
    const { holders: codexHolders } = await this.sdk.queries.holders({
      input: {
        tokenId: `${this.mint}:${SOLANA_NETWORK_ID}`,
      },
    });

    const now = new Date().toISOString();

    const allHolders = tokenSupply
      ? codexHolders.items.map(
        (holder): TokenHolderInsert => ({
          id: crypto.randomUUID(),
          mint: this.mint,
          address: holder.address,
          amount: holder.shiftedBalance,
          percentage: (holder.shiftedBalance / tokenSupply) * 100,
          lastUpdated: now,
        }),
      )
      : [];

    allHolders.sort((a, b) => b.percentage - a.percentage);

    const MAXIMUM_HOLDERS_STORED = 50;
    const holders = allHolders.slice(0, MAXIMUM_HOLDERS_STORED);

    if (holders.length > 0) {
      const MAX_SQLITE_PARAMETERS = 100;
      const parametersPerHolder = Object.keys(holders[0]).length;
      const batchSize = Math.floor(MAX_SQLITE_PARAMETERS / parametersPerHolder);

      for (let i = 0; i < holders.length; i += batchSize) {
        const batch = holders.slice(i, i + batchSize);
        await this.db
          .insert(tokenHolders)
          .values(batch)
          .onConflictDoUpdate({
            target: [tokenHolders.address],
            set: {
              amount: batch[0].amount,
              percentage: batch[0].percentage,
              lastUpdated: now,
            },
          });
      }
    }

    await this.wsClient.to(`token-${this.mint}`).emit("newHolder", holders);

    return holders;
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
    const solPrice = await getSOLPrice(this.env);

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

    if (processedSwaps.length > 0) {
      await this.insertProcessedSwaps(processedSwaps);
      await this.wsClient
        .to(`token-${this.mint}`)
        .emit("newSwap", processedSwaps);
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
        await this.wsClient
          .to(`token-${this.mint}`)
          .emit("newSwap", processedSwaps);
      }

      // Update the cursor for the next batch
      cursor = currentCursor;
    }

    console.log(`Historical update complete for ${this.mint}`);
  }

  // save the processed swaps to the database
  private async insertProcessedSwaps(
    processedSwaps: ProcessedSwap[],
  ): Promise<void> {
    if (processedSwaps.length === 0) return;

    const MAX_SQLITE_PARAMETERS = 100;
    const parametersPerSwap = Object.keys(processedSwaps[0]).length;
    const batchSize =
      Math.floor(MAX_SQLITE_PARAMETERS / parametersPerSwap) ||
      processedSwaps.length;

    // Sort swaps by ascending timestamp
    processedSwaps.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    console.log(
      `Inserting ${processedSwaps.length} swaps in batches of ${batchSize} for ${this.mint}`,
    );

    let insertedCount = 0;
    for (let i = 0; i < processedSwaps.length; i += batchSize) {
      const batch = processedSwaps.slice(i, i + batchSize);
      const result = await this.db
        .insert(swaps)
        .values(batch)
        .onConflictDoNothing()
        .returning({ insertedId: swaps.id });
      insertedCount += result.length;
    }
    console.log(
      `Actually inserted ${insertedCount} new swaps for ${this.mint}`,
    );
  }
}
