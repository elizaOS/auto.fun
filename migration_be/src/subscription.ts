// src/subscription.ts
import { Connection, PublicKey, Logs } from '@solana/web3.js';
import { processTransactionLogs } from './processTransactionLogs';
import { logger } from './logger';

export function startLogSubscription(
   connection: Connection,
   programId: PublicKey,
   env: any
) {
   let subId: number;
   async function watch() {
      subId = await connection.onLogs(
         programId,
         async (logs: Logs) => {
            if (logs.err) return logger.warn('⚠️ tx errored', logs.err);
            try {
               await processTransactionLogs(env, logs.logs, logs.signature);
            } catch (err) {
               logger.error('❌ onLogs handler error:', err);
            }
         },
         'confirmed'
      );
      logger.log(`✅ Subscribed to logs (id=${subId})`);
   }

   watch();

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
