import { ExecutionContext } from "@cloudflare/workers-types/experimental";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { eq, sql } from "drizzle-orm";
import { TokenData, TokenDBData } from "../worker/raydium/types/tokenData";
import { getLatestCandle } from "./chart";
import { getDB, swaps, Token, tokens } from "./db";
import { Env } from "./env";
import { logger } from "./logger";
import { calculateTokenMarketData, getSOLPrice } from "./mcap";
import { awardGraduationPoints, awardUserPoints } from "./points/helpers";
import { TokenMigrator } from "./raydium/migration/migrateToken";
import { getToken } from "./raydium/migration/migrations";
import * as raydium_vault_IDL from "./raydium/raydium_vault.json";
import { RaydiumVault } from "./raydium/types/raydium_vault";
import { checkAndReplenishTokens } from "./routes/generation";
import { updateHoldersCache } from "./routes/token";
import * as IDL from "./target/idl/autofun.json";
import { Autofun } from "./target/types/autofun";
import { Wallet } from "./tokenSupplyHelpers/customWallet";
import {
  bulkUpdatePartialTokens,
  calculateFeaturedScore,
  createNewTokenData,
  getFeaturedMaxValues,
} from "./util";
import { getWebSocketClient } from "./websocket-client";

// Store the last processed signature to avoid duplicate processing
const lastProcessedSignature: string | null = null;

function convertTokenDataToDBData(
  tokenData: Partial<TokenData>,
): Partial<TokenDBData> {
  const now = new Date()
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
        }
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
      .values(newToken as Token);

    await updateHoldersCache(env, rawTokenAddress);

    // Emit the event to all clients
    /**
     * TODO: if this event is emitted before the create-token endpoint finishes its
     * DB update, it seems to corrupt the system and the new token won't ever show on the homepage
     */
    await wsClient.emit("global", "newToken", newToken);

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
        volume24h: sql`COALESCE(${tokens.volume24h}, 0) + ${direction === "1"
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

    const bondStatus = newToken?.status === "bonded" ? "postbond" : "prebond";
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
      const count = await db
        .select()
        .from(swaps)
        .where(eq(swaps.tokenMint, mintAddress))
        .limit(2)
        .execute();
      if (count.length === 1) {
        await awardUserPoints(env, swapRecord.user, {
          type: "first_buyer",
        });
      }
    }

    /** End of point system */

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
    const autofunProgram = new Program<Autofun>(IDL as any, provider);

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
    await tokenMigrator.migrateToken(token);

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
    const isScheduledEvent = "cron" in ctx && typeof ctx.cron === "string";

    if (!isScheduledEvent) {
      logger.warn(
        "Rejected direct call to cron function - not triggered by scheduler",
      );
      return; // Exit early without running the scheduled tasks
    }

    // Log the cron pattern being executed
    const cronPattern = (ctx as { cron: string }).cron;
    logger.log(`Running scheduled tasks for cron pattern: ${cronPattern}...`);
    await updateTokens(env);
  } catch (error) {
    logger.error("Error in cron job:", error);
  }
}

export async function updateTokens(env: Env) {
  // Then update token prices
  const db = getDB(env);
  const activeTokens = await db
    .select()
    .from(tokens)
    .where(eq(tokens.status, "active"));

  await Promise.all([
    (async () => {
      const updatedTokens = await bulkUpdatePartialTokens(activeTokens, env);
      logger.log(`Updated prices for ${updatedTokens.length} tokens`);
    })(),
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
          logger.error(`Error updating holders for token ${token.mint}:`, err);
        }
      }
    })(),
    (async () => {
      await checkAndReplenishTokens(env);
    })(),
  ]);
}
