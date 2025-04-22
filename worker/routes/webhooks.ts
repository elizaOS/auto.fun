import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getLatestCandle } from "../chart";
import { processTransactionLogs } from "../cron";
import { getDB, tokens } from "../db";
import type { Env } from "../env";
import { ExternalToken } from "../externalToken";
import { createRedisCache } from "../redis/redisCacheService";
import { startMonitoringBatch } from "../tokenSupplyHelpers/monitoring";
import { logger } from "../util";
import { getWebSocketClient } from "../websocket-client";

const router = new Hono<{
  Bindings: Env;
  Variables: {
    user?: { publicKey: string } | null;
  };
}>();

/**
 * listen to transaction logs for our program from helius
 */
router.post("/webhook", async (c) => {
  console.log("helius webhook received");
  // value is configured in helius webhook dashboard
  const authorization = c.req.header("Authorization");
  console.log("Authorization", authorization);
  console.log("HELUS_WEBHOOK_AUTH_TOKEN", c.env.HELIUS_WEBHOOK_AUTH_TOKEN);

  if (authorization !== c.env.HELIUS_WEBHOOK_AUTH_TOKEN) {
    return c.json(
      {
        message: "Unauthorized",
      },
      401,
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

  c.executionCtx.waitUntil(
    (async () => {
      await Promise.all(
        events.map((event) =>
          processTransactionLogs(
            c.env,
            event.meta.logMessages,
            event.transaction.signatures[0],
          ),
        ),
      );
    })(),
  );

  return c.json({
    message: "Completed",
  });
});

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

// Define max swaps to keep in Redis list (consistent with cron.ts)
const MAX_SWAPS_TO_KEEP = 1000;

router.post("/codex-webhook", async (c) => {
  const body = await c.req.json();

  const webhookBody = WebhookTokenPairEvent.parse(body);

  const swap = webhookBody.data.event;
  // const db = getDB(c.env);
  // Determine which token index (0 or 1) this event is for
  const token0IsSol =
    swap.token0Address === "So11111111111111111111111111111111111111112";

  // Identify the actual token mint (not SOL)
  const tokenMint = token0IsSol ? swap.token1Address : swap.token0Address;
  const isBuy = swap.eventDisplayType === "Buy"; // Buy means user received the target token

  // Calculate amounts based on which token is SOL and the event type
  let amountIn: number;
  let amountOut: number;
  let price: number;

  if (token0IsSol) {
    // Token 0 is SOL, Token 1 is the target token
    if (isBuy) {
      // User bought Token 1 (spent SOL)
      amountIn = Number(swap.data.amount0) * LAMPORTS_PER_SOL; // SOL spent
      amountOut = Number(swap.data.amount1) * 1e6; // Target Token received (assuming 6 decimals)
      price = amountIn / LAMPORTS_PER_SOL / (amountOut / 1e6); // Price in SOL per Token
    } else {
      // User sold Token 1 (received SOL)
      amountIn = Number(swap.data.amount1) * 1e6; // Target Token spent
      amountOut = Number(swap.data.amount0) * LAMPORTS_PER_SOL; // SOL received
      price = amountOut / LAMPORTS_PER_SOL / (amountIn / 1e6); // Price in SOL per Token
    }
  } else {
    // Token 1 is SOL, Token 0 is the target token
    if (isBuy) {
      // User bought Token 0 (spent SOL)
      amountIn = Number(swap.data.amount1) * LAMPORTS_PER_SOL; // SOL spent
      amountOut = Number(swap.data.amount0) * 1e6; // Target Token received
      price = amountIn / LAMPORTS_PER_SOL / (amountOut / 1e6); // Price in SOL per Token
    } else {
      // User sold Token 0 (received SOL)
      amountIn = Number(swap.data.amount0) * 1e6; // Target Token spent
      amountOut = Number(swap.data.amount1) * LAMPORTS_PER_SOL; // SOL received
      price = amountOut / LAMPORTS_PER_SOL / (amountIn / 1e6); // Price in SOL per Token
    }
  }

  // --- ADD REDIS PUSH BLOCK ---
  const swapRecord = {
    id: crypto.randomUUID(),
    tokenMint: tokenMint,
    user: swap.maker,
    type: isBuy ? "buy" : "sell",
    direction: isBuy ? 0 : 1,
    amountIn: amountIn,
    amountOut: amountOut,
    price: price,
    txId: swap.transactionHash,
    timestamp: new Date(swap.timestamp * 1000), // Store as Date object
  };

  const redisCache = createRedisCache(c.env);
  const listKey = redisCache.getKey(`swapsList:${tokenMint}`);
  try {
    // Pipeline push + trim to reduce RTT
    await redisCache.lpushTrim(
      listKey,
      JSON.stringify(swapRecord),
      MAX_SWAPS_TO_KEEP,
    );
    logger.log(
      `Codex: Saved swap to Redis list ${listKey} & trimmed. Type: ${isBuy ? "buy" : "sell"}`,
    );
  } catch (redisError) {
    logger.error(
      `Codex: Failed to save swap to Redis list ${listKey}:`,
      redisError,
    );
    // Potentially return error or continue processing other parts
  }
  // --- END REDIS PUSH BLOCK ---

  //check if we have the token in the db
  const db = getDB(c.env);
  const token = await db
    .select()
    .from(tokens)
    .where(eq(tokens.mint, tokenMint));
  if (!token || token.length === 0) {
    // do nothing since the token is not in the table
    return c.json({
      message: "Token not in db",
    });
  }
  const wsClient = getWebSocketClient(c.env);

  const ext = new ExternalToken(c.env, tokenMint);
  //  we just call this to update the last 5 swaps in the db
  await ext.updateLatestSwapData(20);
  const latestCandle = await getLatestCandle(c.env, tokenMint, swap);

  await ext.updateMarketAndHolders();

  // Emit the same swapRecord format as used in cron.ts
  await wsClient.to(`token-${tokenMint}`).emit("newSwap", {
    ...swapRecord,
    mint: tokenMint, // Ensure mint field is present
    timestamp: swapRecord.timestamp.toISOString(), // Emit ISO string
  });

  await wsClient.to(`token-${tokenMint}`).emit("newCandle", latestCandle);
  return c.json({
    message: "Completed",
  });
});

// Start monitoring batch
router.post("/codex-start-monitoring", async (c) => {
  const { processed, total } = await startMonitoringBatch(c.env, 10);
  return c.json({
    message:
      processed === 0 && total > 0
        ? "Seeded or already complete"
        : `Processed ${processed} tokens, cursor now ${await c.env.MONITOR_KV.get("lockedCursor")}/${total}`,
  });
});

// Status Endpoint
router.get("/codex-monitor-status", async (c) => {
  const kv = c.env.MONITOR_KV;
  const rawList = await kv.get("lockedList");
  const rawCursor = await kv.get("lockedCursor");
  if (!rawList) return c.json({ seeded: false });
  const mints: string[] = JSON.parse(rawList);
  const cursor = Number.parseInt(rawCursor || "0", 10);
  return c.json({ seeded: true, total: mints.length, processed: cursor });
});

export default router;
