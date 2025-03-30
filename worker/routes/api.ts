import { Hono } from "hono";
import { cors } from "hono/cors";
import { sign, verify } from "hono/jwt";
import { cookieStore } from "hono/cookie-store";
import { Env } from "../env";
import { getSOLPrice } from "../mcap";

export const apiRouter = new Hono<{ Bindings: Env }>();

// Add CORS for API routes
apiRouter.use(
  "*",
  cors({
    origin: ["*"],
    allowHeaders: ["Authorization"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    credentials: true,
  }),
);

// Session store
apiRouter.use(
  "*",
  cookieStore({
    key: "session",
    cookie: {
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "None",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    },
  }),
);

/**
 * Get SOL price in USD
 */
apiRouter.get("/sol-price", async (c) => {
  try {
    const price = await getSOLPrice(c.env);
    return c.json({ price });
  } catch (error) {
    console.error("Error fetching SOL price:", error);
    return c.json({ error: "Failed to fetch SOL price" }, 500);
  }
});

/**
 * Check auth status endpoint
 */
apiRouter.get("/auth-status", async (c) => {
  // ... existing code
});
