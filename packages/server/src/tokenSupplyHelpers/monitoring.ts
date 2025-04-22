import { getDB, tokens } from "../db";
import { eq } from "drizzle-orm";
import { ExternalToken } from "../externalToken";
import { createRedisCache } from "../redis/redisCacheService";

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
  for (const mint of batch) {
    try {
      const ext = new ExternalToken(mint);
      await ext.registerWebhook();
    } catch (err) {
      console.error(`Failed to register ${mint}:`, err);
    }
  }

  cursor += batch.length;
  await redisCache.set("lockedCursor", cursor.toString());
  return { processed: batch.length, total };
}
