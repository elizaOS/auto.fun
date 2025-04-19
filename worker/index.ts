import type { R2ObjectBody } from "@cloudflare/workers-types";
import { ExecutionContext } from "@cloudflare/workers-types/experimental";
import { sql, or } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { getCookie } from "hono/cookie";
import { cron } from "./cron";
import { getDB, preGeneratedTokens } from "./db";
import { Env } from "./env";
import { logger } from "./logger";
import { verifyAuth } from "./auth";
import authRouter from "./routes/auth";
import chatRouter from "./routes/chat";
import generationRouter, { checkAndReplenishTokens } from "./routes/generation";
import messagesRouter from "./routes/messages";
import shareRouter from "./routes/share";
import swapRouter from "./routes/swap";
import webhookRouter from "./routes/webhooks";
import tokenRouter, { processSwapEvent } from "./routes/token";
import migrationRouter from "./routes/migration";
import adminRouter from "./routes/admin";
import { uploadToCloudflare } from "./uploader";
import { WebSocketDO, createTestSwap } from "./websocket";
import { getWebSocketClient } from "./websocket-client";
import { getSOLPrice } from "./mcap";
import { allowedOrigins } from "./allowedOrigins";
// import { startMonitoringBatch } from "./tokenSupplyHelpers/monitoring";
import { checkMigratingTokens } from "./raydium/migration/migrations";

const app = new Hono<{
  Bindings: Env;
  Variables: {
    user?: { publicKey: string } | null;
  };
}>();

app.use(
  "*",
  cors({
    origin: allowedOrigins,
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    exposeHeaders: ["Content-Length"],
    maxAge: 60000,
  }),
);

// Use the improved verifyAuth middleware
app.use("*", verifyAuth);

// Block direct access to __scheduled endpoints from browsers
app.use("/__scheduled*", async (c, next) => {
  const userAgent = c.req.header("User-Agent") || "";

  // Only allow requests from Cloudflare's own systems or cURL (for testing)
  const isBrowser =
    userAgent.includes("Mozilla/") ||
    userAgent.includes("Chrome/") ||
    userAgent.includes("Safari/") ||
    userAgent.includes("Firefox/");

  if (isBrowser) {
    logger.warn(
      `Blocked browser access to __scheduled endpoint - User-Agent: ${userAgent}`,
    );
    return c.json(
      { error: "This endpoint is for internal Cloudflare use only" },
      403,
    );
  }

  return next();
});

const api = new Hono<{
  Bindings: Env;
  Variables: {
    user?: { publicKey: string } | null;
  };
}>();

api.use(
  "*",
  cors({
    origin: allowedOrigins,
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    exposeHeaders: ["Content-Length"],
    maxAge: 60000,
  }),
);

// Use the improved verifyAuth middleware
api.use("*", verifyAuth);

api.route("/", generationRouter);
api.route("/", tokenRouter);
api.route("/", messagesRouter);
api.route("/", authRouter);
api.route("/", swapRouter);
api.route("/", chatRouter);
api.route("/share", shareRouter);
api.route("/", webhookRouter);
api.route("/", migrationRouter);
api.route("/admin", adminRouter);

// Root paths for health checks
app.get("/", (c) => c.json({ status: "ok" }));

const MAINTENANCE_MODE_ENABLED = false;

app.get("/maintenance-mode", (c) => {
  return c.json({ enabled: MAINTENANCE_MODE_ENABLED });
});

