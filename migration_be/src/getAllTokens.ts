import { logger } from "./logger";
import { processTransactionLogs } from "./processTransactionLogs";
import { Token, getDB } from "./db";
import PQueue from "p-queue";
import { Env } from "./env";
import { Connection, PublicKey } from "@solana/web3.js";

async function slotAtOrBeforeTime(
   conn: Connection,
   targetTs: number,
   low: number,
   high: number
): Promise<number> {
   while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const t = await conn.getBlockTime(mid);
      if (t === null) {
         // skip unfulfilled blocks
         high = mid - 1;
      } else if (t > targetTs) {
         high = mid - 1;
      } else {
         low = mid + 1;
      }
   }
   return high;
}

export async function getEventsFromChain(
   connection: Connection,
   env: Env
): Promise<number> {
   try {
      const currentSlot = await connection.getSlot("finalized");
      const currentTs = await connection.getBlockTime(currentSlot);
      if (!currentTs) throw new Error("Could not fetch current block time");
      const twelveHoursAgoTs = currentTs - 12 * 60 * 60;

      // assume slot 0–currentSlot is the search space
      const startSlot = await slotAtOrBeforeTime(
         connection,
         twelveHoursAgoTs,
         0,
         currentSlot
      );

      logger.log(`Starting from slot ~${startSlot} (≈9h ago)`);
      return startSlot;
   } catch (err) {
      logger.error('Error computing 9h‑ago slot:', err);
      // fallback to “last 500 slots”
      const curr = await connection.getSlot('finalized');
      return Math.max(0, curr - 500);
   }
}
// Scan blocks from the last processed slot up to the current slot
export async function processMissedEvents(connection: Connection, env: Env): Promise<void> {
   try {
      const lastSlot = await getEventsFromChain(connection, env);
      const currentSlot = await connection.getSlot("confirmed");

      if (lastSlot >= currentSlot) {
         logger.log(
            "No missed events to process. Last processed slot is up-to-date."
         );
         return;
      }

      logger.log(
         `Processing missed events from slot ${lastSlot + 1} to ${currentSlot}`
      );

      const queue = new PQueue({ concurrency: 1 });
      // Iterate through each slot between lastSlot (exclusive) and currentSlot (inclusive)
      for (let slot = lastSlot + 1; slot <= currentSlot; slot++) {
         queue.add(async () => {
            try {
               // Fetch the block with full transaction details.
               const block = await connection.getBlock(slot, {
                  transactionDetails: "full",
                  rewards: false,
                  commitment: "confirmed",
                  maxSupportedTransactionVersion: 0,
               });
               if (!block) return; // Skip if block is null

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
                     // Construct a log event similar to what the real-time listener receives.
                     const logEvent = {
                        slot,
                        logs: logMessages,
                        signature: tx.transaction.signatures[0],
                        err: tx?.meta?.err || null,
                     };
                     const signature = logEvent.signature;

                     // Process the event
                     await processTransactionLogs(env, logMessages, signature);
                     // // wait for 5 seconds to avoid rate limiting
                     // await new Promise((resolve) => setTimeout(resolve, 5000));
                  }
               }
            } catch (slotError) {
               logger.error(`Error processing slot ${slot}:`, slotError);
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
