import type { R2ObjectBody } from "@cloudflare/workers-types";
import {
  ExecutionContext,
  ScheduledEvent,
} from "@cloudflare/workers-types/experimental";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { cron } from "./cron";
import { getDB, preGeneratedTokens } from "./db";
import { Env } from "./env";
import { logger } from "./logger";
import { verifyAuth } from "./middleware";
import authRouter from "./routes/auth";
import generationRouter, { checkAndReplenishTokens } from "./routes/generation";
import messagesRouter from "./routes/messages";
import shareRouter from "./routes/share";
import swapRouter from "./routes/swap";
import tokenRouter, { processSwapEvent } from "./routes/token";
import { uploadToCloudflare } from "./uploader";
import { WebSocketDO, allowedOrigins, createTestSwap } from "./websocket";
import { getWebSocketClient } from "./websocket-client";
import { getSOLPrice } from "./mcap";

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

app.use("*", verifyAuth);

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

api.use("*", verifyAuth);

api.route("/", generationRouter);
api.route("/", tokenRouter);
api.route("/", messagesRouter);
api.route("/", authRouter);
api.route("/", swapRouter);
api.route("/share", shareRouter);

// Root paths for health checks
app.get("/", (c) => c.json({ status: "ok" }));

app.get("/protected-route", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const apiKey = authHeader.substring(7);

  return c.json({
    success: true,
    message: "You have access to the protected route",
  });
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

api.get("/image/:key", async (c) => {
  try {
    // Get the key from params
    const key = c.req.param("key");
    if (!key) {
      return c.json({ error: "Key parameter is required" }, 400);
    }

    if (!c.env.R2) {
      return c.json({ error: "R2 is not available" }, 500);
    }

    // First, let's try to find the file in the pre-generated tokens table
    let fullStorageKey: string | null = null;

    try {
      const db = getDB(c.env);

      // Search for tokens where the image URL contains the requested filename
      const tokens = await db
        .select()
        .from(preGeneratedTokens)
        .where(sql`image LIKE ${"%" + key + "%"}`);

      logger.log(
        `Found ${tokens.length} tokens with image URLs containing ${key}`,
      );

      if (tokens.length > 0) {
        // Extract the full storage path from the image URL
        const imageUrl = tokens[0].image;

        if (imageUrl) {
          // Extract the key part from the full URL
          // Format could be like: https://example.r2.dev/pre-generated/token-name.png
          // or http://localhost:8787/api/image/abc123-token-name.png

          // Try to extract the last part of the path
          const urlParts = imageUrl.split("/");
          const lastPart = urlParts[urlParts.length - 1];

          // If the URL points to image, we need to retrieve the original key
          if (imageUrl.includes("/api/image/")) {
            // Try to find the actual file by listing objects
            const listed = await c.env.R2.list({ prefix: "", delimiter: "/" });

            // Look for a key containing the lastPart
            const matchingKey = listed.objects.find(
              (obj) =>
                obj.key.includes(lastPart) ||
                obj.key.toLowerCase().includes(lastPart.toLowerCase()),
            )?.key;

            if (matchingKey) {
              fullStorageKey = matchingKey;
              logger.log(`Found storage key from listing: ${fullStorageKey}`);
            }
          } else if (imageUrl.includes("r2.dev")) {
            // This is a direct R2 URL, extract the path after the domain
            const pathMatch = imageUrl.match(/r2\.dev\/(.*?)(?:\?|$)/);
            if (pathMatch && pathMatch[1]) {
              fullStorageKey = pathMatch[1];
              logger.log(`Extracted R2 path: ${fullStorageKey}`);
            }
          } else if (imageUrl.includes("pre-generated/")) {
            // If the URL contains pre-generated/, use that path
            const pathMatch = imageUrl.match(/pre-generated\/(.*?)(?:\?|$)/);
            if (pathMatch && pathMatch[1]) {
              fullStorageKey = `pre-generated/${pathMatch[1]}`;
              logger.log(`Using pre-generated path: ${fullStorageKey}`);
            }
          }
        }
      }
    } catch (dbError) {
      logger.error("Error querying database:", dbError);
      // Continue with fallback search even if DB lookup fails
    }

    // If we found the key in the database, retrieve it directly
    if (fullStorageKey) {
      const object = await c.env.R2.get(fullStorageKey);
      if (object) {
        logger.log(
          `Successfully retrieved file using database key: ${fullStorageKey}`,
        );
        // Get the content type from the object's metadata
        const contentType =
          object.httpMetadata?.contentType || "application/octet-stream";

        // Read the object's body
        const data = await object.arrayBuffer();

        // Return the object with the correct content type
        return new Response(data, {
          headers: {
            "Content-Type": contentType,
            "Content-Length": object.size.toString(),
            "Cache-Control": "public, max-age=31536000",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
    }

    // Fallback to the direct key search with different prefixes
    const possiblePrefixes = [
      "", // No prefix
      "pre-generated/",
      `pre-generated/${key.split(".")[0]}.`, // Try filename without extension
    ];

    let object: R2ObjectBody | null = null;

    // Try each possible prefix
    for (const prefix of possiblePrefixes) {
      const fullKey = prefix + key;
      logger.log(`Trying to fetch file with key: ${fullKey}`);
      const result = await c.env.R2.get(fullKey);
      if (result) {
        object = result;
        logger.log(`Found file with key: ${fullKey}`);
        break;
      }
    }

    // If no object found, try listing objects to find a match
    if (!object) {
      // List objects to find a match
      const listed = await c.env.R2.list({ prefix: "", delimiter: "/" });

      // Look for a key containing the filename
      const matchingKey = listed.objects.find(
        (obj) =>
          obj.key.includes(key) ||
          obj.key.toLowerCase().includes(key.toLowerCase()),
      )?.key;

      if (matchingKey) {
        logger.log(`Found file with similar name: ${matchingKey}`);
        const result = await c.env.R2.get(matchingKey);
        if (result) {
          object = result;
        }
      }
    }

    if (!object) {
      return c.json({ error: "File not found", searched: key }, 404);
    }

    // Get the content type from the object's metadata
    const contentType =
      object.httpMetadata?.contentType || "application/octet-stream";

    // Log the content type for debugging
    logger.log(`Serving file ${key} with content type: ${contentType}`);

    // Read the object's body
    const data = await object.arrayBuffer();

    // Broad CORS headers for development
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    };

    // Return the object with the correct content type
    return new Response(data, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": object.size.toString(),
        "Cache-Control": "public, max-age=31536000",
        ...corsHeaders,
      },
    });
  } catch (error) {
    logger.error("Error serving R2 file:", error);
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

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Run frequent monitoring for token events if it's the right trigger
    // We should run this more frequently than the regular price updates
    if (event.cron === "*/1 * * * *") {
      // Every minute
      logger.log("Running token monitoring (every minute)");

      // Call cron with the proper environment parameter
      await cron(env, ctx);
    } else if (event.cron === "*/15 * * * *") {
      // Every 15 minutes
      logger.log("Running full price updates (every 15 minutes)");

      // Call cron with the proper environment parameter
      await cron(env, ctx);
    }
  },
};
