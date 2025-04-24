import crypto from "crypto";
import { getDB, tokens } from "../db";
import { getGlobalRedisCache } from "../redis";
import { eq } from "drizzle-orm";
import { ExternalToken } from "../externalToken";
import { getLatestCandle } from "../chart";
import { getWebSocketClient } from "../websocket-client";
import { logger } from "../util";
import { webSocketManager } from "../websocket-manager";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

const JOB_QUEUE_KEY = "webhook:jobs";
const PROCESSING_QUEUE = JOB_QUEUE_KEY + ":processing";
const MAX_JOBS_PER_SEC = Number(process.env.MAX_JOBS_PER_SECOND) || 10;
const SOL_ADDRESS = "So11111111111111111111111111111111111111112";

; (async function workerLoop() {
   const cache = await getGlobalRedisCache();
   if (!(await cache.isPoolReady())) {
      throw new Error("Redis pool is not ready");
   }

   const blockingClient = await cache.redisPool.acquire();
   const runWithClient = <T>(fn: (c: any) => Promise<T>) =>
      cache.redisPool.useClient(fn);

   if (!webSocketManager.redisCache) {
      await webSocketManager.initialize(cache);
   }
   const ws = getWebSocketClient();

   while (true) {
      try {
         const rawJob = await blockingClient.brpoplpush(
            JOB_QUEUE_KEY,
            PROCESSING_QUEUE,
            0
         );
         if (rawJob === null) {
            continue;
         }
         const swap = JSON.parse(rawJob);


         const nowSec = Math.floor(Date.now() / 1000);
         const rateKey = `webhook:rate:${nowSec}`;
         const count = await runWithClient(c => c.incr(rateKey)) as number;
         if (count === 1) {
            await runWithClient(c => c.expire(rateKey, 1));
         }
         if (count > MAX_JOBS_PER_SEC) {
            await runWithClient(c => c.rpush(JOB_QUEUE_KEY, rawJob));
            continue;
         }

         const token0IsSol = swap.token0Address === SOL_ADDRESS;
         const mint = token0IsSol ? swap.token1Address : swap.token0Address;

         const cacheKey = `codex-webhook:${mint}`;
         let tokenJson = await cache.get(cacheKey);
         let token = tokenJson ? JSON.parse(tokenJson) : null;
         if (!token) {
            const rows = await getDB()
               .select()
               .from(tokens)
               .where(eq(tokens.mint, mint))
               .limit(1)
               .execute();
            if (rows[0]) {
               token = rows[0];
               // cache for 1h
               await cache.set(cacheKey, JSON.stringify(token), 3600);
            }
         }

         if (!token) {
            await runWithClient(c => c.lrem(PROCESSING_QUEUE, 1, rawJob));
            continue;
         }

         try {
            const candle = await getLatestCandle(mint, swap, token);
            ws.to(`token-${mint}`).emit("newCandle", candle);
         } catch (e) {
            logger.error(`Error sending candle for ${mint}:`, e);
         }

         try {
            const ext = await ExternalToken.create(mint, cache);
            await ext.updateMarketAndHolders();
         } catch (e) {
            logger.error(`Error updating market/holders for ${mint}:`, e);
         }

         try {
            const ext = await ExternalToken.create(mint, cache);
            await ext.updateLatestSwapData(10);
         } catch (e) {
            logger.error(`Error updating swaps for ${mint}:`, e);
         }

         await runWithClient(c => c.lrem(PROCESSING_QUEUE, 1, rawJob));
      } catch (err) {
         logger.error("❌ Webhook worker error:", err);
      }
   }
})().catch(err => {
   logger.error("Fatal in webhook worker:", err);
   process.exit(1);
});
