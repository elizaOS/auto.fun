import { Hono } from "hono";
import { Env } from "../env";
import { z } from "zod";
import { fetchPriceChartData, getLatestCandle } from "../chart";
import { logger } from "../logger";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  getDB,
  TokenHolder,
  tokenHolders,
  tokens,
} from "../db";
const router = new Hono<{
  Bindings: Env;
  Variables: {
    user?: { publicKey: string } | null;
  };
}>();

const ChartParamsSchema = z.object({
  pairIndex: z.string().transform((val) => parseInt(val)),
  start: z.string().transform((val) => parseInt(val)),
  end: z.string().transform((val) => parseInt(val)),
  range: z.string().transform((val) => parseInt(val)),
  token: z.string().min(32).max(44),
});

router.get("/chart/:pairIndex/:start/:end/:range/:token", async (c) => {
  try {
    const params = ChartParamsSchema.parse(c.req.param());
    const data = await fetchPriceChartData(
      c.env,
      params.start * 1000,
      params.end * 1000,
      params.range,
      params.token,
    );
    return c.json({ table: data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      c.json({ error: error.errors }, 400);
    } else {
      logger.error(error);
      c.json({ error: "Internal server error" }, 500);
    }
  }
});
// add /creator-tokens to get tokens created by a user
router.post("/creator-tokens", async (c) => {
  const user = c.get("user");

  if (!user) {
    return c.json({ message: "Unauthorized" }, 401);
  }
  const db = getDB(c.env);
  const tokensCreated = await db
    .select()
    .from(tokens)
    .where(and(
      eq(tokens.creator, user.publicKey),
      eq(tokens.imported, 0),
    )).orderBy(desc(tokens.createdAt));
  // return tokensCreated
  return c.json({ tokens: tokensCreated });

});


export default router;
