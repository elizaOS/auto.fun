import { Connection, PublicKey } from "@solana/web3.js";
import { eq, sql } from "drizzle-orm";
import { getDB, tokens } from "../db";
import { Env } from "../env";
import { retryOperation } from "../raydium/utils";
import { createRedisCache } from "../redis/redisCacheService";
import { calculateFeaturedScore, getFeaturedMaxValues, logger } from "../util";
import { getWebSocketClient } from "../websocket-client";

// Define max swaps to keep in Redis list (consistent with other files)
const MAX_SWAPS_TO_KEEP = 1000;

export async function getAllLockedTokens(env: Env) {
  const db = getDB();
  const tokenData = await db
    .select()
    .from(tokens)
    .where(eq(tokens.status, "locked"))
    .limit(1);
  return tokenData;
}

export async function handleSignature(
  env: Env,
  signature: string,
  token: any,
  solPriceUSD: number,
) {
  const connection = new Connection(
    env.NETWORK === "devnet"
      ? env.DEVNET_SOLANA_RPC_URL
      : env.MAINNET_SOLANA_RPC_URL,
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
    env,
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
  env: Env,
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
      const redisCache = createRedisCache(env);
      const listKey = redisCache.getKey(`swapsList:${mintAddress}`);
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
            ((Number(reserveLamport) - Number(env.VIRTUAL_RESERVES)) /
              (Number(env.CURVE_LIMIT) - Number(env.VIRTUAL_RESERVES))) *
            100,
          txId: signature,
          lastUpdated: new Date(),
          volume24h: sql`COALESCE(${tokens.volume24h}, 0) + ${
            direction === "1"
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
  env: Env,
  tokenMint: string,
): Promise<{
  tokenSupply: string;
  tokenSupplyUiAmount: number;
  tokenDecimals: number;
  lastSupplyUpdate: string;
}> {
  const connection = new Connection(
    env.NETWORK === "mainnet"
      ? env.MAINNET_SOLANA_RPC_URL
      : env.DEVNET_SOLANA_RPC_URL,
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
  env: Env,
  token: any,
  solPriceUSD: number,
  limit = 5,
): Promise<void> {
  const rpcUrl =
    env.NETWORK === "devnet"
      ? env.DEVNET_SOLANA_RPC_URL
      : env.MAINNET_SOLANA_RPC_URL;

  const connection = new Connection(rpcUrl, "confirmed");
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
      await handleSignature(env, signature, token, solPriceUSD);
      return;
    }
  }
}
