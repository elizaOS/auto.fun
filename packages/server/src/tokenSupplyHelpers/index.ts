import { Connection, PublicKey, ParsedAccountData } from "@solana/web3.js";
import { eq, sql } from "drizzle-orm";
import { getDB, tokens } from "../db";
import { retryOperation } from "@autodotfun/raydium/src/utils";
import { getGlobalRedisCache } from "../redis";
import { calculateFeaturedScore, getFeaturedMaxValues, logger } from "../util";
import { getWebSocketClient } from "../websocket-client";
import { ExternalToken } from "../externalToken";

// Define max swaps to keep in Redis list (consistent with other files)
const MAX_SWAPS_TO_KEEP = 1000;

export async function getAllLockedTokens() {
  const db = getDB();
  const tokenData = await db
    .select()
    .from(tokens)
    .where(eq(tokens.status, "locked"))
    .limit(1);
  return tokenData;
}

export async function handleSignature(
  signature: string,
  token: any,
  solPriceUSD: number,
) {
  const connection = new Connection(
    process.env.NETWORK === "devnet"
      ? process.env.DEVNET_SOLANA_RPC_URL || ""
      : process.env.MAINNET_SOLANA_RPC_URL || "",
  );

  // finalize
  const commitment = "confirmed";

  const tx = await connection.getTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment,
  });
  if (!tx || !tx.meta) {
    logger.error(`Transaction not found for signature: ${signature}`);
    return;
  }
  const logs = tx.meta?.logMessages;
  if (!logs) return;

  const metrics = await processSwapLog(
    token,
    signature,
    solPriceUSD,
    logs,
  );
  if (metrics) {
    logger.log(`Swap metrics for ${metrics.mintAddress}:`, metrics);
  }
  return metrics;
}

