// processPool.ts
import { fork } from "child_process";
import path from "path";
import { getGlobalRedisCache, RedisCacheService } from "../redis";
import { Redis } from "ioredis";

const MAX_WORKERS = Number(process.env.MAX_WORKERS) || 8;
const JOB_QUEUE_KEY = "webhook:jobs";
const WORKER_SCRIPT = path.join(__dirname, "processWebhook.ts");

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
