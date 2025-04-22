import { Connection } from "@solana/web3.js";
import dotenv from "dotenv";
import { Hono } from "hono";
import { cors } from "hono/cors";
// import type { Serve } from '@hono/node-server' // Remove this type import

// Load environment variables from .env file at the root
dotenv.config({ path: "../../.env" });

import { allowedOrigins } from "./allowedOrigins";
import { verifyAuth } from "./auth";
import { Env } from "./env"; // Assuming Env type is defined and includes Redis vars
import { adminRouter, ownerRouter } from "./routes/admin";
import agentRouter from "./routes/agents";
import authRouter from "./routes/auth";
import chatRouter from "./routes/chat";
import fileRouter from "./routes/files";
import generationRouter from "./routes/generation";
import messagesRouter from "./routes/messages";
import migrationRouter from "./routes/migration";
import shareRouter from "./routes/share";
import swapRouter from "./routes/swap";
import tokenRouter from "./routes/token";
import webhookRouter from "./routes/webhooks";
// import { uploadToCloudflare } from "./uploader";
import { logger } from "./util";
// import { claimFees } from "./claimFees";
import { createRedisCache } from './redis/redisCacheService'; // Import Redis factory
import { RedisPool } from './redis/redisPool'; // Import RedisPool type if needed for shutdown variable
import { webSocketManager } from './websocket-manager';
// Assuming getSharedRedisPool is exported from redisCacheService or redisPool
import { getSharedRedisPool } from './redis/redisCacheService';

// Define types based on Env, but adaptable for Node.js environment
// You might need to adjust Env definition or how these are accessed
interface AppBindings {
  // Define bindings accessible in Node.js context if needed (e.g., DB connections, service clients)
  // R2: any; // Example: Replace with appropriate type for R2/S3 client
  // AI: any; // Example: Replace if using AI service client
  // DB: any; // Example: Replace if using DB client
}

// Define Variables type matching the original Hono app
interface AppVariables {
  user?: { publicKey: string } | null;
  // Add any other variables used in middleware/routes
}

// Initialize Hono app with Node.js compatible types
const app = new Hono<{ Bindings: AppBindings; Variables: AppVariables }>();

// --- Environment Setup (Load or Validate Env Vars) ---
// Ensure necessary env vars are loaded (dotenv should have done this)
// You might want to validate required env vars here (like REDIS_HOST etc.)
const env = process.env as unknown as Env; // Cast process.env, ensure Env type matches
if (!env.REDIS_HOST || !env.REDIS_PORT) {
  // Add checks for other required env vars
  logger.error("Missing required environment variables (e.g., REDIS_HOST, REDIS_PORT)");
  process.exit(1);
}

// Setup Solana connection
const RPC_URL =
  (process.env.NETWORK === "devnet"
    ? process.env.DEVNET_SOLANA_RPC_URL
    : process.env.MAINNET_SOLANA_RPC_URL)!;

if (!RPC_URL) {
  throw new Error(
    "RPC_URL is not defined. Set NETWORK and corresponding RPC URL in .env",
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
  }),
);

// Authentication Middleware (from original index.ts)
// Ensure verifyAuth correctly reads JWT from headers and sets c.set('user', ...)
app.use("*", verifyAuth);

// --- API Routes ---

// Create a sub-router for API endpoints
const api = new Hono<{ Bindings: AppBindings; Variables: AppVariables }>();

// Apply CORS and Auth middleware to the API sub-router as well
// (This might be redundant if already applied globally, but ensures consistency)
// api.use("*", cors(...)); // Re-applying CORS here might not be necessary if applied globally with "*"
api.use("*", verifyAuth); // Ensure auth applies to all /api routes

// --- Mount existing routers ---
// Ensure these routers don't rely on Cloudflare `c.env` bindings without adaptation
api.route("/", generationRouter);
api.route("/", tokenRouter);
api.route("/", agentRouter);
api.route("/", fileRouter);
api.route("/", messagesRouter);
api.route("/", authRouter);
api.route("/", swapRouter);
api.route("/", chatRouter);
api.route("/share", shareRouter);
api.route("/", webhookRouter);
api.route("/", migrationRouter);
api.route("/admin", adminRouter); // Note: Ensure admin/owner routes have appropriate checks
api.route("/owner", ownerRouter);

// --- Add /claim-fees route from app.ts ---
// Assuming claimFees function is available and adapted for Hono context if needed
// import { claimFees } from './claimFees'; // Make sure this import exists and works

// api.post("/claim-fees", async (c) => {
//   try {
//     // Auth check - verifyAuth middleware should handle this
//     const user = c.get("user");
//     if (!user) {
//       // This check might be redundant if verifyAuth enforces authentication
//       // Depending on verifyAuth's behavior, you might adjust this
//       return c.json({ error: "Unauthorized" }, 401);
//     }

