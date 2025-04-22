import { ExecutionContext } from "@cloudflare/workers-types/experimental";
import { eq, sql } from "drizzle-orm";
import { TokenData, TokenDBData } from "../worker/raydium/types/tokenData";
import { getLatestCandle } from "./chart";
import { getDB, Token, tokens } from "./db";
import { Env } from "./env";
import { calculateTokenMarketData, getSOLPrice } from "./mcap";
import { awardGraduationPoints, awardUserPoints } from "./points/helpers";
import { getToken } from "./raydium/migration/migrations";
import { createRedisCache } from "./redis/redisCacheService";
import {
  checkAndReplenishTokens,
  generateAdditionalTokenImages,
} from "./routes/generation";
import { updateHoldersCache } from "./routes/token";
import {
  bulkUpdatePartialTokens,
  calculateFeaturedScore,
  createNewTokenData,
  getFeaturedMaxValues,
  logger,
} from "./util";
import { getWebSocketClient } from "./websocket-client";

// Store the last processed signature to avoid duplicate processing
const lastProcessedSignature: string | null = null;

// Define max swaps to keep in Redis list
const MAX_SWAPS_TO_KEEP = 1000;

function sanitizeTokenForWebSocket(
  token: Partial<Token>,
  maxBytes = 95000,
): Partial<Token> {
  const clone = { ...token };

  // Helper to get byte size
  const getSize = (obj: any) => Buffer.byteLength(JSON.stringify(obj), "utf8");

  if (getSize(clone) <= maxBytes) return clone;

  // Stepwise stripping
  clone.description = "";
  if (getSize(clone) <= maxBytes) return clone;

  clone.website = "";
  if (getSize(clone) <= maxBytes) return clone;

  clone.twitter = "";
  clone.telegram = "";
  clone.farcaster = "";
  if (getSize(clone) <= maxBytes) return clone;

  clone.image = "";
  clone.url = "";
  if (getSize(clone) <= maxBytes) return clone;

  return {
    id: clone.id,
    name: clone.name,
    ticker: clone.ticker,
    mint: clone.mint,
    creator: clone.creator,
    status: clone.status,
    tokenPriceUSD: clone.tokenPriceUSD,
    marketCapUSD: clone.marketCapUSD,
    currentPrice: clone.currentPrice,
    reserveAmount: clone.reserveAmount,
    reserveLamport: clone.reserveLamport,
    liquidity: clone.liquidity,
    volume24h: clone.volume24h,
    marketId: clone.marketId,
    image: clone.image,
    url: clone.url,
    lockId: clone.lockId,
    createdAt: clone.createdAt,
    solPriceUSD: clone.solPriceUSD,
  };
}
function convertTokenDataToDBData(
  tokenData: Partial<TokenData>,
): Partial<TokenDBData> {
  const now = new Date();
  return {
    ...tokenData,
    lastUpdated: now,
    migration:
      tokenData.migration && typeof tokenData.migration !== "string"
        ? JSON.stringify(tokenData.migration)
        : tokenData.migration,
    withdrawnAmounts:
      tokenData.withdrawnAmounts &&
      typeof tokenData.withdrawnAmounts !== "string"
        ? JSON.stringify(tokenData.withdrawnAmounts)
        : tokenData.withdrawnAmounts,
    poolInfo:
      tokenData.poolInfo && typeof tokenData.poolInfo !== "string"
        ? JSON.stringify(tokenData.poolInfo)
        : tokenData.poolInfo,
  };
}

