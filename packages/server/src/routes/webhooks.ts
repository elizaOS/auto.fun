import { Hono } from "hono";
import { z } from "zod";
import { processTransactionLogs } from "../cron";
import { createRedisCache, getGlobalRedisCache } from "../redis";
import { startMonitoringBatch } from "../tokenSupplyHelpers/monitoring";
import { logger } from "../util";

const router = new Hono<{
  Variables: {
    user?: { publicKey: string } | null;
  };
}>();

const WebhookTokenPairEvent = z.object({
  deduplicationId: z.string(),
  groupId: z.string(),
  hash: z.string(),
  data: z.object({
    event: z.object({
      timestamp: z.number(),
      maker: z.string(),
      data: z.object({
        amount0: z.string(),
        amount1: z.string(),
        priceUsd: z.string(),
        token0SwapValueUsd: z.string(),
        token1SwapValueUsd: z.string(),
      }),
      transactionHash: z.string(),
      token0Address: z.string(),
      token1Address: z.string(),
      token0SwapValueUsd: z.string(),
      token1SwapValueUsd: z.string(),
      token0ValueBase: z.string(),
      token1ValueBase: z.string(),
      token0ValueUsd: z.string(),
      token1ValueUsd: z.string(),
      eventDisplayType: z.enum(["Buy", "Sell"]),
      eventType2: z.string(),
    }),
  }),
});


router.post("/webhook", async (c) => {
  console.log("helius webhook received");
  const authorization = c.req.header("Authorization");


  if (authorization !== process.env.HELIUS_WEBHOOK_AUTH_TOKEN) {
    return c.json(
      {
        message: "Unauthorized",
      },
      401
    );
  }

  const body = await c.req.json();
  const events = z
    .object({
      meta: z.object({
        logMessages: z.string().array(),
      }),
      transaction: z.object({
        signatures: z.string().array(),
      }),
    })
    .array()
    .parse(body);

  (async () => {
    try {
      await Promise.all(
        events.map((event) =>
          processTransactionLogs(
            event.meta.logMessages,
            event.transaction.signatures[0]
          )
        )
      );
    } catch (err) {
      logger.error("Error processing webhook logs:", err);
    }
  })();

  return c.json({
    message: "Completed",
  });
});

router.post("/codex-webhook", async (c) => {
  // const body = await c.req.json();
  // const swapEvent = WebhookTokenPairEvent.parse(body).data.event;

  // const token0IsSol =
  //   swapEvent.token0Address === "So11111111111111111111111111111111111111112";
  // const tokenMint = token0IsSol
  //   ? swapEvent.token1Address
  //   : swapEvent.token0Address;
  // const redisCache = await getGlobalRedisCache();
  // const txId = swapEvent.transactionHash;
  // const dedupeKey = `webhook:tx:${txId}`;
  // const firstSeen = await redisCache.redisPool.useClient((client) =>
  //   client.set(dedupeKey, "1", "EX", 120 * 60, "NX")
  // );
  // if (firstSeen === null) {
  //   // Already processed recently
  //   logger.log(`Skipping dup tx ${txId}`);
  //   return c.json({ message: "Duplicate, ignored" }, 200);
  // }
  // logger.log(`Enqueuing webhook for ${tokenMint}…`);
  // queueJob(swapEvent).catch(err => {
  //   logger.error(`Failed to enqueue swapEvent ${txId}:`, err);
  // });

  return c.json({ message: "Accepted" }, 200);
});

// Start monitoring batch
router.post("/codex-start-monitoring", async (c) => {
  const { processed, total } = await startMonitoringBatch(10);

  const redisCache = createRedisCache();
  const cachedData = await redisCache.get("lockedCursor");
  return c.json({
    message:
      processed === 0 && total > 0
        ? "Seeded or already complete"
        : `Processed ${processed} tokens, cursor now ${cachedData}/${total}`,
  });
});

// Status Endpoint
router.get("/codex-monitor-status", async (c) => {
  const redisCache = createRedisCache();
  const rawList = await redisCache.get("lockedList");
  const rawCursor = await redisCache.get("lockedCursor");
  if (!rawList) return c.json({ seeded: false });
  const mints: string[] = JSON.parse(rawList);
  const cursor = Number.parseInt(rawCursor || "0", 10);
  return c.json({ seeded: true, total: mints.length, processed: cursor });
});

export default router;
