import { eq } from "drizzle-orm";
import { getDB, tokens, swaps } from "./db";
import { Env } from "./env";
import { logger } from "./logger";
import { getSOLPrice } from "./mcap";
import { bulkUpdatePartialTokens } from "./util";
import { Connection, PublicKey } from "@solana/web3.js";
import { getWebSocketClient } from "./websocket-client";
import { updateHoldersCache } from "./routes/token";
import { checkAndReplenishTokens } from "./routes/generation";
import {
  ExecutionContext,
  ScheduledEvent,
} from "@cloudflare/workers-types/experimental";

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

        // Update the database
        await updateTokenInDB(env, tokenData);

        // Emit the event to all clients
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

        // Get SOL price for calculations
        const solPrice = await getSOLPrice(env);

        // Calculate price based on reserves
        const TOKEN_DECIMALS = Number(env.DECIMALS || 6);
        const tokenAmountDecimal =
          Number(reserveToken) / Math.pow(10, TOKEN_DECIMALS);
        const lamportDecimal = Number(reserveLamport) / 1e9;
        const currentPrice = lamportDecimal / tokenAmountDecimal;

        // Save to the swap table for historical records
        const swapRecord = {
          id: crypto.randomUUID(),
          tokenMint: mintAddress,
          user: user,
          type: direction === "0" ? "buy" : "sell",
          direction: parseInt(direction),
          amountIn: Number(amount),
          amountOut: 0, // This could be calculated more precisely if needed
          price: currentPrice,
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
        await db
          .update(tokens)
          .set({
            reserveAmount: Number(reserveToken),
            reserveLamport: Number(reserveLamport),
            currentPrice: currentPrice,
            txId: signature,
            lastUpdated: new Date().toISOString(),
          })
          .where(eq(tokens.mint, mintAddress));

        // Update holders data immediately after a swap
        await updateHoldersCache(env, mintAddress);

        // Emit event to all clients via WebSocket
        await wsClient.emit("global", "newSwap", {
          ...swapRecord,
          mint: mintAddress, // Add mint field for compatibility
        });

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

export async function cron(env: Env, ctx: ExecutionContext): Promise<void> {
  try {
    // Initialize WebSocket client for broadcasting events
    const wsClient = getWebSocketClient(env);
    logger.log("Starting CRON job for token monitoring and updates...");

    // Update SOL price
    const solPrice = await getSOLPrice(env);

    // Broadcast SOL price update via WebSocket
    await wsClient.emit("global", "solPriceUpdate", { price: solPrice });
    logger.log(`Broadcasted SOL price update via WebSocket: $${solPrice}`);

    // Monitor token events (will broadcast WebSocket events internally)
    await monitorTokenEvents(env);

    // Check and replenish pre-generated tokens if needed
    await checkAndReplenishTokens(env);

    logger.log("CRON job completed successfully");
  } catch (error) {
    logger.error("Error in CRON job:", error);
  }
}
