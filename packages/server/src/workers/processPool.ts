import { fork } from "child_process";
import path from "path";
import { getGlobalRedisCache } from "../redis";

const MAX_WORKERS = Number(process.env.MAX_WORKERS) || 4;
const JOB_QUEUE_KEY = "webhook:jobs";
const WORKER_SCRIPT = path.join(__dirname, "processWebhook.ts");


function startWorkerInstance() {
   const child = fork(WORKER_SCRIPT, {
      execArgv: ["--loader", "ts-node/esm"],
      env: process.env,
   });

   child.on("exit", (code) => {
      console.error(`Worker exited with code ${code}, restarting…`);
      setTimeout(startWorkerInstance, 1000);
   });

   child.on("error", (err) => {
      console.error("Worker crashed:", err);
   });
}


for (let i = 0; i < MAX_WORKERS; i++) {
   startWorkerInstance();
}


export async function queueJob(data: any) {
   const cache = await getGlobalRedisCache();
   const payload = JSON.stringify(data);
   await cache.redisPool.useClient((client) =>
      client.rpush(JOB_QUEUE_KEY, payload)
   );
}
