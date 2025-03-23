import { eq } from "drizzle-orm";
import { getDB, tokens } from "./db";
import { Env } from "./env";
import { logger } from "./logger";
import { getSOLPrice } from "./mcap";
import { bulkUpdatePartialTokens } from "./util";
import { Connection, PublicKey } from "@solana/web3.js";
import { getWebSocketClient } from "./websocket-client";

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

    let result: { found: boolean; tokenAddress?: string; event?: string } = {
      found: false,
    };

    // Handle new token events
    if (newTokenLog) {
      try {
        const [tokenAddress, creatorAddress] = newTokenLog
          .split(" ")
          .slice(-2)
          .map((s) => s.replace(/[",)]/g, ""));

        logger.log(`New token detected: ${tokenAddress}`);

        // Basic token data
        const tokenData = {
          mint: tokenAddress,
          creator: creatorAddress,
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

        result = { found: true, tokenAddress, event: "newToken" };
      } catch (error) {
        logger.error("Error processing new token event:", error);
      }
    }

    // Handle swap events
    if (mintLog && swapLog && reservesLog && feeLog) {
      try {
        // Extract data similar to the old code
        const mintAddress = mintLog
          .split("Mint:")[1]
          .trim()
          .replace(/[",)]/g, "");

        // Extract swap details (simplified)
        const [user, direction, amount] = swapLog
          .split(" ")
          .slice(-3)
          .map((s) => s.replace(/[",)]/g, ""));
        const [reserveToken, reserveLamport] = reservesLog
          .split(" ")
          .slice(-2)
          .map((s) => s.replace(/[",)]/g, ""));

        // Get SOL price for calculations
        const solPrice = await getSOLPrice(env);

        // Calculate token price (simplified)
        // This needs to be adapted to your exact formula
        const tokenData = {
          mint: mintAddress,
          reserveAmount: Number(reserveToken),
          reserveLamport: Number(reserveLamport),
          solPriceUSD: solPrice,
          lastSwapTxId: signature,
          lastUpdated: new Date(),
        };

        // Update token data in DB
        await updateTokenInDB(env, tokenData);

        // Create simplified swap data
        const swapData = {
          tokenMint: mintAddress,
          user: user,
          direction: Number(direction),
          type: Number(direction) === 1 ? "sell" : "buy",
          txId: signature,
          timestamp: new Date(),
        };

        // Emit swap events
        await wsClient.emit(`token-${mintAddress}`, "newSwap", swapData);

        // Also update token data
        await wsClient.emit(`token-${mintAddress}`, "updateToken", tokenData);

        result = { found: true, tokenAddress: mintAddress, event: "swap" };
      } catch (error) {
        logger.error("Error processing swap event:", error);
      }
    }

    // Handle migration/curve completion events
    if (completeEventLog && mintLog) {
      try {
        const mintAddress = mintLog
          .split("Mint:")[1]
          .trim()
          .replace(/[",)]/g, "");
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
      env.RPC_URL || "https://api.mainnet-beta.solana.com",
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
      env.RPC_URL || "https://api.mainnet-beta.solana.com",
    );

    // Get program ID from environment
    const programId = new PublicKey(env.PROGRAM_ID);

    // Get recent signatures for the program
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
    }

    logger.log("Token event monitoring completed");
  } catch (error) {
    logger.error("Error in token event monitoring:", error);
  }
}

export async function cron(env: Env): Promise<void> {
  try {
    logger.log("Running scheduled tasks...");

    // Run token monitoring first
    await monitorTokenEvents(env);

    // Then update token prices
    const db = getDB(env);

    // Get all active tokens
    const activeTokens = await db
      .select()
      .from(tokens)
      .where(eq(tokens.status, "active"));

    // Get SOL price once for all tokens
    const solPrice = await getSOLPrice(env);

    // Update each token with new price data
    const updatedTokens = await bulkUpdatePartialTokens(activeTokens, env);

    logger.log(`Updated prices for ${updatedTokens.length} tokens`);
  } catch (error) {
    logger.error("Error in cron job:", error);
  }
}
