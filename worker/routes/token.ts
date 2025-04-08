import { Connection, PublicKey } from "@solana/web3.js";
import { desc, eq, sql, and, asc, count } from "drizzle-orm";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { monitorSpecificToken } from "../cron";
import {
  getDB,
  Swap,
  swaps,
  TokenHolder,
  tokenHolders,
  tokenAgents,
  tokens,
  users,
  Token,
  TokenAgent,
  vanityKeypairs,
} from "../db";
import { Env } from "../env";
import { logger } from "../logger";
import { getSOLPrice } from "../mcap";
import {
  getRpcUrl,
  applyFeaturedSort,
  getFeaturedMaxValues,
  getFeaturedScoreExpression,
  calculateFeaturedScore,
  getMainnetRpcUrl,
  getDevnetRpcUrl,
} from "../util";
import { getWebSocketClient } from "../websocket-client";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  AccountInfo,
  ParsedAccountData,
} from "@solana/web3.js";
import bs58 from "bs58";

// Define the router with environment typing
const tokenRouter = new Hono<{
  Bindings: Env;
  Variables: {
    user?: { publicKey: string } | null;
  };
}>();

// --- STEP 2: Image Upload Endpoint (Simplified) ---
// Accepts only image data, uploads to R2, returns final imageUrl.
tokenRouter.post("/upload", async (c) => {
  logger.log("[/upload - Image Only] Received request");
  let rawBody: any = {}; // Variable to store parsed body for logging
  try {
    // Log raw body *first* before extensive validation
    try {
      rawBody = await c.req.json();
      logger.log(
        "[/upload - Image Only] Received raw body keys:",
        Object.keys(rawBody),
      );
      // Log image prefix if it exists
      if (rawBody && typeof rawBody.image === "string") {
        logger.log(
          "[/upload - Image Only] Received image prefix:",
          rawBody.image.substring(0, 30) + "...",
        );
        logger.log(
          "[/upload - Image Only] Image data is string:",
          typeof rawBody.image === "string",
        );
        logger.log(
          "[/upload - Image Only] Image starts with data:image?",
          rawBody.image.startsWith("data:image"),
        );
      } else {
        logger.log(
          "[/upload - Image Only] Received image field type:",
          typeof rawBody?.image,
        );
      }
    } catch (parseError) {
      logger.error(
        "[/upload - Image Only] Failed to parse request body:",
        parseError,
      );
      return c.json({ error: "Invalid JSON body" }, 400); // Return early if parsing fails
    }

    const user = c.get("user");
    if (!user || !user.publicKey) {
      logger.warn("[/upload - Image Only] Authentication required");
      return c.json({ error: "Authentication required" }, 401);
    }
    logger.log(`[/upload - Image Only] Authenticated user: ${user.publicKey}`);

    if (!c.env.R2) {
      logger.error("[/upload - Image Only] R2 storage is not configured");
      return c.json({ error: "Image storage is not available" }, 500);
    }

    // Use the previously parsed body
    const { image: imageBase64, filename: requestedFilename } = rawBody;

    if (
      !imageBase64 ||
      typeof imageBase64 !== "string" ||
      !imageBase64.startsWith("data:image")
    ) {
      logger.error(
        "[/upload - Image Only] Missing or invalid image data (base64). Value:",
        imageBase64
          ? typeof imageBase64 + ": " + imageBase64.substring(0, 30) + "..."
          : String(imageBase64),
      );
      return c.json({ error: "Missing or invalid image data" }, 400);
    }

    const imageMatch = imageBase64.match(/^data:(image\/[a-z+]+);base64,(.*)$/);
    if (!imageMatch) {
      logger.error(
        "[/upload - Image Only] Invalid image format (regex mismatch)",
      );
      logger.error(
        "[/upload - Image Only] Image prefix:",
        imageBase64.substring(0, 50),
      );
      return c.json({ error: "Invalid image format" }, 400);
    }

    const contentType = imageMatch[1];
    const base64Data = imageMatch[2];
    const imageBuffer = Buffer.from(base64Data, "base64");
    logger.log(
      `[/upload - Image Only] Decoded image: type=${contentType}, size=${imageBuffer.length} bytes`,
    );

    let extension = ".jpg";
    if (contentType.includes("png")) extension = ".png";
    else if (contentType.includes("gif")) extension = ".gif";
    else if (contentType.includes("svg")) extension = ".svg";
    else if (contentType.includes("webp")) extension = ".webp";

    const imageFilename =
      requestedFilename && typeof requestedFilename === "string"
        ? requestedFilename.replace(/[^a-zA-Z0-9._-]/g, "_")
        : `${crypto.randomUUID()}${extension}`;
    const imageKey = `token-images/${imageFilename}`;
    logger.log(`[/upload - Image Only] Determined image R2 key: ${imageKey}`);

    logger.log(
      `[/upload - Image Only] Attempting to upload image to R2 key: ${imageKey}`,
    );
    await c.env.R2.put(imageKey, imageBuffer, {
      httpMetadata: { contentType, cacheControl: "public, max-age=31536000" },
    });
    logger.log(`[/upload - Image Only] Image successfully uploaded to R2.`);

    const imageUrl =
      (c.env as any).LOCAL_DEV === "true"
        ? `${c.env.VITE_API_URL}/api/image/${imageFilename}`
        : `https://pub-75e2227bb40747d9b8b21df85a33efa7.r2.dev/token-images/${imageFilename}`;
    logger.log(
      `[/upload - Image Only] Constructed public image URL: ${imageUrl}`,
    );

    logger.log(
      "[/upload - Image Only] Request successful. Returning image URL.",
    );
    return c.json({
      success: true,
      imageUrl,
    });
  } catch (error) {
    logger.error("[/upload - Image Only] Unexpected error:", error);
    return c.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to process image upload",
      },
      500,
    );
  }
});

// --- Endpoint to serve images from R2 (Logging Added) ---
tokenRouter.get("/image/:filename", async (c) => {
  const filename = c.req.param("filename");
  logger.log(`[/image/:filename] Request received for filename: ${filename}`);
  try {
    if (!filename) {
      logger.warn("[/image/:filename] Filename parameter is missing");
      return c.json({ error: "Filename parameter is required" }, 400);
    }

    if (!c.env.R2) {
      logger.error("[/image/:filename] R2 storage is not available");
      return c.json({ error: "R2 storage is not available" }, 500);
    }

    // IMPORTANT: Use the correct path - all files are in token-images directory
    const imageKey = `token-images/${filename}`;
    logger.log(
      `[/image/:filename] Attempting to get object from R2 key: ${imageKey}`,
    );
    const object = await c.env.R2.get(imageKey);

    if (!object) {
      logger.warn(
        `[/image/:filename] Image not found in R2 for key: ${imageKey}`,
      );

      // DEBUG: List files in the token-images directory to help diagnose issues
      try {
        const objects = await c.env.R2.list({
          prefix: "token-images/",
          limit: 10,
        });
        logger.log(
          `[/image/:filename] Files in token-images directory: ${objects.objects.map((o) => o.key).join(", ")}`,
        );
      } catch (listError) {
        logger.error(
          `[/image/:filename] Error listing files in token-images: ${listError}`,
        );
      }

      return c.json({ error: "Image not found" }, 404);
    }
    logger.log(
      `[/image/:filename] Found object in R2: size=${object.size}, type=${object.httpMetadata?.contentType}`,
    );

    // Determine appropriate content type
    let contentType = object.httpMetadata?.contentType || "image/jpeg";

    // For JSON files, ensure content type is application/json
    if (filename.endsWith(".json")) {
      contentType = "application/json";
    } else if (filename.endsWith(".png")) {
      contentType = "image/png";
    } else if (filename.endsWith(".gif")) {
      contentType = "image/gif";
    } else if (filename.endsWith(".svg")) {
      contentType = "image/svg+xml";
    } else if (filename.endsWith(".webp")) {
      contentType = "image/webp";
    }

    const data = await object.arrayBuffer();

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    };

    logger.log(
      `[/image/:filename] Serving ${filename} with type ${contentType}`,
    );
    return new Response(data, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": object.size.toString(),
        "Cache-Control": "public, max-age=31536000",
        ...corsHeaders,
      },
    });
  } catch (error) {
    logger.error(`[/image/:filename] Error serving image ${filename}:`, error);
    return c.json({ error: "Failed to serve image" }, 500);
  }
});

