import { eq } from "drizzle-orm";
import { getDB, tokens } from "../db";
import { ExternalToken } from "../externalToken";
import { createRedisCache } from "../redis";
import { logger } from "../util";

// TODO: Replace with redis cache
export async function startMonitoringBatch(
  batchSize = 10
): Promise<{ processed: number; total: number }> {
  const db = getDB();
  const redisCache = createRedisCache();
  const rawList = await redisCache.get("lockedList");
  const rawCursor = await redisCache.get("lockedCursor");
  if (!rawList) {
    const locked = await db
      .select()
      .from(tokens)
      .where(eq(tokens.status, "locked"));
    const mints = locked.map((t) => t.mint);
    await redisCache.set("lockedList", JSON.stringify(mints));
    await redisCache.set("lockedCursor", "0");
    return { processed: 0, total: mints.length };
  }

  const mints: string[] = JSON.parse(rawList);
  let cursor = parseInt(rawCursor || "0", 10);
  const total = mints.length;
  if (cursor >= total) {
    return { processed: 0, total };
  }

  const batch = mints.slice(cursor, cursor + batchSize);
  logger.info(`Monitoring: Processing batch of ${batch.length} tokens starting from cursor ${cursor}.`);

  for (const mint of batch) {
    try {
      const ext = await ExternalToken.create(mint, redisCache);
      // await ext.registerWebhook();
      logger.info(`Monitoring: Successfully registered webhook for ${mint}.`);
    } catch (err) {
      logger.error(`Monitoring: Failed to register webhook for ${mint}:`, err);
    }
  }

  cursor += batch.length;
  logger.info(`Monitoring: Batch processed. Updating cursor to ${cursor}.`);
  await redisCache.set("lockedCursor", cursor.toString());
  return { processed: batch.length, total };
}
