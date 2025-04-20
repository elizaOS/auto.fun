// src/index.ts
import cluster from 'cluster';
import os from 'os';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { Connection, PublicKey, Logs } from '@solana/web3.js';

import { Env } from './env';
import { getDB } from './db';
import { processMissedEvents } from './getAllTokens';
import { resumeOnStart } from './processTransactionLogs';
import { startLogSubscription } from './subscription';
import { logger } from './logger';

dotenv.config();

const RPC_URL =
   (process.env.NETWORK === 'devnet'
      ? process.env.DEVNET_SOLANA_RPC_URL
      : process.env.MAINNET_SOLANA_RPC_URL)!;
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID!);
const env = process.env as unknown as Env;
const connection = new Connection(RPC_URL, 'confirmed');
try {
   getDB(process.env as any);

} catch (error) {
   console.error('Error initializing database:', error);
}

type Job = 'subscription' | 'missedEvents' | 'resumeOnStart';
const jobs: Job[] = ['subscription', 'missedEvents', 'resumeOnStart'];
const jobMap = new Map<number, Job>();

if (cluster.isPrimary) {
   (async () => {


      console.log('🔨 Primary: forking workers…');
      for (const job of jobs) {
         const worker = cluster.fork({ JOB: job });
         jobMap.set(worker.id, job);
      }

      cluster.on('exit', (worker, code, signal) => {
         const failedJob = jobMap.get(worker.id);
         console.error(
            `❌ Worker ${worker.process.pid} for job=${failedJob} died (code=${code}, signal=${signal}). Restarting…`
         );
         if (failedJob) {
            const newWorker = cluster.fork({ JOB: failedJob });
            jobMap.set(newWorker.id, failedJob);
         }
      });
   })();
} else {
   // Worker process
   const job = process.env.JOB as Job;

   switch (job) {
      case 'subscription':
         // This script lives in subscription.ts
         startLogSubscription(connection, PROGRAM_ID, env);
         break;

      case 'missedEvents':
         // Run immediately + every 15m
         (async () => {
            await processMissedEvents(connection, env);
            cron.schedule('*/15 * * * *', async () => {
               logger.log('🕒 [missedEvents] Cron trigger');
               await processMissedEvents(connection, env);
            });
         })();
         break;

      case 'resumeOnStart':
         // Run immediately + every 5m
         (async () => {
            await resumeOnStart(env, connection);
            cron.schedule('*/5 * * * *', async () => {
               logger.log('🕒 [resumeOnStart] Cron trigger');
               await resumeOnStart(env, connection);
            });
         })();
         break;

      default:
         throw new Error(`Unknown JOB=${job}`);
   }

   console.log(`Worker ${process.pid} handling "${job}"`);
}