//     // Get body - Hono uses c.req.json()
//     const body = await c.req.json();
//     const { tokenMint, userAddress, nftMint, poolId } = body;

//     if (!tokenMint || !userAddress || !nftMint || !poolId) {
//       return c.json(
//         { error: "Missing required fields: tokenMint, userAddress, nftMint, poolId" },
//         400,
//       );
//     }

//     // Optional: Validate userAddress matches authenticated user if necessary
//     // if (user.publicKey !== userAddress) {
//     //   return c.json({ error: "User address mismatch" }, 403);
//     // }

//     const claimer = new PublicKey(userAddress);

//     // Call the claimFees function (ensure it's imported and adapted)
//     // const txSignature = await claimFees(
//     //   new PublicKey(nftMint),
//     //   new PublicKey(poolId),
//     //   connection, // Pass the shared Solana connection
//     //   claimer,
//     // );

//     // Placeholder response until claimFees is integrated
//     const txSignature = "placeholder_tx_signature_for_claim_fees";
//     logger.info(`Claim fees would be triggered for ${tokenMint}`);


//     if (txSignature) {
//       // Handle success, maybe log or notify
//       logger.info(`Claim fees triggered for ${tokenMint}, Tx: ${txSignature}`);
//       // TODO: Notify user if necessary
//     }

//     return c.json({ status: "Claim fees triggered", tokenMint, txSignature }); // Return signature
//   } catch (err: any) {
//     logger.error("Error in /claim-fees:", err);
//     // Provide a more generic error message to the client for security
//     return c.json({ error: "Failed to trigger claim fees" }, 500);
//   }
// });

// --- Add /upload route (adapted from original index.ts) ---
// Needs adjustment for Node.js environment (e.g., R2 access)
// import { uploadToCloudflare } from "./uploader"; // Requires Node.js adaptation
// import { Buffer } from 'buffer'; // Node.js Buffer

// api.post("/upload", async (c) => {
//   try {
//     const user = c.get("user");
//     if (!user) {
//       return c.json({ error: "Authentication required" }, 401);
//     }

//     const body = await c.req.json();
//     if (!body.image) {
//       return c.json({ error: "Image is required" }, 400);
//     }

//     const matches = body.image.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
//     if (!matches || matches.length !== 3) {
//       return c.json({ error: "Invalid image format" }, 400);
//     }

//     const contentType = matches[1];
//     const imageData = matches[2];
//     const imageBuffer = Buffer.from(imageData, "base64"); // Use Node.js Buffer

//     let filename = `image_${Date.now()}`;
//     if (body.metadata?.name) {
//       const sanitizedName = body.metadata.name.toLowerCase().replace(/[^a-z0-9]/g, "_");
//       let extension = ".jpg"; // Default
//       if (contentType === "image/png") extension = ".png";
//       else if (contentType === "image/gif") extension = ".gif";
//       else if (contentType === "image/svg+xml") extension = ".svg";
//       else if (contentType === "image/webp") extension = ".webp";
//       filename = `${sanitizedName}${extension}`;
//     }

//     // --- Cloudflare R2 Upload Logic Needs Replacement ---
//     // const imageUrl = await uploadToCloudflare(c.env, imageBuffer, { contentType, filename });
//     // Replace uploadToCloudflare with a Node.js compatible S3/R2 client like AWS SDK v3
//     // Example placeholder using a dummy function:
//     // const imageUrl = await nodeUploadFunction(imageBuffer, { contentType, filename, /* Add Node S3/R2 config */ });
//     const imageUrl = `https://placeholder.r2.dev/${filename}`; // Replace with actual URL from Node upload
//     logger.log(`(Placeholder) Would upload image: ${filename} (${contentType})`);
//     // --- End R2 Replacement ---

//     let metadataUrl = "";
//     if (body.metadata) {
//       const metadataFilename = `${filename.replace(/\.[^.]+$/, "")}_metadata.json`;
//       const metadataBuffer = Buffer.from(JSON.stringify({ ...body.metadata, image: imageUrl }));
//       // --- Metadata Upload Logic Needs Replacement ---
//       // metadataUrl = await nodeUploadFunction(metadataBuffer, { contentType: 'application/json', filename: metadataFilename, /* Add Node S3/R2 config */ });
//       metadataUrl = `https://placeholder.r2.dev/${metadataFilename}`; // Replace
//       logger.log(`(Placeholder) Would upload metadata: ${metadataFilename}`);
//       // --- End Metadata Replacement ---
//     }

