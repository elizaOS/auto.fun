import { getDB, tokens } from "../db";
import { eq } from "drizzle-orm";
import { ExternalToken } from "../externalToken";
import { Env } from "../env";

export async function startMonitoringBatch(env: Env, batchSize = 10): Promise<{ processed: number; total: number }> {
   const kv = env.MONITOR_KV;
   const db = getDB(env);

   const rawList = await kv.get("lockedList");
   const rawCursor = await kv.get("lockedCursor");
   if (!rawList) {
      const locked = await db.select().from(tokens).where(eq(tokens.status, "locked"));
      const mints = locked.map((t) => t.mint);
      await kv.put("lockedList", JSON.stringify(mints));
      await kv.put("lockedCursor", "0");
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
         const ext = new ExternalToken(env, mint);
         await ext.registerWebhook();
      } catch (err) {
         console.error(`Failed to register ${mint}:`, err);
      }
   }

   cursor += batch.length;
   await kv.put("lockedCursor", cursor.toString());
   return { processed: batch.length, total };
}
