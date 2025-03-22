import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { getMint } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  CodexBarResolution,
  fetchCodexBars,
  fetchCodexTokenEvents,
} from "./codex";
import { SEED_BONDING_CURVE } from "./constant";
import { fees, getDB, swaps, Token, tokens } from "./db";
import { Env } from "./env";
import { logger } from "./logger";
import { getSOLPrice } from "./mcap";
import { createMigrationService } from "./migration";
import { initSolanaConfig } from "./solana";
import {
  createNewTokenData,
  getTxIdAndCreatorFromTokenAddress,
  updateHoldersCache,
} from "./util";
import { getWebSocketClient } from "./websocket-client";

// Define interface for the API response types
interface DexScreenerPair {
  pairAddress: string;
  priceUsd: string;
  liquidity?: {
    usd: string;
  };
}

interface DexScreenerResponse {
  pairs?: DexScreenerPair[];
}

interface PriceCandle {
  time: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

interface ChartResponse {
  priceCandles?: PriceCandle[];
}

// For devnet testing - placeholder token address for locked tokens since there are none in devnet
export const DEV_TEST_TOKEN_ADDRESS =
  "ANNTWQsQ9J3PeM6dXLjdzwYcSzr51RREWQnjuuCEpump";

// Constants
const MAX_CONCURRENT_UPDATES = 3; // Maximum concurrent holder updates

// const VALID_PROGRAM_ID = new Set(
//   [
//     CREATE_CPMM_POOL_PROGRAM.toBase58(),
//     DEV_CREATE_CPMM_POOL_PROGRAM.toBase58()
//   ])
// const isValidCpmm = (id: string) => VALID_PROGRAM_ID.has(id)

// Default values for when env is not available
export const DEFAULT_TOKEN_SUPPLY = "1000000000000";
export const DEFAULT_DECIMALS = 6;
export const DEFAULT_VIRTUAL_RESERVES = "100000000";
export const DEFAULT_CURVE_LIMIT = "1000000000";

export interface PriceFeedInfo {
  price: number;
  timestamp: Date;
  volume: number;
}

export type CandlePrice = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
};

export class TokenMonitor {
  private wallet: NodeWallet;
  private isMonitoring: boolean = false;
  private holderUpdateInterval: any;
  private env: Env;
  private solanaConfig: any;

  constructor(env: Env, wallet: NodeWallet) {
    this.env = env;
    this.wallet = wallet;
    // Initialize Solana config with the environment
    this.solanaConfig = initSolanaConfig(env);
  }

  private async startHolderUpdates() {
    // Clear any existing interval to avoid duplicates
    if (this.holderUpdateInterval) {
      clearInterval(this.holderUpdateInterval);
    }

    this.holderUpdateInterval = setInterval(
      async () => {
        try {
          const db = getDB(this.env);
          const fiveMinutesAgo = new Date(
            Date.now() - 5 * 60 * 1000,
          ).toISOString();

          // Get all active and migrated tokens
          const activeTokens = await db
            .select({ mint: tokens.mint })
            .from(tokens)
            .where(
              and(
                inArray(tokens.status, ["active", "migrated", "locked"]),
                sql`${tokens.lastUpdated} < ${fiveMinutesAgo}`, // Use SQL template literal for date comparison
              ),
            );

          // Process tokens in small batches to avoid overloading the worker
          for (
            let i = 0;
            i < activeTokens.length;
            i += MAX_CONCURRENT_UPDATES
          ) {
            const tokenBatch = activeTokens.slice(
              i,
              i + MAX_CONCURRENT_UPDATES,
            );

            // Update holders for this batch concurrently
            await Promise.all(
              tokenBatch.map(async (token: { mint: string }) => {
                if (!token.mint) {
                  logger.error("Token mint is not set:", { token });
                  return;
                }

                try {
                  await updateHoldersCache(this.env, token.mint);
                } catch (error) {
                  logger.error(
                    `Failed to update holders for ${token.mint}:`,
                    error,
                  );
                }
              }),
            );

            // Sleep briefly between batches
            if (i + MAX_CONCURRENT_UPDATES < activeTokens.length) {
              await new Promise((resolve) => setTimeout(resolve, 500));
            }
          }
        } catch (error) {
          logger.error("Error in holder update interval:", error);
        }
      },
      5 * 60 * 1000,
    ); // Run every 5 minutes
  }

