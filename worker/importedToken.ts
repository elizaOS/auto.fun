import { Codex } from "@codex-data/sdk";
import {
  AlertRecurrence,
  EventDisplayType,
  SwapEventData,
} from "@codex-data/sdk/dist/sdk/generated/graphql";
import { Env } from "./env";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getDB, tokens, swaps, tokenHolders } from "./db";
import { getWebSocketClient, WebSocketClient } from "./websocket-client";
import { eq, and } from "drizzle-orm";

const SOLANA_NETWORK_ID = 1399811149;

export class ImportedToken {
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

  public async register(): Promise<void> {
    const securityToken = process.env.CODEX_WEBHOOK_AUTH_TOKEN;
    if (!securityToken) {
      throw new Error("missing CODEX_WEBHOOK_AUTH_TOKEN env var");
    }

    try {
      await this.sdk.mutations.createWebhooks({
        input: {
          priceWebhooksInput: {
            webhooks: [
              {
                alertRecurrence: AlertRecurrence.Indefinite,
                callbackUrl: `${this.env.VITE_API_URL}/api/codex-webhook`,
                conditions: {
                  tokenAddress: {
                    eq: this.mint,
                  },
                  networkId: {
                    eq: SOLANA_NETWORK_ID,
                  },
                  priceUsd: {
                    gte: "0",
                  },
                },
                name: this.mint,
                securityToken,
              },
            ],
          },
        },
      });

      // Fetch and store initial data
      await this.updateAllData();
    } catch (error) {
      console.error(`Failed to register token ${this.mint}:`, error);
      throw error;
    }
  }

  public async updateAllData({
    firstRun = false,
  }: { firstRun?: boolean } = {}): Promise<{
    marketData: any;
    swapData: any;
    holderData: any;
  }> {
    console.log("Updating all data for token:", this.mint);
    const marketData = await this.updateMarketData();

    const [swapData, holderData] = await Promise.all([
      this.updateSwapData(firstRun),
      this.updateHolderData(marketData.tokenSupply, firstRun),
    ]);

    return { marketData, swapData, holderData };
  }

  public async updateMarketData() {
    console.log("Updating market data for token:", this.mint);
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
      tokenSupplyUiAmount: tokenSupply,
      decimals: token.token?.decimals ?? 9,
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

  public async updateHolderData(tokenSupply: number, firstRun: boolean) {
    const { holders: codexHolders } = await this.sdk.queries.holders({
      input: {
        tokenId: `${this.mint}:${SOLANA_NETWORK_ID}`,
      },
    });

    const holders = tokenSupply
      ? codexHolders.items.map((holder) => ({
        account: holder.address,
        amount: holder.shiftedBalance,
        percentage: (holder.shiftedBalance / tokenSupply) * 100,
        lastUpdated: new Date().toISOString(),
      }))
      : [];
    if (firstRun) {
      for (const h of holders) {
        if (!h.account || !h.amount || !h.percentage) continue;
        const holderData = {
          id: crypto.randomUUID(),
          mint: this.mint,
          address: h.account,
          amount: h.amount,
          percentage: h.percentage,
          lastUpdated: h.lastUpdated,
        };
        await this.db
          .insert(tokenHolders)
          .values(holderData)
          .onConflictDoNothing();
      }
    }
    return holders;

  }

  public async updateSwapData(firstRun: boolean) {
    const { getTokenEvents } = await this.sdk.queries.getTokenEvents({
      query: {
        address: this.mint,
        networkId: SOLANA_NETWORK_ID,
        eventDisplayType: [EventDisplayType.Buy, EventDisplayType.Sell],
      },
      limit: 200,
    });

    const codexSwaps = getTokenEvents?.items ?? [];

    const tokenSwaps = codexSwaps
      .filter(
        (codexSwap): codexSwap is NonNullable<typeof codexSwap> => !!codexSwap
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
              price: swapData.priceUsd,
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
              price: swapData.priceUsd,
            };
        }
      });
    if (firstRun) {
      for (const swap of tokenSwaps) {
        if (!swap || !swap.user || !swap.price) continue;

        const swapRecord = {
          id: crypto.randomUUID(),
          tokenMint: this.mint, // required field
          user: swap.user,
          type: swap.direction === 0 ? "buy" : "sell",
          direction: swap.direction,
          amountIn: swap.amountIn,
          amountOut: swap.amountOut,
          price: Number(swap.price), // required field; supply a real numeric value
          txId: swap.txId,
          timestamp: new Date(swap.timestamp).toISOString(),
        };
        await this.db.insert(swaps).values(swapRecord).onConflictDoNothing();
      }
    }


    return swaps;
  }
}
