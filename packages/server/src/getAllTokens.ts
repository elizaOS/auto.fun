import { Connection } from "@solana/web3.js";
import { eq } from "drizzle-orm";
import PQueue from "p-queue";
import { getDB, metadata } from "./db";
import { logger } from "./logger";
import { processTransactionLogs } from "./processTransactionLogs";

export async function getLastProcessedSlot(): Promise<number | null> {
   const db = getDB();

   const row = await db.select()
      .from(metadata)
      .where(eq(metadata.key, "lastProcessedSlot"))
      .limit(1)

   if (row.length > 0) {
      return parseInt(row[0].value, 10);
   }
   return null;
}
export async function setLastProcessedSlot(slot: number): Promise<void> {


   const db = await getDB();
   await db.insert(metadata).values({ key: "lastProcessedSlot", value: slot.toString() }).onConflictDoUpdate({
      target: [metadata.key],
      set: { value: slot.toString() },
   });
   logger.log(`Updated last processed slot to ${slot}`);
}

async function findSlotAtOrBeforeTime(
   connection: Connection,
   targetTs: number,
   low: number,
   high: number
): Promise<number> {
   while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);  // bias upwards
      const t = await connection.getBlockTime(mid);
      if (t === null || t > targetTs) {
         // Too new (or missing), search lower
         high = mid - 1;
      } else {
         // mid is too old or just right, keep it
         low = mid;
      }
   }
   return low;
}
async function processSlot(slot: number, connection: Connection) {
   try {
      const block = await connection.getBlock(slot, {
         transactionDetails: 'full',
         rewards: false,
         commitment: 'confirmed',
         maxSupportedTransactionVersion: 0,
      });
      if (!block) return logger.log(`Slot ${slot} empty, skipping`);

      for (const tx of block.transactions) {
         const logs = tx.meta?.logMessages;
         if (!logs) continue;
         if (logs.some((l) => l.includes(process.env.PROGRAM_ID!))) {
            const signature = tx.transaction.signatures[0];
            await processTransactionLogs(logs, signature);
         }
      }
   } catch (err) {
      logger.error(`Error processing slot ${slot}:`, err);
   }
}

// Scan blocks from the last processed slot up to the current slot
export async function processMissedEvents(connection: Connection, ): Promise<void> {
   try {
      const currentSlot = await connection.getSlot("confirmed");
      const currentTime = await connection.getBlockTime(currentSlot);
      let startSlot = await getLastProcessedSlot();

      if (startSlot === null) {
         // First time running: fall back to ~6 h ago
         const currentTime = await connection.getBlockTime(currentSlot);
         if (currentTime !== null) {
            const cutoffTs = currentTime - 6 * 3600; // 6 hours
            startSlot = await findSlotAtOrBeforeTime(
               connection,
               cutoffTs,
               0,
               currentSlot
            );
         } else {
            startSlot = Math.max(0, currentSlot - 500);
         }
         logger.log(`No lastProcessedSlot found. Falling back to slot ${startSlot}`);
      } else {
         logger.log(`Resuming from lastProcessedSlot = ${startSlot}`);
      }
      const slots = await connection.getBlocks(startSlot + 1, currentSlot);
      logger.log(
         `Processing ${slots.length} slots from ${startSlot + 1} to ${currentSlot}`
      );
      // 2) Now process every slot from startSlot to currentSlot
      logger.log(`Scanning events from slot ${startSlot + 1} to ${currentSlot}`);
      const queue = new PQueue({ concurrency: 20 });
      for (const slot of slots) {
         queue.add(() => processSlot(slot, connection));
      }
      await queue.onIdle();
      await setLastProcessedSlot(currentSlot);
      logger.log(`✅ Updated lastProcessedSlot → ${currentSlot}`);
   } catch (error) {
      logger.error("Error processing missed events:", error);
   }
}
