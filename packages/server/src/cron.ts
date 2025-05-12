import {
  TokenData,
  TokenDBData,
} from "@autodotfun/raydium/src/types/tokenData";
import * as idlJson from "@autodotfun/types/idl/autofun.json";
import * as raydium_vault_IDL_JSON from "@autodotfun/types/idl/raydium_vault.json";
import { Autofun } from "@autodotfun/types/types/autofun";
import { RaydiumVault } from "@autodotfun/types/types/raydium_vault";
import { S3Client } from "@aws-sdk/client-s3"; // S3 Import
import { eq, sql } from "drizzle-orm";
import { Buffer } from "node:buffer"; // Buffer import
import crypto from "node:crypto"; // Import crypto for lock value
import { getLatestCandle } from "./chart";
import { getDB, Token, tokens } from "./db";
import { ExternalToken } from "./externalToken";
import { checkAndReplenishTokens } from "./generation";
import { calculateTokenMarketData, getSOLPrice } from "./mcap";
import { getToken } from "./migration/migrations";
import { awardGraduationPoints, awardUserPoints } from "./points";
import { getGlobalRedisCache, RedisCacheService } from "./redis";
import { updateHoldersCache } from "./tokenSupplyHelpers";
import {
  calculateFeaturedScore,
  createNewTokenData,
  getFeaturedMaxValues,
  logger,
} from "./util";
import { getWebSocketClient, WebSocketClient } from "./websocket-client";

export function sanitizeTokenForWebSocket(
  token: Partial<Token>,
  maxBytes = 95000
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
  tokenData: Partial<TokenData>
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
  tokenData: Partial<TokenData>
): Promise<Token> {
  const db = getDB();
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
  logs: string[],
  signature: string,
  wsClient?: WebSocketClient
): Promise<ProcessResult> {
  if (!wsClient) {
    wsClient = getWebSocketClient();
  }
  console.log("Processing transaction logs:", logs);
  try {
    await handleNewToken(logs, signature, wsClient);
  } catch (err) {
    logger.info(`Error in NewToken handler: ${err}`);
  }
  try {
    await handleSwap(logs, signature, wsClient);
  } catch (err) {
    logger.info(`Error in Swap handler: ${err}`);
  }
  try {
    await handleCurveComplete(logs, signature, wsClient);
  } catch (err) {
    logger.info(`Error in CurveComplete handler: ${err}`);
  }

  return { found: false };
}

