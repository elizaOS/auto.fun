import { fork } from "child_process";
import { Hono } from "hono";
import path from "path";
import { z } from "zod";
import { createRedisCache } from "../redis";
import { startMonitoringBatch } from "../tokenSupplyHelpers/monitoring";

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


router.post("/codex-webhook", async (c) => {
  const body = await c.req.json();
  const swapEvent = WebhookTokenPairEvent.parse(body).data.event;

  const child = fork(path.join(__dirname, "subscription/processWebhook.ts"), {
    execArgv: ["--loader", "ts-node/esm"], // if using TypeScript
    env: process.env,
  });

  child.send(swapEvent);

  // Optional: log on exit
  child.on("exit", (code) => {
    if (code !== 0) {
      console.error(`Child process failed for ${swapEvent.transactionHash}`);
    }
  });

  return c.json({ message: "Accepted" });
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
