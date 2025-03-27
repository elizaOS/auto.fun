import { Hono } from "hono";
import { Env } from "../env";
import { z } from "zod";
import { fetchPriceChartData } from "../chart";
import { logger } from "../logger";

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
});

export default router;