async function handleNewToken(
  logs: string[],
  signature: string,
  wsClient: WebSocketClient
): Promise<HandlerResult> {
  const newTokenLog = logs.find((log) => log.includes("NewToken:"));
  if (!newTokenLog) return null;
  const curveLog = logs.find((log) => log.includes("curve_limit:"));
  const reserveLog = logs.find((log) => log.includes("reserve_lamport:"));
  try {
    const parts = newTokenLog.split(" ");
    if (parts.length < 2)
      throw new Error(`Invalid NewToken log: ${newTokenLog}`);

    const rawTokenAddress = parts[parts.length - 2].replace(/[",)]/g, "");
    const rawCreatorAddress = parts[parts.length - 1].replace(/[",)]/g, "");
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(rawTokenAddress)) {
      throw new Error(`Malformed token address: ${rawTokenAddress}`);
    }

    let curveLimit: number | null = null;
    let reserveLamport: number | null = null;
    if (curveLog) {
      const curveValue = curveLog.split("curve_limit:")[1].trim();
      curveLimit = parseInt(curveValue);
      console.log("Parsed curve_limit:", curveLimit);
    }

    if (reserveLog) {
      const reserveValue = reserveLog.split("reserve_lamport:")[1].trim();
      reserveLamport = parseInt(reserveValue);
      console.log("Parsed reserve_lamport:", reserveLamport);
    }
    if (curveLimit === null || reserveLamport === null) {
      logger.error("Missing curve_limit or reserve_lamport in logs");
      return null;
    }

    if (curveLimit < 113000000000) {
      logger.error(
        `Token curve_limit ${curveLimit} is below minimum required 113000000000`
      );
      return null;
    }

    if (reserveLamport < 28000000000) {
      logger.error(
        `Token reserve_lamport ${reserveLamport} is below minimum required 28000000000`
      );
      return null;
    }

    const newToken = await createNewTokenData(
      signature,
      rawTokenAddress,
      rawCreatorAddress
    );
    if (newToken.tokenSupplyUiAmount !== 1000000000) {
      logger.error(
        `Token supply is not 1 billion for ${rawTokenAddress}: ${newToken.tokenSupplyUiAmount}`
      );
      return null;
    }
    if (!newToken) {
      logger.error(`Failed to create new token data for ${rawTokenAddress}`);
      return null;
    }
    await getDB()
      .insert(tokens)
      .values([newToken as Token])
      .onConflictDoNothing();
    await wsClient.emit(
      "global",
      "newToken",
      sanitizeTokenForWebSocket(newToken)
    );
    await updateHoldersCache(rawTokenAddress);

    return { found: true, tokenAddress: rawTokenAddress, event: "newToken" };
  } catch (err) {
    logger.error(`Error in NewToken handler: ${err}`);
    return null;
  }
}

async function handleSwap(
  logs: string[],
  signature: string,
  wsClient: WebSocketClient
): Promise<HandlerResult | null> {
  const mintLog = logs.find((log) => log.includes("Mint:"));
  const swapLog = logs.find((log) => log.includes("Swap:"));
  const reservesLog = logs.find((log) => log.includes("Reserves:"));
  const feeLog = logs.find((log) => log.includes("Fee:"));
  const swapeventLog = logs.find((log) => log.includes("SwapEvent:"));

  if (mintLog && swapLog && reservesLog && swapeventLog) {
    try {
      const mintAddress = mintLog?.match(/Mint:\s*([A-Za-z0-9]+)/)?.[1];
      const swapMatch = swapLog?.match(
        /Swap:\s+([A-Za-z0-9]+)\s+(\d+)\s+(\d+)/
      );
      const user = swapMatch?.[1];
      const direction = swapMatch?.[2];
      const amount = swapMatch?.[3];

      const amountOut = swapeventLog?.match(
        /SwapEvent:\s+\S+\s+\d+\s+(\d+)/
      )?.[1];
      const reserveMatch = reservesLog?.match(/Reserves:\s*(\d+)\s+(\d+)/);
      const reserveToken = reserveMatch?.[1];
      const reserveLamport = reserveMatch?.[2];
      console.log("found swap log", {
        mintAddress,
        swapMatch,
        user,
        direction,
        amount,
        amountOut,
        reserveMatch,
      });
      if (
        !mintAddress ||
        !swapMatch ||
        !user ||
        !direction ||
        !amount ||
        !amountOut ||
        !reserveMatch
      ) {
        logger.error(`Invalid swap log: ${swapLog}`);
        return null;
      }

      // Retrieve token mint info to get decimals.
      console.log("fetching token mint info", mintAddress);
      const tokenWithSupply = await getToken(mintAddress);
      console.log("fetched token mint info", tokenWithSupply);
      if (!tokenWithSupply) {
        logger.error(`Token not found: ${mintAddress}`);
        return null;
      }
      const solPrice = await getSOLPrice();
      console.log("fetched sol price", solPrice);

      const TOKEN_DECIMALS = tokenWithSupply.tokenDecimals || 6;
      const tokenAmount = Number(reserveToken) / 10 ** TOKEN_DECIMALS;
      const solAmount = Number(reserveLamport) / 1e9;
      const currentPrice = solAmount / tokenAmount;
      const tokenPriceInSol = currentPrice / 10 ** TOKEN_DECIMALS;
      const tokenPriceUSD =
        currentPrice > 0
          ? tokenPriceInSol * solPrice * 10 ** TOKEN_DECIMALS
          : 0;

      tokenWithSupply.tokenPriceUSD = tokenPriceUSD;
      tokenWithSupply.currentPrice = currentPrice;

      const tokenWithMarketData = await calculateTokenMarketData(
        tokenWithSupply,
        solPrice
      );
      console.log("fetched token market data", tokenWithMarketData);
      const marketCapUSD = tokenWithMarketData.marketCapUSD;
      const price =
        direction === "1"
          ? Number(amountOut) / 1e9 / (Number(amount) / 10 ** TOKEN_DECIMALS)
          : Number(amount) / 1e9 / (Number(amountOut) / 10 ** TOKEN_DECIMALS);
      const priceUsd = price * solPrice;
      const swapRecord = {
        id: crypto.randomUUID(),
        tokenMint: mintAddress,
        solAmount,
        tokenAmount,
        user,
        type: direction === "0" ? "buy" : ("sell" as any),
        direction: parseInt(direction) as 1 | 0,
        amountIn: Number(amount),
        amountOut: Number(amountOut),
        price: price,
        priceUsd: priceUsd,
        txId: signature,
        timestamp: new Date(),
      };

      const db = getDB();
      const redisCache = await getGlobalRedisCache();
      const listKey = `swapsList:${mintAddress}`;
      console.log(`Adding swap to Redis list ${listKey}`);

      const ext = await ExternalToken.create(mintAddress, redisCache);
      await ext.insertProcessedSwaps([swapRecord]);
      console.log(`sending swap to the user ${mintAddress}`);
      await wsClient.emit(`token-${mintAddress}`, "newSwap", {
        ...swapRecord,
        tokenMint: mintAddress,
        mint: mintAddress,
        timestamp: swapRecord.timestamp.toISOString(),
      });

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
            ((Number(reserveLamport) - Number(process.env.VIRTUAL_RESERVES)) /
              (Number(process.env.CURVE_LIMIT) -
                Number(process.env.VIRTUAL_RESERVES))) *
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
      console.log("updating the holder cache", mintAddress);
      await updateHoldersCache(mintAddress, false);

      const newToken = updatedTokens[0];
      const usdVolume =
        direction === "1"
          ? (Number(amount) / 10 ** TOKEN_DECIMALS) * tokenPriceUSD
          : (Number(amountOut) / 10 ** TOKEN_DECIMALS) * tokenPriceUSD;

      const bondStatus = newToken?.status === "locked" ? "postbond" : "prebond";
      console.log("awarding user points", swapRecord.user);
      try {
        await awardUserPoints(swapRecord.user, {
          type: `${bondStatus}_${swapRecord.type}` as any,
          usdVolume,
        });
      } catch (err) {
        logger.error("Failed to award user points:", err);
      }
      try {
        await awardUserPoints(swapRecord.user, {
          type: "trade_volume_bonus",
          usdVolume,
        });
      } catch (err) {
        logger.error("Failed to award trade volume bonus:", err);
      }

      try {
        const listLength = await redisCache.llen(listKey);
        if (swapRecord.type === "buy" && listLength === 1) {
          await awardUserPoints(swapRecord.user, {
            type: "first_buyer",
          });
          logger.log(`Awarded first_buyer to ${swapRecord.user}`);
        }
      } catch (err) {
        logger.error("Failed to award first_buyer:", err);
      }

      const latestCandle = await getLatestCandle(mintAddress, swapRecord);
      console.log("fetched latest candle", latestCandle);
      await wsClient.to(`token-${mintAddress}`).emit("newCandle", latestCandle);
      const { maxVolume, maxHolders } = await getFeaturedMaxValues(db);
      const enrichedToken = {
        ...newToken,
        featuredScore: calculateFeaturedScore(newToken, maxVolume, maxHolders),
      };

      await wsClient
        .to(`token-${mintAddress}`)
        .emit("updateToken", sanitizeTokenForWebSocket(enrichedToken));
      console.log("updated the token in DB", mintAddress);
      return {
        found: true,
        tokenAddress: mintAddress,
        event: "swap",
      };
    } catch (err) {
      logger.error(`Error in Swap handler: ${err}`);
      return null;
    }
  } else {
    logger.log("Swap log not found or incomplete.");
    return null;
  }
}

async function handleCurveComplete(
  logs: string[],
  signature: string,
  wsClient: WebSocketClient
): Promise<HandlerResult> {
  const completeLog = logs.find((log) => log.includes("curve is completed"));
  const mintLog = logs.find((log) => log.includes("Mint:"));
  if (!completeLog || !mintLog) return null;

  try {
    const mintAddress = mintLog.split("Mint:")[1].trim().replace(/[",)]/g, "");
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(mintAddress)) {
      throw new Error(`Invalid mint on curve completion: ${mintAddress}`);
    }
    if (logs.some((l) => /Failed.*custom program error/i.test(l))) {
      logger.warn(
        `Curve complete aborted due to program failure: ${logs.join(" | ")}`
      );
      return null;
    }
    await awardGraduationPoints(mintAddress);
    const token = await getToken(mintAddress);
    if (!token) {
      logger.error(`Token not found: ${mintAddress}`);
      return null;
    }
    const tokenData: Partial<TokenData> = {
      mint: mintAddress,
      status: "migrating",
      lastUpdated: new Date().toISOString(),
    };

    await updateTokenInDB({
      ...token,
      ...tokenData,
    });
    await wsClient.emit(
      `token-${mintAddress}`,
      "updateToken",
      sanitizeTokenForWebSocket(convertTokenDataToDBData(token))
    );

    return { found: true, tokenAddress: mintAddress, event: "curveComplete" };
  } catch (err) {
    logger.error(`Error in curve complete handler: ${err}`);
    return null;
  }
}

// Renamed to be the primary export for cron tasks
export async function runCronTasks() {
  await checkAndReplenishTokens();
}
