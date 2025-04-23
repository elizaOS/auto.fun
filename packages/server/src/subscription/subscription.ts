// src/subscription.ts
import { Connection, Logs, PublicKey } from '@solana/web3.js';
import { processTransactionLogs } from '../cron';
import { logger } from '../logger';
import { getWebSocketClient } from '../websocket-client';
import { webSocketManager } from '../websocket-manager';
import { getGlobalRedisCache } from '../redis';

export async function startLogSubscription(
   connection: Connection,
   programId: PublicKey,
   env: any
) {
   let subId: number;
   const redisCache = await getGlobalRedisCache();
   const isReady = await redisCache.isPoolReady();
   if (!redisCache) throw new Error("Redis Cache Service not found");

   // Initialize WebSocketManager with Redis
   if (!webSocketManager.redisCache) {
      await webSocketManager.initialize(redisCache);
   }

   const wsClient = getWebSocketClient()

   async function watch() {
      subId = await connection.onLogs(
         programId,
         async (logs: Logs) => {
            if (logs.err) return logger.warn('⚠️ tx errored', logs.err);
            try {
               await processTransactionLogs(logs.logs, logs.signature, wsClient);
            } catch (err) {
               logger.error('❌ onLogs handler error:', err);
            }
         },
         'confirmed'
      );
      logger.log(`✅ Subscribed to logs (id=${subId})`);
   }

   watch();

   // “Watchdog” to re‑subscribe if the RPC breaks
   setInterval(async () => {
      try {
         await connection.getVersion();
      } catch {
         logger.error('❌ RPC heartbeat failed, restarting subscription…');
         connection.removeOnLogsListener(subId).catch(() => { });
         watch();
      }
   }, 30_000);
}
