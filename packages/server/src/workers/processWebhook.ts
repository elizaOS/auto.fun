// processWebhook.ts
import { getDB, tokens } from "../db";
import { getGlobalRedisCache } from "../redis";
import { eq } from "drizzle-orm";
import { ExternalToken } from "../externalToken";
import { getLatestCandle } from "../chart";
import { getWebSocketClient } from "../websocket-client";
import { logger } from "../util";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import crypto from "node:crypto";
import { webSocketManager } from '../websocket-manager';

const JOB_QUEUE_KEY = "webhook:jobs";

async function workerLoop() {
   const redisCache = await getGlobalRedisCache();
   if (!await redisCache.isPoolReady()) {
      throw new Error("Redis pool is not ready");
   }

   // Ensure WebSocket manager is initialized
   if (!webSocketManager.redisCache) {
      await webSocketManager.initialize(redisCache);
   }
   const wsClient = getWebSocketClient();

   while (true) {
      try {
         // Block until a job arrives
         const result = await redisCache.redisPool.useClient((client) =>
            client.blpop(JOB_QUEUE_KEY, 0)
         );
         if (!result) {
            logger.warn("No job retrieved from the queue—continuing loop");
            continue;
         }
         const [, rawJob] = result;
         const swap = JSON.parse(rawJob);

         // Determine which side is SOL
         const token0IsSol =
            swap.token0Address === "So11111111111111111111111111111111111111112";
         const tokenMint = token0IsSol ? swap.token1Address : swap.token0Address;

         // Try to load token from cache or DB
         let token: any = null;
         const cacheKey = `codex-webhook:${tokenMint}`;
         const cached = await redisCache.get(cacheKey);
         if (cached) {
            token = JSON.parse(cached);
         } else {
            const db = getDB();
            const rows = await db
               .select()
               .from(tokens)
               .where(eq(tokens.mint, tokenMint))
               .limit(1)
               .execute();
            if (rows[0]) {
               token = rows[0];
               await redisCache.set(cacheKey, JSON.stringify(token), 60 * 60); // cache 1h
            }
         }
         if (!token) {
            logger.warn(`Token ${tokenMint} not found—skipping swap`);
            continue;
         }

         // 1) send newCandle
         try {
            logger.log(`Sending new candle for ${tokenMint}...`);
            const latestCandle = await getLatestCandle(tokenMint, swap, token);
            await wsClient.to("global").emit("newCandle", latestCandle);
         } catch (e) {
            logger.error("Error sending candle to the user", e);
         }

         // 2) update on‐chain market/holders
         try {
            logger.log(`Updating market and holders for ${tokenMint}...`);
            const ext = await ExternalToken.create(tokenMint, redisCache);
            await ext.updateMarketAndHolders();
         } catch (e) {
            logger.error("Error updating market and holders", e);
         }

         // 3) update latest batch of swaps
         try {
            logger.log(`Updating latest swap data for ${tokenMint}...`);
            const ext = await ExternalToken.create(tokenMint, redisCache);
            await ext.updateLatestSwapData(10);
         } catch (e) {
            logger.error("Error updating latest swap data", e);
         }
      } catch (err) {
         logger.error("❌ Webhook worker error", err);
         // continue;
      }
   }
}

workerLoop().catch((err) => {
   logger.error("Fatal error in webhook worker:", err);
   process.exit(1);
});