export async function updateTokenInDB(
  env: Env,
  tokenData: Partial<TokenData>,
): Promise<Token> {
  const db = getDB(env);
  const now = new Date().toISOString();

  // Create a new object that conforms to TokenDBData
  const updateData: Partial<TokenDBData> = convertTokenDataToDBData(tokenData);

  // Convert nested objects to JSON strings if they're present and not already strings
  if (updateData.migration && typeof updateData.migration !== "string") {
    updateData.migration = JSON.stringify(updateData.migration);
  }
  if (
    updateData.withdrawnAmounts &&
    typeof updateData.withdrawnAmounts !== "string"
  ) {
    updateData.withdrawnAmounts = JSON.stringify(updateData.withdrawnAmounts);
  }
  if (updateData.poolInfo && typeof updateData.poolInfo !== "string") {
    updateData.poolInfo = JSON.stringify(updateData.poolInfo);
  }

  // Ensure mint is defined
  if (!updateData.mint) {
    throw new Error("mint field is required for update");
  }
  // Check if token already exists
  const existingTokens = await db
    .select()
    .from(tokens)
    .where(eq(tokens.mint, updateData.mint));

  let updatedTokens: Token[];

  if (existingTokens.length > 0) {
    console.log("found existing token in DB");
    updatedTokens = await db
      .update(tokens)
      .set(updateData)
      .where(eq(tokens.mint, updateData.mint!))
      .returning();
    logger.log(`Updated token ${updateData.mint} in database`);
  } else {
    console.log("not found existing token in DB");
    console.log(JSON.stringify(updateData, null, 2));
    updatedTokens = await db
      .insert(tokens)
      .values([
        {
          mint: updateData.mint,
          name: updateData.name || `Token ${updateData.mint?.slice(0, 8)}`,
          ticker: updateData.ticker || "TOKEN",
          url: updateData.url || "",
          image: updateData.image || "",
          creator: updateData.creator || "unknown",
          status: updateData.status || "active",
          tokenPriceUSD: updateData.tokenPriceUSD ?? 0,
          reserveAmount: updateData.reserveAmount ?? 0,
          reserveLamport: updateData.reserveLamport ?? 0,
          currentPrice: updateData.currentPrice ?? 0,
          // createdAt: sql`CURRENT_TIMESTAMP`,
          // lastUpdated: sql`CURRENT_TIMESTAMP`,
          txId: updateData.txId || "",
          migration: updateData.migration || "",
          withdrawnAmounts: updateData.withdrawnAmounts || "",
          poolInfo: updateData.poolInfo || "",
          lockLpTxId: updateData.lockLpTxId || "",
          nftMinted: updateData.nftMinted || "",
          marketId: updateData.marketId || "",
        },
      ])
      .returning();
    logger.log(`Added new token ${updateData.mint} to database`);
  }

  return updatedTokens[0];
}
type ProcessResult = {
  found: boolean;
  tokenAddress?: string;
  event?: string;
};

type HandlerResult = ProcessResult | null;
export async function processTransactionLogs(
  env: Env,
  logs: string[],
  signature: string,
  wsClient: any = null,
): Promise<ProcessResult> {
  if (!wsClient) {
    wsClient = getWebSocketClient(env);
  }

  // Try each handler in sequence and return on first match
  const newTokenResult = await handleNewToken(env, logs, signature, wsClient);
  if (newTokenResult) return newTokenResult;

  const swapResult = await handleSwap(env, logs, signature, wsClient);
  if (swapResult) return swapResult;

  const curveResult = await handleCurveComplete(env, logs, signature, wsClient);
  if (curveResult) return curveResult;

  // Default: no event found
  return { found: false };
}

