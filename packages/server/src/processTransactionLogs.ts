import * as IDL from "@autodotfun/types/idl/autofun.json";
import * as raydium_vault_IDL from "@autodotfun/types/idl/raydium_vault.json";
import { Autofun } from "@autodotfun/types/types/autofun";
import { RaydiumVault } from "@autodotfun/types/types/raydium_vault";
import { TokenData, TokenDBData } from "@autodotfun/raydium/src/types/tokenData";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import { eq, sql } from "drizzle-orm";
import { getDB, Token, tokens } from "./db";
import { logger } from "./logger";
import { getSOLPrice } from "./mcap";
import { TokenMigrator } from "./migration/migrateToken";
import { getToken } from "./migration/migrations";
import { createRedisCache } from "./redis";
import { Wallet } from "./tokenSupplyHelpers/customWallet";
import { createNewTokenData, } from "./util";
import { getWebSocketClient } from "./websocket-client";
import { processTokenUpdateEvent } from "./routes/token";

// Define max swaps to keep in Redis list (consistent with worker)
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
   tokenData: Partial<TokenData>,
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
            }
         ])
         .returning();
      logger.log(`Added new token ${updateData.mint} to database`);
   }

   return updatedTokens[0];
}

export async function processTransactionLogs(
   logs: string[],
   signature: string,
): Promise<{
   found: boolean;
   events: Array<{ tokenAddress: string; event: string }>;
}> {
   try {
      const events: Array<{ tokenAddress: string; event: string }> = [];

      const swapLog = logs.find((log) => log.includes("Swap:"));
      const reservesLog = logs.find((log) => log.includes("Reserves:"));
      const feeLog = logs.find((log) => log.includes("fee:"));
      const swapeventLog = logs.find((log) => log.includes("SwapEvent:"));
      const mintLog = logs.find((log) => log.includes("Mint:"));
      const newTokenLog = logs.find((log) => log.includes("NewToken:"));
      const completeEventLog = logs.find((log) =>
         log.includes("curve is completed"),
      );

      // --- Swap handler ---
      if (mintLog && swapLog && reservesLog && feeLog && swapeventLog) {
         try {
            console.log("Swap event detected", swapLog);

            // extract mintAddress
            const mintAddress = mintLog.split("Mint:")[1].trim().replace(/[",)]/g, "");
            if (
               !/^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/.test(
                  mintAddress,
               )
            ) {
               throw new Error(`Invalid mint address format: ${mintAddress}`);
            }

            // extract swap parts
            const parts = swapLog.split(" ");
            const user = parts[parts.length - 3].replace(/[",)]/g, "");
            const direction = parts[parts.length - 2].replace(/[",)]/g, "");
            const amount = parts[parts.length - 1].replace(/[",)]/g, "");
            if (!user || !["0", "1"].includes(direction) || isNaN(Number(amount))) {
               throw new Error(`Invalid swap data: ${swapLog}`);
            }

            // extract reserves
            const rparts = reservesLog.split(" ");
            const reserveToken = rparts[rparts.length - 2].replace(/[",)]/g, "");
            const reserveLamport = rparts[rparts.length - 1].replace(/[",)]/g, "");
            if (
               isNaN(Number(reserveToken)) ||
               isNaN(Number(reserveLamport))
            ) {
               throw new Error(`Invalid reserves data: ${reservesLog}`);
            }

            // extract amountOut
            const amountOut = swapeventLog
               .split(" ")
               .slice(-3)[2]
               .replace(/[",)]/g, "");
            if (isNaN(Number(amountOut))) {
               throw new Error(`Invalid SwapEvent data: ${swapeventLog}`);
            }

            // price calculations
            const solPrice = await getSOLPrice();
            let tokenWithSupply = await getToken(mintAddress);
            if (!tokenWithSupply) {
               // … same "add missing token" logic …
               // then:
               tokenWithSupply = await getToken(mintAddress)!;
            }
            const TOKEN_DECIMALS = tokenWithSupply?.tokenDecimals || 6;
            const lamportDecimal = Number(reserveLamport) / 1e9;
            const tokenAmountDecimal = Number(reserveToken) / 10 ** TOKEN_DECIMALS;
            const currentPrice = lamportDecimal / tokenAmountDecimal;
            const tokenPriceUSD =
               currentPrice > 0
                  ? (currentPrice / 10 ** TOKEN_DECIMALS) * solPrice * 10 ** TOKEN_DECIMALS
                  : 0;

            const SOL_DECIMALS = 9;
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
            const db = getDB();
            const redisCache = createRedisCache();
            const listKey = `swapsList:${mintAddress}`;
            try {
               await redisCache.lpush(listKey, JSON.stringify(swapRecord));
               await redisCache.ltrim(listKey, 0, MAX_SWAPS_TO_KEEP - 1);
               logger.log(
                  `MigrationBE: Saved swap to Redis list ${listKey} & trimmed. Type: ${direction === "0" ? "buy" : "sell"}`,
               );
            } catch (redisError) {
               logger.error(`MigrationBE: Failed to save swap to Redis list ${listKey}:`, redisError);
            }

            // check if the token exists and add it to the db if it does not  
            // const token = await getToken(mintAddress);

            // Update token data in database
            await db
               .update(tokens)
               .set({
                  reserveAmount: Number(reserveToken),
                  reserveLamport: Number(reserveLamport),
                  currentPrice: currentPrice,
                  liquidity:
                     (Number(reserveLamport) / 1e9) * solPrice +
                     (Number(reserveToken) / Math.pow(10, TOKEN_DECIMALS)) * tokenPriceUSD,
                  tokenPriceUSD,
                  solPriceUSD: solPrice,
                  curveProgress:
                     ((Number(reserveLamport) - Number(process.env.VIRTUAL_RESERVES)) /
                        (Number(process.env.CURVE_LIMIT) - Number(process.env.VIRTUAL_RESERVES))) *
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





            events.push({ tokenAddress: mintAddress, event: "swap" });
         } catch (err: any) {
            logger.error(`Swap handler error: ${err.message}`);
         }
      }

      // --- NewToken handler ---
      if (newTokenLog) {
         try {
            const parts = newTokenLog.split(" ");
            if (parts.length < 2) {
               logger.error(`Invalid NewToken log format: ${newTokenLog}`);
               throw new Error(`Invalid NewToken log format: ${newTokenLog}`);
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
               throw new Error(
                  `Invalid address format in NewToken log: token=${rawTokenAddress}, creator=${rawCreatorAddress}`,
               );
            }

            logger.log(`New token detected: ${rawTokenAddress}`);

            // Update the database
            const newToken = await createNewTokenData(
               signature,
               rawTokenAddress,
               rawCreatorAddress,
            );

            // call the cf backend 
            (async () => {
               try {
                  await fetch(`${process.env.API_URL}/api/migration/addMissingTokens`, {
                     method: "POST",
                     headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${process.env.JWT_SECRET}`,
                     },
                     body: JSON.stringify({
                        signature,
                        rawTokenAddress,
                        rawCreatorAddress,
                     }),
                  });
                  logger.log(`add missing token for ${rawTokenAddress}`);
               } catch (httpErr) {
                  console.error(`[Withdraw] CF update failed:`, httpErr);
               }
            })();
            const inserted = await getDB()
               .insert(tokens)
               .values(newToken as Token)
               .onConflictDoNothing()
               .returning();

            // --- Emit WebSocket event for the new token --- START
            if (inserted && inserted.length > 0) {
               logger.log(`Emitting newToken WebSocket event for ${rawTokenAddress}`);
               // Use processTokenUpdateEvent to handle enrichment and emission
               await processTokenUpdateEvent(inserted[0], true, true);
            } else {
               logger.warn(`Token ${rawTokenAddress} might already exist or failed to insert, not emitting newToken event.`);
            }
            // --- Emit WebSocket event for the new token --- END

            events.push({ tokenAddress: rawTokenAddress, event: "newToken" });
         } catch (err: any) {
            logger.error(`NewToken handler error: ${err.message}`);
         }
      }

      // --- Curve‐completion handler ---
      if (completeEventLog && mintLog) {
         try {
            const mintParts = mintLog.split("Mint:");
            if (mintParts.length < 2) {
               logger.error(`Invalid Mint log format in curve completion: ${mintLog}`);
               return { found: false, events };
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
               return { found: false, events };
            }

            logger.log(`Curve completion detected for ${mintAddress}`);

            // Update token status
            const tokenData: Partial<TokenData> = {
               mint: mintAddress,
               status: "migrating",
               lastUpdated: new Date().toISOString(),
            };

            const connection = new Connection(
               process.env.NETWORK === "devnet"
                  ? process.env.DEVNET_SOLANA_RPC_URL || ""
                  : process.env.MAINNET_SOLANA_RPC_URL || "",
            );

            if (!process.env.WALLET_PRIVATE_KEY) {
               throw new Error("Wallet private key not found");
            }

            const wallet = Keypair.fromSecretKey(
               Uint8Array.from(JSON.parse(process.env.WALLET_PRIVATE_KEY)),
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
               connection,
               new Wallet(wallet),
               program,
               autofunProgram,
               provider,
            );
            const token = await getToken(mintAddress);
            if (!token) {
               throw new Error(
                  `Token not found in database: ${mintAddress}`,
               );
            }


            token.status = "migrating";
            // Update in database
            await updateTokenInDB(tokenData);
            // migrate token
            await tokenMigrator.migrateToken(token);

            // Notify clients
            // await wsClient.emit(`token-${mintAddress}`, "updateToken", tokenData);


            events.push({ tokenAddress: mintAddress, event: "curveComplete" });
         } catch (err: any) {
            logger.error(`Curve‐complete handler error: ${err.message}`);
         }
      }

      return {
         found: events.length > 0,
         events,
      };
   } catch (err) {
      logger.error(`Error processing transaction logs: ${err}`);
      return { found: false, events: [] };
   }
}


export async function addOneToken() {
   const env = process.env;
   const {
      signature,
      rawTokenAddress,
      rawCreatorAddress,
   } = {
      signature: "5QVEi1gWwjVThsjkru5jmzkXexsXB2qrqXk3yfZjmFED3RabTnZpKeyAhfaN4ttgBgypN45QzUt6W39FpRfUkFG8",
      rawTokenAddress: "GtahzPErC4ph3aAxgtgbp44gy41XnPsN5aWock9N3FUN",
      rawCreatorAddress: "EKnHbv7NEeKgsUwC1QjYrZ8LFgPmv3mXqZ75LyJPgdCJ",
   }
   const newToken = await createNewTokenData(
      signature,
      rawTokenAddress,
      rawCreatorAddress,
   );

   // call the cf backend 
   (async () => {
      try {
         await fetch(`${process.env.API_URL}/api/migration/addMissingTokens`, {
            method: "POST",
            headers: {
               "Content-Type": "application/json",
               "Authorization": `Bearer ${process.env.JWT_SECRET}`,
            },
            body: JSON.stringify({
               signature,
               rawTokenAddress,
               rawCreatorAddress,
            }),
         });
         logger.log(`new token update POSTed for ${rawTokenAddress}`);
      } catch (httpErr) {
         console.error(`[Withdraw] CF update failed:`, httpErr);
      }
   })();
   await getDB()
      .insert(tokens)
      .values(newToken as Token).onConflictDoNothing();
}

const list = [{
   "mint": "GNBe3at5NDpu45z1foWwrVfdxYhFA5dYWqNm2JMVSCAM",
   "creator": "DKM8aSR2t8or7UzA6kaCwYD2wPrUcPoDVvtqEdZ2aeMH",
   "signature": "333kTadpSPENQQnEeaAWfqZYaqWBkL4AV9Z8WWdM25ZEGDMVdGMuU8mdQtcG8MHWBN2YNCocd5biB2pd3NBxAKrL",
},
]
export async function migrateTokensFromList(
   connection: Connection,

) {
   // look for the token in the db if we do not have it add it
   // and then migrate it
   for (const mintAddress of list) {
      const token = await getToken(mintAddress.mint);
      if (!token) {
         logger.error(`Token not found in database: ${mintAddress}`);
         // createNewTokenData
         const newToken = await createNewTokenData(
            mintAddress.signature,
            mintAddress.mint,
            mintAddress.creator,
         );
         await getDB()
            .insert(tokens)
            .values(newToken as Token).onConflictDoNothing();
         logger.log(`Added new token ${mintAddress} to database`);
      }

   }

   if (!process.env.WALLET_PRIVATE_KEY) {
      throw new Error("Wallet private key not found");
   }

   const wallet = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(process.env.WALLET_PRIVATE_KEY)),
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
      connection,
      new Wallet(wallet),
      program,
      autofunProgram,
      provider,
   );


   for (const mintAddress of list) {
      const token = await getToken(mintAddress.mint);
      if (!token) {
         logger.error(`Token not found in database: ${mintAddress}`);
         continue;
      }
      token.status = "migrating";
      // Update in database
      await updateTokenInDB(token);
      // migrate token
      await tokenMigrator.migrateToken(token);
   }
}

