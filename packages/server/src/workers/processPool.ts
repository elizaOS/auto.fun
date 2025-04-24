// processPool.ts
import { fork } from "child_process";
import path from "path";
import { getGlobalRedisCache, RedisCacheService } from "../redis";
import { Redis } from "ioredis";
import { logger } from "../util";

const MAX_WORKERS = Number(process.env.MAX_WORKERS) || 8;
const JOB_QUEUE_KEY = "webhook:jobs";
const WORKER_SCRIPT = path.join(__dirname, "processWebhook.ts");
const STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes

let enqueuer: RedisCacheService;

// 1) initialize Redis, flush the queue, then spawn workers
getGlobalRedisCache()
   .then(async (c) => {
      enqueuer = c;

      // clear any leftover jobs from previous runs
      await enqueuer.redisPool.useClient((client: Redis) =>
         client.del(JOB_QUEUE_KEY)
      );
      console.log(`[processPool] Cleared Redis queue key "${JOB_QUEUE_KEY}"`);

      // now spawn N workers
      for (let i = 0; i < MAX_WORKERS; i++) {
         const child = fork(WORKER_SCRIPT, {
            execArgv: ["--loader", "ts-node/esm"],
            env: process.env,
         });

         child.on("exit", (code) => {
            console.error(`Worker exited with code ${code}, restarting…`);
            setTimeout(() => {
               fork(WORKER_SCRIPT, {
                  execArgv: ["--loader", "ts-node/esm"],
                  env: process.env,
               });
            }, 1_000);
         });

         child.on("error", (err) => {
            console.error("Worker crashed:", err);
         });
      }

      setInterval(async () => {
         const now = Date.now();
         const client = await enqueuer.redisPool.acquire();
         try {
            while (true) {
               const head = await client.lindex(JOB_QUEUE_KEY, 0);
               if (!head) break;
               let job: { enqueuedAt: number; payload: any };
               try {
                  job = JSON.parse(head);
               } catch {
                  // malformed — drop it
                  await client.lpop(JOB_QUEUE_KEY);
                  continue;
               }
               if (now - job.enqueuedAt > STALE_THRESHOLD) {
                  await client.lpop(JOB_QUEUE_KEY);
                  logger.log(
                     `[processPool] Purged stale job enqueued at ${new Date(
                        job.enqueuedAt
                     ).toISOString()}`
                  );
               } else {
                  break;
               }
            }
         } finally {
            await enqueuer.redisPool.release(client);
         }
      }, 60 * 1000);
   })

   .catch((err) => {
      console.error("Failed to initialize Redis cache for queueing:", err);
      process.exit(1);
   });

// 2) job enqueuer
export function queueJob(data: any): Promise<number> {
   const payload = JSON.stringify(data);
   return enqueuer.redisPool.useClient((client: Redis) =>
      client.rpush(JOB_QUEUE_KEY, payload)
   );
}