//     return c.json({ success: true, imageUrl, metadataUrl });
//   } catch (error) {
//     logger.error("Error uploading:", error);
//     return c.json({ error: "Upload failed" }, 500);
//   }
// });

// --- Add /sol-price route (adapted from original index.ts) ---
// Needs adjustment for Node.js caching if getSOLPrice used CF Cache API
// import { getSOLPrice } from "./mcap"; // Ensure adapted for Node.js

// api.get("/sol-price", async (c) => {
//   try {
//     // Ensure getSOLPrice is adapted for Node.js (e.g., using a simple in-memory cache or redis)
//     // const price = await getSOLPrice(/* Pass necessary env/config if needed */);
//     const price = 150.00; // Placeholder value
//     logger.info("(Placeholder) Would fetch SOL price");
//     return c.json({ price });
//   } catch (error) {
//     logger.error("Error fetching SOL price:", error);
//     return c.json({ error: "Failed to fetch SOL price" }, 500);
//   }
// });

// --- Mount the API sub-router ---
app.route("/api", api);

// --- Root and Maintenance Routes ---
app.get("/", (c) => c.json({ status: "ok", message: "Hono server running!" }));

const MAINTENANCE_MODE_ENABLED = process.env.MAINTENANCE_MODE === "true";
app.get("/maintenance-mode", (c) => {
  return c.json({ enabled: MAINTENANCE_MODE_ENABLED });
});

// --- Not Found Handler ---
app.notFound((c) => {
  logger.warn(`Not Found: ${c.req.method} ${c.req.url}`);
  return c.json({ error: "Not Found", message: `Route ${c.req.method} ${c.req.url} not found.` }, 404);
});

// --- Error Handler ---
app.onError((err, c) => {
  logger.error(`Unhandled error on ${c.req.path}:`, err instanceof Error ? err.stack : err);
  // Avoid leaking stack traces in production
  return c.json({ error: "Internal Server Error" }, 500);
});


// --- Initialize Services ---
let redisPoolInstance: RedisPool | null = null;
try {
  redisPoolInstance = getSharedRedisPool(env); // Initialize or get pool
} catch (error) {
  logger.error("Failed to initialize Redis Pool:", error);
  process.exit(1);
}
const redisCache = createRedisCache(env); // Create cache service instance
logger.info("Redis Cache Service Initialized.");

// --- Start the Node.js server ---
const PORT = parseInt(process.env.PORT || "8787", 10);

if (isNaN(PORT)) {
  logger.error(`Invalid PORT environment variable: ${process.env.PORT}.`);
  process.exit(1);
}

// Simplify server options type
const serverOptions = {
  fetch: app.fetch,
  port: PORT,
};

// const server = serve(serverOptions, (info: AddressInfo) => {
//   console.log(`🚀 Server listening on http://localhost:${info.port}`);
//   logger.info(`Server started successfully on port ${PORT}`);
// });

// --- Initialize WebSocketManager with Redis ---
try {
  webSocketManager.initialize(app, redisCache); // Pass Redis cache
} catch (error) {
   logger.error("Failed to initialize WebSocket Manager:", error);
   // Consider shutting down the server if WS manager fails
}

// --- Graceful Shutdown --- 
const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
signals.forEach((signal) => {
  process.on(signal, async () => { // Make handler async
    logger.info(`Received ${signal}, shutting down gracefully...`);
    let exitCode = 0;
    const shutdownTimeout = setTimeout(() => {
        logger.warn("Graceful shutdown timed out after 10s. Forcing exit.");
        process.exit(1);
    }, 10000); // 10 seconds timeout

    try {
        // 1. Close WebSocketManager (terminates local connections)
        logger.info("Closing WebSocket Manager...");
        webSocketManager.close();

        // 2. Close HTTP server (stops accepting new connections)
        logger.info("Closing HTTP Server...");
        await new Promise<void>((resolve, reject) => {
            server.close((err) => {
                if (err) {
                     logger.error("Error closing HTTP server:", err);
                     return reject(err);
                 }
                logger.info("HTTP Server closed.");
                resolve();
            });
        });

        // 3. Close Redis Pool
        if (redisPoolInstance) {
             logger.info("Closing Redis Pool...");
             await redisPoolInstance.destroy(); // Assuming pool has a destroy method
             logger.info("Redis Pool closed.");
        }

        // Add other cleanup (e.g., database connections) here

    } catch (error) {
        logger.error("Error during graceful shutdown:", error);
        exitCode = 1;
    } finally {
         clearTimeout(shutdownTimeout); // Cancel force exit timeout
         logger.info(`Graceful shutdown complete. Exiting with code ${exitCode}.`);
        process.exit(exitCode);
    }
  });
});

logger.info(`Server configured to run on port ${PORT}`);
export default app;