  async startMonitoring() {
    if (this.isMonitoring) return;
    this.isMonitoring = true;

    this.startHolderUpdates();

    // Subscribe to program logs using config with environment
    this.solanaConfig.connection.onLogs(
      this.solanaConfig.programId,
      async (logs: { err: any; logs: any[]; signature: string }) => {
        if (logs.err) return;

        // Look for swap logs
        const mintLog = logs.logs.find((log) => log.includes("Mint:"));
        const swapLog = logs.logs.find((log) => log.includes("Swap:"));
        const reservesLog = logs.logs.find((log) => log.includes("Reserves:"));
        const feeLog = logs.logs.find((log) => log.includes("fee:"));
        const swapeventLog = logs.logs.find((log) =>
          log.includes("SwapEvent:"),
        );
        const newTokenLog = logs.logs.find((log) => log.includes("NewToken:"));

        const completeEventLog = logs.logs.find((log) =>
          log.includes("curve is completed"),
        );

        if (completeEventLog) {
          try {
            if (!mintLog) {
              logger.error("Missing mint log:", { logs });
              return;
            }

            const mintAddress = mintLog
              .split("Mint:")[1]
              .trim()
              .replace(/[",)]/g, "");
            const [bondingCurvePda] = PublicKey.findProgramAddressSync(
              [
                Buffer.from(SEED_BONDING_CURVE),
                new PublicKey(mintAddress).toBytes(),
              ],
              this.solanaConfig.programId,
            );

            // Process directly instead of using a queue
            // Use existing retry logic for reliability
            const maxRetries = 15;
            for (let i = 0; i < maxRetries; i++) {
              try {
                // Get account info directly using connection instead of Anchor program
                const bondingCurveAccountInfo =
                  await this.solanaConfig.connection.getAccountInfo(
                    bondingCurvePda,
                  );

                // Simple parsing of account data
                if (bondingCurveAccountInfo && bondingCurveAccountInfo.data) {
                  const dataView = new DataView(
                    bondingCurveAccountInfo.data.buffer,
                  );
                  // The isCompleted flag is typically a boolean, which is 1 byte in Borsh serialization
                  // Adjust the offset based on your actual account layout
                  const isCompleted = dataView.getUint8(24) === 1;

                  if (!isCompleted) {
                    if (i === maxRetries - 1) {
                      logger.error(
                        "Failed to confirm curve completion after max retries",
                      );
                      return;
                    }
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                    continue;
                  }

                  const db = getDB(this.env);
                  const [token] = await db
                    .select()
                    .from(tokens)
                    .where(eq(tokens.mint, mintAddress))
                    .limit(1);

                  if (token) {
                    logger.log(
                      "Bonding Curve CompleteEvent confirmed for token:",
                      token.mint,
                    );

                    const [existingToken] = await db
                      .select()
                      .from(tokens)
                      .where(eq(tokens.mint, mintAddress))
                      .limit(1);

                    // Safely check status with null check
                    if (
                      existingToken &&
                      existingToken.status &&
                      ["migrating", "withdrawn", "migrated", "locked"].includes(
                        existingToken.status,
                      )
                    ) {
                      logger.log(
                        `Token ${mintAddress} is already in process: ${existingToken.status}`,
                      );
                      return;
                    }

                    // Only update to migrating if we pass the status check
                    await db
                      .update(tokens)
                      .set({
                        status: "migrating",
                        lastUpdated: new Date().toISOString(),
                      })
                      .where(eq(tokens.mint, mintAddress));

                    await this.handleMigration(token);
                  }
                } else {
                  if (i === maxRetries - 1) {
                    logger.error(
                      "Failed to fetch bonding curve account after max retries",
                    );
                    return;
                  }
                  await new Promise((resolve) => setTimeout(resolve, 2000));
                  continue;
                }
                break;
              } catch (error) {
                if (i === maxRetries - 1) {
                  logger.error(
                    "Error processing complete event after retries:",
                    error,
                  );
                }
              }
            }
          } catch (error) {
            logger.error("Error processing complete event:", error);
          }
        }

        if (newTokenLog) {
          const [tokenAddress, creatorAddress] = newTokenLog
            .split(" ")
            .slice(-2)
            .map((s: string) => s.replace(/[",)]/g, ""));

          const db = getDB(this.env);
          const newToken = await createNewTokenData(
            logs.signature,
            tokenAddress,
            creatorAddress,
            this.env,
          );
          await db
            .insert(tokens)
            .values({
              id: crypto.randomUUID(),
              name: newToken.name || "",
              ticker: newToken.ticker || "",
              url: newToken.url || "",
              image: newToken.image || "",
              mint: newToken.mint || "",
              creator: newToken.creator || "",
              status: "pending",
              createdAt: new Date().toISOString(),
              lastUpdated: new Date().toISOString(),
              txId: logs.signature,
            })
            .onConflictDoUpdate({
              target: tokens.mint,
              set: {
                ...newToken,
                createdAt: new Date().toISOString(),
                lastUpdated: new Date().toISOString(),
              },
            });

          logger.log(`New token event processed for ${tokenAddress}`);
        }

        if (logs.err || !logs.logs.some((log) => log.includes("success"))) {
          return;
        }

        if (mintLog || swapLog || reservesLog || feeLog) {
          if (!mintLog || !swapLog || !reservesLog || !feeLog) {
            logger.error("Missing required logs:", {
              mintLog,
              swapLog,
              reservesLog,
              feeLog,
            });
            return;
          }

          try {
            const db = getDB(this.env);
            // Parse logs
            const mintAddress = mintLog
              .split("Mint:")[1]
              .trim()
              .replace(/[",)]/g, "");
            const [user, direction, amount] = swapLog
              .split(" ")
              .slice(-3)
              .map((s: string) => s.replace(/[",)]/g, ""));
            const [reserveToken, reserveLamport] = reservesLog
              .split(" ")
              .slice(-2)
              .map((s: string) => s.replace(/[",)]/g, ""));
            const feeAmount = feeLog
              .split("fee:")[1]
              .trim()
              .replace(/[",)]/g, "");
            if (!swapeventLog) {
              logger.error("Missing swap event log:", {
                swapLog,
                reservesLog,
                feeLog,
              });
              return;
            }
            const [, , amountOut] = swapeventLog
              .split(" ")
              .slice(-3)
              .map((s: string) => s.replace(/[",)]/g, ""));

            // Fetch token data to get decimals
            const tokenMint = new PublicKey(mintAddress);
            const tokenData = await getMint(
              this.solanaConfig.connection,
              tokenMint,
            );

            const SOL_DECIMALS = 9;
            const TOKEN_DECIMALS = tokenData.decimals; // get the token decimals from token data

            if (logs.signature && logs.signature.match(/^1{64}$/)) {
              logger.log("Invalid signature:", logs.signature);
              return;
            }

            // Create swap record
            const swapId = crypto.randomUUID();
            const swapData = {
              id: swapId,
              tokenMint: mintAddress,
              user: user,
              direction: parseInt(direction),
              type: direction === "1" ? "sell" : "buy",
              amountIn: Number(amount),
              amountOut: Number(amountOut),
              price:
                direction === "1"
                  ? Number(amountOut) /
                    Math.pow(10, SOL_DECIMALS) /
                    (Number(amount) / Math.pow(10, TOKEN_DECIMALS)) // Sell price (SOL/token)
                  : Number(amount) /
                    Math.pow(10, SOL_DECIMALS) /
                    (Number(amountOut) / Math.pow(10, TOKEN_DECIMALS)), // Buy price (SOL/token)
              txId: logs.signature,
              timestamp: new Date().toISOString(),
            };

            await db.insert(swaps).values(swapData).onConflictDoUpdate({
              target: swaps.txId,
              set: swapData,
            });

            const solPrice = await getSOLPrice();

            const currentPrice =
              Number(reserveLamport) /
              1e9 /
              (Number(reserveToken) / Math.pow(10, TOKEN_DECIMALS));

            const tokenPriceInSol = currentPrice / Math.pow(10, TOKEN_DECIMALS);
            const tokenPriceUSD =
              currentPrice > 0
                ? tokenPriceInSol * solPrice * Math.pow(10, TOKEN_DECIMALS)
                : 0;

            // Get TOKEN_SUPPLY from env if available, otherwise use default
            const tokenSupply =
              this.env && this.env.TOKEN_SUPPLY
                ? Number(this.env.TOKEN_SUPPLY)
                : Number(DEFAULT_TOKEN_SUPPLY);

            const marketCapUSD =
              (tokenSupply / Math.pow(10, TOKEN_DECIMALS)) * tokenPriceUSD;

            logger.log("reserveLamport", Number(reserveLamport));
            logger.log("reserveToken", Number(reserveToken));
            logger.log("currentPrice", currentPrice);
            logger.log("tokenPriceUSD", tokenPriceUSD);
            logger.log("marketCapUSD", marketCapUSD);

            // Get existing token data
            const [existingToken] = await db
              .select()
              .from(tokens)
              .where(eq(tokens.mint, mintAddress))
              .limit(1);

            let baseToken: Partial<Token> = {};
            if (!existingToken?.name) {
              const { creatorAddress, tokenCreationTxId } =
                await getTxIdAndCreatorFromTokenAddress(mintAddress);
              // Create new token data without volume24h since it will be incremented separately
              const token = await createNewTokenData(
                tokenCreationTxId,
                mintAddress,
                creatorAddress,
              );
              const { volume24h, ...tokenWithoutVolume } = token;
              baseToken = tokenWithoutVolume;
            }

            const priceChange = existingToken?.price24hAgo
              ? ((tokenPriceUSD - existingToken.price24hAgo) /
                  existingToken.price24hAgo) *
                100
              : 0;

            // Get the virtual reserves value from env or use default
            const virtualReserves =
              this.env && this.env.VIRTUAL_RESERVES
                ? Number(this.env.VIRTUAL_RESERVES)
                : Number(DEFAULT_VIRTUAL_RESERVES);

            // Get the curve limit value from env or use default
            const curveLimit =
              this.env && this.env.CURVE_LIMIT
                ? Number(this.env.CURVE_LIMIT)
                : Number(DEFAULT_CURVE_LIMIT);

            // Build token update
            const tokenUpdate = {
              ...baseToken,
              reserveAmount: Number(reserveToken),
              reserveLamport: Number(reserveLamport),
              currentPrice:
                Number(reserveLamport) /
                1e9 /
                (Number(reserveToken) / Math.pow(10, TOKEN_DECIMALS)),
              liquidity:
                (Number(reserveLamport) / 1e9) * solPrice +
                (Number(reserveToken) / Math.pow(10, TOKEN_DECIMALS)) *
                  tokenPriceUSD,
              marketCapUSD: marketCapUSD,
              tokenPriceUSD: tokenPriceUSD,
              solPriceUSD: solPrice,
              curveProgress:
                ((Number(reserveLamport) - virtualReserves) /
                  (curveLimit - virtualReserves)) *
                100,
              lastUpdated: new Date().toISOString(),
              priceChange24h: priceChange,
            };

            // Calculate volume24h increment
            const volumeIncrement =
              direction === "1"
                ? (Number(amount) / Math.pow(10, TOKEN_DECIMALS)) *
                  tokenPriceUSD
                : (Number(amountOut) / Math.pow(10, TOKEN_DECIMALS)) *
                  tokenPriceUSD;

            // Check if we need to update price24hAgo
            const ONE_HOUR = 60 * 60 * 1000;
            const shouldUpdatePrice =
              !existingToken?.price24hAgo ||
              (existingToken?.lastPriceUpdate &&
                Date.now() - new Date(existingToken.lastPriceUpdate).getTime() >
                  ONE_HOUR);

            if (shouldUpdatePrice) {
              tokenUpdate.price24hAgo = tokenPriceUSD;
              tokenUpdate.lastPriceUpdate = new Date().toISOString();
            }

            // Check if we need to reset volume24h
            const ONE_DAY = 24 * 60 * 60 * 1000;
            const shouldResetVolume =
              existingToken?.lastVolumeReset &&
              Date.now() - new Date(existingToken.lastVolumeReset).getTime() >
                ONE_DAY;

            if (shouldResetVolume) {
              tokenUpdate.volume24h = volumeIncrement;
              tokenUpdate.lastVolumeReset = new Date().toISOString();
            } else {
              // Increment volume24h
              tokenUpdate.volume24h =
                (existingToken?.volume24h || 0) + volumeIncrement;
            }

            // Update token in database
            await db
              .update(tokens)
              .set({
                ...tokenUpdate,
                lastUpdated: new Date().toISOString(),
                // Convert any Date objects in tokenUpdate to strings
                ...(tokenUpdate.lastPriceUpdate
                  ? { lastPriceUpdate: tokenUpdate.lastPriceUpdate }
                  : {}),
                ...(tokenUpdate.lastVolumeReset
                  ? { lastVolumeReset: tokenUpdate.lastVolumeReset }
                  : {}),
              })
              .where(eq(tokens.mint, mintAddress));

            // Create fee record
            const feeId = crypto.randomUUID();
            await db
              .insert(fees)
              .values({
                id: feeId,
                tokenMint: mintAddress,
                user: user,
                direction: parseInt(direction),
                type: "swap",
                tokenAmount: "0",
                solAmount: feeAmount,
                feeAmount: feeAmount,
                txId: logs.signature,
                timestamp: new Date().toISOString(),
              })
              .onConflictDoUpdate({
                target: fees.txId,
                set: {
                  tokenMint: mintAddress,
                  user: user,
                  direction: parseInt(direction),
                  type: "swap",
                  tokenAmount: "0",
                  solAmount: feeAmount,
                  feeAmount: feeAmount,
                  timestamp: new Date().toISOString(),
                },
              });

            // Update holders cache after a swap - direct call instead of using a queue
            try {
              await updateHoldersCache(this.env, mintAddress);
            } catch (error) {
              logger.error(
                `Failed to update holders after swap for ${mintAddress}:`,
                error,
              );
            }

            // Get the updated token for WebSocket emission
            const [updatedToken] = await db
              .select()
              .from(tokens)
              .where(eq(tokens.mint, mintAddress))
              .limit(1);

            // Emit events via WebSocket
            const ws = getWebSocketClient(this.env);

            // Emit the new swap data
            ws.to(`token-${mintAddress}`).emit("newSwap", {
              tokenMint: swapData.tokenMint,
              user: swapData.user,
              price: swapData.price,
              type: swapData.type,
              amountIn: swapData.amountIn,
              amountOut: swapData.amountOut,
              timestamp: swapData.timestamp,
              direction: swapData.direction,
              txId: swapData.txId,
            });

            // Get properly formatted candle data
            const latestCandle = await getLatestCandle(
              this.env,
              mintAddress,
              swapData,
            );

            // Emit the new candle data
            ws.to(`token-${mintAddress}`).emit("newCandle", latestCandle);

            // Emit the new token data
            ws.to(`token-${mintAddress}`).emit("updateToken", updatedToken);

            logger.log(`Recorded swap and fee: ${logs.signature}`);
          } catch (error) {
            logger.error("Error processing swap logs:", error);
          }
        }
      },
      "confirmed",
    );
  }

  private async handleMigration(token: Token) {
    // Use the adapter to create a compatible MigrationService
    const migrationService = createMigrationService(
      this.solanaConfig.connection,
      this.solanaConfig.programId,
      this.wallet,
      this.env,
    );
    await migrationService.migrateToken(token);
  }
}

export async function getLatestCandle(env: Env, tokenMint: string, swap: any) {
  // Get a time range that covers just this swap
  const swapTime = swap.timestamp.getTime() / 1000;
  const candlePeriod = 60; // 1 min default
  const candleStart = Math.floor(swapTime / candlePeriod) * candlePeriod;

  // Check if token is locked (should use Codex API)
  const db = getDB(env);
  const [tokenInfo] = await db
    .select()
    .from(tokens)
    .where(eq(tokens.mint, tokenMint))
    .limit(1);

  if (tokenInfo?.status === "locked") {
    try {
      // Use the test token address only in devnet since there are no locked pools in dev
      const tokenAddress =
        env.NETWORK === "devnet" ? DEV_TEST_TOKEN_ADDRESS : tokenMint;
      const candles = await fetchCodexBars(
        tokenAddress,
        candleStart,
        candleStart + candlePeriod,
        "1", // 1 minute candles
      );

      if (candles.length > 0) {
        return candles[0];
      }
    } catch (error) {
      logger.error("Error fetching latest candle from Codex:", error);
      // Fall through to default method
    }
  }

  // Fallback: Fetch all swaps in this candle period to properly calculate OHLCV
  const latestCandle = await fetchPriceChartData(
    env,
    candleStart * 1000, // start (ms)
    (candleStart + candlePeriod) * 1000, // end (ms)
    1, // 1 min range
    tokenMint,
  );

  return latestCandle && latestCandle.length > 0 ? latestCandle[0] : null; // Return the single candle
}

export async function fetchPriceChartData(
  env: Env,
  start: number,
  end: number,
  range: number,
  tokenMint: string,
) {
  const db = getDB(env);
  const [tokenInfo] = await db
    .select()
    .from(tokens)
    .where(eq(tokens.mint, tokenMint))
    .limit(1);

  if (!tokenInfo) {
    logger.error(`Token ${tokenMint} not found`);
    return [];
  }

  if (tokenInfo.status !== "locked") {
    // Load price histories from DB
    const swapRecords = await db
      .select({
        price: swaps.price,
        amountIn: swaps.amountIn,
        amountOut: swaps.amountOut,
        direction: swaps.direction,
        timestamp: swaps.timestamp,
      })
      .from(swaps)
      .where(
        and(
          eq(swaps.tokenMint, tokenMint),
          sql`${swaps.timestamp} >= ${new Date(start).toISOString()}`,
          sql`${swaps.timestamp} <= ${new Date(end).toISOString()}`,
        ),
      )
      .orderBy(swaps.timestamp);

    // Convert to PriceFeedInfo array - ensure timestamp is not null
    const priceFeeds: PriceFeedInfo[] = swapRecords
      .filter(
        (swap: {
          price: number;
          timestamp: number;
          direction: number;
          amountIn: number;
          amountOut: number;
        }) => swap.price != null && swap.timestamp != null,
      ) // Type guard to ensure price and timestamp are not null
      .map(
        (swap: {
          price: number;
          timestamp: number;
          direction: number;
          amountIn: number;
          amountOut: number;
        }) => ({
          price: swap.price,
          timestamp: new Date(swap.timestamp), // Create a new Date object from the string
          // If direction is 0 (buy), amountIn is SOL
          // If direction is 1 (sell), amountOut is SOL
          volume:
            swap.direction === 0
              ? swap.amountIn / 1e9 // Convert from lamports to SOL
              : swap.amountOut / 1e9,
        }),
      );

    if (!priceFeeds.length) return [];

    const cdFeeds = getCandleData(priceFeeds, range);

    return cdFeeds;
  } else if (tokenInfo.status === "locked") {
    try {
      // Use the test token address only in devnet since there are no locked pools in dev
      const tokenAddress =
        env.NETWORK === "devnet" ? DEV_TEST_TOKEN_ADDRESS : tokenMint;

      // Convert range to Codex resolution format
      let resolution: CodexBarResolution = "1";
      switch (range) {
        case 1:
          resolution = "1";
          break;
        case 5:
          resolution = "5";
          break;
        case 15:
          resolution = "15";
          break;
        case 60:
          resolution = "60";
          break;
        case 120:
          resolution = "60";
          break; // Use 60m and group if needed
        default:
          resolution = "1";
      }

      // Use the new getBars API directly
      const candles = await fetchCodexBars(
        tokenAddress,
        Math.floor(start / 1000),
        Math.floor(end / 1000),
        resolution,
      );

      // For 120 minute resolution, we need to combine 2 x 60m candles
      if (range === 120 && candles.length > 1) {
        const combined: any[] = [];
        for (let i = 0; i < candles.length; i += 2) {
          // If we have a pair, combine them
          if (i + 1 < candles.length) {
            const out = {
              open: candles[i].open,
              high: Math.max(candles[i].high, candles[i + 1].high),
              low: Math.min(candles[i].low, candles[i + 1].low),
              close: candles[i + 1].close,
              volume: candles[i].volume + candles[i + 1].volume,
              time: candles[i].time,
              price: candles[i].close,
              timestamp: new Date(candles[i].time * 1000),
            };
            combined.push(out);
          } else {
            // Add the last odd candle if there is one
            const lastCandle = {
              ...candles[i],
              price: candles[i].close,
              timestamp: new Date(candles[i].time * 1000),
            };
            combined.push(lastCandle);
          }
        }
        return combined;
      }

      return candles;
    } catch (error) {
      logger.error("Error fetching data with getBars API:", error);

      // Fallback to the old method if getBars fails
      try {
        logger.log("Falling back to getTokenEvents API");
        // Use the test token address only in devnet
        const tokenAddress =
          env.NETWORK === "devnet" ? DEV_TEST_TOKEN_ADDRESS : tokenMint;

        // Fetch price history from Codex API using our utility function
        const tokenEvents = await fetchCodexTokenEvents(
          tokenAddress,
          Math.floor(start / 1000),
          Math.floor(end / 1000),
          1399811149,
          env,
        );

        // Convert to price feed format - ensure timestamps are never null
        const priceFeeds: PriceFeedInfo[] = tokenEvents
          .filter((item) => item.timestamp != null) // Filter out items with null timestamps
          .map((item) => ({
            price: parseFloat(item.token1PoolValueUsd || "0"),
            timestamp: new Date(item.timestamp * 1000), // Now safe since we filtered
            volume: parseFloat(item.data?.amount0 || "0"),
          }));

        if (!priceFeeds.length) return [];

        const cdFeeds = getCandleData(priceFeeds, range);
        return cdFeeds;
      } catch (fallbackError) {
        logger.error("Fallback method also failed:", fallbackError);
        return [];
      }
    }
  }
}

export function getCandleData(priceFeeds: PriceFeedInfo[], range: number) {
  const priceHistory = priceFeeds
    .map((feed) => ({
      price: feed.price,
      ts: feed.timestamp.getTime() / 1000,
    }))
    .sort((price1, price2) => price1.ts - price2.ts);

  if (!priceHistory.length) return [];

  let candlePeriod = 60; // 1 min default
  switch (range) {
    case 1:
      // default candle period
      break;
    case 5:
      candlePeriod = 300; // 5 mins
      break;
    case 15:
      candlePeriod = 900; // 15 mins
      break;
    case 60:
      candlePeriod = 3_600; // 1 hr
      break;
    case 120:
      candlePeriod = 7_200; // 2 hrs
      break;
  }

  // Convert price feed to candle price data
  const cdStart = Math.floor(priceHistory[0].ts / candlePeriod) * candlePeriod;
  const cdEnd =
    Math.floor(priceHistory[priceHistory.length - 1].ts / candlePeriod) *
    candlePeriod;

  const cdFeeds: CandlePrice[] = [];
  let pIndex = 0;
  for (
    let curCdStart = cdStart;
    curCdStart <= cdEnd;
    curCdStart += candlePeriod
  ) {
    const st = priceHistory[pIndex].price;
    let hi = priceHistory[pIndex].price;
    let lo = priceHistory[pIndex].price;
    let en = priceHistory[pIndex].price;
    let vol = 0;
    const prevIndex = pIndex;
    for (; pIndex < priceHistory.length; ) {
      if (hi < priceHistory[pIndex].price) hi = priceHistory[pIndex].price;
      if (lo > priceHistory[pIndex].price) lo = priceHistory[pIndex].price;
      en = priceHistory[pIndex].price;
      vol += priceFeeds[pIndex].volume;

      // Break new candle data starts
      if (priceHistory[pIndex].ts >= curCdStart + candlePeriod) break;
      pIndex++;
    }
    if (prevIndex !== pIndex)
      cdFeeds.push({
        open: st,
        high: hi,
        low: lo,
        close: en,
        volume: vol,
        time: curCdStart,
      });
  }

  return cdFeeds;
}

/**
 * Fetch price chart data for locked tokens using Codex API
 * @param token The token mint address
 * @param start Start time in milliseconds
 * @param end End time in milliseconds
 * @param range Time range in minutes for each candle
 * @param env Cloudflare worker environment
 * @returns Array of OHLC candle data
 */
export async function fetchLockedTokenChartData(
  token: string,
  start: number,
  end: number,
  range: number,
  _env: Env,
): Promise<any[]> {
  try {
    // Construct Codex API URL for the token chart data
    const codexApiUrl = `https://api.dexscreener.com/latest/dex/tokens/${token}`;

    // Fetch data from Codex API
    const response = await fetch(codexApiUrl);

    if (!response.ok) {
      throw new Error(
        `Codex API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as DexScreenerResponse;

    // Check if we have valid data
    if (!data || !data.pairs || data.pairs.length === 0) {
      logger.error(`No pairs found for token ${token}`);
      return [];
    }

    // Find the most relevant pair (usually the one with highest liquidity)
    // Sort by liquidity in descending order
    const pairs = data.pairs.sort(
      (a, b) =>
        parseFloat(b.liquidity?.usd || "0") -
        parseFloat(a.liquidity?.usd || "0"),
    );

    const mainPair = pairs[0];

    if (!mainPair || !mainPair.priceUsd) {
      logger.error(`No price data found for token ${token}`);
      return [];
    }

    // For Codex API, we need to make a separate call to get the chart data
    const chartApiUrl = `https://api.dexscreener.com/latest/dex/charts/solana/${mainPair.pairAddress}`;
    const chartResponse = await fetch(chartApiUrl);

    if (!chartResponse.ok) {
      throw new Error(
        `Chart API error: ${chartResponse.status} ${chartResponse.statusText}`,
      );
    }

    const chartData = (await chartResponse.json()) as ChartResponse;

    if (
      !chartData ||
      !chartData.priceCandles ||
      chartData.priceCandles.length === 0
    ) {
      logger.error(`No candle data found for pair ${mainPair.pairAddress}`);
      return [];
    }

    // Convert the candles to our expected format
    // Filter by time range
    const candles = chartData.priceCandles
      .filter((candle) => {
        const candleTime = candle.time * 1000; // Convert to ms
        return candleTime >= start && candleTime <= end;
      })
      .map((candle) => ({
        open: parseFloat(candle.open),
        high: parseFloat(candle.high),
        low: parseFloat(candle.low),
        close: parseFloat(candle.close),
        volume: parseFloat(candle.volume),
        time: candle.time,
      }));

    // Handle the case where we have different time intervals
    // Group candles based on the requested range
    if (range > 0) {
      return groupCandlesByRange(candles, range);
    }

    return candles;
  } catch (error) {
    logger.error(`Error fetching locked token chart data: ${error}`);
    return [];
  }
}

// Define interface for candle data
interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

/**
 * Group candles by the specified time range
 * @param candles Original candle data
 * @param rangeMinutes Time range in minutes
 * @returns Grouped candle data
 */
function groupCandlesByRange(
  candles: Candle[],
  rangeMinutes: number,
): Candle[] {
  if (candles.length === 0) return [];

  const rangeMs = rangeMinutes * 60 * 1000; // Convert minutes to milliseconds
  const groupedCandles: Candle[] = [];

  // Sort candles by time
  const sortedCandles = [...candles].sort((a, b) => a.time - b.time);

  let currentGroup: Candle[] = [];
  let currentRangeStart =
    (Math.floor((sortedCandles[0].time * 1000) / rangeMs) * rangeMs) / 1000;

  // Process each candle
  for (const candle of sortedCandles) {
    const candleRangeStart =
      (Math.floor((candle.time * 1000) / rangeMs) * rangeMs) / 1000;

    if (candleRangeStart === currentRangeStart) {
      // Add to current group
      currentGroup.push(candle);
    } else {
      // Process current group and start a new one
      if (currentGroup.length > 0) {
        groupedCandles.push(
          createCandleFromGroup(currentGroup, currentRangeStart),
        );
      }

      // Handle potential gaps in data
      while (candleRangeStart > currentRangeStart + rangeMs / 1000) {
        currentRangeStart += rangeMs / 1000;
        const previousCandle = groupedCandles[groupedCandles.length - 1];
        groupedCandles.push({
          open: previousCandle.close,
          high: previousCandle.close,
          low: previousCandle.close,
          close: previousCandle.close,
          volume: 0,
          time: currentRangeStart,
        });
      }

      currentRangeStart = candleRangeStart;
      currentGroup = [candle];
    }
  }

  // Process the last group
  if (currentGroup.length > 0) {
    groupedCandles.push(createCandleFromGroup(currentGroup, currentRangeStart));
  }

  return groupedCandles;
}

/**
 * Create a single candle from a group of candles
 * @param group Group of candles
 * @param rangeStart Start time for the group
 * @returns Consolidated candle
 */
function createCandleFromGroup(group: Candle[], rangeStart: number): Candle {
  const open = group[0].open;
  const close = group[group.length - 1].close;
  const high = Math.max(...group.map((c) => c.high));
  const low = Math.min(...group.map((c) => c.low));
  const volume = group.reduce((sum, c) => sum + c.volume, 0);

  return {
    open,
    high,
    low,
    close,
    volume,
    time: rangeStart,
  };
}
