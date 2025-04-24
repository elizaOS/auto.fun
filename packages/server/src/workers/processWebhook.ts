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

   const blockingClient = await redisCache.redisPool.acquire();

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
         const rawJob = res[1];
         const swap = JSON.parse(rawJob);

         // determine mint
         const token0IsSol =
            swap.token0Address === "So11111111111111111111111111111111111111112";
         const tokenMint = token0IsSol ? swap.token1Address : swap.token0Address;

         // dedupe by transactionHash
         const txSeenKey = `webhook:seen:${tokenMint}`;
         const added = await redisCache.redisPool.useClient((c) =>
            c.sadd(txSeenKey, swap.transactionHash)
         );
         if (added === 0) {
            logger.log(`Skipping duplicate tx ${swap.transactionHash}`);
            continue;
         }

         const nowSec = Math.floor(Date.now() / 1000);
         const rateKey = `webhook:rate:${nowSec}`;
         const count = await redisCache.redisPool.useClient((c) => c.incr(rateKey));
         if (count === 1) {
            await redisCache.redisPool.useClient((c) => c.expire(rateKey, 1));
         }
         if (count > MAX_JOBS_PER_SECOND) {
            await redisCache.redisPool.useClient((c) => c.rpush(JOB_QUEUE_KEY, rawJob));
            await sleep(JOB_DELAY_MS * 5);
            continue;
         }

         const cacheKey = `codex-webhook:${tokenMint}`;
         let token = null;
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
               await redisCache.set(cacheKey, JSON.stringify(token), 3600);
            }
         }
         if (!token) {
            logger.warn(`Token ${tokenMint} not found, skipping`);
            continue;
         }

         try {
            const latestCandle = await getLatestCandle(tokenMint, swap, token);
            await wsClient.to(`token-${tokenMint}`).emit("newCandle", latestCandle);
         } catch (err) {
            logger.error("Error sending candle:", err);
         }

         try {
            const ext = await ExternalToken.create(tokenMint, redisCache);
            await ext.updateMarketAndHolders();
         } catch (err) {
            logger.error("Error updating market & holders:", err);
         }

         try {
            const ext = await ExternalToken.create(tokenMint, redisCache);
            await ext.updateLatestSwapData(10);
         } catch (err) {
            logger.error("Error updating latest swap data:", err);
         }

         await sleep(JOB_DELAY_MS);
      } catch (err) {
         logger.error("Worker error:", err);
         await sleep(JOB_DELAY_MS * 2);
      }
   }
}

workerLoop().catch((err) => {
   logger.error("Fatal worker error:", err);
   process.exit(1);
});
