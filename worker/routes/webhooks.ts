import { Hono } from "hono";
import { Env } from "../env";
import { processTransactionLogs } from "../cron";
import { z } from "zod";
import crypto from "crypto";
import { getDB, swaps } from "../db";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
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
  // value is configured in helius webhook dashboard
  const authorization = c.req.header("Authorization");

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

  for (const event of events) {
    await processTransactionLogs(
      c.env,
      event.meta.logMessages,
      event.transaction.signatures[0],
    );
  }

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

router.post("/codex-webhook", async (c) => {
  const body = await c.req.json();

  const webhookBody = WebhookTokenPairEvent.parse(body);

  const hash = crypto
    .createHash("sha256")
    .update(c.env.CODEX_WEBHOOK_AUTH_TOKEN + webhookBody.deduplicationId)
    .digest("hex");

  const isFromCodex = hash === webhookBody.hash;

  if (!isFromCodex) {
    return c.json(
      {
        message: "Unauthorized",
      },
      401,
    );
  }

  const swap = webhookBody.data.event;
  const db = getDB(c.env);

  const amounts =
    swap.eventDisplayType === "Buy"
      ? {
          amountIn: -Number(swap.data.amount1 || 0) * LAMPORTS_PER_SOL,
          amountOut: Number(swap.data.amount0 || 0) * 1e6,
        }
      : {
          amountIn: -Number(swap.data.amount0 || 0) * 1e6,
          amountOut: Number(swap.data.amount1 || 0) * LAMPORTS_PER_SOL,
        };

  const newSwaps = await db
    .insert(swaps)
    .values({
      id: crypto.randomUUID(),
      direction: swap.eventDisplayType === "Buy" ? 0 : 1,
      price: Number(swap.token0ValueUsd),
      timestamp: new Date(swap.timestamp * 1000).toISOString(),
      tokenMint:
        swap.eventDisplayType === "Buy"
          ? swap.token1Address
          : swap.token0Address,
      txId: swap.transactionHash,
      type: swap.eventDisplayType === "Buy" ? "buy" : "sell",
      user: swap.maker,
      ...amounts,
    })
    .returning();

  const wsClient = getWebSocketClient(c.env);

  await wsClient.to(`token-${swap.token0Address}`).emit("newSwap", newSwaps[0]);

  return c.json({
    message: "Completed",
  });
});

export default router;
