import { ExecutionContext } from "@cloudflare/workers-types/experimental";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import { eq, sql } from "drizzle-orm";
import { TokenData, TokenDBData } from "../worker/raydium/types/tokenData";
import { getLatestCandle } from "./chart";
import { getDB, Token, tokens } from "./db";
import { Env } from "./env";
import { calculateTokenMarketData, getSOLPrice } from "./mcap";
import { awardGraduationPoints, awardUserPoints } from "./points/helpers";
import { TokenMigrator } from "./raydium/migration/migrateToken";
import { getToken } from "./raydium/migration/migrations";
import * as raydium_vault_IDL from "./raydium/raydium_vault.json";
import { RaydiumVault } from "./raydium/types/raydium_vault";
import { createRedisCache } from "./redis/redisCacheService";
import {
  checkAndReplenishTokens,
  generateAdditionalTokenImages,
} from "./routes/generation";
import { updateHoldersCache } from "./routes/token";
import * as IDL from "./target/idl/autofun.json";
import { Autofun } from "./target/types/autofun";
import { Wallet } from "./tokenSupplyHelpers/customWallet";
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

// Function to process transaction logs and extract token events
export async function processTransactionLogs(
  env: Env,
  logs: string[],
  signature: string,
  wsClient: any = null,
): Promise<{ found: boolean; tokenAddress?: string; event?: string }> {
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

    // Update the database
    const newToken = await createNewTokenData(
      signature,
      rawTokenAddress,
      rawCreatorAddress,
      env,
    );
    await getDB(env)
      .insert(tokens)
      .values(newToken as Token)
      .onConflictDoNothing()
      .returning();

    await wsClient.emit("global", "newToken", { mint: newToken.mint });

    await updateHoldersCache(env, rawTokenAddress);

    // Emit the event to all clients
    /**
     * TODO: if this event is emitted before the create-token endpoint finishes its
     * DB update, it seems to corrupt the system and the new token won't ever show on the homepage
     */

    result = {
      found: true,
      tokenAddress: rawTokenAddress,
      event: "newToken",
    };
  }

  // Handle swap events
  if (mintLog && swapLog && reservesLog && feeLog) {
    console.log("Swap event detected");
    console.log("swapLog", swapLog);

    const mintParts = mintLog.split("Mint:");
    if (mintParts.length < 2) {
      logger.error(`Invalid Mint log format: ${mintLog}`);
      return result;
    }
    const mintAddress = mintParts[1].trim().replace(/[",)]/g, "");

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

    await updateHoldersCache(env, mintAddress);

    // Extract user, direction, amount with validation
    const swapParts = swapLog.split(" ");
    if (swapParts.length < 3) {
      logger.error(`Invalid Swap log format: ${swapLog}`);
      return result;
    }

    const user = swapParts[swapParts.length - 3].replace(/[",)]/g, "");
    const direction = swapParts[swapParts.length - 2].replace(/[",)]/g, "");
    const amount = swapParts[swapParts.length - 1].replace(/[",)]/g, "");

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

    // Extract reserveToken and reserveLamport with validation
    const reservesParts = reservesLog.split(" ");
    if (reservesParts.length < 2) {
      logger.error(`Invalid Reserves log format: ${reservesLog}`);
      return result;
    }

    const reserveToken = reservesParts[reservesParts.length - 2].replace(
      /[",)]/g,
      "",
    );
    const reserveLamport = reservesParts[reservesParts.length - 1].replace(
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

    const [_usr, _dir, amountOut] = swapeventLog!
      .split(" ")
      .slice(-3)
      .map((s) => s.replace(/[",)]/g, ""));

    // Get SOL price for calculations
    const solPrice = await getSOLPrice(env);
    const tokenWithSupply = await getToken(env, mintAddress);
    if (!tokenWithSupply) {
      logger.error(`Token not found in database: ${mintAddress}`);
      return result;
    }

    // Calculate price based on reserves
    const TOKEN_DECIMALS = tokenWithSupply?.tokenDecimals || 6;
    const SOL_DECIMALS = 9;
    const tokenAmountDecimal =
      Number(reserveToken) / Math.pow(10, TOKEN_DECIMALS);
    const lamportDecimal = Number(reserveLamport) / 1e9;
    const currentPrice = lamportDecimal / tokenAmountDecimal;
    console.log("currentPrice", currentPrice);
    const tokenPriceInSol = currentPrice / Math.pow(10, TOKEN_DECIMALS);
    const tokenPriceUSD =
      currentPrice > 0
        ? tokenPriceInSol * solPrice * Math.pow(10, TOKEN_DECIMALS)
        : 0;
    tokenWithSupply.tokenPriceUSD = tokenPriceUSD;
    tokenWithSupply.currentPrice = currentPrice;

    const tokenWithMarketData = await calculateTokenMarketData(
      tokenWithSupply,
      solPrice,
      env,
    );
    console.log("tokenWithMarketData", tokenWithMarketData);

    const marketCapUSD = tokenWithMarketData.marketCapUSD;

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
      timestamp: new Date(),
    };

    // Insert the swap record
    const db = getDB(env);
    const redisCache = createRedisCache(env);
    const listKey = redisCache.getKey(`swapsList:${mintAddress}`);
    try {
      await redisCache.lpush(listKey, JSON.stringify(swapRecord));
      await redisCache.ltrim(listKey, 0, MAX_SWAPS_TO_KEEP - 1);
      logger.log(
        `Saved swap to Redis list ${listKey} & trimmed. Type: ${direction === "0" ? "buy" : "sell"}`,
      );
    } catch (redisError) {
      logger.error(`Failed to save swap to Redis list ${listKey}:`, redisError);
      // Decide if we should proceed without saving swap history
    }

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
          (Number(reserveToken) / Math.pow(10, TOKEN_DECIMALS)) * tokenPriceUSD,
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
            ? (Number(amount) / Math.pow(10, TOKEN_DECIMALS)) * tokenPriceUSD
            : (Number(amountOut) / Math.pow(10, TOKEN_DECIMALS)) * tokenPriceUSD
        }`,
      })
      .where(eq(tokens.mint, mintAddress))
      .returning();
    const newToken = token[0];

    /** Point System  modification*/
    const usdVolume =
      swapRecord.type === "buy"
        ? (swapRecord.amountOut / Math.pow(10, TOKEN_DECIMALS)) * tokenPriceUSD
        : (swapRecord.amountIn / Math.pow(10, TOKEN_DECIMALS)) * tokenPriceUSD;

    const bondStatus = newToken?.status === "locked" ? "postbond" : "prebond";
    if (swapRecord.type === "buy") {
      await awardUserPoints(env, swapRecord.user, {
        type: bondStatus === "prebond" ? "prebond_buy" : "postbond_buy",
        usdVolume,
      });
    } else {
      await awardUserPoints(env, swapRecord.user, {
        type: bondStatus === "prebond" ? "prebond_sell" : "postbond_sell",
        usdVolume,
      });
    }
    // volume bonus
    await awardUserPoints(env, swapRecord.user, {
      type: "trade_volume_bonus",
      usdVolume,
    });

    //first buyer
    if (swapRecord.type === "buy") {
      // check if this is the very first swap on this mint
      try {
        const listLength = await redisCache.llen(listKey);
        if (listLength === 1) {
          // If only the current swap is in the list
          await awardUserPoints(env, swapRecord.user, {
            type: "first_buyer",
          });
          logger.log(
            `Awarded 'first_buyer' points to ${swapRecord.user} for ${mintAddress}`,
          );
        }
      } catch (redisError) {
        logger.error(
          `Failed to check Redis list length for first_buyer points on ${listKey}:`,
          redisError,
        );
      }
    }

    /** End of point system */

    // Update holders data immediately after a swap
    await updateHoldersCache(env, mintAddress);

    // Emit event to all clients via WebSocket
    await wsClient.emit(`token-${mintAddress}`, "newSwap", {
      ...swapRecord,
      mint: mintAddress, // Add mint field for compatibility
      timestamp: swapRecord.timestamp.toISOString(), // Convert Date to ISO string for emission
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
      featuredScore: calculateFeaturedScore(newToken, maxVolume, maxHolders),
    };

    await wsClient
      .to(`token-${swapRecord.tokenMint}`)
      .emit("updateToken", enrichedToken);

    await wsClient.to("global").emit("updateToken", enrichedToken);

    result = { found: true, tokenAddress: mintAddress, event: "swap" };
  }

  // Handle migration/curve completion events
  if (completeEventLog && mintLog) {
    const mintParts = mintLog.split("Mint:");
    if (mintParts.length < 2) {
      logger.error(`Invalid Mint log format in curve completion: ${mintLog}`);
      return result;
    }
    const mintAddress = mintParts[1].trim().replace(/[",)]/g, "");

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

    logger.log(`Curve completion detected for ${mintAddress}`);

    // Update token status
    const tokenData: Partial<TokenData> = {
      mint: mintAddress,
      status: "migrating",
      lastUpdated: new Date().toISOString(),
    };

    const connection = new Connection(
      env.NETWORK === "devnet"
        ? env.DEVNET_SOLANA_RPC_URL
        : env.MAINNET_SOLANA_RPC_URL,
    );
    const wallet = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(env.WALLET_PRIVATE_KEY)),
    );
    const provider = new AnchorProvider(
      connection,
      new Wallet(wallet),
      AnchorProvider.defaultOptions(),
    );
    const program = new Program<RaydiumVault>(
      raydium_vault_IDL as any,
      provider,
    );
    const autofunProgram = new Program<Autofun>(IDL, provider);

    const tokenMigrator = new TokenMigrator(
      env,
      connection,
      new Wallet(wallet),
      program,
      autofunProgram,
      provider,
    );
    const token = await getToken(env, mintAddress);
    if (!token) {
      logger.error(`Token not found in database: ${mintAddress}`);
      return result;
    }

    /** Point System */
    await awardGraduationPoints(env, mintAddress);
    /** End of point system */

    // Update in database
    await updateTokenInDB(env, tokenData);
    // migrate token
    // await tokenMigrator.migrateToken(token);

    // Notify clients
    await wsClient.emit(`token-${mintAddress}`, "updateToken", tokenData);

    result = {
      found: true,
      tokenAddress: mintAddress,
      event: "curveComplete",
    };
  }

  return result;
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
        // Pass the fetched tokens (cast needed because select specifies columns)
        const updatedTokens = await bulkUpdatePartialTokens(
          activeTokens as Token[],
          env,
        );
        logger.log(`Cron: Updated prices for ${updatedTokens.length} tokens`);
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
