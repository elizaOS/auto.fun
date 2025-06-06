import dotenv from "dotenv-flow";
dotenv.config();

import { Connection } from "@solana/web3.js";
import { Context, Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import { cors } from "hono/cors";
import type { WSContext } from "hono/ws"; // Import WSContext type for handlers

import { allowedOrigins } from "./allowedOrigins";
import { verifyAuth } from "./auth/auth";
import { runCronTasks } from "./cron"; // Import the cron task runner
import { Env } from "./env"; // Assuming Env type is defined and includes Redis vars
import { adminRouter, ownerRouter } from "./routes/admin";
import agentRouter from "./routes/agents";
import authRouter from "./routes/auth";
import chatRouter from "./routes/chat";
import fileRouter from "./routes/files";
import generationRouter from "./routes/generation";
import migrationRouter from "./routes/migration";
import preGeneratedAdminRoutes from "./routes/admin/pregenerated"; // Import the new router
import shareRouter from "./routes/share";
import userRouter from "./routes/user";
import swapRouter from "./routes/swap";
import tokenRouter from "./routes/token";
import webhookRouter from "./routes/webhooks";
import { logger } from "./util";
import { webSocketManager } from "./websocket-manager";
import { fork } from "node:child_process";
import path from "node:path";
import { getSOLPrice } from "./mcap";
import { getGlobalRedisCache } from "./redis";
import { createRateLimiter } from "./middleware/rateLimiter";

interface AppVariables {
  user?: { publicKey: string } | null;
}

const app = new Hono<{ Variables: AppVariables }>();

const env = process.env as unknown as Env;

// Setup Solana connection
const RPC_URL = (
  process.env.NETWORK === "devnet"
    ? process.env.DEVNET_SOLANA_RPC_URL
    : process.env.MAINNET_SOLANA_RPC_URL
)!;

if (!RPC_URL) {
  throw new Error(
    "RPC_URL is not defined. Set NETWORK and corresponding RPC URL in .env"
  );
}
const connection = new Connection(RPC_URL, "confirmed");
logger.info(`Connected to Solana RPC: ${RPC_URL}`);

// --- Middleware ---

// CORS Middleware (from original index.ts)
app.use(
  "*",
  cors({
    origin: allowedOrigins, // Make sure allowedOrigins is compatible
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "X-API-Key",
      "X-Twitter-OAuth-Token",
      "X-Twitter-OAuth-Token-Secret",
      "ngrok-skip-browser-warning", // Added for ngrok testing if needed
    ],
    exposeHeaders: ["Content-Length"],
    maxAge: 60000,
  })
);
const api = new Hono<{ Variables: AppVariables }>();

(async () => {
  const redisCache = await getGlobalRedisCache();
  const limiter = createRateLimiter(redisCache);
  app.use("*", limiter);

  api.use("*", verifyAuth);
  api.route("/generation", generationRouter);
  api.route("/", tokenRouter);

  api.route("/", fileRouter);
  api.route("/", authRouter);
  api.route("/", agentRouter);
  api.route("/", swapRouter);
  api.route("/", chatRouter);
  api.route("/share", shareRouter);
  api.route("/", webhookRouter);
  api.route("/", migrationRouter);
  api.route("/users", userRouter);
  api.route("/admin", adminRouter);
  api.route("/owner", ownerRouter);
  api.route("/admin/pregenerated", preGeneratedAdminRoutes); // Mount the new router

  api.get("/sol-price", async (c) => {
    try {
      const solPrice = await getSOLPrice(); // Use the global cache service
      logger.info("(Placeholder) Would fetch SOL price");
      return c.json({ price: solPrice });
    } catch (error) {
      logger.error("Error fetching SOL price:", error);
      return c.json({ error: "Failed to fetch SOL price" }, 500);
    }
  });

  // --- Mount the API sub-router ---
  app.route("/api", api);
})();

// --- Special Cron Trigger Route ---
// Use a non-standard path and require a secret header
const CRON_SECRET = process.env.CRON_SECRET || "develop"; // Get secret from environment

if (!CRON_SECRET) {
  logger.warn(
    "CRON_SECRET environment variable not set. Cron trigger endpoint will be disabled."
  );
}

// Mount this route directly on the main app, outside /api if desired
app.post("/trigger-cron", async (c) => {
  console.log("Triggering cron");
  const providedSecret = c.req.header("X-Cron-Secret");
  if (providedSecret !== CRON_SECRET) {
    logger.warn("Unauthorized attempt to trigger cron endpoint.");
    return c.json({ error: "Unauthorized" }, 403);
  }

  logger.log(
    "Cron trigger endpoint called successfully. Initiating tasks asynchronously..."
  );

  // Run tasks asynchronously (fire and forget). Do NOT await here.
  // The lock mechanism inside runCronTasks will prevent overlaps.
  await runCronTasks();

  // Return immediately to the cron runner
  return c.json({ success: true, message: "Cron tasks finished." });
});

// --- Root and Maintenance Routes ---
app.get("/", (c) => c.json({ status: "ok", message: "Hono server running!" }));

// --- Not Found Handler ---
app.notFound((c) => {
  logger.warn(`Not Found: ${c.req.method} ${c.req.url}`);
  return c.json(
    {
      error: "Not Found",
      message: `Route ${c.req.method} ${c.req.url} not found.`,
    },
    404
  );
});

// --- Error Handler ---
app.onError((err, c) => {
  logger.error(
    `Unhandled error on ${c.req.path}:`,
    err instanceof Error ? err.stack : err
  );
  // Avoid leaking stack traces in production
  return c.json({ error: "Internal Server Error" }, 500);
});

(async () => {
  // --- Initialize Services ---
  const redisCache = await getGlobalRedisCache();
  logger.info("Redis Cache Service Retrieved.");
  const isReady = await redisCache.isPoolReady();

  console.log("isReady", isReady);

  if (!redisCache) throw new Error("Redis Cache Service not found");

  // Initialize WebSocketManager with Redis
  if (!webSocketManager.redisCache) {
    await webSocketManager.initialize(redisCache);
  }

  if (!webSocketManager.redisCache) {
    throw new Error("WebSocket Manager not initialized");
  }
})().catch((err) => {
  logger.error("Error during initialization:", err);
});

// --- Create Bun WebSocket handlers ---
const { upgradeWebSocket, websocket } = createBunWebSocket();
// --- Add WebSocket Upgrade Route ---
app.get(
  "/ws",
  upgradeWebSocket((c: Context) => {
    return {
      onOpen: (_evt: Event, wsInstance: WSContext) => {
        webSocketManager.handleConnectionOpen(wsInstance);
      },
      onMessage: (evt: MessageEvent, wsInstance: WSContext) => {
        webSocketManager.handleMessage(wsInstance, evt.data);
      },
      onClose: (_evt: CloseEvent, wsInstance: WSContext) => {
        webSocketManager.handleConnectionClose(wsInstance);
      },
      onError: (evt: Event, wsInstance: WSContext) => {
        logger.error("WebSocket error event:", evt);
        const error = (evt as ErrorEvent).error || new Error("WebSocket error");
        webSocketManager.handleConnectionError(wsInstance, error);
      },
    };
  })
);

// Export fetch and websocket handlers for Bun
export default {
  fetch: app.fetch,
  websocket, // Add the websocket handler
};
