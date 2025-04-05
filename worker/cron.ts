import { ExecutionContext } from "@cloudflare/workers-types/experimental";
import { Connection, PublicKey } from "@solana/web3.js";
import { eq, sql } from "drizzle-orm";
import { getLatestCandle } from "./chart";
import {
  getDB,
  swaps,
  tokens,
  VanityKeypairInsert,
  vanityKeypairs,
} from "./db";
import { Env } from "./env";
import { logger } from "./logger";
import { getSOLPrice } from "./mcap";
import { checkAndReplenishTokens } from "./routes/generation";
import { updateHoldersCache } from "./routes/token";
import {
  bulkUpdatePartialTokens,
  calculateFeaturedScore,
  getFeaturedMaxValues,
} from "./util";
import { getWebSocketClient } from "./websocket-client";
import bs58 from "bs58";

// Define a simplified interface for ScheduledEvent since it's not exported from the module
interface ScheduledEvent {
  cron: string;
  scheduledTime: number;
  [key: string]: any;
}

// Store the last processed signature to avoid duplicate processing
let lastProcessedSignature: string | null = null;

// Update token in the database when we detect a new token or event
export async function updateTokenInDB(env: Env, tokenData: any): Promise<void> {
  try {
    const db = getDB(env);

    // Check if token already exists
    const existingTokens = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, tokenData.mint));

    // If token exists, update it
    if (existingTokens.length > 0) {
      await db
        .update(tokens)
        .set({
          ...tokenData,
          lastUpdated: new Date().toISOString(),
        })
        .where(eq(tokens.mint, tokenData.mint));

      logger.log(`Updated token ${tokenData.mint} in database`);
    } else {
      // Otherwise insert new token with all required fields
      const now = new Date().toISOString();
      await db.insert(tokens).values({
        id: crypto.randomUUID(),
        mint: tokenData.mint,
        name: tokenData.name || `Token ${tokenData.mint.slice(0, 8)}`,
        ticker: tokenData.ticker || "TOKEN",
        url: tokenData.url || "",
        image: tokenData.image || "",
        creator: tokenData.creator || "unknown",
        status: tokenData.status || "active",
        tokenPriceUSD: tokenData.tokenPriceUSD || 0,
        reserveAmount: tokenData.reserveAmount || 0,
        reserveLamport: tokenData.reserveLamport || 0,
        currentPrice: tokenData.currentPrice || 0,
        createdAt: now,
        lastUpdated: now,
        txId: tokenData.txId || "",
      });

      logger.log(`Added new token ${tokenData.mint} to database`);
    }
  } catch (error) {
    logger.error(`Error updating token in database: ${error}`);
  }
}