// --- Register Token Endpoint (REVISED + Logging) ---
// Accepts mint, metadata, imageUrl, metadataUrl. Validates mint. Saves to DB.
tokenRouter.post("/register-token", async (c) => {
  logger.log("[/register-token] Received request");
  try {
    // Require authentication
    const user = c.get("user");
    if (!user || !user.publicKey) {
      logger.warn("[/register-token] Authentication required");
      return c.json({ error: "Authentication required" }, 401);
    }
    logger.log(`[/register-token] Authenticated user: ${user.publicKey}`);

    const body = await c.req.json();
    logger.log("[/register-token] Received body:", {
      mint: body.mint,
      name: body.name,
      symbol: body.symbol,
      imageUrl: !!body.imageUrl,
      metadataUrl: !!body.metadataUrl,
      imported: body.imported,
    });
    const {
      mint,
      name,
      symbol,
      description,
      imageUrl,
      metadataUrl,
      twitter,
      telegram,
      website,
      discord,
      imported,
    } = body;

    // --- Validation ---
    if (
      !mint ||
      typeof mint !== "string" ||
      mint.length < 32 ||
      mint.length > 44
    ) {
      logger.error("[/register-token] Invalid or missing mint address:", mint);
      return c.json({ error: "Invalid or missing mint address" }, 400);
    }
    // ... (keep other validations for name, symbol, description)
    if (!name || typeof name !== "string") {
      logger.error("[/register-token] Invalid or missing name");
      return c.json({ error: "Invalid or missing name" }, 400);
    }
    if (!symbol || typeof symbol !== "string") {
      logger.error("[/register-token] Invalid or missing symbol");
      return c.json({ error: "Invalid or missing symbol" }, 400);
    }
    if (!description || typeof description !== "string") {
      logger.error("[/register-token] Invalid or missing description");
      return c.json({ error: "Invalid or missing description" }, 400);
    }
    if (imageUrl && typeof imageUrl !== "string") {
      logger.error("[/register-token] Invalid imageUrl format");
      return c.json({ error: "Invalid imageUrl format" }, 400);
    }
    if (!metadataUrl || typeof metadataUrl !== "string") {
      logger.error("[/register-token] Missing or invalid metadataUrl");
      return c.json({ error: "Missing or invalid metadataUrl" }, 400);
    }
    logger.log(`[/register-token] Validation passed for mint: ${mint}`);

    const db = getDB(c.env);

    // --- Check if token already exists in DB ---
    logger.log(
      `[/register-token] Checking database for existing token ${mint}`,
    );
    const existingToken = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    if (existingToken && existingToken.length > 0) {
      logger.warn(
        `[/register-token] Token ${mint} already exists in database.`,
      );
      return c.json({
        success: true,
        tokenFound: true,
        message: "Token already exists in database",
        token: existingToken[0],
      });
    }
    logger.log(`[/register-token] Token ${mint} not found in DB, proceeding.`);

    // --- Blockchain Validation (Mint Account Existence) ---
    if (!imported) {
      logger.log(
        `[/register-token] Performing on-chain validation for mint: ${mint}`,
      );
      try {
        const connection = new Connection(getRpcUrl(c.env), "confirmed");
        const mintPublicKey = new PublicKey(mint);
        const mintAccountInfo = await connection.getAccountInfo(mintPublicKey);

        if (!mintAccountInfo) {
          logger.error(
            `[/register-token] Mint address ${mint} not found on chain (${c.env.NETWORK || "default"})`,
          );
          return c.json(
            { error: "Mint address not found on the blockchain" },
            400,
          );
        }
        logger.log(
          `[/register-token] Mint address ${mint} confirmed on chain. Size: ${mintAccountInfo.data.length}`,
        );
      } catch (chainError) {
        logger.error(
          `[/register-token] Error validating mint address ${mint} on chain:`,
          chainError,
        );
        return c.json(
          { error: "Failed to validate mint address on the blockchain" },
          500,
        );
      }
    } else {
      logger.log(
        `[/register-token] Skipping on-chain validation for imported token ${mint}`,
      );
    }

    // --- Insert Token into Database ---
    logger.log(
      `[/register-token] Attempting to insert token ${mint} into database`,
    );
    try {
      const now = new Date().toISOString();
      const tokenId = crypto.randomUUID();
      const initialStatus = "active";

      const newTokenData: Partial<Token> = {
        id: tokenId,
        mint: mint,
        name: name,
        ticker: symbol,
        description: description || "",
        url: metadataUrl,
        image: imageUrl || "",
        twitter: twitter || "",
        telegram: telegram || "",
        website: website || "",
        discord: discord || "",
        creator: user.publicKey,
        status: initialStatus,
        tokenPriceUSD: 0,
        createdAt: now,
        lastUpdated: now,
        txId: body.txId || "register-" + tokenId, // Default txId when not provided
      };

      // Ensure required fields are present
      if (!(db.insert(tokens).values as any)._defaults) {
        newTokenData.marketCapUSD = newTokenData.marketCapUSD ?? 0;
        newTokenData.holderCount = newTokenData.holderCount ?? 0;
        newTokenData.volume24h = newTokenData.volume24h ?? 0;
      }

      await db.insert(tokens).values(newTokenData as any);
      logger.log(
        `[/register-token] Token ${mint} successfully inserted into DB`,
      );

      // --- Emit WebSocket Event ---
      try {
        const wsClient = getWebSocketClient(c.env);
        await wsClient.emit("global", "newToken", {
          ...newTokenData,
          timestamp: new Date(),
        });
        logger.log(
          `[/register-token] WebSocket event 'newToken' emitted for ${mint}`,
        );
      } catch (wsError) {
        logger.error(
          `[/register-token] WebSocket error emitting 'newToken' for ${mint}: ${wsError}`,
        );
      }

      // --- Trigger Monitoring ---
      try {
        monitorSpecificToken(c.env, mint).catch((monitorError) => {
          logger.error(
            `[/register-token] Error in background monitorSpecificToken for ${mint}:`,
            monitorError,
          );
        });
        logger.log(
          `[/register-token] Triggered background monitoring for token ${mint}`,
        );
      } catch (monitorError) {
        logger.error(
          `[/register-token] Failed to trigger background monitoring for ${mint}:`,
          monitorError,
        );
      }

      // --- Return Success ---
      logger.log(
        `[/register-token] Registration process completed successfully for ${mint}`,
      );
      const finalTokenData = await db
        .select()
        .from(tokens)
        .where(eq(tokens.mint, mint))
        .limit(1);

      return c.json({
        success: true,
        token: finalTokenData[0],
        message: "Token registered successfully",
      });
    } catch (dbError) {
      logger.error(
        `[/register-token] Database error inserting token ${mint}:`,
        dbError,
      );
      if (
        dbError instanceof Error &&
        dbError.message.includes("UNIQUE constraint failed")
      ) {
        return c.json({ error: "Token already exists" }, 409);
      }
      return c.json(
        {
          success: false,
          error: "Failed to save token to database",
          details:
            dbError instanceof Error
              ? dbError.message
              : "Unknown database error",
        },
        500,
      );
    }
  } catch (error) {
    logger.error("[/register-token] Unexpected error:", error);
    return c.json(
      {
        success: false,
        error: "Failed to register token",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// --- Endpoint to serve metadata JSON from R2 (Updated to support temporary metadata) ---
tokenRouter.get("/metadata/:filename", async (c) => {
  const filename = c.req.param("filename");
  const isTemp = c.req.query("temp") === "true";

  logger.log(
    `[/metadata/:filename] Request received for filename: ${filename}, temp=${isTemp}`,
  );

  try {
    if (!filename || !filename.endsWith(".json")) {
      logger.error("[/metadata/:filename] Invalid filename format:", filename);
      return c.json({ error: "Filename parameter must end with .json" }, 400);
    }

    if (!c.env.R2) {
      logger.error("[/metadata/:filename] R2 storage is not configured");
      return c.json({ error: "R2 storage is not available" }, 500);
    }

    // Determine which location to check first based on the temp parameter
    const primaryKey = isTemp
      ? `token-metadata-temp/${filename}`
      : `token-metadata/${filename}`;
    const fallbackKey = isTemp
      ? `token-metadata/${filename}`
      : `token-metadata-temp/${filename}`;

    logger.log(
      `[/metadata/:filename] Checking primary location: ${primaryKey}`,
    );
    let object = await c.env.R2.get(primaryKey);

    // If not found in primary location, check fallback location
    if (!object) {
      logger.log(
        `[/metadata/:filename] Not found in primary location, checking fallback: ${fallbackKey}`,
      );
      object = await c.env.R2.get(fallbackKey);
    }

    if (!object) {
      logger.error(
        `[/metadata/:filename] Metadata not found in either location`,
      );
      return c.json({ error: "Metadata not found" }, 404);
    }

    logger.log(
      `[/metadata/:filename] Found metadata: size=${object.size}, type=${object.httpMetadata?.contentType}`,
    );

    const contentType = object.httpMetadata?.contentType || "application/json";
    const data = await object.text();

    // Set appropriate CORS headers for public access
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": contentType,
      "Cache-Control": isTemp ? "max-age=3600" : "max-age=86400", // Shorter cache for temp metadata
    };

    logger.log(`[/metadata/:filename] Serving metadata: ${filename}`);
    return new Response(data, { headers: corsHeaders });
  } catch (error) {
    logger.error(
      `[/metadata/:filename] Error serving metadata ${filename}:`,
      error,
    );
    return c.json({ error: "Failed to serve metadata JSON" }, 500);
  }
});

// --- Existing Endpoints Below (Largely Unchanged) ---

// Get paginated tokens
tokenRouter.get("/tokens", async (c) => {
  try {
    const queryParams = c.req.query();

    const limit = parseInt(queryParams.limit as string) || 50;
    const page = parseInt(queryParams.page as string) || 1;
    const skip = (page - 1) * limit;

    // Get search, status, creator params for filtering
    const search = queryParams.search as string;
    const status = queryParams.status as string;
    const creator = queryParams.creator as string;
    const sortBy = search
      ? "marketCapUSD"
      : (queryParams.sortBy as string) || "createdAt";
    const sortOrder = (queryParams.sortOrder as string) || "desc";

    // Use a shorter timeout for test environments
    const timeoutDuration = c.env.NODE_ENV === "test" ? 2000 : 5000;

    // Create a timeout promise to prevent hanging
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Database query timed out")),
        timeoutDuration,
      ),
    );

    const countTimeoutPromise = new Promise<number>((_, reject) =>
      setTimeout(
        () => reject(new Error("Count query timed out")),
        timeoutDuration / 2,
      ),
    );

    const db = getDB(c.env);

    // Get max values for normalization first - we need these for both the featuredScore and sorting
    const { maxVolume, maxHolders } = await getFeaturedMaxValues(db);

    // Prepare a basic query
    const tokenQuery = async () => {
      try {
        // Get all columns from the tokens table programmatically
        const allTokensColumns = Object.fromEntries(
          Object.entries(tokens)
            .filter(
              ([key, value]) => typeof value === "object" && "name" in value,
            )
            .map(([key, value]) => [key, value]),
        );

        // Start with a basic query that includes the weighted score
        let tokensQuery = db
          .select({
            // Include all columns
            ...allTokensColumns,
            // Add the weighted score as a column in the result
            featuredScore: getFeaturedScoreExpression(maxVolume, maxHolders),
          })
          .from(tokens) as any;

        // Apply filters
        if (status) {
          tokensQuery = tokensQuery.where(eq(tokens.status, status));
        } else {
          // By default, don't show pending tokens
          tokensQuery = tokensQuery.where(sql`${tokens.status} != 'pending'`);
        }

        if (creator) {
          tokensQuery = tokensQuery.where(eq(tokens.creator, creator));
        }

        if (search) {
          // This is a simplified implementation - in production you'd use a proper search mechanism
          tokensQuery = tokensQuery.where(
            sql`(${tokens.name} LIKE ${"%" + search + "%"} OR 
                 ${tokens.ticker} LIKE ${"%" + search + "%"} OR 
                 ${tokens.mint} LIKE ${"%" + search + "%"})`,
          );
        }

        // Apply sorting - map frontend sort values to actual DB columns
        // Handle "featured" sort as a special case
        if (sortBy === "featured") {
          // Apply the weighted sort with the max values
          tokensQuery = applyFeaturedSort(
            tokensQuery,
            maxVolume,
            maxHolders,
            sortOrder,
          );
        } else {
          // For other columns, safely map to actual db columns
          const validSortColumns = {
            marketCapUSD: tokens.marketCapUSD,
            createdAt: tokens.createdAt,
            holderCount: tokens.holderCount,
            tokenPriceUSD: tokens.tokenPriceUSD,
            name: tokens.name,
            ticker: tokens.ticker,
            volume24h: tokens.volume24h,
            curveProgress: tokens.curveProgress,
          };

          // Use the mapped column or default to createdAt
          const sortColumn =
            validSortColumns[sortBy as keyof typeof validSortColumns] ||
            tokens.createdAt;

          if (sortOrder.toLowerCase() === "desc") {
            tokensQuery = tokensQuery.orderBy(desc(sortColumn));
          } else {
            tokensQuery = tokensQuery.orderBy(sortColumn);
          }
        }

        // Apply pagination
        tokensQuery = tokensQuery.limit(limit).offset(skip);

        // Execute the query
        return await tokensQuery;
      } catch (error) {
        logger.error("Error in token query:", error);
        return [];
      }
    };

    const countPromise = async () => {
      const countQuery = db.select({ count: sql`count(*)` }).from(tokens);
      let finalQuery: any;
      if (status) {
        finalQuery = countQuery.where(eq(tokens.status, status));
      } else {
        finalQuery = countQuery.where(sql`${tokens.status} != 'pending'`);
      }
      if (creator) {
        finalQuery = countQuery.where(eq(tokens.creator, creator));
      }
      if (search) {
        finalQuery = countQuery.where(
          sql`(${tokens.name} LIKE ${"%" + search + "%"} OR 
               ${tokens.ticker} LIKE ${"%" + search + "%"} OR 
               ${tokens.mint} LIKE ${"%" + search + "%"})`,
        );
      }

      const totalCountResult = await finalQuery;
      return Number(totalCountResult[0]?.count || 0);
    };

    // Try to execute the query with a timeout
    let tokensResult;
    let total = 0;

    try {
      [tokensResult, total] = await Promise.all([
        Promise.race([tokenQuery(), timeoutPromise]),
        Promise.race([countPromise(), countTimeoutPromise]),
      ]);
    } catch (error) {
      logger.error("Token query failed or timed out:", error);
      tokensResult = [];
    }

    const totalPages = Math.ceil(total / limit);

    return c.json({
      tokens: tokensResult,
      page,
      totalPages,
      total,
      hasMore: page < totalPages,
    });
  } catch (error) {
    logger.error("Error in token route:", error);
    // Return empty results rather than error
    return c.json({
      tokens: [],
      page: 1,
      totalPages: 0,
      total: 0,
    });
  }
});

// Direct token search endpoint - SPL-2022 token support
tokenRouter.post("/search-token", async (c) => {
  const body = await c.req.json();
  const { mint, requestor } = body;

  if (!mint || typeof mint !== "string") {
    return c.json({ error: "Invalid mint address" }, 400);
  }

  if (!requestor || typeof requestor !== "string") {
    return c.json({ error: "Missing or invalid requestor" }, 400);
  }

  // Validate mint address
  const mintPublicKey = new PublicKey(mint);
  logger.log(`[search-token] Searching for token ${mint}`);

  // Import the functions to get both mainnet and devnet RPC URLs
  const { getMainnetRpcUrl, getDevnetRpcUrl } = await import("../util");

  // We'll try both networks - first the current configured network
  const primaryConnection = new Connection(getRpcUrl(c.env), "confirmed");

  // Try to find the token on the primary network
  try {
    const tokenInfo = await primaryConnection.getAccountInfo(mintPublicKey);
    if (tokenInfo) {
      logger.log(
        `[search-token] Found token on primary network (${c.env.NETWORK || "default"})`,
      );
      // Continue with the token info we found
      return await processTokenInfo(
        c,
        mintPublicKey,
        tokenInfo,
        primaryConnection,
        requestor,
      );
    }
  } catch (error) {
    logger.error(`[search-token] Error checking primary network: ${error}`);
  }

  // If token not found on primary network, try the alternate network
  const isDevnetPrimary = c.env.NETWORK === "devnet";
  const alternateRpcUrl = isDevnetPrimary
    ? getMainnetRpcUrl(c.env)
    : getDevnetRpcUrl(c.env);
  const alternateNetworkName = isDevnetPrimary ? "mainnet" : "devnet";

  logger.log(
    `[search-token] Token not found on primary network, trying ${alternateNetworkName}`,
  );
  const alternateConnection = new Connection(alternateRpcUrl, "confirmed");

  try {
    const tokenInfo = await alternateConnection.getAccountInfo(mintPublicKey);
    if (tokenInfo) {
      logger.log(`[search-token] Found token on ${alternateNetworkName}`);
      // Continue with the token info we found on the alternate network
      return await processTokenInfo(
        c,
        mintPublicKey,
        tokenInfo,
        alternateConnection,
        requestor,
      );
    }
  } catch (error) {
    logger.error(
      `[search-token] Error checking ${alternateNetworkName}: ${error}`,
    );
  }

  // If we get here, token was not found on either network
  return c.json({ error: "Token not found on any network" }, 404);
});

// Helper function to process token info after finding it on a network
async function processTokenInfo(
  c: any,
  mintPublicKey: PublicKey,
  tokenInfo: AccountInfo<Buffer>,
  connection: Connection,
  requestor: string,
) {
  // Check program ID to verify this is an SPL token
  const TOKEN_PROGRAM_ID = new PublicKey(
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  );
  const TOKEN_2022_PROGRAM_ID = new PublicKey(
    "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  );

  const isSplToken = tokenInfo.owner.equals(TOKEN_PROGRAM_ID);
  const isSPL2022 = tokenInfo.owner.equals(TOKEN_2022_PROGRAM_ID);

  if (!isSplToken && !isSPL2022) {
    return c.json(
      {
        error: "Not a valid SPL token. Owner: " + tokenInfo.owner.toString(),
      },
      400,
    );
  }

  logger.log(`[search-token] Token owner: ${tokenInfo.owner.toString()}`);
  logger.log(`[search-token] Token is SPL-2022: ${isSPL2022}`);

  // Get mint info - decimals and authorities
  const mintInfo = await connection.getParsedAccountInfo(mintPublicKey);
  logger.log(
    `[search-token] Mint info: ${JSON.stringify(mintInfo.value?.data)}`,
  );

  // Extract basic token info
  const parsedData = (mintInfo.value?.data as any)?.parsed;
  const decimals = parsedData?.info?.decimals || 9;
  const mintAuthority = parsedData?.info?.mintAuthority || null;

  logger.log(`[search-token] Decimals: ${decimals}`);
  logger.log(`[search-token] Mint authority: ${mintAuthority}`);

  // Initialize variables for token data
  let tokenName = "";
  let tokenSymbol = "";
  let uri = "";
  let imageUrl = "";
  let description = "";
  let updateAuthority: string | null = null;
  let foundMetadata = false;

  // For SPL-2022 tokens, check for token metadata extension first
  if (isSPL2022 && parsedData?.info?.extensions) {
    logger.log(`[search-token] Checking SPL-2022 extensions for metadata`);

    // Find the tokenMetadata extension if it exists
    const metadataExt = parsedData.info.extensions.find(
      (ext: any) => ext.extension === "tokenMetadata",
    );

    if (metadataExt && metadataExt.state) {
      logger.log(
        `[search-token] Found tokenMetadata extension: ${JSON.stringify(metadataExt.state)}`,
      );

      // Extract metadata directly from the extension
      tokenName = metadataExt.state.name || "";
      tokenSymbol = metadataExt.state.symbol || "";
      uri = metadataExt.state.uri || "";
      updateAuthority = metadataExt.state.updateAuthority || null;

      logger.log(
        `[search-token] SPL-2022 metadata - Name: ${tokenName}, Symbol: ${tokenSymbol}`,
      );
      logger.log(`[search-token] SPL-2022 metadata - URI: ${uri}`);
      logger.log(
        `[search-token] SPL-2022 metadata - Update Authority: ${updateAuthority}`,
      );

      foundMetadata = true;

      // Now fetch additional metadata from the URI if available
      if (uri) {
        logger.log(`[search-token] Fetching metadata from URI: ${uri}`);
        const uriResponse = await fetch(uri);

        if (uriResponse.ok) {
          const uriText = await uriResponse.text();
          logger.log(`[search-token] URI response: ${uriText}`);

          try {
            const uriData = JSON.parse(uriText);
            logger.log(
              `[search-token] Parsed URI data: ${JSON.stringify(uriData)}`,
            );

            // Extract image and description if available
            if (uriData.image) {
              imageUrl = uriData.image;
              logger.log(`[search-token] Found image URL in URI: ${imageUrl}`);
            }

            if (uriData.description) {
              description = uriData.description;
              logger.log(
                `[search-token] Found description in URI: ${description}`,
              );
            }
          } catch (parseError) {
            logger.error(
              `[search-token] Error parsing URI JSON: ${parseError}`,
            );
          }
        } else {
          logger.error(
            `[search-token] Failed to fetch URI: ${uriResponse.status} ${uriResponse.statusText}`,
          );
        }
      }
    } else {
      logger.log(
        `[search-token] No tokenMetadata extension found in SPL-2022 token`,
      );
    }
  }

  // Only try to get Metaplex metadata if we didn't find it in SPL-2022 extensions
  if (!foundMetadata) {
    // Get metadata PDA
    const METADATA_PROGRAM_ID = new PublicKey(
      "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
    );
    const [metadataAddress] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        METADATA_PROGRAM_ID.toBuffer(),
        mintPublicKey.toBuffer(),
      ],
      METADATA_PROGRAM_ID,
    );

    logger.log(
      `[search-token] Metadata address: ${metadataAddress.toString()}`,
    );

    // Get metadata account data - direct read from chain with no fallbacks
    const metadataAccount = await connection.getAccountInfo(metadataAddress);
    if (!metadataAccount || metadataAccount.data.length === 0) {
      // For SPL-2022 tokens, we already checked extensions so this is just a warning
      // For regular SPL tokens, this is an error
      if (isSPL2022) {
        logger.warn(
          `[search-token] No Metaplex metadata found for SPL-2022 token: ${mintPublicKey.toString()}`,
        );
      } else {
        logger.error(
          `[search-token] No metadata found for token: ${mintPublicKey.toString()}`,
        );
        return c.json({ error: "No metadata found for this token" }, 404);
      }
    } else {
      // We found Metaplex metadata
      logger.log(
        `[search-token] Metadata account found, data length: ${metadataAccount.data.length} bytes`,
      );
      logger.log(
        `[search-token] Raw metadata (hex): ${Buffer.from(metadataAccount.data).toString("hex")}`,
      );

      // Direct metadata extraction
      updateAuthority = new PublicKey(
        metadataAccount.data.slice(1, 33),
      ).toString();
      logger.log(`[search-token] Update authority: ${updateAuthority}`);

      // Calculate offsets for variable-length fields
      let offset = 1 + 32 + 32; // Skip version byte + update authority + mint

      // Extract name length and value
      const nameLength = metadataAccount.data[offset];
      offset += 1;
      const nameData = metadataAccount.data.slice(offset, offset + nameLength);
      tokenName = nameData.toString("utf8").replace(/\0/g, "").trim();
      logger.log(
        `[search-token] Token name: ${tokenName} (${nameLength} bytes)`,
      );
      offset += nameLength;

      // Extract symbol - needs to account for padding between fields
      offset += 3; // Skip padding bytes before length
      const symbolLength = metadataAccount.data[offset];
      offset += 1;
      const symbolData = metadataAccount.data.slice(
        offset,
        offset + symbolLength,
      );
      tokenSymbol = symbolData.toString("utf8").replace(/\0/g, "").trim();
      logger.log(
        `[search-token] Token symbol: ${tokenSymbol} (${symbolLength} bytes)`,
      );
      offset += symbolLength;

      // Extract URI
      offset += 3; // Skip padding bytes before length
      const uriLength = metadataAccount.data[offset];
      offset += 1;
      const uriData = metadataAccount.data.slice(offset, offset + uriLength);
      uri = uriData.toString("utf8").replace(/\0/g, "").trim();
      logger.log(`[search-token] Metadata URI: ${uri} (${uriLength} bytes)`);

      foundMetadata = true;

      // Now fetch additional metadata from the URI if available
      if (uri) {
        logger.log(`[search-token] Fetching metadata from URI: ${uri}`);
        const uriResponse = await fetch(uri);

        if (uriResponse.ok) {
          const uriText = await uriResponse.text();
          logger.log(`[search-token] URI response: ${uriText}`);

          try {
            const uriData = JSON.parse(uriText);
            logger.log(
              `[search-token] Parsed URI data: ${JSON.stringify(uriData)}`,
            );

            // Extract image and description if available
            if (uriData.image) {
              imageUrl = uriData.image;
              logger.log(`[search-token] Found image URL in URI: ${imageUrl}`);
            }

            if (uriData.description) {
              description = uriData.description;
              logger.log(
                `[search-token] Found description in URI: ${description}`,
              );
            }
          } catch (parseError) {
            logger.error(
              `[search-token] Error parsing URI JSON: ${parseError}`,
            );
          }
        } else {
          logger.error(
            `[search-token] Failed to fetch URI: ${uriResponse.status} ${uriResponse.statusText}`,
          );
        }
      }
    }
  }

  // If we still didn't find metadata from either source, throw error
  if (!foundMetadata && !isSPL2022) {
    return c.json({ error: "No metadata found for this token" }, 404);
  }

  // For SPL-2022 tokens, we still consider them valid even without metadata
  // since they might not use the tokenMetadata extension

  // Check if we're in development mode
  const isLocalDev = c.env.LOCAL_DEV === "true" || c.env.LOCAL_DEV === true;

  // Determine if requestor is the creator/authority
  // In development mode, always allow any token to be imported
  const isCreator = isLocalDev
    ? true
    : updateAuthority === requestor || mintAuthority === requestor;

  logger.log(`[search-token] Is local development mode? ${isLocalDev}`);
  logger.log(`[search-token] LOCAL_DEV value: ${c.env.LOCAL_DEV}`);
  logger.log(`[search-token] Is requestor the creator? ${isCreator}`);
  logger.log(`[search-token] Request wallet: ${requestor}`);
  logger.log(`[search-token] Update authority: ${updateAuthority}`);
  logger.log(`[search-token] Mint authority: ${mintAuthority}`);

  // Debug log for final creator check result
  if (isLocalDev) {
    logger.log(
      `[search-token] Bypassing creator check in development mode. Anyone can import this token.`,
    );
  } else if (isCreator) {
    logger.log(
      `[search-token] Creator check passed - requestor is the token creator.`,
    );
  } else {
    logger.log(
      `[search-token] Creator check failed - requestor is not the token creator.`,
    );
  }

  // If we don't have names yet (possible for SPL-2022 without tokenMetadata), use defaults
  if (!tokenName) {
    tokenName = `Token ${mintPublicKey.toString().slice(0, 8)}`;
  }
  if (!tokenSymbol) {
    tokenSymbol = mintPublicKey.toString().slice(0, 4).toUpperCase();
  }

  // Return the token data
  const tokenData = {
    name: tokenName,
    symbol: tokenSymbol,
    description: description || `Token ${tokenName} (${tokenSymbol})`,
    mint: mintPublicKey.toString(),
    updateAuthority: updateAuthority,
    mintAuthority: mintAuthority || null,
    creator: updateAuthority || mintAuthority || null,
    isCreator: isCreator,
    metadataUri: uri,
    image: imageUrl,
    tokenType: isSPL2022 ? "spl-2022" : "spl-token",
    decimals: decimals,
    needsWalletSwitch: !isCreator,
  };

  logger.log(`[search-token] Final token data: ${JSON.stringify(tokenData)}`);

  return c.json(tokenData);
}

// Helper function to get the Metadata PDA for a mint
async function getMetadataPDA(mint: string): Promise<PublicKey> {
  const METADATA_PROGRAM_ID = new PublicKey(
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
  );
  const [metadataPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      METADATA_PROGRAM_ID.toBuffer(),
      new PublicKey(mint).toBuffer(),
    ],
    METADATA_PROGRAM_ID,
  );
  return metadataPDA;
}

// Fix metadata decoding for Metaplex tokens
function decodeMetadata(buffer: Buffer): any {
  // This is a proper implementation for decoding Metaplex metadata
  try {
    // Skip the first byte (version)
    const start = 1;

    // Read key fields
    const updateAuthorityStart = start;
    const updateAuthorityEnd = updateAuthorityStart + 32;
    const updateAuthority = new PublicKey(
      buffer.slice(updateAuthorityStart, updateAuthorityEnd),
    ).toString();

    const mintStart = updateAuthorityEnd;
    const mintEnd = mintStart + 32;
    const mint = new PublicKey(buffer.slice(mintStart, mintEnd)).toString();

    // Read data
    let cursor = mintEnd;

    // Skip name length prefix (4 bytes) and read name
    cursor += 4;
    const nameLen = buffer.readUInt32LE(mintEnd);
    const name = buffer
      .slice(cursor, cursor + nameLen)
      .toString("utf8")
      .replace(/\0/g, "");
    cursor += nameLen;

    // Skip symbol length prefix (4 bytes) and read symbol
    cursor += 4;
    const symbolLen = buffer.readUInt32LE(cursor - 4);
    const symbol = buffer
      .slice(cursor, cursor + symbolLen)
      .toString("utf8")
      .replace(/\0/g, "");
    cursor += symbolLen;

    // Skip uri length prefix (4 bytes) and read uri
    cursor += 4;
    const uriLen = buffer.readUInt32LE(cursor - 4);
    const uri = buffer
      .slice(cursor, cursor + uriLen)
      .toString("utf8")
      .replace(/\0/g, "");
    cursor += uriLen;

    // Read fee
    const fee = buffer.readUInt16LE(cursor);
    cursor += 2;

    // Check for creators
    let creators: Array<{
      address: string;
      verified: boolean;
      share: number;
    }> | null = null;
    if (cursor < buffer.length) {
      const hasCreators = buffer[cursor];
      cursor += 1;

      if (hasCreators) {
        const creatorCount = buffer[cursor];
        cursor += 1;

        creators = [];
        for (let i = 0; i < creatorCount; i++) {
          const creatorAddress = new PublicKey(
            buffer.slice(cursor, cursor + 32),
          ).toString();
          cursor += 32;

          const verified = Boolean(buffer[cursor]);
          cursor += 1;

          const share = buffer[cursor];
          cursor += 1;

          creators.push({
            address: creatorAddress,
            verified,
            share,
          });
        }
      }
    }

    return {
      updateAuthority,
      mint,
      data: {
        name,
        symbol,
        uri,
        sellerFeeBasisPoints: fee,
        creators,
      },
    };
  } catch (e) {
    console.error("Error decoding metadata:", e);
    // Return basic structure with as much as we could decode
    return {
      updateAuthority: "Unknown",
      mint: "Unknown",
      data: {
        name: "Unknown",
        symbol: "Unknown",
        uri: "",
        creators: null,
      },
    };
  }
}

// Helper function to extract creators array from buffer
function extractCreators(
  buffer: Buffer,
): Array<{ address: string; verified: boolean; share: number }> | null {
  // This is placeholder logic
  // In production, use proper Borsh deserialization from Metaplex SDK

  // For simplicity, we'll just try to extract the first creator if it exists
  try {
    if (buffer.length > 34) {
      return [
        {
          address: new PublicKey(buffer.slice(2, 34)).toString(),
          verified: Boolean(buffer[34]),
          share: buffer[35],
        },
      ];
    }
  } catch (e) {
    console.error("Error extracting creators:", e);
  }
  return null;
}

