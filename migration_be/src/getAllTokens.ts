import { logger } from "./logger";
import { processTransactionLogs } from "./processTransactionLogs";
import { Token, getDB } from "./db";
import PQueue from "p-queue";
import { Env } from "./env";
import { Connection, PublicKey } from "@solana/web3.js";

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


// Scan blocks from the last processed slot up to the current slot
export async function processMissedEvents(connection: Connection, env: Env,): Promise<void> {
   try {
      const currentSlot = await connection.getSlot("confirmed");
      const currentTime = await connection.getBlockTime(currentSlot);
      let startSlot: number;
      if (currentTime !== null) {
         const eighteenHoursAgo = currentTime - 10 * 3600;
         startSlot = await findSlotAtOrBeforeTime(
            connection,
            eighteenHoursAgo,
            0,
            currentSlot
         );
         logger.log(
            `18 hours ago was ≈${new Date(eighteenHoursAgo * 1000).toISOString()}, ` +
            `which corresponds to slot ${startSlot}`
         );
      } else {
         // fallback if getBlockTime fails
         startSlot = Math.max(0, currentSlot - 500);
         logger.warn(
            "Couldn't get blockTime for currentSlot; falling back to slot",
            startSlot
         );
      }

      // 2) Now process every slot from startSlot to currentSlot
      logger.log(`Scanning events from slot ${startSlot + 1} to ${currentSlot}`);
      const queue = new PQueue({ concurrency: 20 });
      for (let slot = startSlot + 1; slot <= currentSlot; slot++) {
         queue.add(async () => {

            try {
               // Fetch the block with full transaction details.
               const block = await connection.getBlock(slot, {
                  transactionDetails: "full",
                  rewards: false,
                  commitment: "confirmed",
                  maxSupportedTransactionVersion: 0,
               });
               if (!block) {
                  logger.log(`⚠️  Slot ${slot} returned null, skipping`);
                  return;
               }
               // Process each transaction in the block
               for (const tx of block.transactions) {
                  const logMessages = tx.meta?.logMessages;
                  if (!logMessages) return;

                  // Check if any log message includes our program's ID.
                  if (
                     logMessages.some((msg: any) =>
                        msg.includes(env.PROGRAM_ID!)
                     )
                  ) {
                     logger.log(`▶️ found event in slot ${slot}`);

                     // Construct a log event similar to what the real-time listener receives.
                     const logEvent = {
                        slot,
                        logs: logMessages,
                        signature: tx.transaction.signatures[0],
                        err: tx?.meta?.err || null,
                     };
                     const signature = logEvent.signature;
                     // console.log(logMessages)
                     const newTokenLog = logMessages.find((log) => log.includes("NewToken:"));
                     if (!newTokenLog) return; // Skip if no NewToken log found
                     // Process the event
                     await processTransactionLogs(env, logMessages, signature);
                     // // wait for 5 seconds to avoid rate limiting
                     // await new Promise((resolve) => setTimeout(resolve, 5000));
                  }
               }
            } catch (slotError) {
               logger.error(`❌ Error at slot ${slot}:`, slotError);
            }
         });
      }
      // Wait until all queued tasks are complete.
      await queue.onIdle();
      logger.log(`Finished processing missed events up to slot ${currentSlot}`);
   } catch (error) {
      logger.error("Error processing missed events:", error);
   }
}