// Function to process transaction logs and extract token events
export async function processTransactionLogs(
  env: Env,
  logs: string[],
  signature: string,
  wsClient: any = null,
): Promise<{ found: boolean; tokenAddress?: string; event?: string }> {
  try {
    // Get WebSocket client if not provided
    if (!wsClient) {
      wsClient = getWebSocketClient(env);
    }

    // Initialize default result
    let result: { found: boolean; tokenAddress?: string; event?: string } = {
      found: false,
    };

    // Check for specific events, similar to the old TokenMonitor
    const mintLog = logs.find((log) => log.includes("Mint:"));
    const swapLog = logs.find((log) => log.includes("Swap:"));
    const reservesLog = logs.find((log) => log.includes("Reserves:"));
    const feeLog = logs.find((log) => log.includes("fee:"));
    const swapeventLog = logs.find((log) => log.includes("SwapEvent:"));
    const newTokenLog = logs.find((log) => log.includes("NewToken:"));
    const completeEventLog = logs.find((log) =>
      log.includes("curve is completed"),
    );

    // Handle new token events
    if (newTokenLog) {
      try {
        // Extract token address and creator address safely
        const parts = newTokenLog.split(" ");
        if (parts.length < 2) {
          logger.error(`Invalid NewToken log format: ${newTokenLog}`);
          return { found: false };
        }

        // Get the last two elements which should be tokenAddress and creatorAddress
        const rawTokenAddress = parts[parts.length - 2].replace(/[",)]/g, "");
        const rawCreatorAddress = parts[parts.length - 1].replace(/[",)]/g, "");

        // Validate addresses are in proper base58 format
        const isValidTokenAddress =
          /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/.test(
            rawTokenAddress,
          );
        const isValidCreatorAddress =
          /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/.test(
            rawCreatorAddress,
          );

        if (!isValidTokenAddress || !isValidCreatorAddress) {
          logger.error(
            `Invalid address format in NewToken log: token=${rawTokenAddress}, creator=${rawCreatorAddress}`,
          );
          return { found: false };
        }

        logger.log(`New token detected: ${rawTokenAddress}`);

        // Basic token data
        const tokenData = {
          mint: rawTokenAddress,
          creator: rawCreatorAddress,
          status: "active",
          tokenPriceUSD: 0,
          tokenSwapTransactionId: signature,
        };

        try {
          await updateHoldersCache(env, rawTokenAddress);
        } catch (error) {
          logger.error(
            "Failed to update holder cache on newToken event:",
            error,
          );
        }

        // Update the database
        await updateTokenInDB(env, tokenData);

        // Emit the event to all clients
        /**
         * TODO: if this event is emitted before the create-token endpoint finishes its
         * DB update, it seems to corrupt the system and the new token won't ever show on the homepage
         */
        await wsClient.emit("global", "newToken", {
          ...tokenData,
          timestamp: new Date(),
        });

        result = {
          found: true,
          tokenAddress: rawTokenAddress,
          event: "newToken",
        };
      } catch (error) {
        logger.error("Error processing new token event:", error);
      }
    }

    // Handle swap events
    if (mintLog && swapLog && reservesLog && feeLog) {
      try {
        // Extract data with better error handling
        let mintAddress: string;
        try {
          const mintParts = mintLog.split("Mint:");
          if (mintParts.length < 2) {
            logger.error(`Invalid Mint log format: ${mintLog}`);
            return result;
          }
          mintAddress = mintParts[1].trim().replace(/[",)]/g, "");

          // Validate mint address format
          if (
            !mintAddress ||
            !/^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/.test(
              mintAddress,
            )
          ) {
            logger.error(`Invalid mint address format: ${mintAddress}`);
            return result;
          }
        } catch (error) {
          logger.error(`Error parsing mint address: ${error}`);
          return result;
        }

        try {
          await updateHoldersCache(env, mintAddress);
        } catch (error) {
          logger.error("Failed to update holder cache on swap event:", error);
        }

        // Extract user, direction, amount with validation
        let user: string, direction: string, amount: string;
        try {
          const swapParts = swapLog.split(" ");
          if (swapParts.length < 3) {
            logger.error(`Invalid Swap log format: ${swapLog}`);
            return result;
          }

          user = swapParts[swapParts.length - 3].replace(/[",)]/g, "");
          direction = swapParts[swapParts.length - 2].replace(/[",)]/g, "");
          amount = swapParts[swapParts.length - 1].replace(/[",)]/g, "");

          // Validate extracted data
          if (!user || !direction || !amount) {
            logger.error(
              `Missing swap data: user=${user}, direction=${direction}, amount=${amount}`,
            );
            return result;
          }

          // Make sure direction is either "0" or "1"
          if (direction !== "0" && direction !== "1") {
            logger.error(`Invalid direction value: ${direction}`);
            return result;
          }
        } catch (error) {
          logger.error(`Error parsing swap data: ${error}`);
          return result;
        }

        // Extract reserveToken and reserveLamport with validation
        let reserveToken: string, reserveLamport: string;
        try {
          const reservesParts = reservesLog.split(" ");
          if (reservesParts.length < 2) {
            logger.error(`Invalid Reserves log format: ${reservesLog}`);
            return result;
          }

          reserveToken = reservesParts[reservesParts.length - 2].replace(
            /[",)]/g,
            "",
          );
          reserveLamport = reservesParts[reservesParts.length - 1].replace(
            /[",)]/g,
            "",
          );

          // Validate extracted data
          if (!reserveToken || !reserveLamport) {
            logger.error(
              `Missing reserves data: reserveToken=${reserveToken}, reserveLamport=${reserveLamport}`,
            );
            return result;
          }

          // Make sure reserve values are numeric
          if (isNaN(Number(reserveToken)) || isNaN(Number(reserveLamport))) {
            logger.error(
              `Invalid reserve values: reserveToken=${reserveToken}, reserveLamport=${reserveLamport}`,
            );
            return result;
          }
        } catch (error) {
          logger.error(`Error parsing reserves data: ${error}`);
          return result;
        }

        const [_usr, _dir, amountOut] = swapeventLog!
          .split(" ")
          .slice(-3)
          .map((s) => s.replace(/[",)]/g, ""));

        // Get SOL price for calculations
        const solPrice = await getSOLPrice(env);

        // Calculate price based on reserves
        const TOKEN_DECIMALS = Number(env.DECIMALS || 6);
        const SOL_DECIMALS = 9;
        const tokenAmountDecimal =
          Number(reserveToken) / Math.pow(10, TOKEN_DECIMALS);
        const lamportDecimal = Number(reserveLamport) / 1e9;
        const currentPrice = lamportDecimal / tokenAmountDecimal;

        const tokenPriceInSol = currentPrice / Math.pow(10, TOKEN_DECIMALS);
        const tokenPriceUSD =
          currentPrice > 0
            ? tokenPriceInSol * solPrice * Math.pow(10, TOKEN_DECIMALS)
            : 0;

        const marketCapUSD =
          (Number(env.TOKEN_SUPPLY) / Math.pow(10, TOKEN_DECIMALS)) *
          tokenPriceUSD;

        console.log(tokenPriceInSol, tokenPriceUSD, marketCapUSD);

        // Save to the swap table for historical records
        const swapRecord = {
          id: crypto.randomUUID(),
          tokenMint: mintAddress,
          user: user,
          type: direction === "0" ? "buy" : "sell",
          direction: parseInt(direction),
          amountIn: Number(amount),
          amountOut: Number(amountOut),
          price:
            direction === "1"
              ? Number(amountOut) /
                Math.pow(10, SOL_DECIMALS) /
                (Number(amount) / Math.pow(10, TOKEN_DECIMALS)) // Sell price (SOL/token)
              : Number(amount) /
                Math.pow(10, SOL_DECIMALS) /
                (Number(amountOut) / Math.pow(10, TOKEN_DECIMALS)), // Buy price (SOL/token),
          txId: signature,
          timestamp: new Date().toISOString(),
        };

        // Insert the swap record
        const db = getDB(env);
        await db.insert(swaps).values(swapRecord);
        logger.log(
          `Saved swap: ${direction === "0" ? "buy" : "sell"} for ${mintAddress}`,
        );

        // Update token data in database
        const token = await db
          .update(tokens)
          .set({
            reserveAmount: Number(reserveToken),
            reserveLamport: Number(reserveLamport),
            currentPrice: currentPrice,
            liquidity:
              (Number(reserveLamport) / 1e9) * solPrice +
              (Number(reserveToken) / Math.pow(10, TOKEN_DECIMALS)) *
                tokenPriceUSD,
            marketCapUSD,
            tokenPriceUSD,
            solPriceUSD: solPrice,
            curveProgress:
              ((Number(reserveLamport) - Number(env.VIRTUAL_RESERVES)) /
                (Number(env.CURVE_LIMIT) - Number(env.VIRTUAL_RESERVES))) *
              100,
            txId: signature,
            lastUpdated: new Date().toISOString(),
            volume24h: sql`COALESCE(${tokens.volume24h}, 0) + ${
              direction === "1"
                ? (Number(amount) / Math.pow(10, TOKEN_DECIMALS)) *
                  tokenPriceUSD
                : (Number(amountOut) / Math.pow(10, TOKEN_DECIMALS)) *
                  tokenPriceUSD
            }`,
          })
          .where(eq(tokens.mint, mintAddress))
          .returning();
        const newToken = token[0];

        // Update holders data immediately after a swap
        await updateHoldersCache(env, mintAddress);

        // Emit event to all clients via WebSocket
        await wsClient.emit(`token-${mintAddress}`, "newSwap", {
          ...swapRecord,
          mint: mintAddress, // Add mint field for compatibility
        });

        const latestCandle = await getLatestCandle(
          env,
          swapRecord.tokenMint,
          swapRecord,
        );

        // Emit the new candle data
        await wsClient
          .to(`token-${swapRecord.tokenMint}`)
          .emit("newCandle", latestCandle);

        // Emit the updated token data with enriched featured score
        const { maxVolume, maxHolders } = await getFeaturedMaxValues(db);

        // Create enriched token data with featuredScore
        const enrichedToken = {
          ...newToken,
          featuredScore: calculateFeaturedScore(
            newToken,
            maxVolume,
            maxHolders,
          ),
        };

        await wsClient
          .to(`token-${swapRecord.tokenMint}`)
          .emit("updateToken", enrichedToken);

        await wsClient.to("global").emit("updateToken", enrichedToken);

        result = { found: true, tokenAddress: mintAddress, event: "swap" };
      } catch (error) {
        logger.error("Error processing swap event:", error);
      }
    }

    // Handle migration/curve completion events
    if (completeEventLog && mintLog) {
      try {
        let mintAddress: string;
        try {
          const mintParts = mintLog.split("Mint:");
          if (mintParts.length < 2) {
            logger.error(
              `Invalid Mint log format in curve completion: ${mintLog}`,
            );
            return result;
          }
          mintAddress = mintParts[1].trim().replace(/[",)]/g, "");

          // Validate mint address format
          if (
            !mintAddress ||
            !/^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/.test(
              mintAddress,
            )
          ) {
            logger.error(
              `Invalid mint address format in curve completion: ${mintAddress}`,
            );
            return result;
          }
        } catch (error) {
          logger.error(
            `Error parsing mint address in curve completion: ${error}`,
          );
          return result;
        }

        logger.log(`Curve completion detected for ${mintAddress}`);

        // Update token status
        const tokenData = {
          mint: mintAddress,
          status: "migrating",
          lastUpdated: new Date(),
        };

        // Update in database
        await updateTokenInDB(env, tokenData);

        // Notify clients
        await wsClient.emit(`token-${mintAddress}`, "updateToken", tokenData);

        result = {
          found: true,
          tokenAddress: mintAddress,
          event: "curveComplete",
        };
      } catch (error) {
        logger.error("Error processing curve completion:", error);
      }
    }

    return result;
  } catch (error) {
    logger.error("Error processing transaction logs:", error);
    return { found: false };
  }
}

// Function to specifically check for a recently created token
export async function monitorSpecificToken(
  env: Env,
  tokenMint: string,
): Promise<{ found: boolean; message: string }> {
  logger.log(`Looking for specific token: ${tokenMint}`);

  try {
    const wsClient = getWebSocketClient(env);
    const connection = new Connection(
      env.NETWORK === "devnet"
        ? env.DEVNET_SOLANA_RPC_URL
        : env.MAINNET_SOLANA_RPC_URL,
    );

    // Validate programId first since we'll always need this
    let programId: PublicKey;
    try {
      programId = new PublicKey(env.PROGRAM_ID);
    } catch (error) {
      return {
        found: false,
        message: `Invalid program ID: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }

    // First check if token already exists in DB
    const db = getDB(env);
    const existingTokens = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, tokenMint));

    if (existingTokens.length > 0) {
      logger.log(`Token ${tokenMint} already exists in database`);
      return { found: true, message: "Token already exists in database" };
    }

    // Skip token signature check if we know the token mint is likely not a valid PublicKey
    let tokenPubkey: PublicKey | null = null;
    let tokenSignatures: { signature: string }[] = [];
    const isValidBase58 =
      /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/.test(
        tokenMint,
      );

    if (isValidBase58) {
      try {
        // Try to create a PublicKey, but we'll continue even if this fails
        tokenPubkey = new PublicKey(tokenMint);

        // Only attempt to get signatures if PublicKey creation succeeded
        tokenSignatures = await connection.getSignaturesForAddress(
          tokenPubkey,
          { limit: 5 },
          "confirmed",
        );
        logger.log(`Successfully queried signatures for token ${tokenMint}`);
      } catch (error) {
        logger.log(
          `Could not get signatures for token ${tokenMint}: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        logger.log(`Falling back to checking program signatures only`);
      }
    } else {
      logger.log(
        `Token ${tokenMint} contains invalid base58 characters, skipping direct token lookup`,
      );
    }

    // Get program signatures - this should work even if token signatures failed
    const programSignatures = await connection.getSignaturesForAddress(
      programId,
      { limit: 20 }, // Check more program signatures
      "confirmed",
    );
    logger.log(`Found ${programSignatures.length} program signatures to check`);

    // Combine all signatures to check
    const signatures = [...tokenSignatures, ...programSignatures];

    if (signatures.length === 0) {
      logger.log(`No signatures found for token or program`);

      // Create a basic token record anyway since the user is requesting it
      try {
        logger.log(
          `No signatures found, but creating basic token record for ${tokenMint}`,
        );

        // Create a basic token record with all required fields
        const now = new Date().toISOString();
        const tokenData = {
          id: crypto.randomUUID(),
          mint: tokenMint,
          name: `Token ${tokenMint.slice(0, 8)}`,
          ticker: "TOKEN",
          url: "",
          image: "",
          creator: "unknown", // Will be updated later when we find the transaction
          status: "active",
          tokenPriceUSD: 0,
          createdAt: now,
          lastUpdated: now,
          txId: "",
        };

        // Insert directly instead of using updateTokenInDB
        await db.insert(tokens).values(tokenData);

        // Emit event
        await wsClient.emit("global", "newToken", {
          ...tokenData,
          timestamp: new Date(),
        });

        return {
          found: true,
          message: "Token added to database but details will be updated later",
        };
      } catch (error) {
        logger.error(`Error creating basic token record:`, error);
        return {
          found: false,
          message: "No transactions found and could not create token record",
        };
      }
    }

    // Process all signatures to find our token
    for (const signatureInfo of signatures) {
      try {
        const tx = await connection.getTransaction(signatureInfo.signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (!tx || !tx.meta || tx.meta.err) continue;

        // Extract logs
        const logs = tx.meta.logMessages || [];

        // Check if this transaction contains logs mentioning our token
        // We use a safer approach here that doesn't rely on includes()
        const relevantLogs = logs.filter((log) => {
          try {
            // Search for exact token mint by splitting and checking each segment
            const segments = log.split(/[\s:,()[\]{}]+/);
            if (segments.some((segment) => segment === tokenMint)) {
              return true;
            }

            // Also include logs with specific event markers
            return log.includes("NewToken:") || log.includes("Mint:");
          } catch (e) {
            return false;
          }
        });

        if (relevantLogs.length > 0) {
          logger.log(
            `Found ${relevantLogs.length} relevant logs for ${tokenMint} in tx ${signatureInfo.signature}`,
          );

          try {
            // Process the transaction logs
            const result = await processTransactionLogs(
              env,
              logs,
              signatureInfo.signature,
              wsClient,
            );

            // Check exact match when tokenAddress is available, otherwise
            // create a token record anyway since we found related logs
            if (result.found) {
              if (result.tokenAddress === tokenMint) {
                logger.log(
                  `Successfully processed token ${tokenMint} from transaction ${signatureInfo.signature}`,
                );
                return {
                  found: true,
                  message: `Token found and processed (${result.event})`,
                };
              } else {
                logger.log(
                  `Found a token in transaction, but not the one we're looking for. Found ${result.tokenAddress} vs ${tokenMint}`,
                );
              }
            }
          } catch (error) {
            logger.error(
              `Error processing logs for transaction ${signatureInfo.signature}:`,
              error,
            );
          }
        }
      } catch (txError) {
        logger.error(
          `Error fetching transaction ${signatureInfo.signature}:`,
          txError,
        );
      }
    }

    // If we get here, we didn't find a matching token in transactions
    // But we should still create a basic record for it
    try {
      logger.log(
        `No matching transaction found, but creating basic token record for ${tokenMint}`,
      );

      // Create a basic token record with all required fields
      const now = new Date().toISOString();
      const tokenData = {
        id: crypto.randomUUID(),
        mint: tokenMint,
        name: `Token ${tokenMint.slice(0, 8)}`,
        ticker: "TOKEN",
        url: "",
        image: "",
        creator: "unknown", // Will be updated later when we find the transaction
        status: "active",
        tokenPriceUSD: 0,
        createdAt: now,
        lastUpdated: now,
        txId: "",
      };

      // Insert directly instead of using updateTokenInDB
      await db.insert(tokens).values(tokenData);

      // Emit event
      await wsClient.emit("global", "newToken", {
        ...tokenData,
        timestamp: new Date(),
      });

      return {
        found: true,
        message: "Token added to database but details will be updated later",
      };
    } catch (error) {
      logger.error(`Error creating basic token record:`, error);
      return {
        found: false,
        message: "Could not create token record after searching transactions",
      };
    }
  } catch (error) {
    logger.error(`Error monitoring specific token ${tokenMint}:`, error);
    return {
      found: false,
      message: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

export async function monitorTokenEvents(env: Env): Promise<void> {
  try {
    logger.log("Running token event monitoring...");
    const wsClient = getWebSocketClient(env);

    // Create connection to Solana
    const connection = new Connection(
      env.NETWORK === "devnet"
        ? env.DEVNET_SOLANA_RPC_URL
        : env.MAINNET_SOLANA_RPC_URL,
    );

    // Validate program ID is a proper base58 string before creating PublicKey
    if (!env.PROGRAM_ID) {
      logger.error("PROGRAM_ID environment variable is not set");
      return;
    }

    // Check if program ID is a valid base58 string
    const isValidBase58 =
      /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/.test(
        env.PROGRAM_ID,
      );
    if (!isValidBase58) {
      logger.error(
        `Invalid PROGRAM_ID format: ${env.PROGRAM_ID} - contains non-base58 characters`,
      );
      return;
    }

    // Get program ID from environment with try/catch
    let programId: PublicKey;
    try {
      programId = new PublicKey(env.PROGRAM_ID);
    } catch (error) {
      logger.error(
        `Invalid PROGRAM_ID: ${env.PROGRAM_ID} - ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      return;
    }

    // Get recent signatures for the program
    try {
      const signatures = await connection.getSignaturesForAddress(
        programId,
        { limit: 10 }, // Adjust limit as needed
        "confirmed",
      );

      // Process signatures from newest to oldest
      for (let i = 0; i < signatures.length; i++) {
        const signatureInfo = signatures[i];

        // Skip if we've already processed this signature
        if (lastProcessedSignature === signatureInfo.signature) break;

        // If this is the first signature in the list, save it as our marker
        if (i === 0) lastProcessedSignature = signatureInfo.signature;

        try {
          // Get the transaction
          const tx = await connection.getTransaction(signatureInfo.signature, {
            maxSupportedTransactionVersion: 0,
          });

          if (!tx || !tx.meta || tx.meta.err) continue;

          // Extract logs
          const logs = tx.meta.logMessages || [];

          // Process the logs to find and handle events
          await processTransactionLogs(
            env,
            logs,
            signatureInfo.signature,
            wsClient,
          );
        } catch (txError) {
          logger.error(
            `Error processing transaction ${signatureInfo.signature}:`,
            txError,
          );
          // Continue with next signature
        }
      }

      logger.log("Token event monitoring completed");
    } catch (sigError) {
      logger.error(
        `Error getting signatures for program ${env.PROGRAM_ID}:`,
        sigError,
      );
    }
  } catch (error) {
    logger.error("Error in token event monitoring:", error);
  }
}

// --- Vanity Keypair Generation ---
const MIN_VANITY_KEYPAIR_BUFFER = 100;
const TARGET_VANITY_KEYPAIR_BUFFER = 150; // Target slightly higher than min
const VANITY_SUFFIX = "auto";
const MAX_KEYPAIRS_PER_CRON_RUN = 50; // Maximum keypairs to generate per cron run
const MAX_CONCURRENT_KEYPAIR_REQUESTS = 5; // Reduced from 10 to 5 for more stability

export async function manageVanityKeypairs(env: Env): Promise<void> {
  logger.log("[VANITY] Checking vanity keypair buffer...");
  const db = getDB(env);

  try {
    // Count unused keypairs
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(vanityKeypairs)
      .where(eq(vanityKeypairs.used, 0));

    // Also count total keypairs for full stats
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(vanityKeypairs);

    const currentCount = countResult[0]?.count || 0;
    const totalCount = totalResult[0]?.count || 0;
    const usedCount = totalCount - currentCount;

    logger.log(
      `[VANITY] Current stats: ${currentCount} unused out of ${totalCount} total keypairs (${usedCount} used)`,
    );

    // Determine the vanity service URL based on environment
    const vanityServiceUrl =
      env.NODE_ENV === "development"
        ? "http://localhost:8888/grind"
        : "https://vanity.autofun.workers.dev/grind";

    // Start timing
    const startTime = Date.now();

    // Calculate how many keypairs we need to generate
    const keypairsToGenerate = Math.min(
      MAX_KEYPAIRS_PER_CRON_RUN,
      currentCount < MIN_VANITY_KEYPAIR_BUFFER
        ? TARGET_VANITY_KEYPAIR_BUFFER - currentCount
        : 0,
    );

    if (keypairsToGenerate <= 0) {
      logger.log(
        `[VANITY] Buffer full (${currentCount}/${MIN_VANITY_KEYPAIR_BUFFER}). Not generating any keypairs.`,
      );
      return;
    }

    logger.log(
      `[VANITY] Will generate ${keypairsToGenerate} keypairs this run`,
    );

    let successfullyGenerated = 0;

    // Define the concurrency limit
    const maxConcurrent = MAX_CONCURRENT_KEYPAIR_REQUESTS;

    // Function to generate and save a single keypair
    async function generateAndSaveKeypair(index: number): Promise<boolean> {
      try {
        logger.log(
          `[VANITY] Requesting keypair ${index + 1}/${keypairsToGenerate}...`,
        );

        // Request a single keypair from the vanity service
        const response = await fetch(vanityServiceUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            target: VANITY_SUFFIX,
            case_insensitive: false,
            position: "suffix",
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          logger.error(
            `[VANITY] Vanity service error ${response.status}: ${errorText}`,
          );
          return false;
        }

        const result = await response.json();

        // Validate the keypair data
        if (!result.pubkey || !result.private_key) {
          logger.error(
            `[VANITY] Invalid keypair format: ${JSON.stringify(result)}`,
          );
          return false;
        }

        // Log success
        logger.log(
          `[VANITY] Generated keypair ending with "${VANITY_SUFFIX}" in ${result.attempts || "unknown"} attempts: ${result.pubkey}`,
        );

        // Check if this keypair is already in the database before proceeding
        const existingCheck = await db
          .select()
          .from(vanityKeypairs)
          .where(eq(vanityKeypairs.address, result.pubkey))
          .limit(1);

        if (existingCheck && existingCheck.length > 0) {
          logger.warn(
            `[VANITY] Keypair ${result.pubkey} already exists in database, skipping`,
          );
          return false;
        }

        // IMPORTANT: Make sure we have valid Base58 format from the vanity service
        const privateKeyBytes = bs58.decode(result.private_key);

        // Verify the private key is exactly 64 bytes (required by Solana)
        if (privateKeyBytes.length !== 64) {
          logger.error(
            `[VANITY] Invalid private key length: ${privateKeyBytes.length} bytes (expected 64 bytes)`,
          );
          return false;
        }

        // Convert to Base64 for storage to ensure consistent handling
        const privateKeyBase64 =
          Buffer.from(privateKeyBytes).toString("base64");

        // Verify the keypair is valid by trying to recreate it
        try {
          // We need to import the Keypair class here since it's not available at the module level
          const { Keypair } = await import("@solana/web3.js");
          const recreatedKeypair = Keypair.fromSecretKey(privateKeyBytes);
          const recreatedPubkey = recreatedKeypair.publicKey.toString();

          // Verify the public key matches what the vanity service returned
          if (recreatedPubkey !== result.pubkey) {
            logger.error(
              `[VANITY] Keypair verification failed: public key mismatch`,
            );
            logger.error(
              `[VANITY] Expected: ${result.pubkey}, Got: ${recreatedPubkey}`,
            );
            return false;
          }

          logger.log(
            `[VANITY] Keypair verification successful: ${result.pubkey}`,
          );
        } catch (verifyError) {
          logger.error(`[VANITY] Keypair verification failed: ${verifyError}`);
          return false;
        }

        // Create keypair object with Base64-encoded secret key
        const keypair = {
          id: crypto.randomUUID(),
          address: result.pubkey,
          secretKey: privateKeyBase64,
          createdAt: new Date().toISOString(),
          used: 0,
        };

        // CRITICAL: Insert this keypair DIRECTLY with a DEDICATED database connection
        // This is the most important part - no transactions, no batching, just a direct insert
        try {
          // We're using the main db connection, NOT creating a new one to avoid
          // potential connection pool issues
          await db.insert(vanityKeypairs).values(keypair);

          // Log successful insert
          logger.log(
            `[VANITY] ✓ SAVED KEYPAIR DIRECTLY TO DATABASE: ${result.pubkey}`,
          );
          return true;
        } catch (insertError) {
          logger.error(
            `[VANITY] ✘ ERROR SAVING KEYPAIR: ${result.pubkey}`,
            insertError,
          );
          return false;
        }
      } catch (error) {
        logger.error(
          `[VANITY] Error in generateAndSaveKeypair for index ${index}:`,
          error,
        );
        return false;
      }
    }

    // Use a completely different approach with a managed promise pool
    let generatedCount = 0;
    let processingPromises: Promise<boolean>[] = [];

    for (let i = 0; i < keypairsToGenerate; i++) {
      // Add this task to our managed promise pool
      processingPromises.push(
        (async () => {
          try {
            const success = await generateAndSaveKeypair(i);
            if (success) {
              // Only log once after we've completed a successful generation
              generatedCount++;
              logger.log(
                `[VANITY] Progress: ${generatedCount}/${keypairsToGenerate} keypairs generated (${Math.round((generatedCount / keypairsToGenerate) * 100)}%)`,
              );
            }
            return success;
          } catch (error) {
            logger.error(`[VANITY] Error in keypair task ${i}:`, error);
            return false;
          }
        })(),
      );

      // Process in batches to limit concurrency
      if (
        processingPromises.length >= maxConcurrent ||
        i === keypairsToGenerate - 1
      ) {
        // Wait for all current promises to complete before adding more
        const results = await Promise.all(processingPromises);
        // Count successful generations
        successfullyGenerated += results.filter(Boolean).length;
        // Clear the promise array for the next batch
        processingPromises = [];

        // Log the progress after each batch
        logger.log(
          `[VANITY] Batch complete: ${successfullyGenerated}/${keypairsToGenerate} keypairs generated so far`,
        );

        // Do a database check after each batch to verify
        const dbCheckCount = await db
          .select({ count: sql<number>`count(*)` })
          .from(vanityKeypairs)
          .where(eq(vanityKeypairs.used, 0));

        const currentDbCount = dbCheckCount[0]?.count || 0;
        logger.log(
          `[VANITY] Database verification: ${currentDbCount} unused keypairs now in database`,
        );
      }
    }

    const totalTime = (Date.now() - startTime) / 1000;
    logger.log(
      `[VANITY] Completed generation of ${successfullyGenerated}/${keypairsToGenerate} keypairs in ${totalTime.toFixed(1)}s`,
    );

    // Get updated counts
    const updatedCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(vanityKeypairs)
      .where(eq(vanityKeypairs.used, 0));

    logger.log(
      `[VANITY] Final buffer status: ${updatedCount[0]?.count || 0}/${MIN_VANITY_KEYPAIR_BUFFER} unused keypairs`,
    );
  } catch (error) {
    logger.error("[VANITY] Error managing vanity keypairs:", error);
  }
}
// --- End Vanity Keypair Generation ---

export async function cron(
  env: Env,
  ctx: ExecutionContext | { cron: string },
): Promise<void> {
  console.log("Running cron job...");
  try {
    // Check if this is a legitimate Cloudflare scheduled trigger
    // For scheduled triggers, the ctx should have a 'cron' property
    const isScheduledEvent = "cron" in ctx && typeof ctx.cron === "string";

    // if (!isScheduledEvent) {
    //   logger.warn("Rejected direct call to cron function - not triggered by scheduler");
    //   return; // Exit early without running the scheduled tasks
    // }

    // Log the cron pattern being executed
    const cronPattern = (ctx as { cron: string }).cron;
    logger.log(`Running scheduled tasks for cron pattern: ${cronPattern}...`);

    // Then update token prices
    const db = getDB(env);
    const activeTokens = await db
      .select()
      .from(tokens)
      .where(eq(tokens.status, "active"));
    const updatedTokens = await bulkUpdatePartialTokens(activeTokens, env);
    logger.log(`Updated prices for ${updatedTokens.length} tokens`);

    await Promise.all([
      (async () => {
        // Update holder data for each active token
        for (const token of activeTokens) {
          try {
            if (token.mint) {
              logger.log(`Updating holder data for token: ${token.mint}`);
              const holderCount = await updateHoldersCache(env, token.mint);
              logger.log(
                `Updated holders for ${token.mint}: ${holderCount} holders`,
              );
            }
          } catch (err) {
            logger.error(
              `Error updating holders for token ${token.mint}:`,
              err,
            );
          }
        }
      })(),
      (async () => {
        await checkAndReplenishTokens(env);
      })(),
      (async () => {
        await manageVanityKeypairs(env);
      })(),
    ]);
  } catch (error) {
    logger.error("Error in cron job:", error);
  }
}
