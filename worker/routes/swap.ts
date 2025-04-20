import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { fetchPriceChartData } from "../chart";
import { getDB, swaps, tokens } from "../db";
import { Env } from "../env";
import { logger } from "../util";

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

router.post("/creator-tokens", async (c) => {
  const user = c.get("user");

  if (!user) {
    return c.json({ message: "Unauthorized" }, 401);
  }
  const db = getDB(c.env);
  const tokensCreated = await db
    .select()
    .from(tokens)
    .where(and(eq(tokens.creator, user.publicKey), eq(tokens.imported, 0)))
    .orderBy(desc(tokens.createdAt));
  // return tokensCreated
  return c.json({ tokens: tokensCreated });
});

router.get("/swaps/:mint", async (c) => {
  try {
    const mint = c.req.param("mint");

    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // Parse pagination parameters
    const limit = parseInt(c.req.query("limit") || "50");
    const page = parseInt(c.req.query("page") || "1");
    const offset = (page - 1) * limit;

    // Get the DB connection
    const db = getDB(c.env);

    // Get real swap data from the database
    const swapsResult = await db
      .select()
      .from(swaps)
      .where(eq(swaps.tokenMint, mint))
      .orderBy(desc(swaps.timestamp))
      .offset(offset)
      .limit(limit);

    // logger.log(`Found ${swapsResult.length} swaps for mint ${mint}`);

    // Get total count for pagination
    const totalSwapsQuery = await db
      .select({ count: sql`count(*)` })
      .from(swaps)
      .where(eq(swaps.tokenMint, mint));

    const totalSwaps = Number(totalSwapsQuery[0]?.count || 0);
    const totalPages = Math.ceil(totalSwaps / limit);

    // Format directions for better readability
    const formattedSwaps = swapsResult.map((swap) => ({
      ...swap,
      directionText: swap.direction === 0 ? "buy" : "sell",
    }));

    const response = {
      swaps: formattedSwaps,
      page,
      totalPages,
      total: totalSwaps,
    };

    return c.json(response);
  } catch (error) {
    logger.error("Error in swaps history route:", error);
    return c.json(
      {
        swaps: [],
        page: 1,
        totalPages: 0,
        total: 0,
        error: "Failed to fetch swap history",
      },
      500,
    );
  }
});

export default router;
