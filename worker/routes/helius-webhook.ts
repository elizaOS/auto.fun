import { Hono } from "hono";
import { Env } from "../env";
import { processTransactionLogs } from "../cron";
import { z } from "zod";

const router = new Hono<{
  Bindings: Env;
  Variables: {
    user?: { publicKey: string } | null;
  };
}>();

router.post("/webhook", async (c) => {
  // value is configured in helius webhook dashboard
  const authorization = c.req.header("Authorization");

  if (authorization !== c.env.HELIUS_WEBHOOK_AUTH_TOKEN) {
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

  for (const event of events) {
    await processTransactionLogs(
      c.env,
      event.meta.logMessages,
      event.transaction.signatures[0]
    );
  }

  return c.json({
    message: "Completed",
  });
});

export default router;