async function processSwapLog(
  token: any,
  signature: string,
  solPriceUSD: number,
  logs: string[],
) {
  try {
    const wsClient = getWebSocketClient();
    const swapLog = logs.find((l) => l.includes("Swap:"));
    const reservesLog = logs.find((l) => l.includes("Reserves:"));
    const mintLog = logs.find((l) => l.includes("Mint:"));
    const feeLog = logs.find((l) => l.includes("Fee:"));
    const swapeventLog = logs.find((log) => log.includes("SwapEvent:"));

    if (!(mintLog && swapLog && reservesLog && feeLog)) return null;

    if (mintLog && swapLog && reservesLog && feeLog) {
      const mintAddress = mintLog
        .split("Mint:")[1]
        .trim()
        .replace(/[",)]/g, "");
      if (
        !mintAddress ||
        !/^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/.test(
          mintAddress,
        )
      ) {
        logger.error(`Invalid mint address format: ${mintAddress}`);
        return;
      }
      const [user, direction, amount] = swapLog
        .split(" ")
        .slice(-3)
        .map((s) => s.replace(/[",)]/g, ""));

      const [reserveToken, reserveLamport] = reservesLog
        .split(" ")
        .slice(-2)
        .map((s) => s.replace(/[",)]/g, ""));

      const [_usr, _dir, amountOut] = swapeventLog!
        .split(" ")
        .slice(-3)
        .map((s) => s.replace(/[",)]/g, ""));

      const db = getDB();
      const [existing] = await db
        .select({
          price24hAgo: tokens.price24hAgo,
          lastPriceUpdate: tokens.lastPriceUpdate,
        })
        .from(tokens)
        .where(eq(tokens.mint, mintAddress))
        .limit(1)
        .execute();

      const now = new Date();
      const slotTime = now.toISOString();

      const prevPrice24hAgo = existing?.price24hAgo ?? 0;
      const lastPriceUpdate = existing?.lastPriceUpdate
        ? new Date(existing.lastPriceUpdate).getTime()
        : 0;
      const twentyFourHours = 24 * 60 * 60 * 1000;
      const shouldReset24h =
        !existing?.lastPriceUpdate ||
        Date.now() - lastPriceUpdate > twentyFourHours;

      const currentPrice =
        Number(reserveLamport) /
        1e9 /
        (Number(reserveToken) / Math.pow(10, token.tokenDecimals));

      const tokenPriceInSol = currentPrice / Math.pow(10, token.tokenDecimals);
      const tokenPriceUSD =
        currentPrice > 0
          ? tokenPriceInSol * solPriceUSD * Math.pow(10, token.tokenDecimals)
          : 0;
      const marketCapUSD =
        (Number(process.env.TOKEN_SUPPLY) / Math.pow(10, token.tokenDecimals)) *
        tokenPriceUSD;
      const priceChange24h =
        prevPrice24hAgo > 0
          ? ((tokenPriceUSD - prevPrice24hAgo) / prevPrice24hAgo) * 100
          : 0;

      logger.log("reserveLamport", Number(reserveLamport));
      logger.log("reserveToken", Number(reserveToken));
      logger.log("currentPrice", currentPrice);
      logger.log("tokenPriceUSD", tokenPriceUSD);
      logger.log("marketCapUSD", marketCapUSD);
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
            Math.pow(10, 9) /
            (Number(amount) / Math.pow(10, token.tokenDecimals)) // Sell price (SOL/token)
            : Number(amount) /
            Math.pow(10, 9) /
            (Number(amountOut) / Math.pow(10, token.tokenDecimals)), // Buy price (SOL/token),
        txId: signature,
        timestamp: new Date(),
      };
      const redisCache = await getGlobalRedisCache();
      const listKey = `swapsList:${mintAddress}`;
      try {
        await redisCache.lpush(listKey, JSON.stringify(swapRecord));
        await redisCache.ltrim(listKey, 0, MAX_SWAPS_TO_KEEP - 1);
        logger.log(
          `Helper: Saved swap to Redis list ${listKey} & trimmed. Type: ${direction === "0" ? "buy" : "sell"}`,
        );
      } catch (redisError) {
        logger.error(
          `Helper: Failed to save swap to Redis list ${listKey}:`,
          redisError,
        );
        // Consider if we should proceed or return error
      }

      const newToken = await db
        .update(tokens)
        .set({
          reserveAmount: Number(reserveToken),
          reserveLamport: Number(reserveLamport),
          currentPrice: currentPrice,
          liquidity:
            (Number(reserveLamport) / 1e9) * solPriceUSD +
            (Number(reserveToken) / Math.pow(10, token.tokenDecimals)) *
            tokenPriceUSD,
          tokenPriceUSD,
          solPriceUSD: solPriceUSD,
          curveProgress:
            ((Number(reserveLamport) - Number(process.env.VIRTUAL_RESERVES)) /
              (Number(process.env.CURVE_LIMIT) - Number(process.env.VIRTUAL_RESERVES))) *
            100,
          txId: signature,
          lastUpdated: new Date(),
          volume24h: sql`COALESCE(${tokens.volume24h}, 0) + ${direction === "1"
            ? (Number(amount) / Math.pow(10, token.tokenDecimals)) *
            tokenPriceUSD
            : (Number(amountOut) / Math.pow(10, token.tokenDecimals)) *
            tokenPriceUSD
            }`,
          priceChange24h,
          // Conditionally set price24hAgo & lastPriceUpdate
          ...(shouldReset24h
            ? {
              price24hAgo: tokenPriceUSD,
              lastPriceUpdate: now,
            }
            : {}),
        })
        .where(eq(tokens.mint, mintAddress))
        .returning();
      const { maxVolume, maxHolders } = await getFeaturedMaxValues(db);

      const enrichedToken = {
        ...newToken,
        featuredScore: calculateFeaturedScore(
          newToken[0],
          maxVolume,
          maxHolders,
        ),
      };
      // Emit event to all clients via WebSocket
      await wsClient.emit(`token-${mintAddress}`, "newSwap", {
        ...swapRecord,
        mint: mintAddress, // Add mint field for compatibility
        timestamp: swapRecord.timestamp.toISOString(), // Emit ISO string
      });
      await wsClient
        .to(`token-${swapRecord.tokenMint}`)
        .emit("updateToken", enrichedToken);
      return {
        mintAddress,
        currentPrice,
        tokenPriceUSD,
        marketCapUSD,
        priceChange24h,
      };
    }
  } catch (e) {
    console.error("Error processing swap log:", e);
    return;
  }
}

export function shouldUpdateSupply(token: any): boolean {
  if (!token.lastSupplyUpdate) {
    return true;
  }
  const lastUpdate = new Date(token.lastSupplyUpdate).getTime();
  const oneHourAgo = Date.now() - 3600 * 1000;
  return lastUpdate < oneHourAgo;
}

export async function updateTokenSupplyFromChain(
  tokenMint: string,
): Promise<{
  tokenSupply: string;
  tokenSupplyUiAmount: number;
  tokenDecimals: number;
  lastSupplyUpdate: string;
}> {
  const connection = new Connection(
    process.env.NETWORK === "mainnet"
      ? process.env.MAINNET_SOLANA_RPC_URL || ""
      : process.env.DEVNET_SOLANA_RPC_URL || "",
    "confirmed",
  );
  // retry in case it fails once
  const supplyResponse = await retryOperation(
    () => connection.getTokenSupply(new PublicKey(tokenMint)),
    2,
    5000,
  );
  if (!supplyResponse || !supplyResponse.value) {
    throw new Error(`Failed to fetch token supply for ${tokenMint}`);
  }
  const { amount, uiAmount, decimals } = supplyResponse.value;
  const now = new Date();

  const db = getDB();
  await db
    .update(tokens)
    .set({
      tokenSupply: amount,
      tokenSupplyUiAmount: uiAmount,
      tokenDecimals: decimals,
      lastSupplyUpdate: now,
    })
    .where(eq(tokens.mint, tokenMint))
    .execute();

  logger.log(`Token supply updated for ${tokenMint}`);
  return {
    tokenSupply: amount,
    tokenSupplyUiAmount: uiAmount || 0,
    tokenDecimals: decimals,
    lastSupplyUpdate: now.toISOString(),
  };
}

async function isValidSwapTx(
  connection: Connection,
  signature: string,
  mint: string,
): Promise<boolean> {
  const tx = await connection.getTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });
  const logs = tx?.meta?.logMessages;
  if (!logs) return false;

  const has = (kw: string) => logs.some((l) => l.includes(kw));
  return (
    has("Mint:") &&
    has("Swap:") &&
    has("Reserves:") &&
    has("Fee:") &&
    has("SwapEvent:")
  );
}

export async function processLastValidSwap(
  token: any,
  solPriceUSD: number,
  limit = 5,
): Promise<void> {
  const rpcUrl =
    process.env.NETWORK === "devnet"
      ? process.env.DEVNET_SOLANA_RPC_URL
      : process.env.MAINNET_SOLANA_RPC_URL;

  const connection = new Connection(rpcUrl || "", "confirmed");
  const mint = token.mint;
  if (!mint) {
    logger.error("processLastValidSwap: Token object missing mint property.");
    return;
  }

  // Fetch the last `limit` signatures
  const sigs = await connection.getSignaturesForAddress(new PublicKey(mint), {
    limit,
  });

  // Iterate in order (most recent first)
  for (const { signature } of sigs) {
    if (await isValidSwapTx(connection, signature, mint)) {
      // Found the most recent valid swap—process it once
      await handleSignature(signature, token, solPriceUSD);
      return;
    }
  }
}


export async function updateHoldersCache(
  mint: string,
  imported: boolean = false,
): Promise<number> {
  const env = process.env;
  try {
    // Use the utility function to get the RPC URL with proper API key
    const connection = new Connection(process.env.NETWORK! === "devnet" ?
      process.env.DEVNET_SOLANA_RPC_URL! : process.env.MAINNET_SOLANA_RPC_URL!,
      {
        commitment: "confirmed",
        confirmTransactionInitialTimeout: 60000, // 60 seconds
      }

    );

    const db = getDB();
    const existingToken = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);
    if (existingToken?.[0]?.imported === 1) {
      //ignore imported tokens
      logger.log(`Token ${mint} is imported, skipping holder update.`);
      const redisCache = await getGlobalRedisCache(); // Instantiate Redis cache
      const ext = await ExternalToken.create(mint, redisCache);
      await ext.updateMarketAndHolders();
      return 0;
    }
    const redisCache = await getGlobalRedisCache(); // Instantiate Redis cache

    // Get all token accounts for this mint using getParsedProgramAccounts
    // This method is more reliable for finding all holders
    const accounts = await connection.getParsedProgramAccounts(
      new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), // Token program
      {
        filters: [
          {
            dataSize: 165, // Size of token account
          },
          {
            memcmp: {
              offset: 0,
              bytes: mint, // Mint address
            },
          },
        ],
      },
    );

    if (!accounts || accounts.length === 0) {
      logger.log(`No accounts found for token ${mint}`);
      return 0;
    }

    logger.log(`Found ${accounts.length} token accounts for mint ${mint}`);

    // Process accounts to extract holder information
    let totalTokens = 0;
    // Change type from TokenHolder to any or a new local type if needed
    const holders: any[] = [];

    // Process each account to get holder details
    for (const account of accounts) {
      try {
        const parsedAccountInfo = account.account.data as ParsedAccountData;
        const tokenBalance =
          parsedAccountInfo.parsed?.info?.tokenAmount?.uiAmount || 0;

        // Skip accounts with zero balance
        if (tokenBalance <= 0) continue;

        const ownerAddress = parsedAccountInfo.parsed?.info?.owner || "";

        // Skip accounts without owner
        if (!ownerAddress) continue;

        // Add to total tokens for percentage calculation
        totalTokens += tokenBalance;

        // Use a consistent structure, maybe matching old DB schema if needed
        holders.push({
          // id: crypto.randomUUID(), // No longer needed for DB
          mint, // Keep for context within the stored object
          address: ownerAddress,
          amount: tokenBalance,
          percentage: 0, // Will calculate after we have the total
          lastUpdated: new Date(), // Keep track of update time
        });



      } catch (error: any) {
        logger.error(`Error processing account for ${mint}:`, error);
        // Continue with other accounts even if one fails
        continue;
      }
    }

    // Calculate percentages now that we have the total
    if (totalTokens > 0) {
      for (const holder of holders) {
        holder.percentage = (holder.amount / totalTokens) * 100;
      }
    }

    // Sort holders by amount (descending)
    holders.sort((a, b) => b.amount - a.amount);

    const holdersListKey = `holders:${mint}`;
    try {
      // Store the entire list, stringified. No TTL.
      await redisCache.set(holdersListKey, JSON.stringify(holders));
      logger.log(
        `Stored ${holders.length} holders in Redis list ${holdersListKey}`,
      );
    } catch (redisError) {
      logger.error(`Failed to store holders in Redis for ${mint}:`, redisError);
    }

    try {
      const wsClient = getWebSocketClient();
      const limitedHolders = holders.slice(0, 50); // Emit only top 50
      wsClient.emit(`token-${mint}`, "newHolder", limitedHolders);
    } catch (wsError) {
      logger.error(`WebSocket error when emitting holder update:`, wsError);
    }


    await db
      .update(tokens)
      .set({
        holderCount: holders.length, // Use full count
        lastUpdated: new Date(),
      })
      .where(eq(tokens.mint, mint));

    // Emit WebSocket event to notify of token update (with new holder count)
    try {
      const tokenData = await db
        .select()
        .from(tokens)
        .where(eq(tokens.mint, mint))
        .limit(1);

      if (tokenData && tokenData.length > 0) {
        await processTokenUpdateEvent({
          ...tokenData[0],
          event: "holdersUpdated",
          holderCount: holders.length, // Use full count here too
          timestamp: new Date().toISOString(),
        });
      }
    } catch (wsError) {
      logger.error(`WebSocket error when emitting holder update: ${wsError}`);
    }

    return holders.length; // Return full count
  } catch (error) {
    logger.error(`Error updating holders for token ${mint}:`, error);
    return 0;
  }
}

// Function to process a token update and emit WebSocket events
export async function processTokenUpdateEvent(
  tokenData: any,
  shouldEmitGlobal: boolean = false,
  isNewTokenEvent: boolean = false, // Add the new flag
): Promise<void> {
  try {
    // Get WebSocket client
    const wsClient = getWebSocketClient();

    // Get DB connection and calculate featuredScore
    const db = getDB();
    const { maxVolume, maxHolders } = await getFeaturedMaxValues(db);

    // Create enriched token data with featuredScore
    const enrichedTokenData = {
      ...tokenData,
      featuredScore: calculateFeaturedScore(
        tokenData,
        maxVolume,
        maxHolders,
      ),
    };

    // Always emit to token-specific room
    await wsClient.emit(
      `token-${tokenData.mint}`,
      "updateToken",
      enrichedTokenData,
    );

    // Use env var for debug check
    const debugWs = process.env.DEBUG_WEBSOCKET === "true";
    if (debugWs) {
      logger.log(`Emitted token update event for ${tokenData.mint}`);
    }

    // Handle global emission based on flags
    if (isNewTokenEvent) {
      // If it's a new token event, *only* emit the global "newToken" event
      await wsClient.emit("global", "newToken", {
        ...enrichedTokenData,
        timestamp: new Date(),
      });
      if (debugWs) {
        logger.log(`Emitted NEW token event to global feed: ${tokenData.mint}`);
      }
    } else if (shouldEmitGlobal) {
      // Otherwise, if shouldEmitGlobal is true (and it's not a new token), emit "updateToken" globally
      await wsClient.emit("global", "updateToken", {
        ...enrichedTokenData,
        timestamp: new Date(),
      });

      if (debugWs) {
        logger.log("Emitted token update event to global feed");
      }
    }

    return;
  } catch (error) {
    logger.error("Error processing token update event:", error);
    // Don't throw to avoid breaking other functionality
  }
}