async function handleNewToken(
  env: Env,
  logs: string[],
  signature: string,
  wsClient: any,
): Promise<HandlerResult> {
  const newTokenLog = logs.find((log) => log.includes("NewToken:"));
  if (!newTokenLog) return null;

  try {
    const parts = newTokenLog.split(" ");
    if (parts.length < 2)
      throw new Error(`Invalid NewToken log: ${newTokenLog}`);

    const rawTokenAddress = parts[parts.length - 2].replace(/[",)]/g, "");
    const rawCreatorAddress = parts[parts.length - 1].replace(/[",)]/g, "");
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(rawTokenAddress)) {
      throw new Error(`Malformed token address: ${rawTokenAddress}`);
    }

    const newToken = await createNewTokenData(
      signature,
      rawTokenAddress,
      rawCreatorAddress,
      env,
    );
    if (!newToken) {
      logger.error(`Failed to create new token data for ${rawTokenAddress}`);
      return null;
    }
    await getDB(env)
      .insert(tokens)
      .values([newToken as Token])
      .onConflictDoNothing();
    await wsClient.emit("global", "newToken", newToken);
    await updateHoldersCache(env, rawTokenAddress);

    return { found: true, tokenAddress: rawTokenAddress, event: "newToken" };
  } catch (err) {
    logger.error(`Error in NewToken handler: ${err}`);
    return null;
  }
}

async function handleSwap(
  env: Env,
  logs: string[],
  signature: string,
  wsClient: any,
): Promise<HandlerResult | null> {
  const mintLog = logs.find((log) => log.includes("Mint:"));
  const swapLog = logs.find((log) => log.includes("Swap:"));
  const reservesLog = logs.find((log) => log.includes("Reserves:"));
  const feeLog = logs.find((log) => log.includes("fee:"));
  const swapeventLog = logs.find((log) => log.includes("SwapEvent:"));

  if (!mintLog || !swapLog || !reservesLog || !feeLog || !swapeventLog) {
    return null;
  }

  try {
    const mintAddress = mintLog.split("Mint:")[1]?.trim().replace(/[",)]/g, "");
    if (!mintAddress || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(mintAddress)) {
      throw new Error(`Invalid or malformed mint address: ${mintAddress}`);
    }

    const swapParts = swapLog.trim().split(" ");
    const [user, direction, amount] = swapParts
      .slice(-3)
      .map((v) => v.replace(/[",)]/g, ""));
    if (!user || !["0", "1"].includes(direction) || isNaN(Number(amount))) {
      throw new Error(`Malformed swap data: ${swapLog}`);
    }

    const [reserveToken, reserveLamport] = reservesLog
      .trim()
      .split(" ")
      .slice(-2)
      .map((v) => v.replace(/[",)]/g, ""));
    if (isNaN(Number(reserveToken)) || isNaN(Number(reserveLamport))) {
      throw new Error(`Malformed reserve data: ${reservesLog}`);
    }

    const [_usr, _dir, amountOut] = swapeventLog
      .trim()
      .split(" ")
      .slice(-3)
      .map((v) => v.replace(/[",)]/g, ""));

    const solPrice = await getSOLPrice(env);
    const tokenWithSupply = await getToken(env, mintAddress);
    if (!tokenWithSupply) {
      logger.error(`Token not found in DB: ${mintAddress}`);
      return null;
    }

    const TOKEN_DECIMALS = tokenWithSupply.tokenDecimals || 6;
    const tokenAmount = Number(reserveToken) / 10 ** TOKEN_DECIMALS;
    const solAmount = Number(reserveLamport) / 1e9;
    const currentPrice = solAmount / tokenAmount;
    const tokenPriceInSol = currentPrice / 10 ** TOKEN_DECIMALS;
    const tokenPriceUSD =
      currentPrice > 0 ? tokenPriceInSol * solPrice * 10 ** TOKEN_DECIMALS : 0;

    tokenWithSupply.tokenPriceUSD = tokenPriceUSD;
    tokenWithSupply.currentPrice = currentPrice;

    const tokenWithMarketData = await calculateTokenMarketData(
      tokenWithSupply,
      solPrice,
      env,
    );
    const marketCapUSD = tokenWithMarketData.marketCapUSD;

    const swapRecord = {
      id: crypto.randomUUID(),
      tokenMint: mintAddress,
      user,
      type: direction === "0" ? "buy" : "sell",
      direction: parseInt(direction),
      amountIn: Number(amount),
      amountOut: Number(amountOut),
      price:
        direction === "1"
          ? Number(amountOut) / 1e9 / (Number(amount) / 10 ** TOKEN_DECIMALS)
          : Number(amount) / 1e9 / (Number(amountOut) / 10 ** TOKEN_DECIMALS),
      txId: signature,
      timestamp: new Date(),
    };

    const db = getDB(env);
    const redisCache = createRedisCache(env);
    const listKey = redisCache.getKey(`swapsList:${mintAddress}`);

    try {
      await redisCache.lpush(listKey, JSON.stringify(swapRecord));
      await redisCache.ltrim(listKey, 0, MAX_SWAPS_TO_KEEP - 1);
      logger.log(`Saved swap to Redis: ${swapRecord.type} on ${mintAddress}`);
    } catch (err) {
      logger.error(`Redis error saving swap:`, err);
    }

    const liquidity =
      (Number(reserveLamport) / 1e9) * solPrice +
      (Number(reserveToken) / 10 ** TOKEN_DECIMALS) * tokenPriceUSD;

    const updatedTokens = await db
      .update(tokens)
      .set({
        reserveAmount: Number(reserveToken),
        reserveLamport: Number(reserveLamport),
        currentPrice,
        liquidity,
        marketCapUSD,
        tokenPriceUSD,
        solPriceUSD: solPrice,
        curveProgress:
          ((Number(reserveLamport) - Number(env.VIRTUAL_RESERVES)) /
            (Number(env.CURVE_LIMIT) - Number(env.VIRTUAL_RESERVES))) *
          100,
        txId: signature,
        lastUpdated: new Date(),
        volume24h: sql`COALESCE(${tokens.volume24h}, 0) + ${
          direction === "1"
            ? (Number(amount) / 10 ** TOKEN_DECIMALS) * tokenPriceUSD
            : (Number(amountOut) / 10 ** TOKEN_DECIMALS) * tokenPriceUSD
        }`,
      })
      .where(eq(tokens.mint, mintAddress))
      .returning();

    const newToken = updatedTokens[0];
    const usdVolume =
      swapRecord.type === "buy"
        ? (swapRecord.amountOut / 10 ** TOKEN_DECIMALS) * tokenPriceUSD
        : (swapRecord.amountIn / 10 ** TOKEN_DECIMALS) * tokenPriceUSD;

    const bondStatus = newToken?.status === "locked" ? "postbond" : "prebond";
    await awardUserPoints(env, swapRecord.user, {
      type: `${bondStatus}_${swapRecord.type}` as any,
      usdVolume,
    });
    await awardUserPoints(env, swapRecord.user, {
      type: "trade_volume_bonus",
      usdVolume,
    });

    try {
      const listLength = await redisCache.llen(listKey);
      if (swapRecord.type === "buy" && listLength === 1) {
        await awardUserPoints(env, swapRecord.user, {
          type: "first_buyer",
        });
        logger.log(`Awarded first_buyer to ${swapRecord.user}`);
      }
    } catch (err) {
      logger.error("Failed to award first_buyer:", err);
    }

    await updateHoldersCache(env, mintAddress);

    await wsClient.emit(`global`, "newSwap", {
      ...swapRecord,
      mint: mintAddress,
      timestamp: swapRecord.timestamp.toISOString(),
    });

    const latestCandle = await getLatestCandle(env, mintAddress, swapRecord);
    await wsClient.to(`global`).emit("newCandle", latestCandle);

    const { maxVolume, maxHolders } = await getFeaturedMaxValues(db);
    const enrichedToken = {
      ...newToken,
      featuredScore: calculateFeaturedScore(newToken, maxVolume, maxHolders),
    };

    await wsClient
      .to("global")
      .emit("updateToken", sanitizeTokenForWebSocket(enrichedToken));

    return {
      found: true,
      tokenAddress: mintAddress,
      event: "swap",
    };
  } catch (err) {
    logger.error(`Error in Swap handler: ${err}`);
    return null;
  }
}

async function handleCurveComplete(
  env: Env,
  logs: string[],
  signature: string,
  wsClient: any,
): Promise<HandlerResult> {
  const completeLog = logs.find((log) => log.includes("curve is completed"));
  const mintLog = logs.find((log) => log.includes("Mint:"));
  if (!completeLog || !mintLog) return null;

  try {
    const mintAddress = mintLog.split("Mint:")[1].trim().replace(/[",)]/g, "");
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(mintAddress)) {
      throw new Error(`Invalid mint on curve completion: ${mintAddress}`);
    }

    await awardGraduationPoints(env, mintAddress);
    const token = await getToken(env, mintAddress);
    if (!token) {
      logger.error(`Token not found: ${mintAddress}`);
      return null;
    }

    await updateTokenInDB(env, token);
    await wsClient.emit(
      `global`,
      "updateToken",
      sanitizeTokenForWebSocket(convertTokenDataToDBData(token)),
    );

    return { found: true, tokenAddress: mintAddress, event: "curveComplete" };
  } catch (err) {
    logger.error(`Error in curve complete handler: ${err}`);
    return null;
  }
}

export async function cron(
  env: Env,
  ctx: ExecutionContext | { cron: string },
): Promise<void> {
  console.log("Running cron job...");
  try {
    // Check if this is a legitimate Cloudflare scheduled trigger
    // For scheduled triggers, the ctx should have a 'cron' property
    const _ctx = ctx as any; // Use type assertion as a workaround
    const isScheduledEvent = typeof _ctx.cron === "string";

    if (!isScheduledEvent) {
      logger.warn(
        "Rejected direct call to cron function - not triggered by scheduler",
      );
      return; // Exit early without running the scheduled tasks
    }

    // Log the cron pattern being executed
    const cronPattern = (_ctx as { cron: string }).cron;
    logger.log(`Running scheduled tasks for cron pattern: ${cronPattern}...`);
    await updateTokens(env);
  } catch (error) {
    logger.error("Error in cron job:", error);
  }
}

export async function updateTokens(env: Env) {
  const db = getDB(env);
  logger.log("Starting updateTokens cron task...");

  // Fetch active tokens with necessary fields
  const activeTokens = await db
    .select({
      mint: tokens.mint,
      imported: tokens.imported,
      description: tokens.description,
      id: tokens.id,
      name: tokens.name,
      ticker: tokens.ticker,
      url: tokens.url,
      image: tokens.image,
      twitter: tokens.twitter,
      telegram: tokens.telegram,
      website: tokens.website,
      discord: tokens.discord,
      farcaster: tokens.farcaster,
      creator: tokens.creator,
      nftMinted: tokens.nftMinted,
      lockId: tokens.lockId,
      lockedAmount: tokens.lockedAmount,
      lockedAt: tokens.lockedAt,
      harvestedAt: tokens.harvestedAt,
      status: tokens.status,
      createdAt: tokens.createdAt,
      lastUpdated: tokens.lastUpdated,
      completedAt: tokens.completedAt,
      withdrawnAt: tokens.withdrawnAt,
      migratedAt: tokens.migratedAt,
      marketId: tokens.marketId,
      baseVault: tokens.baseVault,
      quoteVault: tokens.quoteVault,
      withdrawnAmount: tokens.withdrawnAmount,
      reserveAmount: tokens.reserveAmount,
      reserveLamport: tokens.reserveLamport,
      virtualReserves: tokens.virtualReserves,
      liquidity: tokens.liquidity,
      currentPrice: tokens.currentPrice,
      marketCapUSD: tokens.marketCapUSD,
      tokenPriceUSD: tokens.tokenPriceUSD,
      solPriceUSD: tokens.solPriceUSD,
      curveProgress: tokens.curveProgress,
      curveLimit: tokens.curveLimit,
      priceChange24h: tokens.priceChange24h,
      price24hAgo: tokens.price24hAgo,
      volume24h: tokens.volume24h,
      inferenceCount: tokens.inferenceCount,
      lastVolumeReset: tokens.lastVolumeReset,
      lastPriceUpdate: tokens.lastPriceUpdate,
      holderCount: tokens.holderCount,
      txId: tokens.txId,
      migration: tokens.migration,
      withdrawnAmounts: tokens.withdrawnAmounts,
      poolInfo: tokens.poolInfo,
      lockLpTxId: tokens.lockLpTxId,
      featured: tokens.featured,
      verified: tokens.verified,
      hidden: tokens.hidden,
      tokenSupply: tokens.tokenSupply,
      tokenSupplyUiAmount: tokens.tokenSupplyUiAmount,
      tokenDecimals: tokens.tokenDecimals,
      lastSupplyUpdate: tokens.lastSupplyUpdate,
    })
    .from(tokens)
    .where(eq(tokens.status, "active"));

  logger.log(`Found ${activeTokens.length} active tokens to process.`);

  await Promise.all([
    // Update Market Data
    (async () => {
      try {
        const CHUNK_SIZE = 50;
        const total = activeTokens.length;
        for (let i = 0; i < total; i += CHUNK_SIZE) {
          const batch = activeTokens.slice(i, i + CHUNK_SIZE) as Token[];
          const updatedBatch = await bulkUpdatePartialTokens(batch, env);
          logger.log(`Cron: Updated prices for batch ${Math.floor(i/CHUNK_SIZE)+1} (${updatedBatch.length}/${batch.length}) tokens`);
        }
        logger.log(`Cron: Completed price updates for ${total} tokens in batches of ${CHUNK_SIZE}`);
      } catch (err) {
        logger.error("Cron: Error during bulkUpdatePartialTokens:", err);
      }
    })(),

    // Update Holders Cache
    (async () => {
      logger.log("Cron: Starting holder cache update loop...");
      for (const token of activeTokens) {
        try {
          if (token.mint) {
            await updateHoldersCache(env, token.mint);
          }
        } catch (err) {
          logger.error(
            `Cron: Error updating holders for token ${token.mint}:`,
            err,
          );
        }
      }
      logger.log("Cron: Finished holder cache update loop.");
    })(),

    // Replenish Pre-Generated Tokens
    (async () => {
      try {
        await checkAndReplenishTokens(env);
        logger.log("Cron: Checked and replenished pre-generated tokens.");
      } catch (err) {
        logger.error("Cron: Error during checkAndReplenishTokens:", err);
      }
    })(),

    // Check/Generate Missing Images
    (async () => {
      logger.log("Cron: Starting check for missing generation images...");
      for (const token of activeTokens) {
        if (token.mint && Number(token.imported) === 0) {
          try {
            if (env.R2) {
              const generationImagesPrefix = `generations/${token.mint}/`;
              const objects = await env.R2.list({
                prefix: generationImagesPrefix,
                limit: 1,
              });
              const hasGenerationImages = objects.objects.length > 0;

              if (!hasGenerationImages) {
                logger.log(
                  `Cron: Triggering image generation for: ${token.mint}`,
                );
                await generateAdditionalTokenImages(
                  env,
                  token.mint,
                  token.description || "",
                );
              }
            } else {
              logger.warn(
                "Cron: R2 storage not configured, skipping image check.",
              );
              break; // No need to check further tokens if R2 isn't there
            }
          } catch (imageCheckError) {
            logger.error(
              `Cron: Error checking/generating images for ${token.mint}:`,
              imageCheckError,
            );
          }
        }
      }
      logger.log("Cron: Finished checking for missing generation images.");
    })(),
  ]);

  logger.log("Finished updateTokens cron task.");
}
