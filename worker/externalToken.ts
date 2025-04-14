import { Codex } from "@codex-data/sdk";
import {
  AlertRecurrence,
  EventDisplayType,
  SwapEventData,
  TokenPairEventType,
} from "@codex-data/sdk/dist/sdk/generated/graphql";
import { Env } from "./env";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getDB, TokenHolderInsert, tokenHolders, tokens } from "./db";
import { getWebSocketClient, WebSocketClient } from "./websocket-client";
import { eq } from "drizzle-orm";

const SOLANA_NETWORK_ID = 1399811149;

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
                    oneOf: [TokenPairEventType.Buy, TokenPairEventType.Sell]
                  }
                },
                name: this.mint,
                securityToken,
                deduplicate: true
              },
            ],
          },
        },
      });

      // Fetch and store initial data
      const updatedData = await this.updateAllData();
      return updatedData
    } catch (error) {
      console.error(`Failed to register token ${this.mint}:`, error);
      throw error;
    }
  }

  public async updateAllData() {
    const marketData = await this.updateMarketData();

    const [swapData, holderData] = await Promise.all([
      this.updateSwapData(),
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
      ? codexHolders.items.map((holder): TokenHolderInsert => ({
          id: crypto.randomUUID(),
          mint: this.mint,
          address: holder.address,
          amount: holder.shiftedBalance,
          percentage: (holder.shiftedBalance / tokenSupply) * 100,
          lastUpdated: now,
        }))
      : [];

    allHolders.sort((a, b) => b.percentage - a.percentage)
    
    const MAXIMUM_HOLDERS_STORED = 50
    const holders = allHolders.slice(0, MAXIMUM_HOLDERS_STORED);

    if (holders.length > 0) {
      const MAX_SQLITE_PARAMETERS = 100;
      const parametersPerHolder = Object.keys(holders[0]).length
      const batchSize = Math.floor(MAX_SQLITE_PARAMETERS / parametersPerHolder)

      for (let i = 0; i < holders.length; i += batchSize) {
        const batch = holders.slice(i, i + batchSize);
        await this.db.insert(tokenHolders).values(batch);
      }
    }

    await this.wsClient.to(`token-${this.mint}`).emit('newHolder', holders);

    return holders;
  }

  public async updateSwapData() {
    const { getTokenEvents } = await this.sdk.queries.getTokenEvents({
      query: {
        address: this.mint,
        networkId: SOLANA_NETWORK_ID,
        eventDisplayType: [EventDisplayType.Buy, EventDisplayType.Sell],
      },
      limit: 200,
    });

    const codexSwaps = getTokenEvents?.items ?? [];

    const swaps = codexSwaps
      .filter(
        (codexSwap): codexSwap is NonNullable<typeof codexSwap> => !!codexSwap,
      )
      .map((codexSwap) => {
        const swapData = codexSwap.data as SwapEventData;

        switch (codexSwap.eventDisplayType) {
          case EventDisplayType.Buy:
            return {
              txId: codexSwap.transactionHash,
              timestamp: codexSwap.timestamp,
              user: codexSwap.maker,
              direction: 0,
              amountIn: -Number(swapData.amount1 || 0) * LAMPORTS_PER_SOL,
              // our program uses 6 decimals for token amounts, so we multiply by 1e6 for consistency in our database even though these tokens
              // might not use 6 decimals
              amountOut: Number(swapData.amount0 || 0) * 1e6,
            };
          case EventDisplayType.Sell:
            return {
              txId: codexSwap.transactionHash,
              timestamp: codexSwap.timestamp,
              user: codexSwap.maker,
              direction: 1,
              amountIn: -Number(swapData.amount0 || 0) * 1e6,
              amountOut: Number(swapData.amount1 || 0) * LAMPORTS_PER_SOL,
            };
        }
      });

    return swaps;
  }
}
