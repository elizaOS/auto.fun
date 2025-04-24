import { fork } from "child_process";
import path from "path";
import { getGlobalRedisCache, RedisCacheService } from "../redis";
import { Redis } from "ioredis";

const MAX_WORKERS = Number(process.env.MAX_WORKERS) || 8;
const JOB_QUEUE_KEY = "webhook:jobs";
const WORKER_SCRIPT = path.join(__dirname, "processWebhook.ts");

// initialize a single global RedisCacheService for enqueuing
let globalCache: RedisCacheService;
getGlobalRedisCache().then(c => (globalCache = c)).catch(err => {
   console.error("Failed to initialize Redis cache for queueing:", err);
   process.exit(1);
});

function startWorkerInstance() {
   const child = fork(WORKER_SCRIPT, {
      execArgv: ["--loader", "ts-node/esm"],
      env: process.env,
   });

   child.on("exit", (code) => {
      console.error(`Worker exited with code ${code}, restarting…`);
      setTimeout(startWorkerInstance, 1_000);
   });

   child.on("error", (err) => {
      console.error("Worker crashed:", err);
   });
}

// spawn N workers once
for (let i = 0; i < MAX_WORKERS; i++) {
   startWorkerInstance();
}

export async function queueJob(data: any): Promise<number> {
   const cache = await getGlobalRedisCache();
   const payload = JSON.stringify(data);
   // return the promise so callers can catch error
   return cache.redisPool.useClient((client: Redis) =>
      client.rpush(JOB_QUEUE_KEY, payload)
   );
}