import { getGlobalRedisCache } from '../redis';
import { getDB, tokens } from '../db';
import { eq } from 'drizzle-orm';
import { ExternalToken } from '../externalToken';
import { getWebSocketClient } from '../websocket-client';
import { webSocketManager } from '../websocket-manager';
import { sanitizeTokenForWebSocket } from '../cron';
import { logger } from '../util';

const JOB_QUEUE_KEY = 'batch:jobs';
const THROTTLE_MS = Number(process.env.THROTTLE_MS) || 2000;
const HEARTBEAT_MS = 5 * 60 * 1000; // 5 minutes

let running = true;
let heartbeatInterval: NodeJS.Timeout;

async function sleep(ms: number) {
   return new Promise(resolve => setTimeout(resolve, ms));
}

async function workerLoop() {
   const redisCache = await getGlobalRedisCache();
   if (!webSocketManager.redisCache) {
      await webSocketManager.initialize(redisCache);
   }
   const wsClient = getWebSocketClient();

   // Single Redis client for blocking pops
   const client = await redisCache.redisPool.acquire();

   // Heartbeat log
   heartbeatInterval = setInterval(() => {
      logger.log(`[Worker ${process.pid}] heartbeat`);
   }, HEARTBEAT_MS);

   try {
      while (running) {
         const res = await client.blpop(JOB_QUEUE_KEY, 0);
         if (!running) break;
         if (!res) continue;

         const mint = res[1] as string;
         logger.log(`[Worker ${process.pid}] Processing mint: ${mint}`);

         const db = getDB();
         const rows = await db
            .select()
            .from(tokens)
            .where(eq(tokens.mint, mint))
            .limit(1)
            .execute();

         if (!rows[0]) {
            logger.warn(`[Worker ${process.pid}] Token ${mint} not found, skipping`);
         } else {
            try {
               const ext = await ExternalToken.create(mint, redisCache);
               const result = await ext.fetchMarketData();
               const newTokenData = result?.newTokenData;
               if (newTokenData) {
                  wsClient
                     .to(`token-${mint}`)
                     .emit('updateToken', sanitizeTokenForWebSocket(newTokenData));
                  logger.log(`[Worker ${process.pid}] Updated token ${mint}`);
               } else {
                  logger.warn(`[Worker ${process.pid}] No new data for ${mint}`);
               }
            } catch (err) {
               logger.error(`[Worker ${process.pid}] Error updating ${mint}:`, err);
            }
         }

         // Throttle before next job
         await sleep(THROTTLE_MS);
      }
   } finally {
      // Cleanup
      clearInterval(heartbeatInterval);
      try {
         await redisCache.redisPool.release(client);
         logger.log(`[Worker ${process.pid}] Redis client released`);
      } catch (err) {
         logger.error(`[Worker ${process.pid}] Error releasing Redis client:`, err);
      }
      logger.log(`[Worker ${process.pid}] Exiting gracefully`);
      process.exit(0);
   }
}


workerLoop().catch(err => {
   logger.error(`[Worker ${process.pid}] Startup error:`, err);
   process.exit(1);
});
