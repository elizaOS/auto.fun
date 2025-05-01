import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { cache as honoCacheMiddleware } from "hono/cache";
import { z } from "zod";
import { fetchPriceChartData } from "../chart";
import { getDB, tokens } from "../db";
import { getGlobalRedisCache } from "../redis";
import { logger, useCodex } from "../util";
import { Codex } from "@codex-data/sdk";
import {
  EventType,
  RankingDirection,
} from "@codex-data/sdk/dist/resources/graphql";

if (!process.env.CODEX_API_KEY) {
  logger.error("Missing CODEX_API_KEY from .env");
  process.exit(1);
}

const codex = new Codex(process.env.CODEX_API_KEY);

const router = new Hono<{
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
        params.token
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
  }
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
    const limit = 50;
    const redisCache = await getGlobalRedisCache();
    const cacheKey = `swapsListCompressed:${mint}`;
    const lookUpKey = `swapsList${mint}`;

    /** Check if cache is present */
    const cache = await redisCache.getCompressed(cacheKey);
    if (cache) {
      return c.json(cache);
    }

    let responseData: {
      swaps?: any;
    } = {};

    /** Lookup the token to determine whether we should query Codex */
    const db = getDB();
    const token = (
      await db
        .select({
          imported: tokens.imported,
          status: tokens.status,
        })
        .from(tokens)
        .where(eq(tokens.mint, mint))
        .limit(1)
    )?.[0];

    if (!token) throw new Error("Token not found");

    const isCodex = useCodex(token);

    if (isCodex) {
      const data = await codex.queries.getTokenEvents({
        query: {
          address: mint,
          networkId: 1399811149,
          eventType: EventType.Swap,
        },
        direction: RankingDirection.Desc,
        limit: 50,
      });

      const items = data?.getTokenEvents?.items;

      responseData = {
        swaps: items?.map((swap) => {
          return {
            account: swap?.maker || "NA",
            swapType: swap?.eventDisplayType || "Buy",
            // @ts-ignore - TS error but property exists
            solana: swap?.data?.priceBaseTokenTotal || "0",
            // @ts-ignore - TS error but property exists
            tokenAmount: swap?.data?.amountNonLiquidityToken || "0",
            transactionHash: swap?.transactionHash || "",
            // @ts-ignore - TS error but property exists
            timestamp: swap?.timestamp * 1000 || 0,
            // @ts-ignore - TS error but property exists
            usdValue: swap?.data?.priceUsdTotal || null,
          };
        }),
      };
    } else {
      let swapsResultRaw: any[] = [];

      const [swapStrings] = await Promise.all([
        redisCache.lrange(lookUpKey, 0, limit - 1),
      ]);

      swapsResultRaw = swapStrings.map((s) => JSON.parse(s));

      const formattedSwaps = swapsResultRaw.map((swap) => ({
        ...swap,
        directionText: swap.direction === 0 ? "buy" : "sell",
        timestamp: swap.timestamp
          ? new Date(swap.timestamp).toISOString()
          : null,
      }));

      responseData = {
        swaps: formattedSwaps,
      };
    }
    /** Cache the response */
    await redisCache.setCompressed(cacheKey, responseData, 7);

    return c.json(responseData);
  } catch (error) {
    logger.error("Error in swaps history route:", error);
    return c.json(
      {
        swaps: [],
        error: "Failed to fetch swap history",
      },
      500
    );
  }
});

export default router;
