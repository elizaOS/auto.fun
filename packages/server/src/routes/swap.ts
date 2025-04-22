import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { cache as honoCacheMiddleware } from "hono/cache";
import { z } from "zod";
import { fetchPriceChartData } from "../chart";
import { getDB, tokens } from "../db";
import { Env } from "../env";
import { getGlobalRedisCache } from "../redis/redisCacheGlobal";
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

router.get(
  "/chart/:pairIndex/:start/:end/:range/:token",
  honoCacheMiddleware({
    cacheName: "chart-cache",
    cacheControl: "max-age=120",
    wait: true,
  }),
  async (c) => {
    try {
      const params = ChartParamsSchema.parse(c.req.param());
      const data = await fetchPriceChartData(
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
  },
);

router.post("/creator-tokens", async (c) => {
  const user = c.get("user");

  if (!user) {
    return c.json({ message: "Unauthorized" }, 401);
  }
  const db = getDB();
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

    const redisCache = getGlobalRedisCache();
    const listKey = `swapsList:${mint}`;
    let totalSwaps = 0;
    let swapsResultRaw: any[] = []; // Use any[] for initial parsed data

    try {
      // Fetch total count and paginated swaps concurrently
      const [countResult, swapStrings] = await Promise.all([
        redisCache.llen(listKey),
        redisCache.lrange(listKey, offset, offset + limit - 1),
      ]);

      totalSwaps = countResult;
      swapsResultRaw = swapStrings.map((s) => JSON.parse(s));
      logger.log(
        `Retrieved ${swapsResultRaw.length} swaps (total: ${totalSwaps}) from Redis list ${listKey}`,
      );
    } catch (redisError) {
      logger.error(
        `Failed to read swaps from Redis list ${listKey}:`,
        redisError,
      );
      // Return error or empty list depending on desired behavior
      return c.json(
        {
          swaps: [],
          page: page,
          totalPages: 0,
          total: 0,
          error: "Failed to retrieve swap history from cache",
        },
        500,
      );
    }

    // const totalSwaps = Number(totalSwapsQuery[0]?.count || 0);
    const totalPages = Math.ceil(totalSwaps / limit);

    // Format directions for better readability
    // Also convert timestamp string back to ISO string if needed by frontend
    const formattedSwaps = swapsResultRaw.map((swap) => ({
      ...swap,
      directionText: swap.direction === 0 ? "buy" : "sell",
      // Ensure timestamp is in a consistent format (ISO string)
      timestamp: swap.timestamp ? new Date(swap.timestamp).toISOString() : null,
    }));

    const responseData = {
      swaps: formattedSwaps,
      page,
      totalPages,
      total: totalSwaps,
    };

    return c.json(responseData);
  } catch (error) {
    logger.error("Error in swaps history route:", error);
    return c.json(
      {
        swaps: [],
        page: parseInt(c.req.query("page") || "1"),
        totalPages: 0,
        total: 0,
        error: "Failed to fetch swap history",
      },
      500,
    );
  }
});

export default router;
