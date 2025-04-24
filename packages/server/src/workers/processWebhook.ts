// processWebhook.ts
import crypto from "crypto";
import { getDB, tokens } from "../db";
import { getGlobalRedisCache } from "../redis";
import { eq } from "drizzle-orm";
import { ExternalToken } from "../externalToken";
import { getLatestCandle } from "../chart";
import { getWebSocketClient } from "../websocket-client";
import { logger } from "../util";
import { webSocketManager } from '../websocket-manager';

const JOB_QUEUE_KEY = "webhook:jobs";
const JOB_DELAY_MS = Number(process.env.JOB_DELAY_MS) || 2000;
const MAX_JOBS_PER_SECOND = Number(process.env.MAX_JOBS_PER_SECOND) || 5;

async function sleep(ms: number) {
   return new Promise((resolve) => setTimeout(resolve, ms));
}

async function workerLoop() {
   const redisCache = await getGlobalRedisCache();
   if (!(await redisCache.isPoolReady())) {
      throw new Error("Redis pool is not ready");
   }

   // single blocking client for BLPOP
   const blockingClient = await redisCache.redisPool.acquire();

   // init WS once
   if (!webSocketManager.redisCache) {
      await webSocketManager.initialize(redisCache);
   }
   const wsClient = getWebSocketClient();

   while (true) {
      let rawJob: string;
      try {
         // 1) pop next job
         const result = await blockingClient.blpop(JOB_QUEUE_KEY, 0);
         if (!result) {
            await sleep(JOB_DELAY_MS);
            continue;
         }
         [, rawJob] = result;
         const swap = JSON.parse(rawJob);

         // 2) figure out mint
         const token0IsSol =
            swap.token0Address === "So11111111111111111111111111111111111111112";
         const tokenMint = token0IsSol ? swap.token1Address : swap.token0Address;

         //  per‐token lock 
         const lockKey = `processing:${tokenMint}`;
         const lockId = crypto.randomUUID();
         const gotLock = await redisCache.acquireLock(
            lockKey,
            lockId,
            30_000
         );
         if (!gotLock) {
            await blockingClient.rpush(JOB_QUEUE_KEY, rawJob);
            logger.log(`Re-queued ${tokenMint} because it’s locked`);
            await sleep(JOB_DELAY_MS);
            continue;
         }

         try {
            // 3) global rate‐limit
            const nowSec = Math.floor(Date.now() / 1000);
            const rateKey = `webhook:rate:${nowSec}`;
            const count = await redisCache.redisPool.useClient((c) => c.incr(rateKey));
            if (count === 1) {
               await redisCache.redisPool.useClient((c) => c.expire(rateKey, 1));
            }
            if (count > MAX_JOBS_PER_SECOND) {
               await blockingClient.rpush(JOB_QUEUE_KEY, rawJob);
               await sleep(JOB_DELAY_MS * 5);
               continue;
            }

            const dedupeKey = `codex:throttle:${tokenMint}`;
            const seen = await redisCache.redisPool.useClient((c) =>
               c.set(dedupeKey, "1", "EX", 1, "NX")
            );
            if (seen === null) {
               await sleep(JOB_DELAY_MS);
               continue;
            }

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
                  await redisCache.set(cacheKey, JSON.stringify(token), 60 * 60);
               }
            }
            if (!token) {
               await sleep(JOB_DELAY_MS);
               continue;
            }

            try {
               const latestCandle = await getLatestCandle(tokenMint, swap, token);
               await wsClient.to(`token-${tokenMint}`).emit("newCandle", latestCandle);
            } catch (e) {
               logger.error("Error sending candle:", e);
            }

            try {
               const ext = await ExternalToken.create(tokenMint, redisCache);
               await ext.updateMarketAndHolders();
            } catch (e) {
               logger.error("Error updating market & holders:", e);
            }

            try {
               const ext = await ExternalToken.create(tokenMint, redisCache);
               await ext.updateLatestSwapData(10);
            } catch (e) {
               logger.error("Error updating latest swap data:", e);
            }

         } finally {
            await redisCache.releaseLock(lockKey, lockId);
         }

         await sleep(JOB_DELAY_MS);

      } catch (err) {
         logger.error("❌ Webhook worker error", err);
         await sleep(JOB_DELAY_MS * 2);
      }
   }
}

workerLoop().catch((err) => {
   logger.error("Fatal error in webhook worker:", err);
   process.exit(1);
});
