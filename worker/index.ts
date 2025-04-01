import type { R2ObjectBody } from "@cloudflare/workers-types";
import {
  ExecutionContext,
  ScheduledEvent,
} from "@cloudflare/workers-types/experimental";
import { sql } from "drizzle-orm";
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
import tokenRouter, { processSwapEvent } from "./routes/token";
import { uploadToCloudflare } from "./uploader";
import { WebSocketDO, allowedOrigins, createTestSwap } from "./websocket";
import { getWebSocketClient } from "./websocket-client";
import { getSOLPrice } from "./mcap";

// Memory cache for SOL price to reduce API calls in development
const DEV_SOL_PRICE_CACHE = {
  price: null as number | null,
  lastUpdate: 0,
  // Cache for 2 minutes
  cacheValidity: 2 * 60 * 1000,
  // Collection of connected WebSocket clients for price broadcasts
  connectedClients: new Set<WebSocket>()
};

// Setup interval for SOL price updates in development
let solPriceUpdateInterval: NodeJS.Timeout | null = null;

/**
 * Updates the SOL price and broadcasts to all connected clients
 * Used for the development WebSocket server only
 */
async function updateAndBroadcastSolPrice(env: Env) {
  try {
    const now = Date.now();
    
    // Only fetch new price if cache is expired
    if (!DEV_SOL_PRICE_CACHE.price || now - DEV_SOL_PRICE_CACHE.lastUpdate > DEV_SOL_PRICE_CACHE.cacheValidity) {
      logger.log("Dev WebSocket: Fetching fresh SOL price for broadcast");
      const price = await getSOLPrice(env);
      
      if (price) {
        DEV_SOL_PRICE_CACHE.price = price;
        DEV_SOL_PRICE_CACHE.lastUpdate = now;
        logger.log(`Dev WebSocket: Updated SOL price: $${price}`);
      }
    }
    
    if (DEV_SOL_PRICE_CACHE.price && DEV_SOL_PRICE_CACHE.connectedClients.size > 0) {
      // Broadcast to all connected clients
      const updateMessage = JSON.stringify({
        event: "solPriceUpdate",
        data: {
          price: DEV_SOL_PRICE_CACHE.price
        }
      });
      
      // Count of successful deliveries
      let deliveredCount = 0;
      
      DEV_SOL_PRICE_CACHE.connectedClients.forEach(client => {
        try {
          if (client.readyState === WebSocket.OPEN) {
            client.send(updateMessage);
            deliveredCount++;
          } else if (client.readyState === WebSocket.CLOSED || client.readyState === WebSocket.CLOSING) {
            // Clean up closed clients
            DEV_SOL_PRICE_CACHE.connectedClients.delete(client);
          }
        } catch (error) {
          logger.error("Error sending SOL price update to client:", error);
          // Remove problematic clients
          DEV_SOL_PRICE_CACHE.connectedClients.delete(client);
        }
      });
      
      logger.log(`Dev WebSocket: Broadcasted SOL price $${DEV_SOL_PRICE_CACHE.price} to ${deliveredCount} clients`);
    }
  } catch (error) {
    logger.error("Error in SOL price broadcast:", error);
  }
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

          // Add to connected clients for SOL price broadcasts
          DEV_SOL_PRICE_CACHE.connectedClients.add(server);
          
          // Setup SOL price update interval if not already running
          if (!solPriceUpdateInterval) {
            // Update SOL price every 30 seconds
            solPriceUpdateInterval = setInterval(() => {
              updateAndBroadcastSolPrice(env);
            }, 30_000); // 30 seconds
            
            // Initial update
            updateAndBroadcastSolPrice(env);
          }

          // Send a welcome message and initial SOL price if available
          server.send(
            JSON.stringify({
              event: "connected",
              data: { 
                message: "Connected to development WebSocket server",
                // Include current SOL price if available for immediate use
                solPrice: DEV_SOL_PRICE_CACHE.price 
              },
            }),
          );

          // Set up a simple echo handler
          server.addEventListener("message", (event) => {
            try {
              // Log the received message
              logger.log(`Received WebSocket message: ${event.data}`);

              // Set a client ID if not already set
              if (!server.__clientId) {
                server.__clientId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                logger.log(`Assigned WebSocket client ID: ${server.__clientId}`);
              }

              // Parse the message to handle basic functionality
              try {
                const message = JSON.parse(event.data);
                
                // Extract clientId from message if provided
                if (message.clientId) {
                  server.__clientId = message.clientId;
                  logger.log(`Updated WebSocket client ID to: ${server.__clientId}`);
                }

                // Handle subscription events
                if (message.event === "subscribeGlobal") {
                  // Acknowledge subscription
                  server.send(
                    JSON.stringify({
                      event: "joined",
                      data: { room: "global" },
                    }),
                  );
                  
                  // Send current SOL price immediately when subscribing to global
                  if (DEV_SOL_PRICE_CACHE.price) {
                    server.send(
                      JSON.stringify({
                        event: "solPriceUpdate",
                        data: { price: DEV_SOL_PRICE_CACHE.price }
                      })
                    );
                  }
                } else if (message.event === "subscribe" && message.data) {
                  // Acknowledge token subscription
                  server.send(
                    JSON.stringify({
                      event: "subscribed",
                      data: { room: `token-${message.data}` },
                    }),
                  );
                } else if (message.event === "getSolPrice") {
                  // Handle direct SOL price request
                  const handleSolPriceRequest = async () => {
                    try {
                      // Use cached price if available and fresh
                      const now = Date.now();
                      let price: number;
                      
                      if (DEV_SOL_PRICE_CACHE.price && 
                          now - DEV_SOL_PRICE_CACHE.lastUpdate < DEV_SOL_PRICE_CACHE.cacheValidity) {
                        price = DEV_SOL_PRICE_CACHE.price;
                        logger.log(`Using cached SOL price: $${price}`);
                      } else {
                        price = await getSOLPrice(env);
                        if (price) {
                          DEV_SOL_PRICE_CACHE.price = price;
                          DEV_SOL_PRICE_CACHE.lastUpdate = now;
                        }
                        logger.log(`Fetched fresh SOL price: $${price}`);
                      }
                      
                      // Send response
                      server.send(
                        JSON.stringify({
                          event: "solPriceUpdate",
                          data: { price }
                        })
                      );
                    } catch (error) {
                      logger.error("Error handling SOL price request:", error);
                      // Send error response
                      server.send(
                        JSON.stringify({
                          event: "solPriceUpdate",
                          data: { 
                            error: "Failed to fetch SOL price",
                            fallbackPrice: 130.0
                          }
                        })
                      );
                    }
                  };
                  
                  handleSolPriceRequest();
                } else if (message.event === "checkAuthStatus") {
                  // Handle auth status check for development
                  const token = message.data?.token;
                  let walletAddress = null;
                  let authenticated = false;
                  
                  // For wallet tokens, extract wallet address
                  if (token && token.startsWith("wallet_")) {
                    const parts = token.split("_");
                    if (parts.length >= 2) {
                      walletAddress = parts[1];
                      authenticated = true;
                    }
                  } 
                  // For JWT tokens
                  else if (token && token.includes(".")) {
                    try {
                      const parts = token.split(".");
                      if (parts.length === 3) {
                        const payload = JSON.parse(atob(parts[1]));
                        walletAddress = payload.sub || null;
                        authenticated = true;
                      }
                    } catch (e) {
                      logger.error("Error decoding JWT in dev mode:", e);
                    }
                  }
                  
                  // Send auth response
                  server.send(
                    JSON.stringify({
                      event: "authStatus",
                      data: {
                        authenticated,
                        privileges: authenticated ? ["user"] : [],
                        walletAddress,
                        development: true
                      }
                    })
                  );
                } else if (message.event === "getTokens") {
                  // Handle token list request for development
                  try {
                    const page = message.data?.page || 1;
                    const limit = message.data?.limit || 12;
                    const sortBy = message.data?.sortBy || "createdAt";
                    const sortOrder = message.data?.sortOrder || "desc";
                    
                    // Create a more visible log so it's clear we received the tokens request
                    logger.log(`🔄 WebSocket token request: page=${page}, limit=${limit}, sortBy=${sortBy}, sortOrder=${sortOrder}`);
                    
                    // Create a cache key for this specific request
                    const cacheKey = `tokens-${page}-${limit}-${sortBy}-${sortOrder}`;
                    
                    // Use memory cache for development mode
                    // This is a simplified implementation that doesn't persist between worker restarts
                    const memoryCache = (globalThis as any).__tokenCache = (globalThis as any).__tokenCache || {};
                    
                    // Track last request time for each client to prevent rapid duplicate requests
                    const clientRequestCache = (globalThis as any).__clientRequestTimes = (globalThis as any).__clientRequestTimes || {};
                    const requesterId = server.__clientId || "unknown";
                    const now = Date.now();
                    const lastRequestTime = clientRequestCache[`${requesterId}-${cacheKey}`] || 0;
                    
                    // If this client has requested this exact data in the last second, throttle the request
                    if (now - lastRequestTime < 1000) {
                      logger.log(`🚫 Throttling duplicate request from client ${requesterId} (${now - lastRequestTime}ms since last request)`);
                      // Still return cached data if available, but don't hit the API
                      if (memoryCache[cacheKey] && (now - memoryCache[cacheKey].timestamp < 60000)) {
                        server.send(
                          JSON.stringify({
                            event: "tokensList",
                            data: memoryCache[cacheKey].data
                          })
                        );
                      }
                      return;
                    }
                    
                    // Update last request time for this client and this cache key
                    clientRequestCache[`${requesterId}-${cacheKey}`] = now;
                    
                    // Check if we have a recent cached response (last 60 seconds)
                    const cachedItem = memoryCache[cacheKey];
                    if (cachedItem && (now - cachedItem.timestamp < 60000)) {
                      // Use cached data
                      logger.log(`✅ Using cached token data for ${cacheKey} (${now - cachedItem.timestamp}ms old)`);
                      server.send(
                        JSON.stringify({
                          event: "tokensList",
                          data: cachedItem.data
                        })
                      );
                      return;
                    }
                    
                    // Not in cache or expired, fetch from API
                    logger.log(`📥 Fetching fresh token data for ${cacheKey}`);
                    
                    // Construct API URL with query parameters
                    const tokenUrl = new URL(`${env.VITE_API_URL}/api/tokens`);
                    tokenUrl.searchParams.append("page", page.toString());
                    tokenUrl.searchParams.append("limit", limit.toString());
                    tokenUrl.searchParams.append("sortBy", sortBy);
                    tokenUrl.searchParams.append("sortOrder", sortOrder);
                    
                    // Fetch token data with reasonable timeout
                    Promise.race([
                      fetch(tokenUrl.toString()),
                      new Promise((_, reject) => 
                        setTimeout(() => reject(new Error("Fetch timeout")), 5000)
                      )
                    ])
                      .then(response => {
                        if (!response) {
                          throw new Error("Empty response");
                        }
                        if (!(response as Response).ok) {
                          throw new Error(`Token fetch failed: ${(response as Response).status}`);
                        }
                        return (response as Response).json();
                      })
                      .then(tokenData => {
                        // Store in memory cache with timestamp
                        memoryCache[cacheKey] = {
                          data: tokenData,
                          timestamp: now
                        };
                        
                        // Send response to client
                        logger.log(`✅ Sending token data via WebSocket: ${tokenData.tokens?.length || 0} tokens`);
                        server.send(
                          JSON.stringify({
                            event: "tokensList",
                            data: tokenData
                          })
                        );
                      })
                      .catch(error => {
                        logger.error("❌ Error fetching tokens in dev WebSocket:", error);
                        
                        // If we have stale cache, use it despite being expired
                        if (cachedItem) {
                          logger.log(`⚠️ Using stale cache due to fetch error`);
                          server.send(
                            JSON.stringify({
                              event: "tokensList",
                              data: {
                                ...cachedItem.data,
                                _stale: true
                              }
                            })
                          );
                          return;
                        }
                        
                        server.send(
                          JSON.stringify({
                            event: "tokensList",
                            data: { 
                              error: "Error fetching tokens", 
                              tokens: [] 
                            }
                          })
                        );
                      });
                  } catch (error) {
                    logger.error("❌ Error handling token request in dev WebSocket:", error);
                    server.send(
                      JSON.stringify({
                        event: "tokensList",
                        data: { 
                          error: "Server error processing token request", 
                          tokens: [] 
                        }
                      })
                    );
                  }
                } else if (message.event === "searchTokens") {
                  // Handle token search request for development
                  try {
                    const searchQuery = message.data?.search || "";
                    
                    // Create a more visible log for search requests
                    logger.log(`🔍 WebSocket token search request: "${searchQuery}"`);
                    
                    // Create a cache key for this specific search
                    const cacheKey = `search-${searchQuery.toLowerCase().trim()}`;
                    
                    // Use memory cache for development mode
                    const memoryCache = (globalThis as any).__searchCache = (globalThis as any).__searchCache || {};
                    
                    // Track last request time for search requests
                    const clientRequestCache = (globalThis as any).__clientSearchTimes = (globalThis as any).__clientSearchTimes || {};
                    const requesterId = server.__clientId || "unknown";
                    const now = Date.now();
                    const lastRequestTime = clientRequestCache[`${requesterId}-${cacheKey}`] || 0;
                    
                    // If this client has searched for the same thing in the last second, throttle
                    if (now - lastRequestTime < 1000) {
                      logger.log(`🚫 Throttling duplicate search from client ${requesterId} (${now - lastRequestTime}ms since last search)`);
                      // Still return cached data if available, but don't hit the API
                      if (memoryCache[cacheKey] && (now - memoryCache[cacheKey].timestamp < 60000)) {
                        server.send(
                          JSON.stringify({
                            event: "searchResults",
                            data: memoryCache[cacheKey].data
                          })
                        );
                      }
                      return;
                    }
                    
                    // Update last request time for this client and this search
                    clientRequestCache[`${requesterId}-${cacheKey}`] = now;
                    
                    // If search is empty, return empty results
                    if (!searchQuery.trim()) {
                      server.send(
                        JSON.stringify({
                          event: "searchResults",
                          data: { tokens: [] }
                        })
                      );
                      return;
                    }
                    
                    // Check if we have a recent cached response (last 60 seconds)
                    const cachedItem = memoryCache[cacheKey];
                    if (cachedItem && (now - cachedItem.timestamp < 60000)) {
                      // Use cached data
                      logger.log(`✅ Using cached search results for "${searchQuery}" (${now - cachedItem.timestamp}ms old)`);
                      server.send(
                        JSON.stringify({
                          event: "searchResults",
                          data: cachedItem.data
                        })
                      );
                      return;
                    }
                    
                    // Not in cache or expired, fetch from API
                    logger.log(`📥 Fetching fresh search results for "${searchQuery}"`);
                    
                    // Construct API URL with search parameter
                    const searchUrl = new URL(`${env.VITE_API_URL}/api/tokens/search`);
                    searchUrl.searchParams.append("search", searchQuery);
                    
                    // Fetch search results with reasonable timeout
                    Promise.race([
                      fetch(searchUrl.toString()),
                      new Promise((_, reject) => 
                        setTimeout(() => reject(new Error("Search timeout")), 5000)
                      )
                    ])
                      .then(response => {
                        if (!response) {
                          throw new Error("Empty response");
                        }
                        if (!(response as Response).ok) {
                          throw new Error(`Search failed: ${(response as Response).status}`);
                        }
                        return (response as Response).json();
                      })
                      .then(searchData => {
                        // Store in memory cache with timestamp
                        memoryCache[cacheKey] = {
                          data: searchData,
                          timestamp: now
                        };
                        
                        // Send response to client
                        logger.log(`✅ Sending search results via WebSocket: ${searchData.tokens?.length || 0} tokens found`);
                        server.send(
                          JSON.stringify({
                            event: "searchResults",
                            data: searchData
                          })
                        );
                      })
                      .catch(error => {
                        logger.error("❌ Error during token search in dev WebSocket:", error);
                        
                        // If we have stale cache, use it despite being expired
                        if (cachedItem) {
                          logger.log(`⚠️ Using stale search cache due to fetch error`);
                          server.send(
                            JSON.stringify({
                              event: "searchResults",
                              data: {
                                ...cachedItem.data,
                                _stale: true
                              }
                            })
                          );
                          return;
                        }
                        
                        server.send(
                          JSON.stringify({
                            event: "searchResults",
                            data: { 
                              error: "Error searching tokens", 
                              tokens: [] 
                            }
                          })
                        );
                      });
                  } catch (error) {
                    logger.error("❌ Error handling search request in dev WebSocket:", error);
                    server.send(
                      JSON.stringify({
                        event: "searchResults",
                        data: { 
                          error: "Server error processing search request", 
                          tokens: [] 
                        }
                      })
                    );
                  }
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
          
          // Handle WebSocket closing to remove from client list
          server.addEventListener("close", () => {
            // Remove from connected clients
            DEV_SOL_PRICE_CACHE.connectedClients.delete(server);
            logger.log(`WebSocket client disconnected. Remaining: ${DEV_SOL_PRICE_CACHE.connectedClients.size}`);
            
            // Clear interval if no more clients
            if (DEV_SOL_PRICE_CACHE.connectedClients.size === 0 && solPriceUpdateInterval) {
              clearInterval(solPriceUpdateInterval);
              solPriceUpdateInterval = null;
              logger.log("No more WebSocket clients, stopped SOL price updates");
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