api.post("/upload", async (c) => {
  try {
    // Require authentication
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const body = await c.req.json();

    if (!body.image) {
      return c.json({ error: "Image is required" }, 400);
    }

    // Extract content type and base64 data from the Data URL
    const matches = body.image.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);

    if (!matches || matches.length !== 3) {
      logger.warn("Invalid image format:", body.image.substring(0, 50) + "...");
      return c.json(
        { error: "Invalid image format. Expected data URL format." },
        400,
      );
    }

    const contentType = matches[1];
    const imageData = matches[2];

    logger.log(`Detected content type: ${contentType}`);

    // Check if it's a PNG to verify handling
    const isPng = contentType.toLowerCase() === "image/png";
    if (isPng) {
      logger.log("PNG image detected - ensuring proper handling");
    }

    // Generate a filename based on metadata if available, or use a default
    let filename = `image_${Date.now()}`;

    // If there's metadata with a name, use it for the filename
    if (body.metadata && body.metadata.name) {
      // Sanitize the name for use in filenames
      const sanitizedName = body.metadata.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_");

      // Determine file extension from content type
      let extension = ".jpg"; // Default
      if (contentType === "image/png") extension = ".png";
      else if (contentType === "image/gif") extension = ".gif";
      else if (contentType === "image/svg+xml") extension = ".svg";
      else if (contentType === "image/webp") extension = ".webp";

      filename = `${sanitizedName}${extension}`;
      logger.log(`Generated filename from metadata: ${filename}`);
    }

    const imageBuffer = Uint8Array.from(atob(imageData), (c) =>
      c.charCodeAt(0),
    ).buffer;

    logger.log(
      `Uploading image with content type: ${contentType}, filename: ${filename}`,
    );

    // Upload image to Cloudflare R2
    const imageUrl = await uploadToCloudflare(c.env, imageBuffer, {
      contentType,
      filename,
    });

    logger.log(`Image uploaded successfully: ${imageUrl}`);

    // If metadata provided, upload that too
    let metadataUrl = "";
    if (body.metadata) {
      // Use a similar naming convention for metadata files
      const metadataFilename = `${filename.replace(/\.[^.]+$/, "")}_metadata.json`;

      metadataUrl = await uploadToCloudflare(
        c.env,
        { ...body.metadata, image: imageUrl },
        {
          isJson: true,
          filename: metadataFilename,
        },
      );
      logger.log(`Metadata uploaded successfully: ${metadataUrl}`);
    }

    // Log success for debugging
    logger.log(
      `Upload complete - Image: ${imageUrl}, Metadata: ${metadataUrl}`,
    );

    return c.json({
      success: true,
      imageUrl,
      metadataUrl,
      debug: {
        contentType,
        isPng: isPng || false,
        filename,
      },
    });
  } catch (error) {
    logger.error("Error uploading to Cloudflare:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

// Test endpoint to emit a swap event via WebSocket
api.get("/emit-test-swap/:tokenId", async (c) => {
  try {
    const tokenId = c.req.param("tokenId");
    if (!tokenId) {
      return c.json({ error: "tokenId parameter is required" }, 400);
    }

    // Create test swap data
    const swap = createTestSwap(tokenId);

    // Process and emit the swap event
    await processSwapEvent(c.env, swap);

    return c.json({
      success: true,
      message: "Test swap emitted via WebSocket",
      swap,
    });
  } catch (error) {
    logger.error("Error emitting test swap:", error);
    return c.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// Add an HTTP endpoint to broadcast to WebSocket rooms (useful for testing)
api.post("/broadcast", async (c) => {
  try {
    const { room, event, data } = await c.req.json();

    if (!room || !event) {
      return c.json({ error: "Room and event are required" }, 400);
    }

    // Get WebSocket client
    const wsClient = getWebSocketClient(c.env);

    // Emit to the specified room
    await wsClient.emit(room, event, data);

    return c.json({
      success: true,
      message: `Broadcasted ${event} to ${room}`,
    });
  } catch (error) {
    logger.error("Error broadcasting:", error);
    return c.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

api.get("/sol-price", async (c) => {
  try {
    // If not in cache, fetch the SOL price
    const price = await getSOLPrice(c.env);

    // Prepare the result
    const result = { price };

    return c.json(result);
  } catch (error) {
    console.error("Error fetching SOL price:", error);
    return c.json({ error: "Failed to fetch SOL price" }, 500);
  }
});

api.notFound((c) => {
  return c.json({ error: "Route not found" }, 404);
});

app.route("/api", api);

// Export the WebSocket Durable Object
export { WebSocketDO };

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    // Initialize pre-generated tokens in the background
    ctx.waitUntil(checkAndReplenishTokens(env));

    const url = new URL(request.url);

    // Setup CORS headers for WebSocket requests
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
      "Access-Control-Allow-Credentials": "true",
    };

    // Handle CORS preflight requests for WebSocket endpoint
    if (url.pathname === "/ws" && request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // Handle WebSocket connection upgrade
    if (
      url.pathname === "/ws" &&
      request.headers.get("Upgrade") === "websocket"
    ) {
      // Forward to the WebSocket Durable Object
      if (env.WEBSOCKET_DO) {
        try {
          // Get the singleton instance
          const doId = env.WEBSOCKET_DO.idFromName("singleton");
          const webSocketDO = env.WEBSOCKET_DO.get(doId);

          // Forward the request directly - Durable Objects can handle WebSocket connections
          // @ts-ignore - Types are compatible at runtime
          return webSocketDO.fetch(request);
        } catch (error) {
          logger.error("Error forwarding WebSocket request:", error);
          return new Response("WebSocket error", {
            status: 500,
            headers: corsHeaders,
          });
        }
      } else {
        // For local development when Durable Objects aren't available
        logger.log(
          "Using simplified WebSocket implementation for local development",
        );

        try {
          // Create a new WebSocketPair
          // @ts-ignore - WebSocketPair may be available in Miniflare
          const pair = new WebSocketPair();
          const server = pair[1];
          const client = pair[0];

          // Accept the connection
          server.accept();

          // Send a welcome message
          server.send(
            JSON.stringify({
              event: "connected",
              data: { message: "Connected to development WebSocket server" },
            }),
          );

          // Set up a simple echo handler
          server.addEventListener("message", (event) => {
            try {
              // Log the received message
              logger.log(`Received WebSocket message: ${event.data}`);

              // Parse the message to handle basic functionality
              try {
                const message = JSON.parse(event.data);

                // Handle subscription events
                if (message.event === "subscribeGlobal") {
                  // Acknowledge subscription
                  server.send(
                    JSON.stringify({
                      event: "joined",
                      data: { room: "global" },
                    }),
                  );
                } else if (message.event === "subscribe" && message.data) {
                  // Acknowledge token subscription
                  server.send(
                    JSON.stringify({
                      event: "subscribed",
                      data: { room: `token-${message.data}` },
                    }),
                  );
                }

                // Echo the message back
                server.send(
                  JSON.stringify({
                    event: "echo",
                    data: message,
                  }),
                );
              } catch (parseError) {
                // If not valid JSON, just echo back as text
                server.send(
                  JSON.stringify({
                    event: "echo",
                    data: { text: event.data },
                  }),
                );
              }
            } catch (error) {
              logger.error(`Error handling WebSocket message: ${error}`);
            }
          });

          // Return the client WebSocket
          return new Response(null, {
            status: 101,
            // @ts-ignore - webSocket is non-standard but supported in Cloudflare Workers/Miniflare
            webSocket: client,
          });
        } catch (error) {
          logger.error("Error creating local WebSocket:", error);
          return new Response(
            `WebSocket creation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            {
              status: 500,
              headers: corsHeaders,
            },
          );
        }
      }
    }

    // Handle regular HTTP requests via Hono app
    return app.fetch(request, env, ctx);
  },

  async scheduled(event: any, env: Env, ctx: ExecutionContext) {
    try {
      // Make sure event has the required properties
      if (!event || typeof event.cron !== "string") {
        logger.error("Invalid scheduled event format:", event);
        return;
      }
      {
        /* Malibu: We might need to add this in the future */
      }
      // ctx.waitUntil(
      //   (async () => {
      //     try {
      //       const { processed, total } = await startMonitoringBatch(env, 5);
      //       logger.info(`Scheduled monitoring: processed ${processed}/${total}`);
      //     } catch (err) {
      //       logger.error("Error in batch monitoring:", err);
      //     }
      //   })()
      // );

      // ctx.waitUntil(
      //   (async () => {
      //     try {
      await cron(env, event);
      logger.info("Cron job completed");
      //     } catch (err) {
      //       logger.error("Error in cron job:", err);
      //     }
      //   })()
      // );
    } catch (error) {
      logger.error("Error in scheduled handler:", error);
    }
  },
};
