import { eq } from "drizzle-orm";
import { getDB, tokens } from "./db";
import { Env } from "./env";
import { logger } from "./logger";
import { getSOLPrice } from "./mcap";
import { bulkUpdatePartialTokens } from "./util";

// Helper function to update token prices (for scheduled tasks)

export async function cron(env: Env): Promise<void> {
  try {
    logger.log("Updating token prices...");
    const db = getDB(env);

    // Get all active tokens
    const activeTokens = await db
      .select()
      .from(tokens)
      .where(eq(tokens.status, "active"));

    // Get SOL price once for all tokens
    const solPrice = await getSOLPrice(env);

    // Update each token with new price data
    const updatedTokens = await bulkUpdatePartialTokens(activeTokens, env);

    logger.log(`Updated prices for ${updatedTokens.length} tokens`);
  } catch (error) {
    logger.error("Error updating token prices:", error);
  }
}
