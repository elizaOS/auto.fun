import cluster from 'cluster';
import os from 'os';
import { getGlobalRedisCache } from '../redis';
import { getDB, tokens } from '../db';
import { eq } from 'drizzle-orm';
import { logger } from '../util';

const NUM_WORKERS = Number(process.env.MAX_WORKERS) || 4;
const SCAN_INTERVAL_MS = Number(process.env.SCAN_INTERVAL_MS) || 60_000;
const JOB_QUEUE_KEY = 'batch:jobs';

async function scanAndEnqueue() {
   const db = getDB();
   const redisCache = await getGlobalRedisCache();
   const rows = await db
      .select()
      .from(tokens)
      .where(eq(tokens.status, 'locked'))
      .execute();

   if (rows.length === 0) {
      logger.log('[Scheduler] No locked tokens to enqueue');
      return;
   }

   const client = await redisCache.redisPool.acquire();
   try {
      for (const token of rows) {
         await client.rpush(JOB_QUEUE_KEY, token.mint);
      }
      logger.log(`[Scheduler] Enqueued ${rows.length} locked tokens`);
   } catch (err) {
      logger.error('[Scheduler] Error enqueuing tokens:', err);
   } finally {
      await redisCache.redisPool.release(client);
   }
}

if (cluster.isMaster) {
   for (let i = 0; i < NUM_WORKERS; i++) {
      cluster.fork();
   }

   scanAndEnqueue().catch(err => logger.error('[Scheduler] Initial scan failed:', err));
   setInterval(() => {
      scanAndEnqueue().catch(err => logger.error('[Scheduler] Scan failed:', err));
   }, SCAN_INTERVAL_MS);

   cluster.on('exit', (worker, code, signal) => {
      logger.error(`Worker ${worker.id} died (code=${code}, signal=${signal}), restarting...`);
      cluster.fork();
   });
} else {
   require('./codexUpdater');
}