// Helper function to fetch metadata URI content
async function fetchMetadataUri(uri: string): Promise<string | null> {
  try {
    // Clean the URI
    const cleanUri = uri.trim();
    if (!cleanUri) return null;

    // If URI contains invalid characters that would break a URL
    if (/[\u0000-\u001F\u007F-\u009F]/.test(cleanUri)) {
      logger.error(
        `[fetchMetadataUri] URI contains invalid characters: ${cleanUri}`,
      );
      return null;
    }

    // Handle different URI types
    const arweavePrefix = "https://arweave.net/";
    const ipfsPrefix = "ipfs://";

    let fetchUri = cleanUri;

    // Convert IPFS URI to HTTP URL if needed
    if (cleanUri.startsWith(ipfsPrefix)) {
      fetchUri = `https://ipfs.io/ipfs/${cleanUri.substring(ipfsPrefix.length)}`;
    }

    // Add a timeout to prevent hanging on slow responses
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    try {
      // Fetch the metadata JSON
      const response = await fetch(fetchUri, {
        signal: controller.signal,
        headers: {
          Accept: "application/json, text/plain, */*",
          "User-Agent": "auto-fun-metadata-service",
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      // Get the response as text first to avoid JSON parsing errors
      const text = await response.text();

      // Try to parse it as JSON to validate
      try {
        JSON.parse(text);
        return text;
      } catch (jsonError) {
        logger.error(
          `[fetchMetadataUri] Invalid JSON in response: ${jsonError}`,
        );
        return null;
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
  } catch (error) {
    logger.error(`[fetchMetadataUri] Error fetching URI: ${uri}`, error);
    return null;
  }
}

// Get token holders endpoint
tokenRouter.get("/token/:mint/holders", async (c) => {
  try {
    const mint = c.req.param("mint");

    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // Parse pagination parameters
    const limit = parseInt(c.req.query("limit") || "50");
    const page = parseInt(c.req.query("page") || "1");
    const offset = (page - 1) * limit;

    const db = getDB(c.env);

    // Get holders from database directly
    const holders = await db
      .select()
      .from(tokenHolders)
      .where(eq(tokenHolders.mint, mint))
      .orderBy(desc(tokenHolders.amount));

    if (!holders || holders.length === 0) {
      return c.json({
        holders: [],
        page: 1,
        totalPages: 0,
        total: 0,
      });
    }

    // Paginate results
    const paginatedHolders = holders.slice(offset, offset + limit);

    return c.json({
      holders: paginatedHolders,
      page: page,
      totalPages: Math.ceil(holders.length / limit),
      total: holders.length,
    });
  } catch (error) {
    logger.error(`Database error in token holders route: ${error}`);
    return c.json(
      {
        holders: [],
        page: 1,
        totalPages: 0,
        total: 0,
        error: "Database error",
      },
      500,
    );
  }
});

// Transaction to harvest LP fees endpoint
tokenRouter.get("/token/:mint/harvest-tx", async (c) => {
  try {
    const mint = c.req.param("mint");

    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    const owner = c.req.query("owner");
    if (!owner) {
      return c.json({ error: "Owner address is required" }, 400);
    }

    const db = getDB(c.env);

    // Find the token by its mint address
    const token = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    if (!token || token.length === 0) {
      return c.json({ error: "Token not found" }, 404);
    }

    // Make sure the request owner is actually the token creator
    if (owner !== token[0].creator) {
      return c.json({ error: "Only the token creator can harvest" }, 403);
    }

    // Confirm token status is "locked" and that an NFT was minted
    if (token[0].status !== "locked") {
      return c.json({ error: "Token is not locked" }, 400);
    }

    if (!token[0].nftMinted) {
      return c.json({ error: "Token has no NFT minted" }, 400);
    }

    // For a real implementation, generate a blockchain transaction
    // For now, return a placeholder transaction
    const serializedTransaction = "placeholder_transaction";
    return c.json({ token: token[0], transaction: serializedTransaction });
  } catch (error) {
    logger.error("Error creating harvest transaction:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

// Token price endpoint
tokenRouter.get("/token/:mint/price", async (c) => {
  try {
    const mint = c.req.param("mint");

    // Validate mint address
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // Get token data from database
    const db = getDB(c.env);
    const tokenData = await (db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1) as any);

    if (!tokenData || tokenData.length === 0) {
      return c.json({ error: "Token not found" }, 404);
    }

    const token = tokenData[0];

    // Return actual token price data
    return c.json({
      price: token.currentPrice || 0.001,
      priceUSD: token.tokenPriceUSD || 0.0001,
      marketCap: token.liquidity || 1000,
      marketCapUSD: token.marketCapUSD || 120,
      priceChange24h: token.priceChange24h || 0,
      volume24h: token.volume24h || 0,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error(`Error getting token price: ${error}`);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

// Replace the implementation of the tokens/:mint/price endpoint
tokenRouter.get("/token/:mint/price", async (c) => {
  // Use the same implementation as the token price endpoint
  const mint = c.req.param("mint");

  // Validate mint address
  if (!mint || mint.length < 32 || mint.length > 44) {
    return c.json({ error: "Invalid mint address" }, 400);
  }

  // Get token data from database
  try {
    const db = getDB(c.env);
    const tokenData = await (db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1) as any);

    if (!tokenData || tokenData.length === 0) {
      return c.json({ error: "Token not found" }, 404);
    }

    const token = tokenData[0];
    const solPrice = await getSOLPrice(c.env);

    const TOKEN_DECIMALS = Number(c.env.DECIMALS || 6);
    const tokenPriceInSol = token.currentPrice / Math.pow(10, TOKEN_DECIMALS);
    const tokenPriceUSD =
      token.currentPrice > 0
        ? tokenPriceInSol * solPrice * Math.pow(10, TOKEN_DECIMALS)
        : 0;

    // Use TOKEN_SUPPLY from env if available, otherwise use reserveAmount
    const tokenSupply = c.env.TOKEN_SUPPLY
      ? Number(c.env.TOKEN_SUPPLY)
      : token.reserveAmount || 1000000000000; // Default if null

    const marketCapUSD =
      (tokenSupply / Math.pow(10, TOKEN_DECIMALS)) * tokenPriceUSD;

    // Calculate curve progress based on the original formula
    const virtualReserves = c.env.VIRTUAL_RESERVES
      ? Number(c.env.VIRTUAL_RESERVES)
      : 2800000000;
    const curveLimit = c.env.CURVE_LIMIT
      ? Number(c.env.CURVE_LIMIT)
      : 11300000000;

    token.curveProgress =
      token.status === "migrated"
        ? 100
        : ((token.reserveLamport - virtualReserves) /
            (curveLimit - virtualReserves)) *
          100;

    return c.json({
      price: token.currentPrice || 0.001,
      priceUSD: token.tokenPriceUSD || 0.0001,
      marketCap: token.liquidity || 1000,
      marketCapUSD: marketCapUSD,
      priceChange24h: token.priceChange24h || 0,
      volume24h: token.volume24h || 0,
      timestamp: Date.now(),
    });
  } catch (error) {
    logger.error("Error in token price handler:", error);
    // Return fallback values
    return c.json({
      price: 0.001,
      priceUSD: 0.0001,
      marketCap: 1000,
      marketCapUSD: 120,
      priceChange24h: 0,
      volume24h: 0,
      timestamp: Date.now(),
      note: "Fallback response due to error",
    });
  }
});

// Get specific token data with full details
tokenRouter.get("/token/:mint", async (c) => {
  try {
    const mint = c.req.param("mint");

    // Validate mint address
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // Get token data
    const db = getDB(c.env);
    const tokenData = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    if (!tokenData || tokenData.length === 0) {
      return c.json({ error: "Token not found", mint }, 404);
    }

    // Only refresh holder data if explicitly requested
    // const refreshHolders = c.req.query("refresh_holders") === "true";
    // if (refreshHolders) {
    logger.log(`Refreshing holders data for token ${mint}`);
    await updateHoldersCache(c.env, mint);
    // }

    const token = tokenData[0];

    // Get fresh SOL price
    const solPrice = await getSOLPrice(c.env);

    // Set default values for critical fields if they're missing
    const TOKEN_DECIMALS = Number(c.env.DECIMALS || 6);
    const defaultReserveAmount = 1000000000000; // 1 trillion (default token supply)
    const defaultReserveLamport = 2800000000; // 2.8 SOL (default reserve)

    // Make sure reserveAmount and reserveLamport have values
    token.reserveAmount = token.reserveAmount || defaultReserveAmount;
    token.reserveLamport = token.reserveLamport || defaultReserveLamport;

    // Update or set default values for missing fields
    if (!token.currentPrice && token.reserveAmount && token.reserveLamport) {
      token.currentPrice =
        Number(token.reserveLamport) /
        1e9 /
        (Number(token.reserveAmount) / Math.pow(10, TOKEN_DECIMALS));
    }

    // Calculate tokenPriceUSD in the same way as the old code
    const tokenPriceInSol =
      (token.currentPrice || 0) / Math.pow(10, TOKEN_DECIMALS);
    token.tokenPriceUSD =
      (token.currentPrice || 0) > 0
        ? tokenPriceInSol * solPrice * Math.pow(10, TOKEN_DECIMALS)
        : 0;

    // Update solPriceUSD
    token.solPriceUSD = solPrice;

    // Use TOKEN_SUPPLY from env if available, otherwise use reserveAmount
    const tokenSupply = c.env.TOKEN_SUPPLY
      ? Number(c.env.TOKEN_SUPPLY)
      : token.reserveAmount;

    // Calculate or update marketCapUSD if we have tokenPriceUSD
    token.marketCapUSD =
      (tokenSupply / Math.pow(10, TOKEN_DECIMALS)) * token.tokenPriceUSD;

    // Get virtualReserves and curveLimit from env or set defaults
    const virtualReserves = c.env.VIRTUAL_RESERVES
      ? Number(c.env.VIRTUAL_RESERVES)
      : 2800000000;
    const curveLimit = c.env.CURVE_LIMIT
      ? Number(c.env.CURVE_LIMIT)
      : 11300000000;

    // Update virtualReserves and curveLimit
    token.virtualReserves = token.virtualReserves || virtualReserves;
    token.curveLimit = token.curveLimit || curveLimit;

    // Calculate or update curveProgress using the original formula
    token.curveProgress =
      token.status === "migrated"
        ? 100
        : ((token.reserveLamport - token.virtualReserves) /
            (token.curveLimit - token.virtualReserves)) *
          100;

    // Get token holders count
    const holdersCountQuery = await db
      .select({ count: sql<number>`count(*)` })
      .from(tokenHolders)
      .where(eq(tokenHolders.mint, mint));

    const holdersCount = holdersCountQuery[0]?.count || 0;
    token.holderCount = holdersCount;

    // Get latest swap - most recent transaction
    const latestSwapQuery = await db
      .select()
      .from(swaps)
      .where(eq(swaps.tokenMint, mint))
      .orderBy(desc(swaps.timestamp))
      .limit(1);

    const latestSwap = latestSwapQuery[0] || null;

    // Update token in database if we've calculated new values
    await db
      .update(tokens)
      .set({
        tokenPriceUSD: token.tokenPriceUSD,
        currentPrice: token.currentPrice,
        marketCapUSD: token.marketCapUSD,
        solPriceUSD: token.solPriceUSD,
        curveProgress: token.curveProgress,
        virtualReserves: token.virtualReserves,
        curveLimit: token.curveLimit,
        holderCount: token.holderCount,
        // Only update reserveAmount and reserveLamport if they were null
        ...(tokenData[0].reserveAmount === null
          ? { reserveAmount: token.reserveAmount }
          : {}),
        ...(tokenData[0].reserveLamport === null
          ? { reserveLamport: token.reserveLamport }
          : {}),
        lastUpdated: new Date().toISOString(),
      })
      .where(eq(tokens.mint, mint));

    // Format response with additional data
    return c.json({
      ...token,
      latestSwap,
    });
  } catch (error) {
    logger.error(`Error getting token: ${error}`);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

export default tokenRouter;

// User registration endpoint
tokenRouter.post("/register", async (c) => {
  try {
    const body = await c.req.json();

    if (!body.address) {
      return c.json({ error: "Missing required field: address" }, 400);
    }

    const db = getDB(c.env);
    const userId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Check if user already exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.address, body.address))
      .limit(1);

    if (existingUser && existingUser.length > 0) {
      return c.json({ user: existingUser[0] });
    }

    // Create new user
    await db.insert(users).values({
      id: userId,
      name: body.name || null,
      address: body.address,
      createdAt: now,
    });

    const newUser = {
      id: userId,
      address: body.address,
      name: body.name || null,
      createdAt: now,
    };

    return c.json({ user: newUser });
  } catch (error) {
    logger.error("Error in user registration:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

// Add this new endpoint near other token-related routes
tokenRouter.post("/check-token", async (c) => {
  try {
    // Require authentication
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Authentication required" }, 401);
    }

    // Get token from request
    const body = await c.req.json();
    const { tokenMint, imageUrl, metadataUrl } = body;
    if (!tokenMint) {
      return c.json({ error: "Token mint address is required" }, 400);
    }

    logger.log(`Manual token check requested for: ${tokenMint}`);

    // Basic token format validation - allow wider range of characters for testing
    // But still enforce basic length rules
    if (
      typeof tokenMint !== "string" ||
      tokenMint.length < 30 ||
      tokenMint.length > 50
    ) {
      logger.warn(`Invalid token mint format (wrong length): ${tokenMint}`);
      return c.json(
        {
          success: false,
          tokenFound: false,
          message: "Invalid token mint address length",
        },
        400,
      );
    }

    // First check if token exists in DB regardless of validity
    const db = getDB(c.env);
    const existingToken = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, tokenMint))
      .limit(1);

    if (existingToken && existingToken.length > 0) {
      // If we have new image or metadata URLs, update the token
      if (
        (imageUrl || metadataUrl) &&
        (existingToken[0].image === "" || existingToken[0].url === "")
      ) {
        await db
          .update(tokens)
          .set({
            image: imageUrl || existingToken[0].image || "",
            url: metadataUrl || existingToken[0].url || "",
            lastUpdated: new Date().toISOString(),
          })
          .where(eq(tokens.mint, tokenMint));

        logger.log(`Updated image and metadata URLs for token ${tokenMint}`);

        // Return the updated token
        const updatedToken = {
          ...existingToken[0],
          image: imageUrl || existingToken[0].image || "",
          url: metadataUrl || existingToken[0].url || "",
        };

        return c.json({
          success: true,
          tokenFound: true,
          message: "Token exists and URLs updated",
          token: updatedToken,
        });
      }

      logger.log(`Token ${tokenMint} already exists in database`);
      return c.json({
        success: true,
        tokenFound: true,
        message: "Token already exists in database",
        token: existingToken[0],
      });
    }

    try {
      // Try to create a simple record first if nothing exists
      const now = new Date().toISOString();
      const tokenId = crypto.randomUUID();

      // Insert with all required fields from the schema
      await db.insert(tokens).values({
        id: tokenId,
        mint: tokenMint,
        name: `Token ${tokenMint.slice(0, 8)}`,
        ticker: "TOKEN",
        url: metadataUrl || "", // Use provided URL if available
        image: imageUrl || "", // Use provided image if available
        creator: user.publicKey || "unknown",
        status: "active",
        tokenPriceUSD: 0,
        createdAt: now,
        lastUpdated: now,
        txId: "",
      });

      // For response, create a simplified token object
      const tokenData = {
        id: tokenId,
        mint: tokenMint,
        name: `Token ${tokenMint.slice(0, 8)}`,
        ticker: "TOKEN",
        creator: user.publicKey || "unknown",
        status: "active",
        url: metadataUrl || "",
        image: imageUrl || "",
        createdAt: now,
      };

      logger.log(`Created basic token record for ${tokenMint}`);

      // Emit event to websocket clients
      try {
        const wsClient = getWebSocketClient(c.env);
        await wsClient.emit("global", "newToken", {
          ...tokenData,
          timestamp: new Date(),
        });
        logger.log(`WebSocket event emitted for token ${tokenMint}`);
      } catch (wsError) {
        // Don't fail if WebSocket fails
        logger.error(`WebSocket error: ${wsError}`);
      }

      // Now try monitoring to find more details
      try {
        // Run extended check to look for token on chain
        const result = await monitorSpecificToken(c.env, tokenMint);

        return c.json({
          success: true,
          tokenFound: true,
          message: result.message || "Token added to database",
          token: tokenData,
        });
      } catch (monitorError) {
        // If monitoring fails, we still have the basic record
        logger.error(`Error in monitorSpecificToken: ${monitorError}`);
        return c.json({
          success: true,
          tokenFound: true,
          message:
            "Basic token record created, detailed info will update later",
          token: tokenData,
        });
      }
    } catch (dbError) {
      logger.error(`Error creating token in database: ${dbError}`);

      // Try monitoring anyway as fallback
      try {
        const result = await monitorSpecificToken(c.env, tokenMint);
        return c.json({
          success: result.found,
          tokenFound: result.found,
          message:
            result.message ||
            "Error creating database record but monitoring succeeded",
        });
      } catch (monitorError) {
        logger.error(`Both database and monitoring failed: ${monitorError}`);
        return c.json({
          success: false,
          tokenFound: false,
          message: "Failed to create token record and monitoring failed",
          error: `${dbError instanceof Error ? dbError.message : "Unknown database error"}`,
        });
      }
    }
  } catch (error) {
    logger.error("Error checking token:", error);
    return c.json(
      {
        success: false,
        tokenFound: false,
        error: "Failed to check token",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// Manual token price update - useful for development mode
tokenRouter.get("/dev/update-token/:mint", async (c) => {
  try {
    // Only allow in development environment
    if (c.env.NODE_ENV !== "development" && c.env.NODE_ENV !== "test") {
      return c.json(
        { error: "This endpoint is only available in development" },
        403,
      );
    }

    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    const db = getDB(c.env);
    const tokenData = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    if (!tokenData || tokenData.length === 0) {
      return c.json({ error: "Token not found" }, 404);
    }

    // Get fresh SOL price
    const solPrice = await getSOLPrice(c.env);

    // Calculate token price in same way as old code
    const TOKEN_DECIMALS = Number(c.env.DECIMALS || 6);
    const token = { ...tokenData[0] };

    // Calculate price if we have the necessary data
    if (token.reserveAmount && token.reserveLamport) {
      token.currentPrice =
        Number(token.reserveLamport) /
        1e9 /
        (Number(token.reserveAmount) / Math.pow(10, TOKEN_DECIMALS));

      const tokenPriceInSol = token.currentPrice / Math.pow(10, TOKEN_DECIMALS);
      token.tokenPriceUSD =
        token.currentPrice > 0
          ? tokenPriceInSol * solPrice * Math.pow(10, TOKEN_DECIMALS)
          : 0;
    }

    // Use TOKEN_SUPPLY from env if available, otherwise use reserveAmount with a default
    const tokenSupply = c.env.TOKEN_SUPPLY
      ? Number(c.env.TOKEN_SUPPLY)
      : token.reserveAmount || 1000000000000;

    token.marketCapUSD = token.tokenPriceUSD
      ? (tokenSupply / Math.pow(10, TOKEN_DECIMALS)) * token.tokenPriceUSD
      : 0;

    // Update solPriceUSD
    token.solPriceUSD = solPrice;

    // Get virtualReserves and curveLimit from env or set defaults
    const virtualReserves = c.env.VIRTUAL_RESERVES
      ? Number(c.env.VIRTUAL_RESERVES)
      : 2800000000;
    const curveLimit = c.env.CURVE_LIMIT
      ? Number(c.env.CURVE_LIMIT)
      : 11300000000;

    // Update curve progress with the original formula
    token.curveProgress =
      token.status === "migrated"
        ? 100
        : ((Number(token.reserveLamport || virtualReserves) - virtualReserves) /
            (curveLimit - virtualReserves)) *
          100;

    // Update token in database
    await db
      .update(tokens)
      .set({
        currentPrice: token.currentPrice,
        tokenPriceUSD: token.tokenPriceUSD,
        marketCapUSD: token.marketCapUSD,
        solPriceUSD: token.solPriceUSD,
        curveProgress: token.curveProgress,
        virtualReserves: virtualReserves,
        curveLimit: curveLimit,
        lastUpdated: new Date().toISOString(),
      })
      .where(eq(tokens.mint, mint));

    return c.json({
      success: true,
      message: "Token prices updated successfully",
      token,
    });
  } catch (error) {
    logger.error("Error updating token prices:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

// Add an endpoint to fix a specific token's virtualReserves value
tokenRouter.get("/dev/fix-token/:mint", async (c) => {
  try {
    // Only allow in development environment
    if (c.env.NODE_ENV !== "development" && c.env.NODE_ENV !== "test") {
      return c.json(
        { error: "This endpoint is only available in development" },
        403,
      );
    }

    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    const db = getDB(c.env);
    const tokenData = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    if (!tokenData || tokenData.length === 0) {
      return c.json({ error: "Token not found" }, 404);
    }

    const token = tokenData[0];

    // Set the correct values for virtualReserves and curveLimit
    const virtualReserves = 2800000000; // 2.8 billion
    const curveLimit = 11300000000; // 11.3 billion

    // Calculate the correct curve progress using the fixed values
    const curveProgress =
      token.status === "migrated"
        ? 100
        : ((Number(token.reserveLamport || virtualReserves) - virtualReserves) /
            (curveLimit - virtualReserves)) *
          100;

    // Update the token in database with correct values
    await db
      .update(tokens)
      .set({
        virtualReserves: virtualReserves,
        curveLimit: curveLimit,
        curveProgress: curveProgress,
        lastUpdated: new Date().toISOString(),
      })
      .where(eq(tokens.mint, mint));

    return c.json({
      success: true,
      message: "Token values fixed successfully",
      oldVirtualReserves: token.virtualReserves,
      newVirtualReserves: virtualReserves,
      oldCurveLimit: token.curveLimit,
      newCurveLimit: curveLimit,
      oldCurveProgress: token.curveProgress,
      newCurveProgress: curveProgress,
    });
  } catch (error) {
    logger.error("Error fixing token values:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

// Update token reserveLamport value for development
tokenRouter.post("/dev/update-token-data/:mint", async (c) => {
  try {
    // Only allow in development environment
    if (c.env.NODE_ENV !== "development" && c.env.NODE_ENV !== "test") {
      return c.json(
        { error: "This endpoint is only available in development" },
        403,
      );
    }

    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // Get request body with the reserveLamport value to set
    const body = await c.req.json();
    if (!body || typeof body.reserveLamport !== "number") {
      return c.json(
        { error: "Request must include reserveLamport as a number" },
        400,
      );
    }

    const reserveLamport = body.reserveLamport;

    const db = getDB(c.env);
    const tokenData = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    if (!tokenData || tokenData.length === 0) {
      return c.json({ error: "Token not found" }, 404);
    }

    const token = tokenData[0];

    // Set the correct values for virtualReserves and curveLimit
    const virtualReserves = 2800000000; // 2.8 billion
    const curveLimit = 11300000000; // 11.3 billion
    const TOKEN_DECIMALS = Number(c.env.DECIMALS || 6);

    // Calculate the correct curve progress using the fixed values
    const curveProgress =
      token.status === "migrated"
        ? 100
        : ((reserveLamport - virtualReserves) /
            (curveLimit - virtualReserves)) *
          100;

    // Calculate currentPrice
    const currentPrice =
      reserveLamport /
      1e9 /
      ((token.reserveAmount || 1000000000000) / Math.pow(10, TOKEN_DECIMALS));

    // Get fresh SOL price
    const solPrice = await getSOLPrice(c.env);

    // Calculate tokenPriceUSD in the same way as the old code
    const tokenPriceInSol = currentPrice / Math.pow(10, TOKEN_DECIMALS);
    const tokenPriceUSD =
      currentPrice > 0
        ? tokenPriceInSol * solPrice * Math.pow(10, TOKEN_DECIMALS)
        : 0;

    // Calculate marketCapUSD
    // Use TOKEN_SUPPLY from env if available, otherwise use reserveAmount
    const tokenSupply = c.env.TOKEN_SUPPLY
      ? Number(c.env.TOKEN_SUPPLY)
      : token.reserveAmount || 1000000000000;

    const marketCapUSD =
      (tokenSupply / Math.pow(10, TOKEN_DECIMALS)) * tokenPriceUSD;

    // Update the token in database with the new values
    await db
      .update(tokens)
      .set({
        reserveLamport,
        currentPrice,
        tokenPriceUSD,
        marketCapUSD,
        solPriceUSD: solPrice,
        curveProgress,
        virtualReserves,
        curveLimit,
        lastUpdated: new Date().toISOString(),
      })
      .where(eq(tokens.mint, mint));

    // Get the updated token for the response
    const updatedTokenData = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    return c.json({
      success: true,
      message: "Token data updated successfully to reflect mainnet state",
      oldReserveLamport: token.reserveLamport,
      newReserveLamport: reserveLamport,
      oldCurveProgress: token.curveProgress,
      newCurveProgress: curveProgress,
      token: updatedTokenData[0],
    });
  } catch (error) {
    logger.error("Error updating token data:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

export async function updateHoldersCache(
  env: Env,
  mint: string,
): Promise<number> {
  try {
    // Use the utility function to get the RPC URL with proper API key
    const connection = new Connection(getRpcUrl(env));
    const db = getDB(env);

    // Get all token accounts for this mint using getParsedProgramAccounts
    // This method is more reliable for finding all holders
    const accounts = await connection.getParsedProgramAccounts(
      new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), // Token program
      {
        filters: [
          {
            dataSize: 165, // Size of token account
          },
          {
            memcmp: {
              offset: 0,
              bytes: mint, // Mint address
            },
          },
        ],
      },
    );

    if (!accounts || accounts.length === 0) {
      logger.log(`No accounts found for token ${mint}`);
      return 0;
    }

    logger.log(`Found ${accounts.length} token accounts for mint ${mint}`);

    // Process accounts to extract holder information
    let totalTokens = 0;
    const holders: TokenHolder[] = [];

    // Process each account to get holder details
    for (const account of accounts) {
      try {
        const parsedAccountInfo = account.account.data as ParsedAccountData;
        const tokenBalance =
          parsedAccountInfo.parsed?.info?.tokenAmount?.uiAmount || 0;

        // Skip accounts with zero balance
        if (tokenBalance <= 0) continue;

        const ownerAddress = parsedAccountInfo.parsed?.info?.owner || "";

        // Skip accounts without owner
        if (!ownerAddress) continue;

        // Add to total tokens for percentage calculation
        totalTokens += tokenBalance;

        holders.push({
          id: crypto.randomUUID(),
          mint,
          address: ownerAddress,
          amount: tokenBalance,
          percentage: 0, // Will calculate after we have the total
          lastUpdated: new Date().toISOString(),
        });
      } catch (error: any) {
        logger.error(`Error processing account for ${mint}:`, error);
        // Continue with other accounts even if one fails
        continue;
      }
    }

    // Calculate percentages now that we have the total
    if (totalTokens > 0) {
      for (const holder of holders) {
        holder.percentage = (holder.amount / totalTokens) * 100;
      }
    }

    // Sort holders by amount (descending)
    holders.sort((a, b) => b.amount - a.amount);

    // logger.log(`Processing ${holders.length} holders for token ${mint}`);

    // Clear existing holders and insert new ones
    // logger.log(`Clearing existing holders for token ${mint}`);
    await db.delete(tokenHolders).where(eq(tokenHolders.mint, mint));

    // For large number of holders, we need to limit what we insert
    // to avoid overwhelming the database
    const MAX_HOLDERS_TO_SAVE = 500; // Reasonable limit for most UI needs
    const holdersToSave =
      holders.length > MAX_HOLDERS_TO_SAVE
        ? holders.slice(0, MAX_HOLDERS_TO_SAVE)
        : holders;

    // logger.log(`Will insert ${holdersToSave.length} holders (from ${holders.length} total) for token ${mint}`);

    if (holdersToSave.length > 0) {
      // Use a very small batch size to avoid SQLite parameter limits
      const BATCH_SIZE = 10;

      // Insert in batches to avoid overwhelming the database
      for (let i = 0; i < holdersToSave.length; i += BATCH_SIZE) {
        try {
          const batch = holdersToSave.slice(i, i + BATCH_SIZE);
          const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
          const totalBatches = Math.ceil(holdersToSave.length / BATCH_SIZE);

          // logger.log(`Inserting batch ${batchNumber}/${totalBatches} (${batch.length} holders) for token ${mint}`);

          await db.insert(tokenHolders).values(batch);

          // logger.log(`Successfully inserted batch ${batchNumber}/${totalBatches} for token ${mint}`);
        } catch (insertError) {
          logger.error(`Error inserting batch for token ${mint}:`, insertError);
          // Continue with next batch even if this one fails
        }
      }

      try {
        const wsClient = getWebSocketClient(env);
        // Only emit a limited set of holders to avoid overwhelming WebSockets
        const limitedHolders = holdersToSave.slice(0, 50);
        wsClient.emit(`token-${mint}`, "newHolder", limitedHolders);
        // logger.log(`Emitted WebSocket update with ${limitedHolders.length} holders`);
      } catch (wsError) {
        logger.error(`WebSocket error when emitting holder update:`, wsError);
        // Don't fail if WebSocket fails
      }
    }

    // Update token holder count with the ACTUAL total count
    // even if we've only stored a subset
    await db
      .update(tokens)
      .set({
        holderCount: holders.length, // Use full count, not just what we saved
        lastUpdated: new Date().toISOString(),
      })
      .where(eq(tokens.mint, mint));

    // Emit WebSocket event to notify of holder update
    try {
      // Get updated token data
      const tokenData = await db
        .select()
        .from(tokens)
        .where(eq(tokens.mint, mint))
        .limit(1);

      if (tokenData && tokenData.length > 0) {
        // Emit event with updated holder count
        await processTokenUpdateEvent(env, {
          ...tokenData[0],
          event: "holdersUpdated",
          holderCount: holders.length, // Use full count here too
          timestamp: new Date().toISOString(),
        });

        // logger.log(`Emitted holder update event for token ${mint} with ${holders.length} holders count`);
      }
    } catch (wsError) {
      // Don't fail if WebSocket fails
      logger.error(`WebSocket error when emitting holder update: ${wsError}`);
    }

    return holders.length; // Return full count, not just what we saved
  } catch (error) {
    logger.error(`Error updating holders for token ${mint}:`, error);
    return 0; // Return 0 instead of throwing to avoid crashing the endpoint
  }
}

// Add this to the token router in worker/routes/token.ts
tokenRouter.get("/dev/update-holders/:mint", async (c) => {
  try {
    // Only allow in development environment
    if (c.env.NODE_ENV !== "development" && c.env.NODE_ENV !== "test") {
      return c.json(
        { error: "This endpoint is only available in development" },
        403,
      );
    }

    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    const holderCount = await updateHoldersCache(c.env, mint);

    return c.json({
      success: true,
      message: `Updated holders data for token ${mint}`,
      holderCount,
    });
  } catch (error) {
    logger.error("Error updating holders data:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

// Add regular endpoint to update holders data on demand
tokenRouter.get("/token/:mint/refresh-holders", async (c) => {
  try {
    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // Require authentication
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Authentication required" }, 401);
    }

    // logger.log(
    //   `Refreshing holders data for token ${mint} requested by ${user.publicKey}`,
    // );

    // Update holders for this specific token
    const holderCount = await updateHoldersCache(c.env, mint);

    return c.json({
      success: true,
      message: `Updated holders data for token ${mint}`,
      holderCount,
    });
  } catch (error) {
    logger.error("Error updating holders data:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

// Add regular endpoint to refresh trade/swap data on demand
tokenRouter.get("/token/:mint/refresh-swaps", async (c) => {
  try {
    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // Require authentication
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Authentication required" }, 401);
    }

    // logger.log(
    //   `Refreshing swap data for token ${mint} requested by ${user.publicKey}`,
    // );

    // In a real implementation, this would fetch the latest swaps
    // For now, just return the current swap data from the database
    const db = getDB(c.env);
    const swapsData = await db
      .select()
      .from(swaps)
      .where(eq(swaps.tokenMint, mint))
      .orderBy(desc(swaps.timestamp))
      .limit(10);

    // Emit WebSocket events for the 3 most recent swaps (if available)
    // This helps refresh clients with the latest data
    try {
      const recentSwaps = swapsData.slice(0, 3);
      for (const swap of recentSwaps) {
        await processSwapEvent(c.env, swap, false); // Only emit to token-specific room
      }
      // logger.log(
      //   `Emitted ${recentSwaps.length} recent swaps for token ${mint}`,
      // );
    } catch (wsError) {
      // Don't fail if WebSocket emission fails
      logger.error(`WebSocket error when emitting swaps: ${wsError}`);
    }

    return c.json({
      success: true,
      message: `Retrieved latest swap data for token ${mint}`,
      swaps: swapsData,
      count: swapsData.length,
    });
  } catch (error) {
    logger.error("Error fetching swap data:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

// Add a debug endpoint to add test holder data
tokenRouter.get("/dev/add-test-holders/:mint", async (c) => {
  try {
    // Only allow in development environment
    if (c.env.NODE_ENV !== "development" && c.env.NODE_ENV !== "test") {
      return c.json(
        { error: "This endpoint is only available in development" },
        403,
      );
    }

    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // logger.log(`Adding test holder data for token ${mint}`);

    const db = getDB(c.env);

    // Clear existing holders first
    await db.delete(tokenHolders).where(eq(tokenHolders.mint, mint));

    // Create mock holder data
    const holders = [
      {
        id: crypto.randomUUID(),
        mint,
        address: "DvmXXp4tSXYwZJhM5HjtEUvQ6SfxwkA7daE1jQgCX1ri", // Example address - replace with your address
        amount: 500000000000,
        percentage: 50,
        lastUpdated: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        mint,
        address: "4TSsx3XxMJKzDnQDPvP3YHkHZpPJmJh4xzNtiypvG1Lm",
        amount: 300000000000,
        percentage: 30,
        lastUpdated: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        mint,
        address: "8HQUbGPnG4XzfKMrpJG9nNq9h6JU5Q3dkKA49E1JZQke",
        amount: 200000000000,
        percentage: 20,
        lastUpdated: new Date().toISOString(),
      },
    ];

    // Insert test holders
    await db.insert(tokenHolders).values(holders);

    // Update token holder count
    await db
      .update(tokens)
      .set({
        holderCount: holders.length,
        lastUpdated: new Date().toISOString(),
      })
      .where(eq(tokens.mint, mint));

    // Fetch holders to confirm they were added
    const savedHolders = await db
      .select()
      .from(tokenHolders)
      .where(eq(tokenHolders.mint, mint))
      .orderBy(desc(tokenHolders.amount));

    return c.json({
      success: true,
      message: `Added ${holders.length} test holders for token ${mint}`,
      holderCount: holders.length,
      holders: savedHolders,
    });
  } catch (error) {
    logger.error("Error adding test holders:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

// Add a debug endpoint to check holder data in database
tokenRouter.get("/dev/check-holders/:mint", async (c) => {
  try {
    // Only allow in development environment
    if (c.env.NODE_ENV !== "development" && c.env.NODE_ENV !== "test") {
      return c.json(
        { error: "This endpoint is only available in development" },
        403,
      );
    }

    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // logger.log(`Checking holder data in database for token ${mint}`);

    const db = getDB(c.env);

    // Get token to check holderCount
    const token = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    // Get all holders from database
    const holders = await db
      .select()
      .from(tokenHolders)
      .where(eq(tokenHolders.mint, mint))
      .orderBy(desc(tokenHolders.amount));

    // Check if token exists
    if (!token || token.length === 0) {
      return c.json({
        success: false,
        message: `Token ${mint} not found in database`,
        holderCount: 0,
        holders: [],
      });
    }

    return c.json({
      success: true,
      token: token[0],
      tokenHolderCount: token[0].holderCount || 0,
      actualHolderCount: holders.length,
      holdersInDB: holders.length,
      holders: holders,
    });
  } catch (error) {
    logger.error("Error checking holder data:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

// Add a debug endpoint to add all test data (holders and swaps)
tokenRouter.get("/dev/add-all-test-data/:mint", async (c) => {
  try {
    // Only allow in development environment
    if (c.env.NODE_ENV !== "development" && c.env.NODE_ENV !== "test") {
      return c.json(
        { error: "This endpoint is only available in development" },
        403,
      );
    }

    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // logger.log(`Adding all test data for token ${mint}`);

    const db = getDB(c.env);

    // Get token to make sure it exists
    const token = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    if (!token || token.length === 0) {
      return c.json({
        success: false,
        message: `Token ${mint} not found in database`,
      });
    }

    // 1. Add test holders data
    // Clear existing holders first
    await db.delete(tokenHolders).where(eq(tokenHolders.mint, mint));

    // Create mock holder data
    const holders = [
      {
        id: crypto.randomUUID(),
        mint,
        address: "DvmXXp4tSXYwZJhM5HjtEUvQ6SfxwkA7daE1jQgCX1ri", // Example address - replace with your address
        amount: 500000000000,
        percentage: 50,
        lastUpdated: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        mint,
        address: "4TSsx3XxMJKzDnQDPvP3YHkHZpPJmJh4xzNtiypvG1Lm",
        amount: 300000000000,
        percentage: 30,
        lastUpdated: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        mint,
        address: "8HQUbGPnG4XzfKMrpJG9nNq9h6JU5Q3dkKA49E1JZQke",
        amount: 200000000000,
        percentage: 20,
        lastUpdated: new Date().toISOString(),
      },
    ];

    // Insert test holders
    await db.insert(tokenHolders).values(holders);

    // 2. Add test swap data
    // Clear existing swaps first
    await db.delete(swaps).where(eq(swaps.tokenMint, mint));

    // Create mock swap data - 10 swaps over the last few days
    const now = new Date();
    const swapRecords: Swap[] = [];

    // Create 10 swaps with alternating directions (buy/sell)
    for (let i = 0; i < 10; i++) {
      const timestamp = new Date(now.getTime() - i * 3600000); // 1 hour apart
      const direction = i % 2; // Alternate between 0 (buy) and 1 (sell)
      const price = 0.00001 + Math.random() * 0.00001; // Random price variation

      swapRecords.push({
        id: crypto.randomUUID(),
        tokenMint: mint,
        user: "DvmXXp4tSXYwZJhM5HjtEUvQ6SfxwkA7daE1jQgCX1ri", // Example user
        type: direction === 0 ? "buy" : "sell",
        direction: direction,
        amountIn: 1000000000 + Math.random() * 500000000, // Random amount
        amountOut: 500000000 + Math.random() * 300000000, // Random amount
        priceImpact: 0, // TBD
        price: price,
        txId: `test-tx-${i}-${crypto.randomUUID().slice(0, 8)}`,
        timestamp: timestamp.toISOString(),
      });
    }

    // Insert test swaps
    await db.insert(swaps).values(swapRecords);

    // 3. Update token with latest data
    await db
      .update(tokens)
      .set({
        holderCount: holders.length,
        lastUpdated: now.toISOString(),
      })
      .where(eq(tokens.mint, mint));

    return c.json({
      success: true,
      message: `Added all test data for token ${mint}`,
      holderCount: holders.length,
      swapCount: swapRecords.length,
    });
  } catch (error) {
    logger.error("Error adding test data:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

// Add a debug endpoint to check swap data in database
tokenRouter.get("/dev/check-swaps/:mint", async (c) => {
  try {
    // Only allow in development environment
    if (c.env.NODE_ENV !== "development" && c.env.NODE_ENV !== "test") {
      return c.json(
        { error: "This endpoint is only available in development" },
        403,
      );
    }

    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // logger.log(`Checking swap data in database for token ${mint}`);

    const db = getDB(c.env);

    // Get all swaps from database
    const swapsResult = await db
      .select()
      .from(swaps)
      .where(eq(swaps.tokenMint, mint))
      .orderBy(desc(swaps.timestamp));

    // Count total swaps
    const totalSwapsQuery = await db
      .select({ count: sql`count(*)` })
      .from(swaps)
      .where(eq(swaps.tokenMint, mint));

    const totalSwaps = Number(totalSwapsQuery[0]?.count || 0);

    return c.json({
      success: true,
      mint,
      totalSwaps,
      swaps: swapsResult,
      swapsCount: swapsResult.length,
      swapsExample: swapsResult.length > 0 ? swapsResult[0] : null,
    });
  } catch (error) {
    logger.error("Error checking swap data:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

// Get specific token swaps endpoint
tokenRouter.get("/swaps/:mint", async (c) => {
  // logger.log(`Swaps endpoint called for mint: ${c.req.param("mint")}`);
  try {
    const mint = c.req.param("mint");

    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // Parse pagination parameters
    const limit = parseInt(c.req.query("limit") || "50");
    const page = parseInt(c.req.query("page") || "1");
    const offset = (page - 1) * limit;

    // Get the DB connection
    const db = getDB(c.env);

    // Get real swap data from the database
    const swapsResult = await db
      .select()
      .from(swaps)
      .where(eq(swaps.tokenMint, mint))
      .orderBy(desc(swaps.timestamp))
      .offset(offset)
      .limit(limit);

    // logger.log(`Found ${swapsResult.length} swaps for mint ${mint}`);

    // Get total count for pagination
    const totalSwapsQuery = await db
      .select({ count: sql`count(*)` })
      .from(swaps)
      .where(eq(swaps.tokenMint, mint));

    const totalSwaps = Number(totalSwapsQuery[0]?.count || 0);
    const totalPages = Math.ceil(totalSwaps / limit);

    // Format directions for better readability
    const formattedSwaps = swapsResult.map((swap) => ({
      ...swap,
      directionText: swap.direction === 0 ? "buy" : "sell",
    }));

    const response = {
      swaps: formattedSwaps,
      page,
      totalPages,
      total: totalSwaps,
    };

    return c.json(response);
  } catch (error) {
    logger.error("Error in swaps history route:", error);
    return c.json(
      {
        swaps: [],
        page: 1,
        totalPages: 0,
        total: 0,
        error: "Failed to fetch swap history",
      },
      500,
    );
  }
});

// Add a new endpoint that matches the frontend path
tokenRouter.get("/api/swaps/:mint", async (c) => {
  // Simplified logging - just log the mint
  // logger.log(`API swaps endpoint called for mint: ${c.req.param("mint")}`);
  try {
    const mint = c.req.param("mint");

    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // Parse pagination parameters
    const limit = parseInt(c.req.query("limit") || "50");
    const page = parseInt(c.req.query("page") || "1");
    const offset = (page - 1) * limit;

    // Get the DB connection
    const db = getDB(c.env);

    // First, try to fetch real swap data from the blockchain
    let blockchainSwaps: (typeof swaps.$inferInsert)[] = [];
    try {
      // Import the fetchTokenTransactions function if needed
      const { fetchTokenTransactions } = await import(
        "../../src/utils/blockchain"
      );

      logger.log(`Fetching real blockchain swap data for mint ${mint}`);
      logger.log(
        `Using Solana RPC URL: ${process.env.MAINNET_SOLANA_RPC_URL || process.env.VITE_RPC_URL || "default url"}`,
      );
      const txResult = await fetchTokenTransactions(mint, limit * 2); // Fetch more to account for pagination

      logger.log(
        `Blockchain transaction search results: ${JSON.stringify({
          found: txResult && txResult.swaps ? txResult.swaps.length : 0,
          total: txResult?.total || 0,
          hasSwaps: !!(txResult && txResult.swaps && txResult.swaps.length > 0),
        })}`,
      );

      if (txResult && txResult.swaps && txResult.swaps.length > 0) {
        logger.log(
          `Found ${txResult.swaps.length} real swaps from blockchain for mint ${mint}`,
        );

        // Format the blockchain swaps to match our DB schema
        blockchainSwaps = txResult.swaps.map((swap) => ({
          id: swap.txId,
          tokenMint: mint,
          user: swap.user,
          type: swap.direction === 0 ? "buy" : "sell",
          direction: swap.direction,
          amountIn: swap.amountIn,
          amountOut: swap.amountOut,
          price: swap.amountIn / swap.amountOut, // Calculate price
          priceImpact: 0.01, // Default value
          txId: swap.txId,
          timestamp: swap.timestamp,
        }));

        // Insert these swaps into the database for future reference
        try {
          // Use batch insert to avoid conflicts
          for (const swap of blockchainSwaps) {
            await db
              .insert(swaps)
              .values(swap)
              .onConflictDoNothing({ target: [swaps.txId] });
          }
          logger.log(
            `Inserted ${blockchainSwaps.length} blockchain swaps into database`,
          );
        } catch (err) {
          logger.error("Error saving blockchain swaps to database:", err);
          // Continue without failing - we still have the data in memory
        }
      }
    } catch (err) {
      logger.error("Error fetching blockchain swap data:", err);
      // Continue with fallback to database
    }

    // If we found blockchain swaps, use them directly
    if (blockchainSwaps.length > 0) {
      // Apply pagination to the blockchain swaps
      const paginatedSwaps = blockchainSwaps
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        )
        .slice(offset, offset + limit);

      logger.log(
        `Returning ${paginatedSwaps.length} blockchain swaps for page ${page}`,
      );

      return c.json({
        swaps: paginatedSwaps,
        page,
        totalPages: Math.ceil(blockchainSwaps.length / limit),
        total: blockchainSwaps.length,
      });
    }

    // Otherwise, try to get swap data from the database
    const swapsResult = await db
      .select()
      .from(swaps)
      .where(eq(swaps.tokenMint, mint))
      .orderBy(desc(swaps.timestamp))
      .offset(offset)
      .limit(limit);

    logger.log(
      `Found ${swapsResult.length} swaps in database for mint ${mint}`,
    );

    // If no swaps found in either blockchain or database, create sample data in development mode
    if (swapsResult.length === 0 && c.env.NODE_ENV === "development") {
      logger.log("No swaps found, adding sample data for development");

      // Create mock swap data with exact fields expected by frontend
      const now = new Date();
      const swapRecords: (typeof swaps.$inferInsert)[] = [];

      // Create 15 test swaps with varying times and directions
      for (let i = 0; i < 15; i++) {
        // Vary the time offsets to create a realistic timeline
        const timeOffset = i * (Math.random() * 600000 + 3600000); // 1-2 hours apart
        const timestamp = new Date(now.getTime() - timeOffset).toISOString();

        // Alternate between buy and sell with some randomness
        const direction = Math.random() > 0.4 ? 0 : 1; // 60% buys, 40% sells

        // Create varying amounts based on direction
        const solAmount = 1000000000 + Math.random() * 3000000000; // 1-4 SOL
        const tokenAmount = 500000000 + Math.random() * 2500000000; // 0.5-3 tokens

        swapRecords.push({
          id: crypto.randomUUID(),
          tokenMint: mint,
          priceImpact: Math.random() * 0.02, // 0-2% price impact
          user: [
            "DvmXXp4tSXYwZJhM5HjtEUvQ6SfxwkA7daE1jQgCX1ri",
            "Gq8ncxiUZBP5V8dd1XRqsyiV7aQmQVZEEYgLLJwFAXvA",
            "3LCNtKAQRYMMCcXrKY9eMR1p8zUuY6gGZnBnnwQwULkE",
            "8HQUbGPnG4XzfKMrpJG9nNq9h6JU5Q3dkKA49E1JZQke",
            "HzkWnuoMSJRNhyHYrXVPgpyWaPn795bLJNBsfgXF326x",
          ][Math.floor(Math.random() * 5)], // Random user from list
          type: direction === 0 ? "buy" : "sell",
          direction: direction,
          amountIn: direction === 0 ? solAmount : tokenAmount,
          amountOut: direction === 0 ? tokenAmount : solAmount,
          price: 0.0001 + Math.random() * 0.0005, // Small price variation
          txId: `test-tx-${i}-${crypto.randomUUID().slice(0, 8)}`,
          timestamp: timestamp,
        });
      }

      // Insert test swaps
      try {
        await db.insert(swaps).values(swapRecords);
        logger.log("Added test swap data");

        // Return the newly added data
        const convertedSwaps = swapRecords.map((swap) => {
          // Calculate solAmount and tokenAmount based on direction
          const direction =
            typeof swap.direction === "number" ? swap.direction : 0;
          const amountIn =
            typeof swap.amountIn === "number" ? swap.amountIn : 0;
          const amountOut =
            typeof swap.amountOut === "number" ? swap.amountOut : 0;

          // If direction is 0 (buy), amountIn is SOL and amountOut is token
          // If direction is 1 (sell), amountIn is token and amountOut is SOL
          const solAmount = direction === 0 ? amountIn / 1e9 : amountOut / 1e9; // Convert lamports to SOL
          const tokenAmount =
            direction === 0 ? amountOut / 1e6 : amountIn / 1e6; // Convert to token amount

          return {
            ...swap,
            directionText: direction === 0 ? "buy" : "sell",
            type: direction === 0 ? "Buy" : "Sell", // Uppercase first letter for display
            solAmount: solAmount, // Added for frontend
            tokenAmount: tokenAmount, // Added for frontend
          };
        });

        const response = {
          swaps: convertedSwaps,
          page: 1,
          totalPages: 1,
          total: swapRecords.length,
        };

        return c.json(response);
      } catch (err) {
        logger.error("Error adding test swaps:", err);
      }
    } else if (swapsResult.length === 0) {
      // In production, just return empty array if no swaps found
      return c.json({
        swaps: [],
        page: 1,
        totalPages: 0,
        total: 0,
      });
    }

    // Get total count for pagination
    const totalSwapsQuery = await db
      .select({ count: sql`count(*)` })
      .from(swaps)
      .where(eq(swaps.tokenMint, mint));

    const totalSwaps = Number(totalSwapsQuery[0]?.count || 0);
    const totalPages = Math.ceil(totalSwaps / limit);

    // Format the swaps for the frontend with careful type handling
    const formattedSwaps = swapsResult.map((swap) => {
      // Calculate solAmount and tokenAmount based on direction
      const direction = typeof swap.direction === "number" ? swap.direction : 0;
      const amountIn = typeof swap.amountIn === "number" ? swap.amountIn : 0;
      const amountOut = typeof swap.amountOut === "number" ? swap.amountOut : 0;

      // If direction is 0 (buy), amountIn is SOL and amountOut is token
      // If direction is 1 (sell), amountIn is token and amountOut is SOL
      const solAmount = direction === 0 ? amountIn / 1e9 : amountOut / 1e9; // Convert lamports to SOL
      const tokenAmount = direction === 0 ? amountOut / 1e6 : amountIn / 1e6; // Convert to token amount

      // Create a new object with exactly the expected fields
      return {
        ...swap,
        txId: typeof swap.txId === "string" ? swap.txId : "", // Must be string
        timestamp:
          typeof swap.timestamp === "string"
            ? swap.timestamp
            : new Date().toISOString(), // Must be string in ISO format
        user: typeof swap.user === "string" ? swap.user : "", // Must be string
        direction: direction, // Must be 0 or 1
        amountIn: amountIn, // Must be number
        amountOut: amountOut, // Must be number
        directionText: direction === 0 ? "buy" : "sell",
        type: direction === 0 ? "Buy" : "Sell", // Uppercase first letter for display
        solAmount: solAmount, // Added for frontend
        tokenAmount: tokenAmount, // Added for frontend
      };
    });

    const response = {
      swaps: formattedSwaps,
      page,
      totalPages,
      total: totalSwaps,
    };

    return c.json(response);
  } catch (error) {
    logger.error("Error in api/swaps history route:", error);
    return c.json(
      {
        swaps: [],
        page: 1,
        totalPages: 0,
        total: 0,
        error: "Failed to fetch swap history",
      },
      500,
    );
  }
});

// Debug endpoint for swap data
tokenRouter.get("/swaps/:mint", async (c) => {
  console.log("Debug swaps endpoint called for mint:", c.req.param("mint"));
  try {
    const mint = c.req.param("mint");

    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    const db = getDB(c.env);

    // Get all swap data from the database without pagination
    const swapsResult = await db
      .select()
      .from(swaps)
      .where(eq(swaps.tokenMint, mint))
      .orderBy(desc(swaps.timestamp));

    console.log(`DEBUG: Found ${swapsResult.length} swaps for mint ${mint}`);

    // Format the swaps for the frontend with careful type handling
    const formattedSwaps = swapsResult.map((swap) => ({
      txId: typeof swap.txId === "string" ? swap.txId : "",
      timestamp:
        typeof swap.timestamp === "string"
          ? swap.timestamp
          : new Date().toISOString(),
      user: typeof swap.user === "string" ? swap.user : "",
      direction: typeof swap.direction === "number" ? swap.direction : 0,
      amountIn: typeof swap.amountIn === "number" ? swap.amountIn : 0,
      amountOut: typeof swap.amountOut === "number" ? swap.amountOut : 0,
    }));

    return c.json({
      swaps: formattedSwaps,
      count: formattedSwaps.length,
      originalSwaps: swapsResult.slice(0, 2), // For debugging, include the first two original records
    });
  } catch (error) {
    logger.error("Error in debug swaps route:", error);
    return c.json({ error: "Failed to fetch swap data", swaps: [] }, 500);
  }
});

// Add debug endpoint for WebSocket status check
tokenRouter.get("/websocket-status", async (c) => {
  try {
    // Only allow in development environment
    if (c.env.NODE_ENV !== "development" && c.env.NODE_ENV !== "test") {
      return c.json(
        { error: "This endpoint is only available in development" },
        403,
      );
    }

    // Get WebSocket client
    const wsClient = getWebSocketClient(c.env);

    // Test emit to global channel
    const testData = {
      message: "This is a test message",
      timestamp: new Date().toISOString(),
    };

    try {
      // Emit to global
      await wsClient.emit("global", "test", testData);

      // Return success
      return c.json({
        success: true,
        message: "WebSocket test event emitted successfully",
        socketActorAvailable: !!(c.env as any).socketActor,
        legacyNamespaceAvailable: !!(c.env as any).WEBSOCKET_DO,
      });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          message: "Failed to emit WebSocket test event",
          error: error?.message || "Unknown error",
          socketActorAvailable: !!(c.env as any).socketActor,
          legacyNamespaceAvailable: !!(c.env as any).WEBSOCKET_DO,
        },
        500,
      );
    }
  } catch (error: any) {
    logger.error("Error in WebSocket status endpoint:", error);
    return c.json(
      {
        error: "Error checking WebSocket status",
        details: error?.message || "Unknown error",
      },
      500,
    );
  }
});

// Function to process a swap and emit WebSocket events
export async function processSwapEvent(
  env: Env,
  swap: any,
  shouldEmitGlobal: boolean = true,
): Promise<void> {
  try {
    // Get WebSocket client
    const wsClient = getWebSocketClient(env);

    // Get DB connection to fetch token data and calculate featuredScore
    const db = getDB(env);

    // Get the token data for this swap
    const tokenData = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, swap.tokenMint))
      .limit(1);

    // Prepare swap data for emission
    const enrichedSwap = { ...swap };

    // Add featuredScore if we have token data
    if (tokenData && tokenData.length > 0) {
      // Get max values for normalization
      const { maxVolume, maxHolders } = await getFeaturedMaxValues(db);

      // Calculate featured score
      const featuredScore = calculateFeaturedScore(
        tokenData[0],
        maxVolume,
        maxHolders,
      );

      // Add token data with featuredScore to the swap
      enrichedSwap.tokenData = {
        ...tokenData[0],
        featuredScore,
      };
    }

    // Emit to token-specific room
    await wsClient.emit(`token-${swap.tokenMint}`, "newSwap", enrichedSwap);

    // Only log in debug mode or for significant events
    if (process.env.DEBUG_WEBSOCKET) {
      logger.log(`Emitted swap event for token ${swap.tokenMint}`);
    }

    // Optionally emit to global room for activity feed
    if (shouldEmitGlobal) {
      await wsClient.emit("global", "newSwap", enrichedSwap);

      if (process.env.DEBUG_WEBSOCKET) {
        logger.log("Emitted swap event to global feed");
      }
    }

    return;
  } catch (error) {
    logger.error("Error processing swap event:", error);
    throw error;
  }
}

// Function to process a token update and emit WebSocket events
export async function processTokenUpdateEvent(
  env: Env,
  tokenData: any,
  shouldEmitGlobal: boolean = false,
): Promise<void> {
  try {
    // Get WebSocket client
    const wsClient = getWebSocketClient(env);

    // Get DB connection and calculate featuredScore
    const db = getDB(env);
    const { maxVolume, maxHolders } = await getFeaturedMaxValues(db);

    // Create enriched token data with featuredScore
    const enrichedTokenData = {
      ...tokenData,
      featuredScore: calculateFeaturedScore(tokenData, maxVolume, maxHolders),
    };

    // Always emit to token-specific room
    await wsClient.emit(
      `token-${tokenData.mint}`,
      "updateToken",
      enrichedTokenData,
    );

    if (process.env.DEBUG_WEBSOCKET) {
      logger.log(`Emitted token update event for ${tokenData.mint}`);
    }

    // Optionally emit to global room for activity feed
    if (shouldEmitGlobal) {
      await wsClient.emit("global", "updateToken", {
        ...enrichedTokenData,
        timestamp: new Date(),
      });

      if (process.env.DEBUG_WEBSOCKET) {
        logger.log("Emitted token update event to global feed");
      }
    }

    return;
  } catch (error) {
    logger.error("Error processing token update event:", error);
    // Don't throw to avoid breaking other functionality
  }
}

// Add a dev endpoint to test token update WebSocket events
tokenRouter.get("/dev/emit-token-update/:mint", async (c) => {
  try {
    // Only allow in development environment
    if (c.env.NODE_ENV !== "development" && c.env.NODE_ENV !== "test") {
      return c.json(
        { error: "This endpoint is only available in development" },
        403,
      );
    }

    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // Get token data from database
    const db = getDB(c.env);
    const tokenData = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    if (!tokenData || tokenData.length === 0) {
      return c.json({ error: "Token not found" }, 404);
    }

    // Add timestamp for the event
    const tokenWithTimestamp = {
      ...tokenData[0],
      timestamp: new Date().toISOString(),
    };

    // Emit token update event via WebSocket
    await processTokenUpdateEvent(c.env, tokenWithTimestamp, true);

    return c.json({
      success: true,
      message: "Token update event emitted successfully",
      token: tokenWithTimestamp,
    });
  } catch (error) {
    logger.error("Error emitting token update event:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

// Add token update endpoint for social links
tokenRouter.post("/token/:mint/update", async (c) => {
  try {
    // Get auth headers and extract from cookies
    const authHeader = c.req.header("Authorization") || "none";
    const publicKeyCookie = getCookie(c, "publicKey");
    const authTokenCookie = getCookie(c, "auth_token");

    logger.log("Token update request received");
    logger.log("Authorization header:", authHeader);
    logger.log("Auth cookie present:", !!authTokenCookie);
    logger.log("PublicKey cookie:", publicKeyCookie);

    // Require authentication
    const user = c.get("user");

    if (!user) {
      logger.error("Authentication required - no user in context");

      // For development purposes, if in dev mode and there's a publicKey in the body, use that
      if (c.env.NODE_ENV === "development") {
        try {
          const body = await c.req.json();
          if (body._devWalletOverride && c.env.NODE_ENV === "development") {
            logger.log(
              "DEVELOPMENT: Using wallet override:",
              body._devWalletOverride,
            );
            c.set("user", { publicKey: body._devWalletOverride });
          } else {
            return c.json({ error: "Authentication required" }, 401);
          }
        } catch (e) {
          logger.error("Failed to parse request body for dev override");
          return c.json({ error: "Authentication required" }, 401);
        }
      } else {
        return c.json({ error: "Authentication required" }, 401);
      }
    }

    // At this point user should be available - get it again after potential override
    const authenticatedUser = c.get("user");
    if (!authenticatedUser) {
      return c.json({ error: "Authentication failed" }, 401);
    }

    // User is available, continue with the request
    logger.log("Authenticated user:", authenticatedUser.publicKey);

    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // Get request body with updated token metadata
    let body;
    try {
      body = await c.req.json();
      logger.log("Request body:", body);
    } catch (e) {
      logger.error("Failed to parse request body:", e);
      return c.json({ error: "Invalid request body" }, 400);
    }

    // Get DB connection
    const db = getDB(c.env);

    // Get the token to check permissions
    const tokenData = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    if (!tokenData || tokenData.length === 0) {
      logger.error(`Token not found: ${mint}`);
      return c.json({ error: "Token not found" }, 404);
    }

    // Log for debugging auth issues
    logger.log(`Update attempt for token ${mint}`);
    logger.log(`User wallet: ${authenticatedUser.publicKey}`);
    logger.log(`Token creator: ${tokenData[0].creator}`);

    // Try multiple ways to compare addresses
    let isCreator = false;

    try {
      // Try normalized comparison with PublicKey objects
      const normalizedWallet = new PublicKey(
        authenticatedUser.publicKey,
      ).toString();
      const normalizedCreator = new PublicKey(tokenData[0].creator).toString();

      logger.log("Normalized wallet:", normalizedWallet);
      logger.log("Normalized creator:", normalizedCreator);

      isCreator = normalizedWallet === normalizedCreator;
      logger.log("Exact match after normalization:", isCreator);

      if (!isCreator) {
        // Case-insensitive as fallback
        const caseMatch =
          authenticatedUser.publicKey.toLowerCase() ===
          tokenData[0].creator.toLowerCase();
        logger.log("Case-insensitive match:", caseMatch);
        isCreator = caseMatch;
      }
    } catch (error) {
      logger.error("Error normalizing addresses:", error);

      // Fallback to simple comparison
      isCreator = authenticatedUser.publicKey === tokenData[0].creator;
      logger.log("Simple equality check:", isCreator);
    }

    // Special dev override if enabled
    if (c.env.NODE_ENV === "development" && body._forceAdmin === true) {
      logger.log("DEVELOPMENT: Admin access override enabled");
      isCreator = true;
    }

    // Check if user is the token creator
    if (!isCreator) {
      logger.error("User is not authorized to update this token");
      return c.json(
        {
          error: "Only the token creator can update token information",
          userAddress: authenticatedUser.publicKey,
          creatorAddress: tokenData[0].creator,
        },
        403,
      );
    }

    // At this point, user is authenticated and authorized
    logger.log("User is authorized to update token");

    // Update token with the new social links
    await db
      .update(tokens)
      .set({
        website: body.website ?? tokenData[0].website,
        twitter: body.twitter ?? tokenData[0].twitter,
        telegram: body.telegram ?? tokenData[0].telegram,
        discord: body.discord ?? tokenData[0].discord,
        lastUpdated: new Date().toISOString(),
      })
      .where(eq(tokens.mint, mint));

    logger.log("Token updated successfully");

    // Get the updated token data
    const updatedToken = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    // Emit WebSocket event for token update if needed
    try {
      await processTokenUpdateEvent(c.env, {
        ...updatedToken[0],
        event: "tokenUpdated",
        timestamp: new Date().toISOString(),
      });

      logger.log(`Emitted token update event for ${mint}`);
    } catch (wsError) {
      // Don't fail if WebSocket fails
      logger.error(`WebSocket error when emitting token update: ${wsError}`);
    }

    return c.json({
      success: true,
      message: "Token information updated successfully",
      token: updatedToken[0],
    });
  } catch (error) {
    logger.error("Error updating token:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

// --- NEW: Get Token Agents ---
tokenRouter.get("/token/:mint/agents", async (c) => {
  try {
    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    const db = getDB(c.env);
    const agents = await db
      .select()
      .from(tokenAgents) // Ensure tokenAgents is imported and defined in schema
      .where(eq(tokenAgents.tokenMint, mint))
      .orderBy(tokenAgents.createdAt);

    // ** ADD Log: Check the agents data before sending **
    logger.log(
      `[GET /agents] Found agents for mint ${mint}:`,
      JSON.stringify(agents),
    );

    // Return in the format expected by the frontend { agents: [...] }
    return c.json({ agents: agents || [] });
  } catch (error) {
    logger.error("Error fetching token agents:", error);
    return c.json({ agents: [], error: "Failed to fetch agents" }, 500);
  }
});

// --- NEW: Create Token Agent ---
tokenRouter.post("/token/:mint/agents", async (c) => {
  try {
    // Require authentication (check user variable set by middleware)
    const user = c.get("user");
    if (!user || !user.publicKey) {
      logger.warn("Agent creation attempt failed: Authentication required");
      return c.json({ error: "Authentication required" }, 401);
    }

    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    const body = await c.req.json();
    const { twitterUserId } = body;

    if (!twitterUserId || typeof twitterUserId !== "string") {
      return c.json({ error: "Missing or invalid twitterUserId" }, 400);
    }

    const db = getDB(c.env);

    // Check if this Twitter user is already linked to this specific token
    const existingAgent = await db
      .select()
      .from(tokenAgents)
      .where(
        and(
          eq(tokenAgents.tokenMint, mint),
          eq(tokenAgents.twitterUserId, twitterUserId),
        ),
      )
      .limit(1);

    if (existingAgent && existingAgent.length > 0) {
      logger.warn(
        `Agent creation attempt failed: Twitter user ${twitterUserId} already linked to token ${mint}`,
      );
      return c.json(
        {
          error: "This Twitter account is already connected to this token.",
          agent: existingAgent[0],
        },
        409, // Conflict
      );
    }

    // --- Placeholder: Fetch Twitter Username and Image ---
    // TODO: Replace with actual Twitter API call using credentials/client
    const twitterUserName = twitterUserId;
    const twitterImageUrl = "/default-avatar.png";
    logger.warn(
      `Placeholder: Using mock Twitter data for user ID ${twitterUserId}`,
    );
    // try {
    //   const twitterProfile = await fetchTwitterProfile(c.env, twitterUserId);
    //   twitterUserName = twitterProfile.username;
    //   twitterImageUrl = twitterProfile.profile_image_url;
    // } catch (twitterError) {
    //    logger.error(`Failed to fetch Twitter profile for ${twitterUserId}:`, twitterError);
    //    // Decide how to handle - proceed with placeholder or error out?
    // }
    // --- End Placeholder ---

    // Check if the owner is the token creator to mark as official
    const tokenData = await db
      .select({ creator: tokens.creator })
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    const isOfficial =
      tokenData &&
      tokenData.length > 0 &&
      tokenData[0].creator === user.publicKey;

    const newAgentData = {
      id: crypto.randomUUID(), // Generate ID if not auto-generated by DB
      tokenMint: mint,
      ownerAddress: user.publicKey, // The Solana address of the user linking the account
      twitterUserId: twitterUserId,
      twitterUserName: twitterUserName,
      twitterImageUrl: twitterImageUrl,
      official: isOfficial ? 1 : 0,
      createdAt: new Date().toISOString(), // Set timestamp if not auto-set by DB
    };

    // This insert call now expects 'official' as a number (0 or 1)
    const result = await db
      .insert(tokenAgents)
      .values(newAgentData)
      .returning();

    if (!result || result.length === 0) {
      throw new Error("Failed to insert new agent into database.");
    }

    const newAgent = result[0];
    logger.log(
      `Successfully created agent link: Token ${mint}, Twitter ${twitterUserName}, Owner ${user.publicKey}`,
    );

    // TODO: Emit WebSocket event for new agent?

    return c.json(newAgent, 201); // Return the newly created agent with 201 status
  } catch (error) {
    logger.error("Error creating token agent:", error);
    // Handle potential database unique constraint errors more gracefully if needed
    if (
      error instanceof Error &&
      error.message.includes("duplicate key value violates unique constraint")
    ) {
      return c.json(
        {
          error:
            "This Twitter account might already be linked elsewhere or a database conflict occurred.",
        },
        409,
      );
    }
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create agent",
      },
      500,
    );
  }
});

// --- NEW: Delete Token Agent ---
tokenRouter.delete("/token/:mint/agents/:agentId", async (c) => {
  try {
    // Require authentication
    const user = c.get("user");
    if (!user || !user.publicKey) {
      logger.warn("Agent deletion attempt failed: Authentication required");
      return c.json({ error: "Authentication required" }, 401);
    }

    const mint = c.req.param("mint");
    const agentId = c.req.param("agentId"); // Assuming agentId is the unique ID (UUID)

    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }
    // Basic UUID check (simplified)
    if (!agentId || agentId.length < 30) {
      return c.json({ error: "Missing or invalid agent ID" }, 400);
    }

    const db = getDB(c.env);

    // Find the agent to check ownership
    const agentToDelete = await db
      .select()
      .from(tokenAgents)
      .where(and(eq(tokenAgents.id, agentId), eq(tokenAgents.tokenMint, mint)))
      .limit(1);

    if (!agentToDelete || agentToDelete.length === 0) {
      return c.json(
        { error: "Agent not found or does not belong to this token" },
        404,
      );
    }

    // Check if the authenticated user is the owner of this agent link
    if (agentToDelete[0].ownerAddress !== user.publicKey) {
      logger.warn(
        `Agent deletion attempt failed: User ${user.publicKey} tried to delete agent ${agentId} owned by ${agentToDelete[0].ownerAddress}`,
      );
      return c.json(
        { error: "You can only remove agents you have connected." },
        403, // Forbidden
      );
    }

    // Delete the agent
    const result = await db
      .delete(tokenAgents)
      .where(eq(tokenAgents.id, agentId))
      .returning({ id: tokenAgents.id }); // Return ID to confirm deletion

    if (!result || result.length === 0) {
      // This might happen if the agent was deleted between the select and delete calls
      logger.warn(
        `Agent ${agentId} not found during deletion, possibly already deleted.`,
      );
      return c.json({ error: "Agent not found during deletion attempt" }, 404);
    }

    logger.log(
      `Successfully deleted agent: ID ${agentId}, Token ${mint}, User ${user.publicKey}`,
    );

    // TODO: Emit WebSocket event for agent removal?

    return c.json({ success: true, message: "Agent removed successfully" });
  } catch (error) {
    logger.error("Error deleting token agent:", error);
    return c.json({ error: "Failed to remove agent" }, 500);
  }
});

// --- NEW: Connect Twitter Agent - Combined Endpoint ---
tokenRouter.post("/token/:mint/connect-twitter-agent", async (c) => {
  try {
    // Require authentication
    const user = c.get("user");
    if (!user || !user.publicKey) {
      logger.warn("Agent connection attempt failed: Authentication required");
      return c.json({ error: "Authentication required" }, 401);
    }

    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    const body = await c.req.json();
    const { accessToken, userId } = body;

    if (!accessToken || !userId) {
      return c.json({ error: "Missing Twitter credentials" }, 400);
    }

    // Step 1: Attempt to fetch Twitter user info
    let twitterUserId = userId;
    let twitterUserName = `user_${userId.substring(0, 5)}`;
    let twitterImageUrl = "/default-avatar.png";

    try {
      // Try to fetch user profile
      logger.log(`Fetching Twitter profile for user ID: ${userId}`);
      const profileResponse = await fetch(
        "https://api.twitter.com/2/users/me?user.fields=profile_image_url",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        logger.log("Twitter profile data:", profileData);

        if (profileData.data && profileData.data.id) {
          twitterUserId = profileData.data.id;
          // If username is available, use it
          if (profileData.data.username) {
            twitterUserName = `@${profileData.data.username}`;
          }

          // Handle profile image if available
          if (profileData.data.profile_image_url) {
            // Store original Twitter URL temporarily
            const originalImageUrl = profileData.data.profile_image_url;

            // Replace '_normal' with '_400x400' to get a larger image
            const largeImageUrl = originalImageUrl.replace(
              "_normal",
              "_400x400",
            );

            try {
              // Fetch the image
              const imageResponse = await fetch(largeImageUrl);
              if (imageResponse.ok) {
                // Generate a unique filename
                const imageId = crypto.randomUUID();
                const imageKey = `twitter-images/${imageId}.jpg`;

                // Get the image as arrayBuffer
                const imageBuffer = await imageResponse.arrayBuffer();

                // Store in R2 if available
                if (c.env.R2) {
                  await c.env.R2.put(imageKey, imageBuffer, {
                    httpMetadata: {
                      contentType: "image/jpeg",
                      cacheControl: "public, max-age=31536000", // Cache for 1 year
                    },
                  });

                  // Set the URL to our cached version
                  twitterImageUrl = `${c.env.ASSET_URL || c.env.VITE_API_URL}/api/twitter-image/${imageId}`;
                  logger.log(
                    `Cached Twitter profile image at: ${twitterImageUrl}`,
                  );
                } else {
                  // If R2 is not available, use the original URL
                  twitterImageUrl = largeImageUrl;
                  logger.log("R2 not available, using original Twitter URL");
                }
              } else {
                logger.warn(
                  `Failed to fetch Twitter profile image: ${imageResponse.status}`,
                );
                // Fall back to the original URL
                twitterImageUrl = originalImageUrl;
              }
            } catch (imageError) {
              logger.error("Error caching Twitter profile image:", imageError);
              // Fall back to the original URL
              twitterImageUrl = originalImageUrl;
            }
          }
        }
      } else {
        logger.warn(
          `Twitter profile fetch failed with status: ${profileResponse.status}`,
        );
        // Continue with default values - we don't want to fail the agent creation
        // just because we couldn't get user details
      }
    } catch (profileError) {
      logger.error("Error fetching Twitter profile:", profileError);
      // Continue with default values
    }

    // Step 2: Check if this Twitter user is already connected to this token
    const db = getDB(c.env);
    const existingAgent = await db
      .select()
      .from(tokenAgents)
      .where(
        and(
          eq(tokenAgents.tokenMint, mint),
          eq(tokenAgents.twitterUserId, twitterUserId),
        ),
      )
      .limit(1);

    if (existingAgent && existingAgent.length > 0) {
      logger.warn(
        `Agent creation attempt failed: Twitter user ${twitterUserId} already linked to token ${mint}`,
      );
      return c.json(
        {
          error: "This Twitter account is already connected to this token.",
          agent: existingAgent[0],
        },
        409, // Conflict
      );
    }

    // Step 3: Check if the owner is the token creator to mark as official
    const tokenData = await db
      .select({ creator: tokens.creator })
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    const isOfficial =
      tokenData &&
      tokenData.length > 0 &&
      tokenData[0].creator === user.publicKey;

    // Step 4: Create new agent
    const newAgentData = {
      id: crypto.randomUUID(),
      tokenMint: mint,
      ownerAddress: user.publicKey,
      twitterUserId: twitterUserId,
      twitterUserName: twitterUserName,
      twitterImageUrl: twitterImageUrl,
      official: isOfficial ? 1 : 0,
      createdAt: new Date().toISOString(),
    };

    const result = await db
      .insert(tokenAgents)
      .values(newAgentData)
      .returning();

    if (!result || result.length === 0) {
      throw new Error("Failed to insert new agent into database.");
    }

    const newAgent = result[0];
    logger.log(
      `Successfully created agent link: Token ${mint}, Twitter ${twitterUserName}, Owner ${user.publicKey}`,
    );

    // TODO: Emit WebSocket event for new agent?

    return c.json(newAgent, 201);
  } catch (error) {
    logger.error("Error connecting Twitter agent:", error);
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to connect Twitter agent",
      },
      500,
    );
  }
});

// --- Serve Twitter profile images directly from R2 ---
tokenRouter.get("/twitter-image/:imageId", async (c) => {
  try {
    // Get the imageId from params
    const imageId = c.req.param("imageId");
    if (!imageId) {
      return c.json({ error: "Image ID parameter is required" }, 400);
    }

    // Ensure R2 is available
    if (!c.env.R2) {
      return c.json({ error: "R2 storage is not available" }, 500);
    }

    // Construct the full storage key
    const imageKey = `twitter-images/${imageId}.jpg`;

    // Fetch the image from R2
    const object = await c.env.R2.get(imageKey);

    if (!object) {
      return c.json({ error: "Twitter profile image not found" }, 404);
    }

    // Get the content type and data
    const contentType = object.httpMetadata?.contentType || "image/jpeg";
    const data = await object.arrayBuffer();

    // Set CORS headers for browser access
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    };

    // Return the image with appropriate headers
    return new Response(data, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": object.size.toString(),
        "Cache-Control": "public, max-age=31536000", // Cache for 1 year
        ...corsHeaders,
      },
    });
  } catch (error) {
    logger.error("Error serving Twitter profile image:", error);
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to serve Twitter profile image",
      },
      500,
    );
  }
});

// Add endpoint to check token balance for a wallet
tokenRouter.get("/token/:mint/check-balance", async (c) => {
  try {
    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // Get wallet address from query parameter
    const address = c.req.query("address");
    if (!address || address.length < 32 || address.length > 44) {
      return c.json({ error: "Invalid wallet address" }, 400);
    }

    // Check if we're in local mode (which will check both networks)
    const mode = c.req.query("mode");
    const isLocalMode = mode === "local";

    logger.log(
      `Checking token balance for ${address} on ${mint}, mode: ${isLocalMode ? "local" : "standard"}`,
    );

    const db = getDB(c.env);

    // Check token holders table
    const holderQuery = await db
      .select()
      .from(tokenHolders)
      .where(
        and(eq(tokenHolders.mint, mint), eq(tokenHolders.address, address)),
      )
      .limit(1);

    // Get token for decimals information
    const tokenQuery = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    const token = tokenQuery[0];

    // If token doesn't exist in our database but we're in local mode,
    // try to check the blockchain directly if LOCAL_DEV is enabled
    if (!token && (isLocalMode || (c.env as any).LOCAL_DEV === "true")) {
      logger.log(
        `Token ${mint} not found in database, but in local/dev mode, trying blockchain lookup`,
      );
      return await checkBlockchainTokenBalance(c, mint, address, isLocalMode);
    }

    // If token doesn't exist in our database and not in local mode
    if (!token) {
      return c.json({ error: "Token not found" }, 404);
    }

    // Check if user is the token creator
    const isCreator = token.creator === address;

    // Default decimals for most tokens
    const decimals = 6;

    if (holderQuery.length > 0) {
      // User is in the token holders table
      const holder = holderQuery[0];
      const balance = holder.amount / Math.pow(10, decimals);

      return c.json({
        balance,
        percentage: holder.percentage,
        isCreator,
        mint,
        address,
        lastUpdated: holder.lastUpdated,
      });
    } else if (isCreator) {
      // User is the creator but not in holders table (might not have any tokens)
      return await checkBlockchainTokenBalance(c, mint, address, false);
    } else {
      // User is not in holders table and is not the creator
      // This likely means they have no tokens
      return c.json({
        balance: 0,
        percentage: 0,
        isCreator: false,
        mint,
        address,
      });
    }
  } catch (error) {
    logger.error(`Error checking token balance: ${error}`);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

// Helper to check token balance directly on blockchain
async function checkBlockchainTokenBalance(
  c,
  mint,
  address,
  checkMultipleNetworks = false,
) {
  // Initialize return data
  let balance = 0;
  let foundNetwork = ""; // Renamed to avoid confusion with loop variable
  // Get explicit mainnet and devnet URLs
  const mainnetUrl = getMainnetRpcUrl(c.env);
  const devnetUrl = getDevnetRpcUrl(c.env);

  // Log detailed connection info and environment settings
  logger.log(`IMPORTANT DEBUG INFO FOR TOKEN BALANCE CHECK:`);
  logger.log(`Address: ${address}`);
  logger.log(`Mint: ${mint}`);
  logger.log(`CheckMultipleNetworks: ${checkMultipleNetworks}`);
  logger.log(`LOCAL_DEV setting: ${c.env.LOCAL_DEV}`);
  logger.log(`ENV.NETWORK setting: ${c.env.NETWORK || "not set"}`);
  logger.log(`Mainnet URL: ${mainnetUrl}`);
  logger.log(`Devnet URL: ${devnetUrl}`);

  // Determine which networks to check - ONLY mainnet and devnet if in local mode
  const networksToCheck = checkMultipleNetworks
    ? [
        { name: "mainnet", url: mainnetUrl },
        { name: "devnet", url: devnetUrl },
      ]
    : [
        {
          name: c.env.NETWORK || "devnet",
          url: c.env.NETWORK === "mainnet" ? mainnetUrl : devnetUrl,
        },
      ];

  logger.log(
    `Will check these networks: ${networksToCheck.map((n) => `${n.name} (${n.url})`).join(", ")}`,
  );

  // Try each network until we find a balance
  for (const network of networksToCheck) {
    try {
      logger.log(
        `Checking ${network.name} (${network.url}) for token balance...`,
      );
      const connection = new Connection(network.url, "confirmed");

      // Convert string addresses to PublicKey objects
      const mintPublicKey = new PublicKey(mint);
      const userPublicKey = new PublicKey(address);

      logger.log(
        `Getting token accounts for ${address} for mint ${mint} on ${network.name}`,
      );

      // Fetch token accounts with a simple RPC call
      const response = await connection.getTokenAccountsByOwner(
        userPublicKey,
        { mint: mintPublicKey },
        { commitment: "confirmed" },
      );

      // Log the number of accounts found
      logger.log(
        `Found ${response.value.length} token accounts on ${network.name}`,
      );

      // If we have accounts, calculate total balance
      if (response && response.value && response.value.length > 0) {
        let networkBalance = 0;

        // Log each account
        for (let i = 0; i < response.value.length; i++) {
          const { pubkey } = response.value[i];
          logger.log(`Account ${i + 1}: ${pubkey.toString()}`);
        }

        // Get token balances from all accounts
        for (const { pubkey } of response.value) {
          try {
            const accountInfo = await connection.getTokenAccountBalance(pubkey);
            if (accountInfo.value) {
              const amount = accountInfo.value.amount;
              const decimals = accountInfo.value.decimals;
              const tokenAmount = Number(amount) / Math.pow(10, decimals);
              networkBalance += tokenAmount;
              logger.log(
                `Account ${pubkey.toString()} has ${tokenAmount} tokens`,
              );
            }
          } catch (balanceError) {
            logger.error(
              `Error getting token account balance: ${balanceError}`,
            );
            // Continue with other accounts
          }
        }

        // If we found tokens on this network, use this balance
        if (networkBalance > 0) {
          balance = networkBalance;
          foundNetwork = network.name;
          logger.log(
            `SUCCESS: Found balance of ${balance} tokens on ${foundNetwork}`,
          );
          break; // Stop checking other networks once we find a balance
        } else {
          logger.log(
            `No balance found on ${network.name} despite finding accounts`,
          );
        }
      } else {
        logger.log(`No token accounts found on ${network.name}`);
      }
    } catch (netError) {
      logger.error(
        `Error checking ${network.name} for token balance: ${netError}`,
      );
      // Continue to next network
    }
  }

  // Return the balance information
  logger.log(
    `Final result: Balance=${balance}, Network=${foundNetwork || "none"}`,
  );
  return c.json({
    balance,
    percentage: 0, // We don't know the percentage when checking directly
    isCreator: false, // We don't know if creator when checking directly
    mint,
    address,
    network: foundNetwork || c.env.NETWORK || "unknown",
    onChain: true,
  });
}

// Add proper endpoint for updating holder cache for a token
tokenRouter.get("/token/:mint/update-holders", async (c) => {
  try {
    const mint = c.req.param("mint");

    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    const holderCount = await updateHoldersCache(c.env, mint);

    return c.json({
      success: true,
      message: `Updated holders data for token ${mint}`,
      holderCount,
    });
  } catch (error) {
    const mint = c.req.param("mint");
    logger.error(`Error updating holders for ${mint}:`, error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// --- STEP 3 (Part 1): Temporary Metadata Upload Endpoint ---
// Accepts metadata JSON, uploads to R2 with a temporary name, returns temporary URL.
tokenRouter.post("/upload-metadata-temp", async (c) => {
  logger.log("[/upload-metadata-temp] Received request");
  try {
    const user = c.get("user");
    if (!user || !user.publicKey) {
      logger.warn("[/upload-metadata-temp] Authentication required");
      return c.json({ error: "Authentication required" }, 401);
    }
    logger.log(`[/upload-metadata-temp] Authenticated user: ${user.publicKey}`);

    if (!c.env.R2) {
      logger.error("[/upload-metadata-temp] R2 storage is not configured");
      return c.json({ error: "Metadata storage is not available" }, 500);
    }

    // Parse the request body
    let metadataJson;
    try {
      metadataJson = await c.req.json();
      logger.log(
        `[/upload-metadata-temp] Received metadata for token: ${metadataJson.name || "unnamed"}`,
      );
    } catch (parseError) {
      logger.error(
        "[/upload-metadata-temp] Failed to parse request JSON:",
        parseError,
      );
      return c.json({ error: "Invalid JSON payload" }, 400);
    }

    // Basic validation of received JSON
    if (!metadataJson || typeof metadataJson !== "object") {
      logger.error("[/upload-metadata-temp] Invalid metadata JSON format");
      return c.json(
        { error: "Invalid metadata format: must be a JSON object" },
        400,
      );
    }

    if (!metadataJson.name || !metadataJson.symbol) {
      logger.error("[/upload-metadata-temp] Missing required metadata fields");
      return c.json(
        { error: "Metadata must include at least name and symbol" },
        400,
      );
    }

    // Ensure image field exists if provided
    if (metadataJson.image && typeof metadataJson.image !== "string") {
      logger.error("[/upload-metadata-temp] Invalid image URL in metadata");
      return c.json({ error: "Image field must be a string URL" }, 400);
    }

    logger.log(
      `[/upload-metadata-temp] Metadata validation passed for: ${metadataJson.name}`,
    );

    // Create a temporary unique ID for the metadata
    const tempId = crypto.randomUUID();
    const tempFilename = `${tempId}.json`;
    const tempMetadataKey = `token-metadata-temp/${tempFilename}`;

    // Convert to buffer and upload
    const metadataBuffer = Buffer.from(JSON.stringify(metadataJson));
    logger.log(
      `[/upload-metadata-temp] Uploading metadata to temp location: ${tempMetadataKey}`,
    );

    await c.env.R2.put(tempMetadataKey, metadataBuffer, {
      httpMetadata: {
        contentType: "application/json",
        cacheControl: "public, max-age=3600", // Cache for 1 hour
      },
    });
    logger.log(`[/upload-metadata-temp] Metadata uploaded successfully to R2`);

    // Construct the temporary metadata URL
    const assetBaseUrl =
      c.env.ASSET_URL || c.env.VITE_API_URL || c.req.url.split("/api/")[0];
    // For the temporary metadata, we'll need a way to serve it:
    // Either from a specific temp endpoint, or by adapting the existing metadata endpoint
    // For now, we'll use the same metadata endpoint with a temp=true query parameter
    const temporaryMetadataUrl = `${assetBaseUrl}/api/metadata/${tempFilename}?temp=true`;

    logger.log(
      `[/upload-metadata-temp] Created temporary metadata URL: ${temporaryMetadataUrl}`,
    );

    return c.json({
      success: true,
      temporaryMetadataUrl: temporaryMetadataUrl,
      // Also return the key for debugging
      temporaryMetadataKey: tempMetadataKey,
    });
  } catch (error) {
    logger.error("[/upload-metadata-temp] Unexpected error:", error);
    return c.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to upload temporary metadata",
      },
      500,
    );
  }
});

// --- STEP 4: Register Token Endpoint ---
// Receives mint, all metadata, imageUrl, temporaryMetadataUrl
// Validates mint, finalizes metadata, saves token to database
tokenRouter.post("/register-token", async (c) => {
  logger.log("[/register-token] Received request");
  try {
    // Validate authentication
    const user = c.get("user");
    if (!user || !user.publicKey) {
      logger.warn("[/register-token] Authentication required");
      return c.json({ error: "Authentication required" }, 401);
    }
    logger.log(`[/register-token] Authenticated user: ${user.publicKey}`);

    // Parse and validate request body
    let body;
    try {
      body = await c.req.json();
      logger.log("[/register-token] Received body keys:", Object.keys(body));
    } catch (parseError) {
      logger.error(
        "[/register-token] Failed to parse request body:",
        parseError,
      );
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const {
      mint,
      name,
      symbol,
      description,
      imageUrl,
      // Don't destructure temporaryMetadataUrl or metadataUrl here - we'll handle them specially
      twitter = "",
      telegram = "",
      website = "",
      discord = "",
      imported = false,
      preGeneratedId = null,
    } = body;

    // Get the metadata URLs with fallback logic for backward compatibility
    let temporaryMetadataUrl = body.temporaryMetadataUrl;
    const metadataUrl = body.metadataUrl; // For backward compatibility

    // Validate required fields
    if (
      !mint ||
      typeof mint !== "string" ||
      mint.length < 32 ||
      mint.length > 44
    ) {
      logger.error("[/register-token] Invalid mint address:", mint);
      return c.json({ error: "Invalid mint address" }, 400);
    }

    if (!name || !symbol || !description) {
      logger.error("[/register-token] Missing required metadata fields");
      return c.json(
        {
          error: "Missing required metadata fields (name, symbol, description)",
        },
        400,
      );
    }

    if (!imageUrl || typeof imageUrl !== "string") {
      logger.error("[/register-token] Missing or invalid image URL");
      return c.json({ error: "Missing or invalid image URL" }, 400);
    }

    // Use metadataUrl as fallback if temporaryMetadataUrl is not provided
    if (!temporaryMetadataUrl && metadataUrl) {
      logger.log(
        "[/register-token] Using metadataUrl instead of temporaryMetadataUrl for backward compatibility",
      );
      temporaryMetadataUrl = metadataUrl;
    }

    // For non-imported tokens, validate metadata URL
    if (
      !imported &&
      (!temporaryMetadataUrl || typeof temporaryMetadataUrl !== "string")
    ) {
      logger.error(
        "[/register-token] Missing or invalid metadata URL. temporaryMetadataUrl:",
        temporaryMetadataUrl,
        "metadataUrl:",
        metadataUrl,
      );
      return c.json({ error: "Missing or invalid metadata URL" }, 400);
    }

    logger.log(`[/register-token] Using metadata URL: ${temporaryMetadataUrl}`);

    logger.log(
      `[/register-token] Initial validation passed for token: ${name} (${mint})`,
    );

    // Access database
    const db = getDB(c.env);
    if (!db) {
      logger.error("[/register-token] Failed to access database");
      return c.json({ error: "Database access error" }, 500);
    }

    // Check if token already exists in the database
    logger.log(
      `[/register-token] Checking if token ${mint} already exists in database`,
    );
    const existingToken = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    if (existingToken && existingToken.length > 0) {
      logger.log(`[/register-token] Token ${mint} already exists in database`);
      return c.json({
        success: true,
        tokenExists: true,
        token: existingToken[0],
        message: "Token already registered",
      });
    }
    logger.log(
      `[/register-token] Token ${mint} not found in database, proceeding with registration`,
    );

    // For non-imported tokens: validate on blockchain, finalize metadata
    let finalMetadataUrl = temporaryMetadataUrl || metadataUrl || "";

    // If no metadata URL was provided, but we have imageUrl, create a minimal metadata file
    if (
      (!finalMetadataUrl || finalMetadataUrl === "") &&
      imageUrl &&
      c.env.R2
    ) {
      logger.log(
        `[/register-token] No metadata URL provided. Creating minimal metadata file for ${mint}`,
      );
      try {
        // Create minimal metadata JSON
        const minimalMetadata = {
          name,
          symbol,
          description,
          image: imageUrl,
          external_url: website || "",
          properties: {
            files: [{ uri: imageUrl, type: "image/png" }],
            category: "image",
            creators: [{ address: user.publicKey, share: 100 }],
            links: {
              twitter: twitter || "",
              telegram: telegram || "",
              website: website || "",
              discord: discord || "",
            },
          },
        };

        // Generate metadata filename and key
        const metadataFilename = `${mint}.json`;
        const metadataKey = `token-metadata/${metadataFilename}`;

        // Upload metadata JSON
        const metadataBuffer = Buffer.from(JSON.stringify(minimalMetadata));
        logger.log(
          `[/register-token] Creating fallback metadata at: ${metadataKey}`,
        );

        await c.env.R2.put(metadataKey, metadataBuffer, {
          httpMetadata: {
            contentType: "application/json",
            cacheControl: "public, max-age=86400", // Cache for 24 hours
          },
        });

        // Create metadata URL
        const assetBaseUrl =
          c.env.ASSET_URL || c.env.VITE_API_URL || c.req.url.split("/api/")[0];
        finalMetadataUrl = `${assetBaseUrl}/api/metadata/${metadataFilename}`;
        logger.log(
          `[/register-token] Created fallback metadata URL: ${finalMetadataUrl}`,
        );
      } catch (fallbackError) {
        logger.error(
          `[/register-token] Error creating fallback metadata:`,
          fallbackError,
        );
        // Continue with empty URL if this fails
      }
    }

    if ((!finalMetadataUrl || finalMetadataUrl === "") && !imported) {
      logger.warn(
        `[/register-token] No valid metadata URL available for token ${mint}`,
      );
      // Continue anyway, better to have the token in DB with missing metadata than not at all
    }

    // Insert token into database
    try {
      logger.log(`[/register-token] Inserting token ${mint} into database`);

      const now = new Date().toISOString();
      const tokenId = crypto.randomUUID();

      const newToken = {
        id: tokenId,
        mint,
        name,
        ticker: symbol,
        description,
        image: imageUrl,
        url: finalMetadataUrl,
        twitter,
        telegram,
        website,
        discord,
        creator: user.publicKey,
        status: "active",
        createdAt: now,
        lastUpdated: now,
        // Add defaults for required numeric fields
        holderCount: 0,
        tokenPriceUSD: 0,
        marketCapUSD: 0,
        volume24h: 0,
        txId: `register-${tokenId}`, // Default txId to satisfy NOT NULL constraint
      };

      // Insert the token into the database
      await db.insert(tokens).values(newToken);
      logger.log(
        `[/register-token] Successfully inserted token ${mint} into database`,
      );

      // If this was a pre-generated token, mark it as used
      if (preGeneratedId && typeof preGeneratedId === "string") {
        try {
          logger.log(
            `[/register-token] Marking pre-generated token ${preGeneratedId} as used`,
          );
          // Note: Implement this if needed
          // await markPreGeneratedTokenAsUsed(c.env, preGeneratedId, name, symbol);
          logger.log(
            `[/register-token] Successfully marked pre-generated token as used`,
          );
        } catch (markError) {
          logger.warn(
            `[/register-token] Failed to mark pre-generated token as used:`,
            markError,
          );
          // Continue even if this fails
        }
      }

      // Fetch the token to return in response
      const insertedToken = await db
        .select()
        .from(tokens)
        .where(eq(tokens.mint, mint))
        .limit(1);
      logger.log(
        `[/register-token] Fetched inserted token from database: ${!!insertedToken}`,
      );

      // Emit token creation event via WebSocket if available
      try {
        const wsClient = getWebSocketClient(c.env);
        if (wsClient) {
          logger.log(
            `[/register-token] Emitting token creation event for ${mint}`,
          );
          await processTokenUpdateEvent(c.env, insertedToken[0], true);
          logger.log(
            `[/register-token] Successfully emitted token creation event`,
          );
        }
      } catch (wsError) {
        logger.warn(
          `[/register-token] Failed to emit WebSocket event:`,
          wsError,
        );
        // Continue even if this fails
      }

      // Start monitoring the token
      try {
        logger.log(`[/register-token] Starting monitoring for token ${mint}`);
        await monitorSpecificToken(c.env, mint);
        logger.log(`[/register-token] Successfully started monitoring`);
      } catch (monitorError) {
        logger.warn(
          `[/register-token] Failed to start token monitoring:`,
          monitorError,
        );
        // Continue even if this fails
      }

      // Return success response
      logger.log(`[/register-token] Successfully registered token ${mint}`);
      return c.json({
        success: true,
        token: insertedToken[0],
        message: "Token successfully registered",
      });
    } catch (dbError) {
      logger.error(`[/register-token] Database error:`, dbError);

      // Handle unique constraint violations
      if (
        dbError instanceof Error &&
        dbError.message.includes("UNIQUE constraint failed")
      ) {
        return c.json({ error: "Token already exists in database" }, 409);
      }

      return c.json({ error: "Failed to add token to database" }, 500);
    }
  } catch (error) {
    logger.error("[/register-token] Unexpected error:", error);
    return c.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to register token",
      },
      500,
    );
  }
});

// --- POST endpoint to request a vanity keypair ---
tokenRouter.post("/vanity-keypair", async (c) => {
  console.log("keypairs");
  try {
    // Require authentication
    const user = c.get("user");
    if (!user || !user.publicKey) {
      logger.warn("[POST /vanity-keypair] Authentication required");
      return c.json({ error: "Authentication required" }, 401);
    }
    logger.log(`[POST /vanity-keypair] Authenticated user: ${user.publicKey}`);

    const db = getDB(c.env);

    // Parse request body (optional - could include specific vanity requirements or force generation flag)
    const requestOptions = {
      forceGenerate: false,
    };

    try {
      const body = await c.req.json();
      logger.log(`[POST /vanity-keypair] Request body:`, body);
      requestOptions.forceGenerate = !!body.forceGenerate;
    } catch (e) {
      // If body can't be parsed, just use default options
      logger.log(
        `[POST /vanity-keypair] No request body or invalid JSON, using defaults`,
      );
    }

    // Check actual count of available keypairs for debugging
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(vanityKeypairs)
      .where(eq(vanityKeypairs.used, 0));

    const totalCount = countResult[0]?.count || 0;
    logger.log(
      `[POST /vanity-keypair] Database reports ${totalCount} unused keypairs available`,
    );

    // Try to find an unused keypair
    const keypairs = await db
      .select()
      .from(vanityKeypairs)
      .where(eq(vanityKeypairs.used, 0))
      .limit(1);

    console.log("keypairs", keypairs);

    if (!keypairs || keypairs.length === 0) {
      // Double-check if there's a discrepancy between count and actual query
      if (totalCount > 0) {
        logger.warn(
          `[POST /vanity-keypair] Discrepancy: Count reports ${totalCount} keypairs but query found none!`,
        );

        // Try a more direct query to check for any issue
        const allKeypairs = await db
          .select({ id: vanityKeypairs.id, used: vanityKeypairs.used })
          .from(vanityKeypairs)
          .limit(5);

        console.log("allKeypairs", allKeypairs);

        logger.log(
          `[POST /vanity-keypair] Sample of up to 5 keypairs from database: ${JSON.stringify(allKeypairs)}`,
        );
      }

      // Generate a new keypair as fallback
      logger.log(
        "[POST /vanity-keypair] Falling back to generating a new keypair",
      );
      const generatedKeypair = Keypair.generate();
      const newKeypair = {
        id: generatedKeypair.publicKey.toString(),
        address: generatedKeypair.publicKey.toString(),
        secretKey: Buffer.from(generatedKeypair.secretKey).toString("base64"),
        createdAt: Math.floor(Date.now() / 1000).toString(),
        used: 1, // Mark as used immediately since we're using it now
      };

      // Insert the generated keypair
      await db.insert(vanityKeypairs).values(newKeypair);
      logger.log(`[POST /vanity-keypair] Inserted new generated keypair`);

      // Return the generated keypair
      return c.json({
        id: newKeypair.id,
        publicKey: newKeypair.address,
        secretKey: Array.from(generatedKeypair.secretKey),
        message: "Successfully generated a new keypair",
      });
    }

    const keypair = keypairs[0];

    console.log("**** *keypair is", keypair);

    if (!keypair) {
      // generate a regular keypair
      const kp = Keypair.generate();
      return c.json({
        id: crypto.randomUUID(),
        publicKey: kp.publicKey,
        secretKey: Object.values(kp.secretKey),
        message: "Successfully reserved a vanity keypair",
      });
    }

    logger.log(
      `[POST /vanity-keypair] Found unused keypair: ${keypair.address}`,
    );

    // Mark this keypair as used
    await db
      .update(vanityKeypairs)
      .set({
        used: 1,
      })
      .where(eq(vanityKeypairs.id, keypair.id));

    logger.log(
      `[POST /vanity-keypair] Marked keypair ${keypair.address} as used by ${user.publicKey}`,
    );

    // Convert secretKey from base64 to byte array for the client
    let secretKeyBytes;
    try {
      // The secretKey is stored as base64 string in the database
      const base64Key = keypair.secretKey;

      // Decode it to get a binary buffer
      const secretKeyBuffer = Buffer.from(base64Key, "base64");

      // Convert to array format expected by solana/web3.js
      secretKeyBytes = Array.from(secretKeyBuffer);

      logger.log(
        `[POST /vanity-keypair] Successfully converted secretKey to array of length ${secretKeyBytes.length}`,
      );
    } catch (keyError) {
      logger.error(
        `[POST /vanity-keypair] Error converting secretKey: ${keyError}`,
      );
      return c.json({ error: "Failed to process keypair" }, 500);
    }

    // Return the keypair details with consistent field naming (publicKey instead of address)
    return c.json({
      id: keypair.id,
      publicKey: keypair.address,
      secretKey: secretKeyBytes,
      message: "Successfully reserved a vanity keypair",
    });
  } catch (error) {
    logger.error("[POST /vanity-keypair] Error processing request:", error);
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to process vanity keypair request",
      },
      500,
    );
  }
});

// Add this endpoint after the vanity-keypair endpoint

// --- Endpoint to check vanity keypair status ---
tokenRouter.get("/vanity-keypair-status", async (c) => {
  try {
    // Require authentication
    const user = c.get("user");
    if (!user || !user.publicKey) {
      logger.warn("[/vanity-keypair-status] Authentication required");
      return c.json({ error: "Authentication required" }, 401);
    }
    logger.log(
      `[/vanity-keypair-status] Authenticated user: ${user.publicKey}`,
    );

    const db = getDB(c.env);

    // Count total keypairs
    const totalCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(vanityKeypairs);

    // Count used keypairs
    const usedCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(vanityKeypairs)
      .where(eq(vanityKeypairs.used, 1));

    // Count unused keypairs
    const unusedCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(vanityKeypairs)
      .where(eq(vanityKeypairs.used, 0));

    // Get the most recent keypair for checking timestamp
    const recentKeypairs = await db
      .select()
      .from(vanityKeypairs)
      .orderBy(desc(vanityKeypairs.createdAt))
      .limit(1);

    const mostRecentKeypair =
      recentKeypairs.length > 0 ? recentKeypairs[0] : null;

    logger.log(
      `[/vanity-keypair-status] Total keypairs: ${totalCount[0]?.count || 0}, Used: ${usedCount[0]?.count || 0}, Unused: ${unusedCount[0]?.count || 0}`,
    );

    return c.json({
      total: totalCount[0]?.count || 0,
      used: usedCount[0]?.count || 0,
      unused: unusedCount[0]?.count || 0,
      mostRecent: mostRecentKeypair
        ? {
            createdAt: mostRecentKeypair.createdAt,
            addressPreview:
              mostRecentKeypair.address.substring(0, 8) +
              "..." +
              mostRecentKeypair.address.substring(
                mostRecentKeypair.address.length - 4,
              ),
            used: mostRecentKeypair.used === 1,
          }
        : null,
      buffer: {
        min: 100, // From your MIN_VANITY_KEYPAIR_BUFFER constant
        target: 150, // From your TARGET_VANITY_KEYPAIR_BUFFER constant
      },
    });
  } catch (error) {
    logger.error(
      "[/vanity-keypair-status] Error checking keypair status:",
      error,
    );
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to check keypair status",
      },
      500,
    );
  }
});

// New endpoint to generate sample swaps
tokenRouter.post("/api/token/:mint/generate-sample-swaps", async (c) => {
  try {
    const mint = c.req.param("mint");
    const count = parseInt(c.req.query("count") || "15");

    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // Get the DB connection
    const db = getDB(c.env);

    logger.log(`Generating ${count} sample swaps for token ${mint}`);

    // Create mock swap data
    const now = new Date();
    const swapRecords: (typeof swaps.$inferInsert)[] = [];

    // Create sample swaps
    for (let i = 0; i < count; i++) {
      // Vary the time offsets to create a realistic timeline
      const timeOffset = i * (Math.random() * 600000 + 3600000); // 1-2 hours apart
      const timestamp = new Date(now.getTime() - timeOffset).toISOString();

      // Alternate between buy and sell with some randomness
      const direction = Math.random() > 0.4 ? 0 : 1; // 60% buys, 40% sells

      // Create varying amounts based on direction
      const solAmount = 1000000000 + Math.random() * 3000000000; // 1-4 SOL
      const tokenAmount = 500000000 + Math.random() * 2500000000; // 0.5-3 tokens

      swapRecords.push({
        id: crypto.randomUUID(),
        tokenMint: mint,
        priceImpact: Math.random() * 0.02, // 0-2% price impact
        user: [
          "DvmXXp4tSXYwZJhM5HjtEUvQ6SfxwkA7daE1jQgCX1ri",
          "Gq8ncxiUZBP5V8dd1XRqsyiV7aQmQVZEEYgLLJwFAXvA",
          "3LCNtKAQRYMMCcXrKY9eMR1p8zUuY6gGZnBnnwQwULkE",
          "8HQUbGPnG4XzfKMrpJG9nNq9h6JU5Q3dkKA49E1JZQke",
          "HzkWnuoMSJRNhyHYrXVPgpyWaPn795bLJNBsfgXF326x",
        ][Math.floor(Math.random() * 5)], // Random user from list
        type: direction === 0 ? "buy" : "sell",
        direction: direction,
        amountIn: direction === 0 ? solAmount : tokenAmount,
        amountOut: direction === 0 ? tokenAmount : solAmount,
        price: 0.0001 + Math.random() * 0.0005, // Small price variation
        txId: `test-tx-${i}-${crypto.randomUUID().slice(0, 8)}`,
        timestamp: timestamp,
      });
    }

    // Insert all swaps
    await db.insert(swaps).values(swapRecords);

    // Emit swap events to update clients
    try {
      const socket = getWebSocketClient(c.env);

      // Emit to token room that new swaps are available
      await socket.emit(`token-${mint}`, "newSwaps", {
        swaps: swapRecords.slice(0, 5).map((swap) => ({
          ...swap,
          directionText: swap.direction === 0 ? "buy" : "sell",
        })),
      });

      logger.log(`Emitted swap events for token ${mint}`);
    } catch (err) {
      logger.error("Failed to emit WebSocket events:", err);
    }

    return c.json({
      success: true,
      message: `Generated ${swapRecords.length} sample swaps for token ${mint}`,
      count: swapRecords.length,
    });
  } catch (error) {
    logger.error("Error generating sample swaps:", error);
    return c.json({ error: "Failed to generate sample swaps" }, 500);
  }
});

// Create a dedicated endpoint for generating sample swap data for testing
tokenRouter.post("/api/token/:mint/generate-sample-swaps", async (c) => {
  try {
    const mint = c.req.param("mint");

    // Get count from query parameter or body
    const count = parseInt(c.req.query("count") || "15");

    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // Get the DB connection
    const db = getDB(c.env);

    logger.log(`Generating ${count} sample swaps for token ${mint}`);

    // Create mock swap data
    const now = new Date();
    const swapRecords: (typeof swaps.$inferInsert)[] = [];

    // Create sample swaps
    for (let i = 0; i < count; i++) {
      // Vary the time offsets to create a realistic timeline
      const timeOffset = i * (Math.random() * 600000 + 3600000); // 1-2 hours apart
      const timestamp = new Date(now.getTime() - timeOffset).toISOString();

      // Alternate between buy and sell with some randomness
      const direction = Math.random() > 0.4 ? 0 : 1; // 60% buys, 40% sells

      // Create varying amounts based on direction
      const solAmount = 1000000000 + Math.random() * 3000000000; // 1-4 SOL in lamports
      const tokenAmount = 500000 + Math.random() * 2500000; // 0.5-3 tokens in smallest units

      swapRecords.push({
        id: crypto.randomUUID(),
        tokenMint: mint,
        priceImpact: Math.random() * 0.02, // 0-2% price impact
        user: [
          "DvmXXp4tSXYwZJhM5HjtEUvQ6SfxwkA7daE1jQgCX1ri",
          "Gq8ncxiUZBP5V8dd1XRqsyiV7aQmQVZEEYgLLJwFAXvA",
          "3LCNtKAQRYMMCcXrKY9eMR1p8zUuY6gGZnBnnwQwULkE",
          "8HQUbGPnG4XzfKMrpJG9nNq9h6JU5Q3dkKA49E1JZQke",
          "HzkWnuoMSJRNhyHYrXVPgpyWaPn795bLJNBsfgXF326x",
        ][Math.floor(Math.random() * 5)], // Random user from list
        type: direction === 0 ? "buy" : "sell",
        direction: direction,
        amountIn: direction === 0 ? solAmount : tokenAmount,
        amountOut: direction === 0 ? tokenAmount : solAmount,
        price: 0.0001 + Math.random() * 0.0005, // Small price variation
        txId: `test-tx-${i}-${crypto.randomUUID().slice(0, 8)}`,
        timestamp: timestamp,
      });
    }

    // Insert all swaps
    try {
      await db.insert(swaps).values(swapRecords);
      logger.log(
        `Inserted ${swapRecords.length} sample swaps for token ${mint}`,
      );
    } catch (err) {
      logger.error(`Error inserting sample swaps:`, err);
      return c.json({ error: "Failed to insert sample swaps" }, 500);
    }

    // Emit swap events to update clients
    try {
      const socket = getWebSocketClient(c.env);

      // Emit each swap event individually as the frontend expects
      for (const swap of swapRecords.slice(0, 5)) {
        await socket.emit(`token-${mint}`, "newSwap", {
          txId: swap.txId,
          timestamp: swap.timestamp,
          user: swap.user,
          direction: swap.direction,
          amountIn: swap.amountIn,
          amountOut: swap.amountOut,
        });
        logger.log(`Emitted newSwap event for txId ${swap.txId}`);
      }

      // Also emit to the token-specific room
      await socket.emit(`token-${mint}`, "newSwaps", {
        swaps: swapRecords.slice(0, 5).map((swap) => ({
          txId: swap.txId,
          timestamp: swap.timestamp,
          user: swap.user,
          direction: swap.direction,
          amountIn: swap.amountIn,
          amountOut: swap.amountOut,
        })),
      });

      logger.log(`Emitted swap events for token ${mint}`);
    } catch (err) {
      logger.error("Failed to emit WebSocket events:", err);
    }

    return c.json({
      success: true,
      message: `Generated ${swapRecords.length} sample swaps for token ${mint}`,
      count: swapRecords.length,
    });
  } catch (error) {
    logger.error("Error generating sample swaps:", error);
    return c.json({ error: "Failed to generate sample swaps" }, 500);
  }
});

// Add direct endpoint to get real blockchain swap data
tokenRouter.get("/api/token/:mint/real-swaps", async (c) => {
  logger.log(
    `Direct blockchain swaps endpoint called for mint: ${c.req.param("mint")}`,
  );
  try {
    const mint = c.req.param("mint");

    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // Import the blockchain utility directly
    const { fetchTokenTransactions, getConnection } = await import(
      "../../src/utils/blockchain"
    );

    logger.log(
      `Attempting to fetch real blockchain swap data for mint ${mint}`,
    );

    // Add more debugging info
    const connection = getConnection();
    logger.log(`Using RPC connection: ${connection.rpcEndpoint}`);

    // Try to fetch a larger amount of transactions
    const result = await fetchTokenTransactions(mint, 100);

    if (!result || !result.swaps || result.swaps.length === 0) {
      logger.log(`No blockchain swaps found for mint ${mint}`);

      // Get DB connection to check if we have any swaps in the database
      const db = getDB(c.env);
      const dbSwaps = await db
        .select()
        .from(swaps)
        .where(eq(swaps.tokenMint, mint))
        .orderBy(desc(swaps.timestamp))
        .limit(5);

      return c.json({
        success: false,
        mint,
        message: "No blockchain swaps found",
        blockchainSwaps: [],
        total: 0,
        dbSwapsCount: dbSwaps.length,
        dbSwapsSample: dbSwaps.length > 0 ? dbSwaps.slice(0, 2) : [],
      });
    }

    logger.log(
      `Found ${result.swaps.length} real blockchain swaps for mint ${mint}`,
    );

    // Try to save these swaps to the database
    try {
      const db = getDB(c.env);

      // Format the swaps for database insertion
      const swapRecords = result.swaps.map((swap) => ({
        id: swap.txId,
        tokenMint: mint,
        user: swap.user,
        type: swap.direction === 0 ? "buy" : "sell",
        direction: swap.direction,
        amountIn: swap.amountIn,
        amountOut: swap.amountOut,
        price: swap.amountIn / swap.amountOut, // Calculate price
        priceImpact: 0.01, // Default value
        txId: swap.txId,
        timestamp: swap.timestamp,
      }));

      // Insert each swap one by one to avoid conflicts
      let insertedCount = 0;
      for (const swap of swapRecords) {
        try {
          await db
            .insert(swaps)
            .values(swap)
            .onConflictDoNothing({ target: [swaps.txId] });
          insertedCount++;
        } catch (err) {
          logger.error(`Error inserting swap ${swap.txId}:`, err);
        }
      }

      logger.log(`Inserted ${insertedCount} new swaps into database`);

      // Emit WebSocket events for new swaps
      const wsClient = getWebSocketClient(c.env);
      await wsClient.emit(`token-${mint}`, "newSwap", result.swaps[0]);
      logger.log(`Emitted newSwap event to token room`);
    } catch (err) {
      logger.error("Error saving blockchain swaps to database:", err);
    }

    return c.json({
      success: true,
      mint,
      blockchainSwaps: result.swaps,
      total: result.swaps.length,
      sample: result.swaps.slice(0, 3),
    });
  } catch (error) {
    logger.error("Error fetching real blockchain swaps:", error);
    return c.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error fetching blockchain swaps",
      },
      500,
    );
  }
});

// Function to update the swaps cache for a token
export async function updateSwapsCache(
  env: Env,
  mint: string,
): Promise<number> {
  try {
    // Use the blockchain utility directly
    const { fetchTokenTransactions, getConnection } = await import(
      "../../src/utils/blockchain"
    );

    logger.log(`Updating swaps cache for token ${mint}`);

    // Add more debugging info
    const connection = getConnection();
    logger.log(`Using RPC connection: ${connection.rpcEndpoint}`);

    // Try to fetch a larger amount of transactions
    const result = await fetchTokenTransactions(mint, 100);

    if (!result || !result.swaps || result.swaps.length === 0) {
      logger.log(`No blockchain swaps found for mint ${mint}`);
      return 0;
    }

    logger.log(
      `Found ${result.swaps.length} real blockchain swaps for mint ${mint}`,
    );

    // Get DB connection
    const db = getDB(env);

    // Format the swaps for database insertion
    const swapRecords = result.swaps.map((swap) => ({
      id: swap.txId,
      tokenMint: mint,
      user: swap.user,
      type: swap.direction === 0 ? "buy" : "sell",
      direction: swap.direction,
      amountIn: swap.amountIn,
      amountOut: swap.amountOut,
      price: swap.amountIn / swap.amountOut, // Calculate price
      priceImpact: 0.01, // Default value
      txId: swap.txId,
      timestamp: swap.timestamp,
    }));

    // First, clear existing swaps for this mint
    try {
      await db.delete(swaps).where(eq(swaps.tokenMint, mint));
      logger.log(`Cleared existing swaps for token ${mint}`);
    } catch (err) {
      logger.error(`Error clearing existing swaps for ${mint}:`, err);
    }

    // Insert new swaps in batches to avoid overwhelming the DB
    const BATCH_SIZE = 10;
    let insertedCount = 0;

    for (let i = 0; i < swapRecords.length; i += BATCH_SIZE) {
      try {
        const batch = swapRecords.slice(i, i + BATCH_SIZE);
        // logger.log(`Inserting batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(swapRecords.length/BATCH_SIZE)} (${batch.length} swaps) for token ${mint}`);

        await db.insert(swaps).values(batch);
        insertedCount += batch.length;

        // logger.log(`Successfully inserted batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(swapRecords.length/BATCH_SIZE)} for token ${mint}`);
      } catch (err) {
        logger.error(`Error inserting batch for token ${mint}:`, err);
      }
    }

    // logger.log(`Inserted ${insertedCount} swaps for token ${mint}`);

    // Emit WebSocket events for new swaps if any were inserted
    if (insertedCount > 0) {
      try {
        const wsClient = getWebSocketClient(env);

        // Format the swaps to match what the frontend expects
        const formattedSwaps = swapRecords.slice(0, 10).map((swap) => ({
          ...swap,
          directionText: swap.direction === 0 ? "buy" : "sell",
          solAmount:
            swap.direction === 0 ? swap.amountIn / 1e9 : swap.amountOut / 1e9, // Convert lamports to SOL
          tokenAmount:
            swap.direction === 0 ? swap.amountOut / 1e6 : swap.amountIn / 1e6, // Convert to token amount
        }));

        // Emit each swap individually to match current WebSocket protocol
        for (const swap of formattedSwaps) {
          // Emit to token room
          await wsClient.emit(`token-${mint}`, "newSwap", swap);
          // Add a small delay between emissions to avoid overwhelming the WebSocket
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        // logger.log(`Emitted ${formattedSwaps.length} swap events for token ${mint}`);

        // Also update the token in db with correct swap count
        try {
          // Update token with swap count
          await db
            .update(tokens)
            .set({
              lastUpdated: new Date().toISOString(),
            })
            .where(eq(tokens.mint, mint));

          // Create token update event data
          const tokenUpdateData = {
            mint,
            swapCount: insertedCount,
            lastSwapAt: new Date().toISOString(),
          };

          // Emit token update event with the correctly formatted data
          await processTokenUpdateEvent(env, tokenUpdateData, false);
          // logger.log(`Updated token record with new swap count: ${insertedCount}`);
        } catch (dbErr) {
          logger.error(`Error updating token record for ${mint}:`, dbErr);
        }
      } catch (wsErr) {
        logger.error(`Error emitting swap events for ${mint}:`, wsErr);
      }
    }

    return insertedCount;
  } catch (error) {
    logger.error(`Error updating swaps cache for ${mint}:`, error);
    return 0;
  }
}

// Add endpoint to update swaps cache for a token (similar to holders)
tokenRouter.get("/token/:mint/update-swaps", async (c) => {
  try {
    const mint = c.req.param("mint");

    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    const swapCount = await updateSwapsCache(c.env, mint);

    return c.json({
      success: true,
      message: `Updated swaps data for token ${mint}`,
      swapCount,
    });
  } catch (error) {
    const mint = c.req.param("mint");
    logger.error(`Error updating swaps for ${mint}:`, error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Update the existing swaps endpoint to first check for real data and fetch it if needed
tokenRouter.get("/api/swaps/:mint", async (c) => {
  // logger.log(`API swaps endpoint called for mint: ${c.req.param("mint")}`);
  try {
    const mint = c.req.param("mint");

    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // Parse pagination parameters
    const limit = parseInt(c.req.query("limit") || "50");
    const page = parseInt(c.req.query("page") || "1");
    const offset = (page - 1) * limit;

    // Get the DB connection
    const db = getDB(c.env);

    // Get existing swap data from the database
    const swapsResult = await db
      .select()
      .from(swaps)
      .where(eq(swaps.tokenMint, mint))
      .orderBy(desc(swaps.timestamp))
      .offset(offset)
      .limit(limit);

    // logger.log(`Found ${swapsResult.length} swaps in database for mint ${mint}`);

    // Calculate total for pagination
    const totalSwapsQuery = await db
      .select({ count: sql`count(*)` })
      .from(swaps)
      .where(eq(swaps.tokenMint, mint));

    const totalSwaps = Number(totalSwapsQuery[0]?.count || 0);
    const totalPages = Math.ceil(totalSwaps / limit);

    // Format the swaps for the frontend with careful type handling
    const formattedSwaps = swapsResult.map((swap) => {
      // Get direction as a number (0 = buy, 1 = sell)
      const direction = typeof swap.direction === "number" ? swap.direction : 0;

      // Get amounts with proper fallbacks
      const amountIn = typeof swap.amountIn === "number" ? swap.amountIn : 0;
      const amountOut = typeof swap.amountOut === "number" ? swap.amountOut : 0;

      // For a buy (direction = 0), amountIn is SOL and amountOut is token
      // For a sell (direction = 1), amountIn is token and amountOut is SOL
      const solAmount = direction === 0 ? amountIn / 1e9 : amountOut / 1e9;
      const tokenAmount = direction === 0 ? amountOut / 1e6 : amountIn / 1e6;

      // Return a complete object with all fields needed by the frontend
      return {
        id: swap.id,
        txId: typeof swap.txId === "string" ? swap.txId : "",
        timestamp:
          typeof swap.timestamp === "string"
            ? swap.timestamp
            : new Date().toISOString(),
        user: typeof swap.user === "string" ? swap.user : "",
        direction,
        amountIn,
        amountOut,
        type: direction === 0 ? "Buy" : "Sell",
        directionText: direction === 0 ? "buy" : "sell",
        solAmount,
        tokenAmount,
        price: typeof swap.price === "number" ? swap.price : 0,
        priceImpact:
          typeof swap.priceImpact === "number" ? swap.priceImpact : 0,
      };
    });

    const response = {
      swaps: formattedSwaps,
      page,
      totalPages,
      total: totalSwaps,
    };

    return c.json(response);
  } catch (error) {
    logger.error("Error in api/swaps history route:", error);
    return c.json(
      {
        swaps: [],
        page: 1,
        totalPages: 0,
        total: 0,
        error: "Failed to fetch swap history",
      },
      500,
    );
  }
});

// First endpoint - /api/swaps/:mint
tokenRouter.get("/api/swaps/:mint", async (c) => {
  const env = c.env as Env;
  const mint = c.req.param("mint");

  if (!mint || mint.length < 32 || mint.length > 44) {
    return c.json({ error: "Invalid mint address" }, 400);
  }

  try {
    // Get pagination params
    const limit = parseInt(c.req.query("limit") || "10");
    const page = parseInt(c.req.query("page") || "1");
    const sortBy = c.req.query("sortBy") || "timestamp";
    const sortOrder = c.req.query("sortOrder") || "desc";
    const txId = c.req.query("txId");

    const offset = (page - 1) * limit;

    const db = await getDB(env);

    let swapsQuery = db
      .select()
      .from(swaps)
      .where(eq(swaps.tokenMint, mint))
      .orderBy(desc(swaps.timestamp))
      .limit(limit)
      .offset(offset) as any;

    // Apply sorting - map frontend sort values to actual DB columns
    if (sortBy === "timestamp") {
      swapsQuery = swapsQuery.orderBy(
        sortOrder === "asc" ? asc(swaps.timestamp) : desc(swaps.timestamp),
      );
    } else if (sortBy === "price") {
      swapsQuery = swapsQuery.orderBy(
        sortOrder === "asc" ? asc(swaps.price) : desc(swaps.price),
      );
    } else if (sortBy === "amountIn") {
      swapsQuery = swapsQuery.orderBy(
        sortOrder === "asc" ? asc(swaps.amountIn) : desc(swaps.amountIn),
      );
    } else if (sortBy === "amountOut") {
      swapsQuery = swapsQuery.orderBy(
        sortOrder === "asc" ? asc(swaps.amountOut) : desc(swaps.amountOut),
      );
    }

    if (txId) {
      swapsQuery = swapsQuery.where(eq(swaps.txId, txId));
    }

    const [swapsResult, totalSwaps] = await Promise.all([
      swapsQuery,
      db
        .select({ count: count() })
        .from(swaps)
        .where(eq(swaps.tokenMint, mint))
        .then((result) => result[0]?.count || 0),
    ]);

    const totalPages = Math.ceil(totalSwaps / limit);

    // Format swap data for the frontend
    const formattedSwaps = swapsResult.map((swap) => {
      // Calculate solAmount and tokenAmount based on direction
      const direction = typeof swap.direction === "number" ? swap.direction : 0;
      const amountIn = typeof swap.amountIn === "number" ? swap.amountIn : 0;
      const amountOut = typeof swap.amountOut === "number" ? swap.amountOut : 0;

      // If direction is 0 (buy), amountIn is SOL and amountOut is token
      // If direction is 1 (sell), amountIn is token and amountOut is SOL
      const solAmount = direction === 0 ? amountIn / 1e9 : amountOut / 1e9; // Convert lamports to SOL
      const tokenAmount = direction === 0 ? amountOut / 1e6 : amountIn / 1e6; // Convert to token amount

      return {
        ...swap,
        directionText: direction === 0 ? "buy" : "sell",
        type: direction === 0 ? "Buy" : "Sell", // Uppercase first letter for display
        solAmount: solAmount, // Added for frontend
        tokenAmount: tokenAmount, // Added for frontend
      };
    });

    return c.json({
      swaps: formattedSwaps,
      page,
      totalPages,
      total: totalSwaps,
    });
  } catch (error) {
    console.error("Error fetching swaps:", error);
    return c.json({ error: "Failed to fetch swaps" }, 500);
  }
});

// Second endpoint - /api/token/:mint/refresh-swaps
tokenRouter.post("/api/token/:mint/refresh-swaps", async (c) => {
  const env = c.env as Env;
  const mint = c.req.param("mint");

  if (!mint || mint.length < 32 || mint.length > 44) {
    return c.json({ error: "Invalid mint address" }, 400);
  }

  try {
    const count = await updateSwapsCache(env, mint);

    // Get fresh swaps after updating
    const db = await getDB(env);
    const freshSwapsResult = await db
      .select()
      .from(swaps)
      .where(eq(swaps.tokenMint, mint))
      .orderBy(desc(swaps.timestamp))
      .limit(10);

    // Format directions for better readability
    const convertedSwaps = freshSwapsResult.map((swap) => {
      // Calculate solAmount and tokenAmount based on direction
      const direction = typeof swap.direction === "number" ? swap.direction : 0;
      const amountIn = typeof swap.amountIn === "number" ? swap.amountIn : 0;
      const amountOut = typeof swap.amountOut === "number" ? swap.amountOut : 0;

      // If direction is 0 (buy), amountIn is SOL and amountOut is token
      // If direction is 1 (sell), amountIn is token and amountOut is SOL
      const solAmount = direction === 0 ? amountIn / 1e9 : amountOut / 1e9; // Convert lamports to SOL
      const tokenAmount = direction === 0 ? amountOut / 1e6 : amountIn / 1e6; // Convert to token amount

      return {
        ...swap,
        directionText: direction === 0 ? "buy" : "sell",
        type: direction === 0 ? "Buy" : "Sell", // Uppercase first letter for display
        solAmount: solAmount, // Added for frontend
        tokenAmount: tokenAmount, // Added for frontend
      };
    });

    return c.json({
      success: true,
      message: `Found ${count} swaps for ${mint}`,
      swaps: convertedSwaps,
    });
  } catch (error) {
    console.error("Error refreshing swaps:", error);
    return c.json({ error: "Failed to refresh swaps" }, 500);
  }
});

// Define a single endpoint for /api/swaps/:mint that works correctly with the frontend
tokenRouter.get("/api/swaps/:mint", async (c) => {
  // logger.log(`API swaps endpoint called for mint: ${c.req.param("mint")}`);
  try {
    const mint = c.req.param("mint");

    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // Parse pagination parameters
    const limit = parseInt(c.req.query("limit") || "50");
    const page = parseInt(c.req.query("page") || "1");
    const offset = (page - 1) * limit;

    // Get the DB connection
    const db = getDB(c.env);

    // If this is a dev environment and we haven't populated data yet, do it now
    const swapCount = await db
      .select({ count: sql`count(*)` })
      .from(swaps)
      .where(eq(swaps.tokenMint, mint))
      .then((result) => Number(result[0]?.count || 0));

    // In development with no swaps, create sample data
    if (swapCount === 0 && c.env.NODE_ENV === "development") {
      logger.log(
        `No swaps found for ${mint} - generating sample data in dev mode`,
      );

      // Create mock swap data
      const now = new Date();
      const swapRecords: (typeof swaps.$inferInsert)[] = [];

      // Create test swaps with varying times and directions
      for (let i = 0; i < 15; i++) {
        const timeOffset = i * (Math.random() * 600000 + 3600000); // 1-2 hours apart
        const timestamp = new Date(now.getTime() - timeOffset).toISOString();

        // Alternate between buy and sell with some randomness
        const direction = Math.random() > 0.4 ? 0 : 1; // 60% buys, 40% sells

        // Create varying amounts based on direction
        const solAmount = 1000000000 + Math.random() * 3000000000; // 1-4 SOL
        const tokenAmount = 500000000 + Math.random() * 2500000000; // 0.5-3 tokens

        swapRecords.push({
          id: crypto.randomUUID(),
          tokenMint: mint,
          priceImpact: Math.random() * 0.02, // 0-2% price impact
          user: [
            "DvmXXp4tSXYwZJhM5HjtEUvQ6SfxwkA7daE1jQgCX1ri",
            "Gq8ncxiUZBP5V8dd1XRqsyiV7aQmQVZEEYgLLJwFAXvA",
            "3LCNtKAQRYMMCcXrKY9eMR1p8zUuY6gGZnBnnwQwULkE",
            "8HQUbGPnG4XzfKMrpJG9nNq9h6JU5Q3dkKA49E1JZQke",
            "HzkWnuoMSJRNhyHYrXVPgpyWaPn795bLJNBsfgXF326x",
          ][Math.floor(Math.random() * 5)], // Random user from list
          type: direction === 0 ? "buy" : "sell",
          direction: direction,
          amountIn: direction === 0 ? solAmount : tokenAmount,
          amountOut: direction === 0 ? tokenAmount : solAmount,
          price: 0.0001 + Math.random() * 0.0005, // Small price variation
          txId: `test-tx-${i}-${crypto.randomUUID().slice(0, 8)}`,
          timestamp: timestamp,
        });
      }

      try {
        await db.insert(swaps).values(swapRecords);
        // logger.log(`Added ${swapRecords.length} test swaps for ${mint}`);
      } catch (error) {
        logger.error(`Error adding test swaps for ${mint}:`, error);
      }
    } else if (swapCount === 0) {
      // Try to update from blockchain
      await updateSwapsCache(c.env, mint);
    }

    // Get swap data from the database (now should include any new data)
    const swapsResult = await db
      .select()
      .from(swaps)
      .where(eq(swaps.tokenMint, mint))
      .orderBy(desc(swaps.timestamp))
      .offset(offset)
      .limit(limit);

    // logger.log(`Found ${swapsResult.length} swaps in database for mint ${mint}`);

    // Calculate total for pagination
    const totalSwapsQuery = await db
      .select({ count: sql`count(*)` })
      .from(swaps)
      .where(eq(swaps.tokenMint, mint));

    const totalSwaps = Number(totalSwapsQuery[0]?.count || 0);
    const totalPages = Math.ceil(totalSwaps / limit);

    // Format the swaps to exactly match TransactionSchema expectations
    const formattedSwaps = swapsResult.map((swap) => {
      return {
        txId: typeof swap.txId === "string" ? swap.txId : "",
        timestamp:
          typeof swap.timestamp === "string"
            ? swap.timestamp
            : new Date().toISOString(),
        user: typeof swap.user === "string" ? swap.user : "",
        direction: typeof swap.direction === "number" ? swap.direction : 0,
        amountIn: typeof swap.amountIn === "number" ? swap.amountIn : 0,
        amountOut: typeof swap.amountOut === "number" ? swap.amountOut : 0,
      };
    });

    return c.json({
      swaps: formattedSwaps,
      page,
      totalPages,
      total: totalSwaps,
    });
  } catch (error) {
    logger.error("Error in api/swaps history route:", error);
    return c.json(
      {
        swaps: [],
        page: 1,
        totalPages: 0,
        total: 0,
        error: "Failed to fetch swap history",
      },
      500,
    );
  }
});

// Endpoint to generate sample swap data for testing
tokenRouter.post("/api/token/:mint/sample-swaps", async (c) => {
  try {
    const mint = c.req.param("mint");

    // Get count from query parameter or body
    const count = parseInt(c.req.query("count") || "15");

    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // Get the DB connection
    const db = getDB(c.env);

    logger.log(`Generating ${count} sample swaps for token ${mint}`);

    // Create mock swap data
    const now = new Date();
    const swapRecords: (typeof swaps.$inferInsert)[] = [];

    // Create sample swaps
    for (let i = 0; i < count; i++) {
      // Vary the time offsets to create a realistic timeline
      const timeOffset = i * (Math.random() * 600000 + 3600000); // 1-2 hours apart
      const timestamp = new Date(now.getTime() - timeOffset).toISOString();

      // Alternate between buy and sell with some randomness
      const direction = Math.random() > 0.4 ? 0 : 1; // 60% buys, 40% sells

      // Create varying amounts based on direction
      const solAmount = 1000000000 + Math.random() * 3000000000; // 1-4 SOL in lamports
      const tokenAmount = 500000 + Math.random() * 2500000; // 0.5-3 tokens in smallest units

      swapRecords.push({
        id: crypto.randomUUID(),
        tokenMint: mint,
        priceImpact: Math.random() * 0.02, // 0-2% price impact
        user: [
          "DvmXXp4tSXYwZJhM5HjtEUvQ6SfxwkA7daE1jQgCX1ri",
          "Gq8ncxiUZBP5V8dd1XRqsyiV7aQmQVZEEYgLLJwFAXvA",
          "3LCNtKAQRYMMCcXrKY9eMR1p8zUuY6gGZnBnnwQwULkE",
          "8HQUbGPnG4XzfKMrpJG9nNq9h6JU5Q3dkKA49E1JZQke",
          "HzkWnuoMSJRNhyHYrXVPgpyWaPn795bLJNBsfgXF326x",
        ][Math.floor(Math.random() * 5)], // Random user from list
        type: direction === 0 ? "buy" : "sell",
        direction: direction,
        amountIn: direction === 0 ? solAmount : tokenAmount,
        amountOut: direction === 0 ? tokenAmount : solAmount,
        price: 0.0001 + Math.random() * 0.0005, // Small price variation
        txId: `test-tx-${i}-${crypto.randomUUID().slice(0, 8)}`,
        timestamp: timestamp,
      });
    }

    // Insert all swaps
    try {
      await db.insert(swaps).values(swapRecords);
      logger.log(
        `Inserted ${swapRecords.length} sample swaps for token ${mint}`,
      );
    } catch (err) {
      logger.error(`Error inserting sample swaps:`, err);
      return c.json({ error: "Failed to insert sample swaps" }, 500);
    }

    // Emit swap events to update clients
    try {
      const socket = getWebSocketClient(c.env);

      // Format the swaps to match what the frontend expects
      const formattedSwaps = swapRecords.slice(0, 5).map((swap) => {
        // Calculate formatted values
        const solAmount =
          swap.direction === 0 ? swap.amountIn / 1e9 : swap.amountOut / 1e9;
        const tokenAmount =
          swap.direction === 0 ? swap.amountOut / 1e6 : swap.amountIn / 1e6;

        return {
          txId: swap.txId,
          timestamp: swap.timestamp,
          user: swap.user,
          direction: swap.direction,
          type: swap.direction === 0 ? "Buy" : "Sell",
          amountIn: swap.amountIn,
          amountOut: swap.amountOut,
          solAmount,
          tokenAmount,
        };
      });

      // Emit each swap event individually as the frontend expects
      for (const swap of formattedSwaps) {
        await socket.emit(`token-${mint}`, "newSwap", swap);
        logger.log(`Emitted newSwap event for txId ${swap.txId}`);
      }

      logger.log(`Emitted swap events for token ${mint}`);
    } catch (err) {
      logger.error("Failed to emit WebSocket events:", err);
    }

    return c.json({
      success: true,
      message: `Generated ${swapRecords.length} sample swaps for token ${mint}`,
      count: swapRecords.length,
    });
  } catch (error) {
    logger.error("Error generating sample swaps:", error);
    return c.json({ error: "Failed to generate sample swaps" }, 500);
  }
});
