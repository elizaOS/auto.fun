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
                // callbackUrl: `${this.env.VITE_API_URL}/api/codex-webhook`,
                callbackUrl: `https://out-charitable-remain-declined.trycloudflare.com/api/codex-webhook`,
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
      this.updateSwapData(true),
      this.updateHolderData(marketData.tokenSupply),
    ]);

    return { marketData, swapData, holderData };
  }

  public async updateMarketData() {
    const { filterTokens } = await this.sdk.queries.filterTokens({
      tokens: [`${this.mint}:${SOLANA_NETWORK_ID}`],
    });

    const token = filterTokens?.results?.[0];
    if (!token) {
      throw new Error("failed to find token with codex");
    }

    const tokenSupply = token.token?.info?.circulatingSupply
      ? Number(token.token?.info?.circulatingSupply)
      : 0;

    const newTokenData = {
      marketCapUSD: token.marketCap ? Number(token.marketCap) : 0,
      volume24h: token.volume24 ? Number(token.volume24) : 0,
      liquidity: token.liquidity ? Number(token.liquidity) : 0,
      tokenPriceUSD: token.priceUSD ? Number(token.priceUSD) : 0,
      holderCount: token.holders,
      // time of import
      createdAt: new Date().toISOString(),

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
        await this.db.insert(tokenHolders).values(batch);
      }
    }

    await this.wsClient.to(`token-${this.mint}`).emit("newHolder", holders);

    return holders;
  }

  public async updateSwapData(fetchHistorical: boolean = false) {
    const allProcessedSwaps: ProcessedSwap[] = [];
    let hasMore = true;
    let cursor: string | undefined | null = undefined; // Use cursor based on linter feedback

    console.log(
      `Starting swap update for ${this.mint}. Historical fetch: ${fetchHistorical}`,
    );

    while (hasMore) {
      const { getTokenEvents } = await this.sdk.queries.getTokenEvents({
        query: {
          address: this.mint,
          networkId: SOLANA_NETWORK_ID,
          eventDisplayType: [EventDisplayType.Buy, EventDisplayType.Sell],
        },
        limit: 200, // Adjust limit as needed/allowed
        // --- Potential Pagination Parameter ---
        // Adjust this based on actual Codex SDK parameter name
        // Use cursor for pagination
        ...(cursor ? { cursor: cursor } : {}),
      });

      const codexSwaps = getTokenEvents?.items ?? [];
      // --- Check for more data ---
      // Adjust this based on actual Codex SDK response structure
      // Use cursor from the response
      const currentCursor = getTokenEvents?.cursor;
      hasMore = fetchHistorical && !!currentCursor && codexSwaps.length > 0;
      cursor = currentCursor;

      console.log(
        `Fetched ${codexSwaps.length} swaps for ${this.mint}. Has more: ${hasMore}, Next cursor: ${cursor}`,
      );

      if (codexSwaps.length === 0) {
        // No swaps in this batch, stop if historical, or break if just recent fetch
        if (!fetchHistorical) hasMore = false; // Stop if only fetching recent and got 0
        break;
      }

      const processedSwaps = codexSwaps
        .filter(
          (codexSwap): codexSwap is NonNullable<typeof codexSwap> =>
            !!codexSwap,
        )
        .map((codexSwap): ProcessedSwap | null => {
          // Add explicit return type
          const swapData = codexSwap.data as SwapEventData;

          // Common data
          // Use ProcessedSwap type for structure
          const commonData = {
            id: crypto.randomUUID(), // Add unique ID
            tokenMint: this.mint, // Use tokenMint to match schema
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

      allProcessedSwaps.push(...processedSwaps);

      // If not fetching historical data, stop after the first batch
      if (!fetchHistorical) {
        hasMore = false;
      }
    } // End while(hasMore)

    console.log(
      `Finished fetching swaps for ${this.mint}. Total fetched: ${allProcessedSwaps.length}`,
    );

    // --- Start Added Logic ---
    if (allProcessedSwaps.length > 0) {
      const MAX_SQLITE_PARAMETERS = 100;
      // Ensure we reference a swap if available to get keys, otherwise use default
      const parametersPerSwap = allProcessedSwaps[0]
        ? Object.keys(allProcessedSwaps[0]).length
        : 10;
      const batchSize = Math.floor(MAX_SQLITE_PARAMETERS / parametersPerSwap);

      // Sort swaps by timestamp ascending before inserting
      allProcessedSwaps.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      console.log(
        `Inserting ${allProcessedSwaps.length} swaps for ${this.mint} in batches of ${batchSize}`,
      );
      let insertedCount = 0;
      for (let i = 0; i < allProcessedSwaps.length; i += batchSize) {
        const batch = allProcessedSwaps.slice(i, i + batchSize);
        // Use ON CONFLICT DO NOTHING to avoid inserting duplicate txIds
        const result = await this.db
          .insert(swaps)
          .values(batch)
          .onConflictDoNothing()
          .returning({ insertedId: swaps.id });
        insertedCount += result.length; // Count how many were actually inserted (not ignored by ON CONFLICT)
      }

      console.log(
        `Actually inserted ${insertedCount} new swaps for ${this.mint}`,
      );

      // Emit only newly inserted swaps if possible, otherwise all fetched for this update cycle
      // For simplicity now, emitting all fetched ones from this potentially historical update.
      // A more refined approach might query the DB for swaps inserted in this run.
      if (allProcessedSwaps.length > 0) {
        await this.wsClient
          .to(`token-${this.mint}`)
          .emit("newSwap", allProcessedSwaps);
      }
    }
    // --- End Added Logic ---

    return allProcessedSwaps; // Return all processed swaps from this run
  }
}
