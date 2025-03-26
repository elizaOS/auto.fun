import { sql } from "drizzle-orm";
import { Env } from "./env";
import { getDB, preGeneratedTokens } from "./db";
import { generatePreGeneratedTokens } from "./routes/generation";
import { logger } from "./logger";

// Initialize the pre-generated tokens in the database
export async function initializePreGeneratedTokens(env: Env): Promise<void> {
  try {
    logger.log("Initializing pre-generated tokens...");

    // Check if we have any tokens already
    const db = getDB(env);
    const countResult = await db
      .select({ count: sql`count(*)` })
      .from(preGeneratedTokens);

    const count = Number(countResult[0].count);
    logger.log(`Current pre-generated token count: ${count}`);

    // Generate initial batch of tokens if none exist
    if (count === 0) {
      logger.log("No pre-generated tokens found. Generating initial batch...");
      const result = await generatePreGeneratedTokens(env, 100);
      if (result) {
        logger.log("Successfully generated initial batch of tokens");
      } else {
        logger.error("Failed to generate initial batch of tokens");
      }
    } else {
      logger.log(
        `Found ${count} existing pre-generated tokens. Skipping initialization.`,
      );
    }
  } catch (error) {
    logger.error("Error initializing pre-generated tokens:", error);
  }
}
