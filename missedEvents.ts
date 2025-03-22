import { config } from "./lib/solana";
import { logger } from "./logger";
import { handleLogEvent } from "./lib/eventProcessor";
import { Token } from "./schemas";
import PQueue from "p-queue";

export async function getLastProcessedSlotFromDB(): Promise<number> {
  try {
    // Query the Token collection for the document with the most recent lastUpdated value.
    const lastToken = await Token.findOne({}).sort({ lastUpdated: -1 });
    if (lastToken && lastToken.lastUpdated) {
      // Convert lastUpdated to seconds.
      const lastUpdatedTime = lastToken.lastUpdated.getTime() / 1000;
      const now = Date.now() / 1000;
      const diffSeconds = now - lastUpdatedTime;

      // Assuming an average of 0.4 seconds per slot on Solana.
      const estimatedSlotDiff = Math.floor(diffSeconds / 0.4);
      const currentSlot = await config.connection.getSlot("finalized");

      // The starting slot is currentSlot minus the estimated number of slots that have passed.
      const startingSlot = Math.max(0, currentSlot - estimatedSlotDiff);
      logger.log(
        `Estimated starting slot based on tokens.lastUpdated: ${startingSlot}`
      );
      return startingSlot;
    } else {
      const currentSlot = await config.connection.getSlot("finalized");
      // go back 100 slots to be safe (/* Malibu */ we can change this number if needed)
      const startingSlot = Math.max(0, currentSlot - 100);
      logger.log(`No tokens found. Using current slot: ${currentSlot}`);
      return startingSlot;
    }
  } catch (error) {
    logger.error("Error determining last processed slot from DB:", error);
    return await config.connection.getSlot("confirmed");
  }
}

// Scan blocks from the last processed slot up to the current slot
export async function processMissedEvents(): Promise<void> {
  try {
    const lastSlot = await getLastProcessedSlotFromDB();
    const currentSlot = await config.connection.getSlot("confirmed");

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
          const block = await config.connection.getBlock(slot, {
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
              logMessages.some((msg) =>
                msg.includes(config.program.programId.toBase58())
              )
            ) {
              // Construct a log event similar to what the real-time listener receives.
              const logEvent = {
                slot,
                logs: logMessages,
                signature: tx.transaction.signatures[0],
                err: tx.meta.err,
              };

              // Process the event
              await handleLogEvent(logEvent);
              // wait for 5 seconds to avoid rate limiting
              await new Promise((resolve) => setTimeout(resolve, 5000));
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
