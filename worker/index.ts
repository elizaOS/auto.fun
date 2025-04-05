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
import generationRouter, { checkAndReplenishTokens } from "./routes/generation";
import messagesRouter from "./routes/messages";
import shareRouter from "./routes/share";
import swapRouter from "./routes/swap";
import heliusWebhookRouter from "./routes/helius-webhook";
import tokenRouter, { processSwapEvent } from "./routes/token";
import { uploadToCloudflare } from "./uploader";
import { WebSocketDO, allowedOrigins, createTestSwap } from "./websocket";
import { getWebSocketClient } from "./websocket-client";
import { getSOLPrice } from "./mcap";

// Define a simple interface for the scheduled event object
interface ScheduledEvent {
  cron: string;
  scheduledTime: number;
}

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
api.route("/share", shareRouter);
api.route("/", heliusWebhookRouter);

// Root paths for health checks
app.get("/", (c) => c.json({ status: "ok" }));

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

      metadataUrl = await uploadToCloudflare(c.env, body.metadata, {
        isJson: true,
        filename: metadataFilename,
      });
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
    const price = await getSOLPrice(c.env);
    return c.json({ price });
  } catch (error) {
    console.error("Error fetching SOL price:", error);
    return c.json({ error: "Failed to fetch SOL price" }, 500);
  }
});

api.notFound((c) => {
  return c.json({ error: "Route not found" }, 404);
});

app.route("/api", api);

// --- Add Explicit Image Route to Main App ---
api.get("/image/:key", async (c) => {
  // This logic is identical to api.get("/image/:key")
  // We add it here to ensure it overrides any implicit/incorrect handling
  try {
    const key = c.req.param("key");
    if (!key) {
      return c.json({ error: "Key parameter is required" }, 400);
    }

    if (!c.env.R2) {
      return c.json({ error: "R2 is not available" }, 500);
    }

    logger.log(
      `[App Route] Attempting to fetch R2 object directly with key: ${key}`,
    );
    let object: R2ObjectBody | null = await c.env.R2.get(key);
    let foundKey = key; // Assume the requested key is the correct one initially

    // If direct fetch fails, try a fallback lookup via database
    if (!object) {
      logger.warn(
        `[App Route] Direct R2 fetch failed for key: ${key}. Attempting DB fallback.`,
      );
      try {
        const db = getDB(c.env);
        const tokens = await db
          .select()
          .from(preGeneratedTokens)
          .where(
            or(
              sql`image LIKE ${"%/" + key}`,
              sql`image LIKE ${"%/" + key + "?%"}`, // Handle potential query params
            ),
          )
          .limit(1);

        if (tokens.length > 0 && tokens[0].image) {
          const imageUrl = tokens[0].image;
          logger.log(
            `[App Route] Found potential match in DB with URL: ${imageUrl}`,
          );

          let extractedKey: string | null = null;
          if (
            imageUrl.includes("/api/image/") ||
            imageUrl.includes("/image/")
          ) {
            // Check both /api/image/ and /image/
            extractedKey = imageUrl.substring(imageUrl.lastIndexOf("/") + 1);
          } else if (imageUrl.includes("r2.dev/")) {
            const pathMatch = imageUrl.match(/r2\.dev\/(.*?)(?:\?|$)/);
            if (pathMatch && pathMatch[1]) {
              extractedKey = pathMatch[1];
            }
          }

          if (extractedKey && extractedKey !== key) {
            logger.log(
              `[App Route] Extracted potential R2 key from DB URL: ${extractedKey}. Retrying fetch.`,
            );
            object = await c.env.R2.get(extractedKey);
            if (object) {
              foundKey = extractedKey;
            }
          } else if (extractedKey === key) {
            logger.log(
              `[App Route] Extracted key ${extractedKey} matches requested key ${key}. Object likely does not exist.`,
            );
          } else {
            logger.warn(
              `[App Route] Could not reliably extract R2 key from DB URL: ${imageUrl}`,
            );
          }
        } else {
          logger.log(
            `[App Route] No matching image URL found in DB for key: ${key}`,
          );
        }
      } catch (dbError) {
        logger.error("[App Route] Error during DB fallback lookup:", dbError);
      }
    }

    if (!object || !object.body) {
      // Check for object and body existence
      logger.error(
        `[App Route] R2 object not found or has no body for key: ${key} (even after fallback)`,
      );
      return c.json({ error: "File not found", searchedKey: key }, 404);
    }

    logger.log(
      `[App Route] Successfully retrieved R2 object with key: ${foundKey}`,
    );

    const contentType =
      object.httpMetadata?.contentType || "application/octet-stream";
    logger.log(
      `[App Route] Serving file ${foundKey} with content type: ${contentType}`,
    );

    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Content-Length", object.size.toString());
    headers.set("Cache-Control", "public, max-age=31536000");
    headers.set("ETag", object.httpEtag);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "*");
    headers.set("Access-Control-Max-Age", "86400");

    return new Response(object.body as any, {
      headers,
    });
  } catch (error) {
    logger.error("[App Route] Error serving R2 file:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
// --- End Explicit Image Route ---

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

      await cron(env, event);
    } catch (error) {
      logger.error("Error in scheduled handler:", error);
    }
  },
};
