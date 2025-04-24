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
import { Redis } from "ioredis";

const JOB_QUEUE_KEY = "webhook:jobs";
const JOB_DELAY_MS = Number(process.env.JOB_DELAY_MS) || 2000;
const MAX_JOBS_PER_SECOND = Number(process.env.MAX_JOBS_PER_SECOND) || 5;
// only do holders/swaps updates once per TOKEN_UPDATE_WINDOW seconds
const TOKEN_UPDATE_WINDOW = Number(process.env.TOKEN_UPDATE_WINDOW) || 10;
import { sanitizeTokenForWebSocket } from "../cron";
async function sleep(ms: number) {
   return new Promise((r) => setTimeout(r, ms));
}

async function workerLoop() {
   const redisCache = await getGlobalRedisCache();
   if (!(await redisCache.isPoolReady())) {
      throw new Error("Redis pool is not ready");
   }

   const blockingClient = await redisCache.redisPool.acquire();
   const client = await redisCache.redisPool.acquire();

   if (!webSocketManager.redisCache) {
      await webSocketManager.initialize(redisCache);
   }
   const wsClient = getWebSocketClient();

   while (true) {
      try {
         const res = await blockingClient.blpop(JOB_QUEUE_KEY, 0);
         if (!res) {
            await sleep(JOB_DELAY_MS);
            continue;
         }
         const rawJob = res[1] as string;
         const swap = JSON.parse(rawJob);

         const token0IsSol =
            swap.token0Address === "So11111111111111111111111111111111111111112";
         const tokenMint = token0IsSol ? swap.token1Address : swap.token0Address;
         const txSeenKey = `webhook:seen:${tokenMint}`;
         const added = await client.sadd(txSeenKey, swap.transactionHash);
         if (added === 1) {
            await client.expire(txSeenKey, 120 * 60);
         } else {
            logger.log(`Skipping duplicate tx ${swap.transactionHash}`);
            continue;
         }

         const nowSec = Math.floor(Date.now() / 1000);
         const rateKey = `webhook:rate:${nowSec}`;
         const count = await client.incr(rateKey);
         if (count === 1) {
            await client.expire(rateKey, 1);
         }
         if (count > MAX_JOBS_PER_SECOND) {
            await client.rpush(JOB_QUEUE_KEY, rawJob);
            await sleep(JOB_DELAY_MS * 5);
            continue;
         }

         const updateLockKey = `webhook:updateLock:${tokenMint}`;
         const gotLock = await client.set(
            updateLockKey,
            "1",
            "EX",
            TOKEN_UPDATE_WINDOW,
            "NX"
         );
         const doHeavyWork = gotLock === "OK";

         const cacheKey = `codex-webhook:${tokenMint}`;
         let token: any = null;
         const cached = await redisCache.get(cacheKey);
         if (cached) {
            token = JSON.parse(cached);
         } else {
            const rows = await getDB()
               .select()
               .from(tokens)
               .where(eq(tokens.mint, tokenMint))
               .limit(1)
               .execute();
            if (rows[0]) {
               token = rows[0];
               await redisCache.set(cacheKey, JSON.stringify(token), 3600);
            }
         }
         if (!token) {
            logger.warn(`Token ${tokenMint} not found, skipping`);
            continue;
         }


         if (doHeavyWork) {
            try {
               const ext = await ExternalToken.create(tokenMint, redisCache);
               const result = await ext.fetchMarketData();
               const newTokenData = result?.newTokenData;
               if (!newTokenData) {
                  logger.warn(`No new token data for ${tokenMint}, skipping`);
                  continue;
               }
               wsClient.to(`token-${tokenMint}`).emit("updateToken",
                  sanitizeTokenForWebSocket(newTokenData)
               )
            } catch (e) {
               logger.error("Error updating market & holders:", e);
            }
         }


         await sleep(JOB_DELAY_MS);

      } catch (err) {
         logger.error("❌ Webhook worker error", err);
         await sleep(JOB_DELAY_MS * 2);
      }
   }
}

workerLoop().catch((err) => {
   logger.error("Fatal worker error:", err);
   process.exit(1);
});
