import { fork } from "child_process";
import path from "path";

const MAX_WORKERS = 4;
const workerPath = path.join(__dirname, "processWebhook.ts");

type Job = { data: any };

const jobQueue: Job[] = [];
const workers: (ReturnType<typeof fork> | null)[] = Array(MAX_WORKERS).fill(null);
const busy: boolean[] = Array(MAX_WORKERS).fill(false);

function startWorker(index: number, job: Job) {
   busy[index] = true;

   const child = fork(workerPath, {
      execArgv: ["--loader", "ts-node/esm"],
      env: process.env,
   });

   workers[index] = child;

   child.send(job.data);

   child.on("exit", (code) => {
      busy[index] = false;
      workers[index] = null;
      if (code !== 0) {
         console.error("❌ Worker exited with error");
      }
      runQueue();
   });

   child.on("error", (err) => {
      console.error("❌ Worker crashed:", err);
      busy[index] = false;
      workers[index] = null;
      runQueue();
   });
}

function runQueue() {
   const nextJob = jobQueue.shift();
   if (!nextJob) return;

   const freeIndex = busy.findIndex((b) => !b);
   if (freeIndex !== -1) {
      startWorker(freeIndex, nextJob);
   } else {
      // back at the front of the queue
      jobQueue.unshift(nextJob);
      console.log("Job re-queued:", nextJob);
   }
}

export function queueJob(data: any) {
   jobQueue.push({ data });
   runQueue();
}
