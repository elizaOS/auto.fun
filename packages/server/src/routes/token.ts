import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3"; // S3 Import
import { AccountInfo, Connection, PublicKey } from "@solana/web3.js";
import { and, count, eq, getTableColumns, or, sql, SQL } from "drizzle-orm";
import { PgSelect } from "drizzle-orm/pg-core";
import { Context, Hono } from "hono";
import { Buffer } from "node:buffer"; // Buffer import
import { getDB, Token, tokens, users } from "../db";
import { ExternalToken } from "../externalToken";
import { generateAdditionalTokenImages } from "../generation";
import { getSOLPrice } from "../mcap";
import { generateOgImage } from "../ogImageGenerator"; // <<< Trying path relative to src
import { getGlobalRedisCache, RedisCache, RedisCacheService } from "../redis";
import { getS3Client } from "../s3Client"; // Import shared S3 client function
import {
  processTokenUpdateEvent,
  updateHoldersCache,
} from "../tokenSupplyHelpers";
import { uploadWithS3 } from "../uploader"; // Import the S3 uploader
import {
  applyFeaturedSort,
  calculateFeaturedScore,
  getDevnetRpcUrl,
  getFeaturedMaxValues,
  getMainnetRpcUrl,
  logger,
} from "../util";
import { getWebSocketClient } from "../websocket-client";
import { uploadToStorage } from "./files";

import { inArray } from "drizzle-orm";

import { Codex } from "@codex-data/sdk";
import {
  HoldersSortAttribute,
  RankingDirection,
} from "@codex-data/sdk/dist/resources/graphql";

import { parseTokensQuery } from "./validators/tokenQuery";
import { parseHoldersQuery } from "./validators/tokenHoldersQuery";
import { parseSolanaAddress, parsePaginationQuery } from "./validators/global";
import {
  parseUpdateTokenRequest,
  UpdateTokenBody,
} from "./validators/tokenUpdateQuery";
import { parseSearchTokenRequest } from "./validators/tokenSearchQuery";

if (!process.env.CODEX_API_KEY) {
  logger.error("Missing CODEX_API_KEY from .env");
  process.exit(1);
}

const codex = new Codex(process.env.CODEX_API_KEY);

// --- Validation Function ---
async function validateQueryResults(
  params: { hideImported?: number; status?: string },
  results: Token[] | null | undefined,
  sqlStrings?: { mainQuerySql?: string } // Optional parameter for SQL string
): Promise<void> {
  const { hideImported, status } = params;
  const mainSql = sqlStrings?.mainQuerySql || "N/A";

  if (!results || results.length === 0) {
    /* ... */ return;
  }
  logger.log(`[Validation] Validating ${results.length} results...`);

  if (hideImported === 1) {
    const importedTokensFound = results.filter((token) => token.imported === 1);
    if (importedTokensFound.length > 0) {
      const mints = importedTokensFound.map((t) => t.mint).join(", ");
      const errorMsg = `Integrity check failed: Filter hideImported=1 active, but found imported=1. Mints: ${mints}. SQL: ${mainSql}`;
      logger.error(`[CRITICAL] ${errorMsg}`);
      throw new Error(errorMsg);
    } else {
      logger.log(`[Validation] Passed: hideImported=1 check.`);
    }
  }
  if (status === "active") {
    const nonActiveTokensFound = results.filter(
      (token) => token.status !== "active"
    );
    if (nonActiveTokensFound.length > 0) {
      const details = nonActiveTokensFound
        .map((t) => `${t.mint}(${t.status})`)
        .join(", ");
      const errorMsg = `Integrity check failed: Filter status='active' active, but found others. Mints/Statuses: ${details}. SQL: ${mainSql}`;
      logger.error(`[CRITICAL] ${errorMsg}`);
      throw new Error(errorMsg);
    } else {
      logger.log(`[Validation] Passed: status='active' check.`);
    }
  }
  if (status === "locked") {
    const nonLockedTokensFound = results.filter(
      (token) => token.status !== "locked"
    );
    if (nonLockedTokensFound.length > 0) {
      const details = nonLockedTokensFound
        .map((t) => `${t.mint}(${t.status})`)
        .join(", ");
      const errorMsg = `Integrity check failed: Filter status='locked' active, but found others. Mints/Statuses: ${details}. SQL: ${mainSql}`;
      logger.error(`[CRITICAL] ${errorMsg}`);
      throw new Error(errorMsg);
    } else {
      logger.log(`[Validation] Passed: status='locked' check.`);
    }
  }
  logger.log(`[Validation] All checks passed.`);
}

// --- Build Base Query (Filters) ---
// Adjust DB type if needed
function buildTokensBaseQuery(
  db: any,
  params: {
    hideImported?: number;
    status?: string;
    creator?: string;
    search?: string;
    sortBy?: string;
    maxVolume?: number;
    maxHolders?: number;
  }
): PgSelect {
  const {
    hideImported,
    status,
    creator,
    search,
    sortBy,
    maxVolume,
    maxHolders,
  } = params;
  // Select specific columns needed eventually (adjust as needed)
  // Selecting all initially, will be refined before sorting
  let query = db
    .select({
      id: tokens.id,
      mint: tokens.mint,
      name: tokens.name,
      tokenPriceUSD: tokens.tokenPriceUSD,
      priceChange24h: tokens.priceChange24h,
      volume24h: tokens.volume24h,
      marketCapUSD: tokens.marketCapUSD,
      currentPrice: tokens.currentPrice,
      lastPriceUpdate: tokens.lastPriceUpdate,
      status: tokens.status,
      holderCount: tokens.holderCount,
      tokenSupplyUiAmount: tokens.tokenSupplyUiAmount,
      image: tokens.image,
      createdAt: tokens.createdAt,
      curveProgress: tokens.curveProgress,
      curveLimit: tokens.curveLimit,
      imported: tokens.imported,
      hidden: tokens.hidden,
      featured: tokens.featured,
      hide_from_featured: tokens.hide_from_featured,
      ticker: tokens.ticker,
      verified: tokens.verified,
    })
    .from(tokens)
    .$dynamic();

  const conditions: (SQL | undefined)[] = [];
  const partnerLaunches = process.env.PARTNER_LAUNCHES?.split(",") || [];
  const partnerCreators = process.env.PARTNER_CREATORS?.split(",") || [];

  if (hideImported === 1) {
    conditions.push(sql`${tokens.imported} = 0`);
    logger.log(`[Query Build] Adding condition: imported = 0`);
  }
  let specificStatusApplied = false;
  if (status === "active") {
    conditions.push(sql`${tokens.status} = 'active'`);
    conditions.push(sql`${tokens.curveProgress} >= ${0}`);
    conditions.push(sql`${tokens.tokenSupplyUiAmount} = ${1000000000}`);
    logger.log(`[Query Build] Adding condition: status = 'active'`);

    specificStatusApplied = true;
  } else if (status === "locked") {
    conditions.push(sql`${tokens.status} = 'locked'`);
    logger.log(`[Query Build] Adding condition: status = 'locked'`);
    specificStatusApplied = true;
  }
  if (!specificStatusApplied) {
    conditions.push(sql`${tokens.status} != 'pending'`);
    logger.log(`[Query Build] Adding condition: status != 'pending'`);
  }
  conditions.push(sql`(${tokens.hidden} != 1 OR ${tokens.hidden} IS NULL)`);
  logger.log(`[Query Build] Adding condition: hidden != 1 OR hidden IS NULL`);
  if (creator) {
    conditions.push(eq(tokens.creator, creator));
    logger.log(`[Query Build] Adding condition: creator = ${creator}`);
  }
  if (search) {
    conditions.push(
      or(
        sql`${tokens.name} ILIKE ${"%" + search + "%"}`, // Use standard SQL LIKE
        sql`${tokens.ticker} ILIKE ${"%" + search + "%"}`, // Use standard SQL LIKE
        sql`${tokens.mint} ILIKE ${"%" + search + "%"}` // Use standard SQL LIKE
      )
    );
    logger.log(`[Query Build] Adding condition: search LIKE ${search}`);
  }

  if (partnerLaunches.length > 0 && partnerCreators.length > 0) {
    conditions.push(
      sql`(
        lower(${tokens.ticker}) NOT IN (
          ${sql.join(
            partnerLaunches.map((t) => sql`${t.toLowerCase()}`),
            sql`, `
          )}
        )
        OR
        lower(${tokens.creator}) IN (
          ${sql.join(
            partnerCreators.map((c) => sql`${c.toLowerCase()}`),
            sql`, `
          )}
        )
      )`
    );
    logger.log(
      `[Query Build] Adding condition: restrict partner launch tickers to partnerCreators (case-insensitive)`
    );
  }

  conditions.push(sql`${tokens.ticker} NOT LIKE ${sql`${"%✅"}`}`);

  if (conditions.length > 0) {
    query = query.where(and(...conditions.filter((c): c is SQL => !!c)));
  }
  return query;
}

// --- Build Count Query (Filters Only) ---
// Adjust DB type if needed
function buildTokensCountBaseQuery(
  db: any,
  params: {
    hideImported?: number;
    status?: string;
    creator?: string;
    search?: string;
  }
): PgSelect {
  let query = db.select({ count: count() }).from(tokens).$dynamic();
  const { hideImported, status, creator, search } = params;
  const conditions: (SQL | undefined)[] = [];

  if (hideImported === 1) {
    conditions.push(sql`${tokens.imported} = 0`);
  }
  let specificStatusApplied = false;
  if (status === "active") {
    conditions.push(sql`${tokens.status} = 'active'`);
    specificStatusApplied = true;
  } else if (status === "locked") {
    conditions.push(sql`${tokens.status} = 'locked'`);
    specificStatusApplied = true;
  }
  if (!specificStatusApplied) {
    conditions.push(sql`${tokens.status} != 'pending'`);
  }
  conditions.push(sql`(${tokens.hidden} != 1 OR ${tokens.hidden} IS NULL)`);
  if (creator) {
    conditions.push(eq(tokens.creator, creator));
  }
  if (search) {
    conditions.push(
      or(
        sql`${tokens.name} ILIKE ${"%" + search + "%"}`, // Use standard SQL LIKE
        sql`${tokens.ticker} ILIKE ${"%" + search + "%"}`, // Use standard SQL LIKE
        sql`${tokens.mint} ILIKE ${"%" + search + "%"}` // Use standard SQL LIKE
      )
    );
    logger.log(`[Count Build] Adding condition: search LIKE ${search}`);
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions.filter((c): c is SQL => !!c)));
  }
  return query;
}

// Define the router (Env removed from Bindings)
const tokenRouter = new Hono<{ Bindings: {} }>();

// --- OG Image Endpoint ---
tokenRouter.get("/og-image/:mint{.*png?}", async (c) => {
  // Match .png optionally
  const mint = c.req.param("mint").replace(/\.png$/, ""); // Remove .png suffix
  // Get query params
  const queryParams = c.req.query();
  const forceRefresh = queryParams.refresh === "true";

  logger.log(
    `[GET /og-image/:mint] Request for mint: ${mint}, Refresh: ${forceRefresh}`
  );

  if (!mint || mint.length < 32 || mint.length > 44) {
    return c.text("Invalid mint address", 400);
  }

  const redisCache = await getGlobalRedisCache();
  const s3Key = `og-images/${mint}.png`;
  const redisUrlKey = `og:image:url:${mint}`;
  const cacheTTL = 14400; // 4 hours in seconds

  try {
    // 1. Check Redis for cached S3 URL (Skip if forceRefresh is true)
    if (!forceRefresh && redisCache) {
      const cachedUrl = await redisCache.get(redisUrlKey);
      if (cachedUrl) {
        logger.log(
          `[OG Image] Cache hit for ${mint}, redirecting to ${cachedUrl}`
        );
        // Use 302 Found for temporary redirect
        return c.redirect(cachedUrl, 302);
      }
      logger.log(`[OG Image] URL cache miss for ${mint}`);
    } else if (forceRefresh) {
      logger.log(
        `[OG Image] Refresh requested, skipping cache check for ${mint}`
      );
    }

    // 2. Cache Miss or Refresh Requested -> Generate Image
    logger.log(`[OG Image] Generating image for ${mint}...`);
    let imageBuffer: Buffer;
    try {
      imageBuffer = await generateOgImage(mint);
    } catch (genError: any) {
      logger.error(
        `[OG Image] Failed to generate image for ${mint}:`,
        genError
      );
      // Redirect to a default OG image if generation fails
      // Consider hosting a static default image
      const defaultOgImage = `/default-og-image.png`;
      logger.warn(
        `[OG Image] Redirecting to default OG image: ${defaultOgImage}`
      );
      // You might want to return a 404 or 500 instead, depending on desired behavior
      return c.redirect(defaultOgImage, 302);
      // Alternative: return c.text('Failed to generate image', 500);
    }

    // 3. Upload generated image to S3/R2
    logger.log(`[OG Image] Uploading generated image to S3 key: ${s3Key}`);
    const { publicBaseUrl } = await getS3Client(); // Get base URL for construction
    let publicUrl = "";
    try {
      // Use the updated uploadWithS3 function with cache control
      publicUrl = await uploadWithS3(imageBuffer, {
        filename: `${mint}.png`, // Filename part for uploader
        contentType: "image/png",
        basePath: "og-images", // Specify the correct base path
        cacheControl: `public, max-age=${cacheTTL}`, // 4-hour cache
      });

      logger.log(`[OG Image] Upload successful, public URL: ${publicUrl}`);
    } catch (uploadError) {
      logger.error(
        `[OG Image] Failed to upload image ${s3Key} to S3:`,
        uploadError
      );
      // Handle upload error (e.g., return 500 or default image)
      const defaultOgImage = `/default-og-image.png`;
      return c.redirect(defaultOgImage, 302);
      // Alternative: return c.text('Failed to store generated image', 500);
    }

    // 4. Update Redis Cache with the *new* public URL
    if (redisCache && publicUrl) {
      await redisCache.set(redisUrlKey, publicUrl, cacheTTL);
      logger.log(`[OG Image] Updated Redis URL cache for ${mint}`);
    }

    // 5. Redirect to the newly uploaded image
    logger.log(`[OG Image] Redirecting to newly generated image: ${publicUrl}`);
    return c.redirect(publicUrl, 302);
  } catch (error) {
    logger.error(`[OG Image] Unexpected error for mint ${mint}:`, error);
    // General error fallback
    const defaultOgImage = `/default-og-image.png`;
    return c.redirect(defaultOgImage, 302);
    // Alternative: return c.text('Internal Server Error', 500);
  }
});

// --- Endpoint to serve images from storage (S3 API) ---
tokenRouter.get("/image/:filename", async (c) => {
  const filename = c.req.param("filename");
  logger.log(`[/image/:filename] Request received for filename: ${filename}`);
  try {
    if (!filename) {
      logger.warn("[/image/:filename] Filename parameter is missing");
      return c.json({ error: "Filename parameter is required" }, 400);
    }

    // Use the shared S3 client getter
    const { client: s3Client, bucketName } = await getS3Client();

    // Determine potential object key (might be generation or token image)
    const generationMatch = filename.match(
      /^generation-([A-Za-z0-9]{32,44})-([1-9][0-9]*)\.jpg$/
    );

    let imageKey;
    if (generationMatch) {
      const [_, mint, number] = generationMatch;
      imageKey = `generations/${mint}/gen-${number}.jpg`;
    } else {
      imageKey = `token-images/${filename}`;
    }

    try {
      logger.log(
        `[/image/:filename] Attempting to get object from S3 key: ${imageKey}`
      );
      const getCmd = new GetObjectCommand({
        Bucket: bucketName,
        Key: imageKey,
      });
      const objectResponse = await s3Client.send(getCmd);

      logger.log(
        `[/image/:filename] Found object in S3: Size=${objectResponse.ContentLength}, Type=${objectResponse.ContentType}`
      );

      let contentType = objectResponse.ContentType || "image/jpeg";
      if (filename.endsWith(".png")) contentType = "image/png";
      else if (filename.endsWith(".gif")) contentType = "image/gif";
      else if (filename.endsWith(".svg")) contentType = "image/svg+xml";
      else if (filename.endsWith(".webp")) contentType = "image/webp";

      const data = await objectResponse.Body?.transformToByteArray();
      if (!data) {
        logger.error(
          `[/image/:filename] Image body stream is empty for ${imageKey}`
        );
        return c.json({ error: "Failed to read image content" }, 500);
      }
      const dataBuffer = Buffer.from(data);

      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Max-Age": "86400",
      };

      logger.log(
        `[/image/:filename] Serving ${filename} with type ${contentType}`
      );
      return new Response(dataBuffer, {
        headers: {
          "Content-Type": contentType,
          "Content-Length": objectResponse.ContentLength?.toString() ?? "0",
          "Cache-Control": "public, max-age=31536000",
          ...corsHeaders,
        },
      });
    } catch (error: any) {
      if (error.name === "NoSuchKey") {
        logger.warn(
          `[/image/:filename] Image not found in S3 for key: ${imageKey}`
        );
        // DEBUG: List files in the directory
        try {
          const prefix = imageKey.substring(0, imageKey.lastIndexOf("/") + 1);
          const listCmd = new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: prefix,
            MaxKeys: 10,
          });
          const listResponse = await s3Client.send(listCmd);
          const keys =
            listResponse.Contents?.map((o: any) => o.Key ?? "unknown-key") ??
            [];
          logger.log(
            `[/image/:filename] Files in ${prefix} directory: ${keys.join(", ")}`
          );
        } catch (listError) {
          logger.error(
            `[/image/:filename] Error listing files in directory: ${listError}`
          );
        }
        return c.json({ error: "Image not found" }, 404);
      } else {
        logger.error(
          `[/image/:filename] Error fetching image ${imageKey} from S3:`,
          error
        );
        throw error;
      }
    }
  } catch (error) {
    logger.error(`[/image/:filename] Error serving image ${filename}:`, error);
    return c.json({ error: "Failed to serve image" }, 500);
  }
});

// --- Endpoint to serve metadata JSON from storage (S3 API) ---
tokenRouter.get("/metadata/:filename", async (c) => {
  const filename = c.req.param("filename");
  const isTemp = c.req.query("temp") === "true";

  logger.log(
    `[/metadata/:filename] Request received for filename: ${filename}, temp=${isTemp}`
  );

  try {
    if (!filename || !filename.endsWith(".json")) {
      logger.error("[/metadata/:filename] Invalid filename format:", filename);
      return c.json({ error: "Filename parameter must end with .json" }, 400);
    }

    // Use the shared S3 client getter
    const { client: s3Client, bucketName } = await getS3Client();

    const primaryKey = isTemp
      ? `token-metadata-temp/${filename}`
      : `token-metadata/${filename}`;
    const fallbackKey = isTemp
      ? `token-metadata/${filename}`
      : `token-metadata-temp/${filename}`;
    let objectResponse;
    let objectKey = primaryKey;

    try {
      logger.log(
        `[/metadata/:filename] Checking primary location: ${primaryKey}`
      );
      const getPrimaryCmd = new GetObjectCommand({
        Bucket: bucketName,
        Key: primaryKey,
      });
      objectResponse = await s3Client.send(getPrimaryCmd);
    } catch (error: any) {
      if (error.name === "NoSuchKey") {
        logger.log(
          `[/metadata/:filename] Not found in primary location, checking fallback: ${fallbackKey}`
        );
        objectKey = fallbackKey;
        try {
          const getFallbackCmd = new GetObjectCommand({
            Bucket: bucketName,
            Key: fallbackKey,
          });
          objectResponse = await s3Client.send(getFallbackCmd);
        } catch (fallbackError: any) {
          if (fallbackError.name === "NoSuchKey") {
            logger.error(
              `[/metadata/:filename] Metadata not found in either location for ${filename}`
            );
            return c.json({ error: "Metadata not found" }, 404);
          } else {
            logger.error(
              `[/metadata/:filename] Error fetching fallback metadata ${fallbackKey}:`,
              fallbackError
            );
            throw fallbackError;
          }
        }
      } else {
        logger.error(
          `[/metadata/:filename] Error fetching primary metadata ${primaryKey}:`,
          error
        );
        throw error;
      }
    }

    const contentType = objectResponse.ContentType || "application/json";
    const data = await objectResponse.Body?.transformToString();
    if (data === undefined) {
      logger.error(
        `[/metadata/:filename] Metadata body stream is empty for ${objectKey}`
      );
      return c.json({ error: "Failed to read metadata content" }, 500);
    }

    logger.log(
      `[/metadata/:filename] Found metadata: Key=${objectKey}, Size=${objectResponse.ContentLength}, Type=${contentType}`
    );

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": contentType,
      "Cache-Control": isTemp ? "max-age=3600" : "max-age=86400",
    };

    logger.log(`[/metadata/:filename] Serving metadata: ${filename}`);
    return new Response(data, { headers: corsHeaders });
  } catch (error) {
    logger.error(
      `[/metadata/:filename] Error serving metadata ${filename}:`,
      error
    );
    return c.json({ error: "Failed to serve metadata JSON" }, 500);
  }
});

export async function processSwapEvent(
  swap: any,
  shouldEmitGlobal: boolean = true
): Promise<void> {
  try {
    // Get WebSocket client
    const wsClient = getWebSocketClient();

    // Get DB connection to fetch token data and calculate featuredScore
    const db = getDB();

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
        maxHolders
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
    // Check for process is not ideal in Cloudflare Workers, use env var instead
    const debugWs = process.env.DEBUG_WEBSOCKET === "true";
    if (debugWs) {
      logger.log(`Emitted swap event for token ${swap.tokenMint}`);
    }

    // Optionally emit to global room for activity feed
    if (shouldEmitGlobal) {
      await wsClient.emit(`token-${swap.tokenMint}`, "newSwap", enrichedSwap);

      if (debugWs) {
        logger.log("Emitted swap event to global feed");
      }
    }

    return;
  } catch (error) {
    logger.error("Error processing swap event:", error);
    throw error;
  }
}

// Helper function to process token info after finding it on a network
async function processTokenInfo(
  mintPublicKey: PublicKey,
  tokenInfo: AccountInfo<Buffer>,
  connection: Connection,
  requestor: string
) {
  // Check program ID to verify this is an SPL token
  const TOKEN_PROGRAM_ID = new PublicKey(
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
  );
  const TOKEN_2022_PROGRAM_ID = new PublicKey(
    "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
  );

  const isSplToken = tokenInfo.owner.equals(TOKEN_PROGRAM_ID);
  const isSPL2022 = tokenInfo.owner.equals(TOKEN_2022_PROGRAM_ID);

  if (!isSplToken && !isSPL2022) {
    throw new Error(
      "Not a valid SPL token. Owner: " + tokenInfo.owner.toString()
    );
  }

  logger.log(`[search-token] Token owner: ${tokenInfo.owner.toString()}`);
  logger.log(`[search-token] Token is SPL-2022: ${isSPL2022}`);

  // Get mint info - decimals and authorities
  const mintInfo = await connection.getParsedAccountInfo(mintPublicKey);
  logger.log(
    `[search-token] Mint info: ${JSON.stringify(mintInfo.value?.data)}`
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
      (ext: any) => ext.extension === "tokenMetadata"
    );

    if (metadataExt && metadataExt.state) {
      logger.log(
        `[search-token] Found tokenMetadata extension: ${JSON.stringify(metadataExt.state)}`
      );

      // Extract metadata directly from the extension
      tokenName = metadataExt.state.name || "";
      tokenSymbol = metadataExt.state.symbol || "";
      uri = metadataExt.state.uri || "";
      updateAuthority = metadataExt.state.updateAuthority || null;

      logger.log(
        `[search-token] SPL-2022 metadata - Name: ${tokenName}, Symbol: ${tokenSymbol}`
      );
      logger.log(`[search-token] SPL-2022 metadata - URI: ${uri}`);
      logger.log(
        `[search-token] SPL-2022 metadata - Update Authority: ${updateAuthority}`
      );

      foundMetadata = true;

      // Now fetch additional metadata from the URI if available
      if (uri) {
        logger.log(`[search-token] Fetching metadata from URI: ${uri}`);
        // Use fetch with timeout/error handling
        try {
          const uriResponse = await fetch(uri); // Add timeout here if needed

          if (uriResponse.ok) {
            const uriText = await uriResponse.text();
            logger.log(`[search-token] URI response: ${uriText}`);

            try {
              const uriData = JSON.parse(uriText);
              logger.log(
                `[search-token] Parsed URI data: ${JSON.stringify(uriData)}`
              );

              // Extract image and description if available
              if (uriData.image) {
                imageUrl = uriData.image;
                logger.log(
                  `[search-token] Found image URL in URI: ${imageUrl}`
                );
              }

              if (uriData.description) {
                description = uriData.description;
                logger.log(
                  `[search-token] Found description in URI: ${description}`
                );
              }
            } catch (parseError) {
              logger.error(
                `[search-token] Error parsing URI JSON: ${parseError}`
              );
            }
          } else {
            logger.error(
              `[search-token] Failed to fetch URI: ${uriResponse.status} ${uriResponse.statusText}`
            );
          }
        } catch (fetchError) {
          logger.error(`[search-token] Error fetching URI: ${fetchError}`);
        }
      }
    } else {
      logger.log(
        `[search-token] No tokenMetadata extension found in SPL-2022 token`
      );
    }
  }

  // Only try to get Metaplex metadata if we didn't find it in SPL-2022 extensions
  if (!foundMetadata) {
    // Get metadata PDA
    const METADATA_PROGRAM_ID = new PublicKey(
      "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
    );
    const [metadataAddress] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        METADATA_PROGRAM_ID.toBuffer(),
        mintPublicKey.toBuffer(),
      ],
      METADATA_PROGRAM_ID
    );

    logger.log(
      `[search-token] Metadata address: ${metadataAddress.toString()}`
    );

    // Get metadata account data - direct read from chain with no fallbacks
    const metadataAccount = await connection.getAccountInfo(metadataAddress);
    if (!metadataAccount || metadataAccount.data.length === 0) {
      // For SPL-2022 tokens, we already checked extensions so this is just a warning
      // For regular SPL tokens, this is an error
      if (isSPL2022) {
        logger.warn(
          `[search-token] No Metaplex metadata found for SPL-2022 token: ${mintPublicKey.toString()}`
        );
      } else {
        logger.error(
          `[search-token] No metadata found for token: ${mintPublicKey.toString()}`
        );
        throw new Error(
          `No metadata found for token: ${mintPublicKey.toString()}`
        );
      }
    } else {
      // We found Metaplex metadata
      logger.log(
        `[search-token] Metadata account found, data length: ${metadataAccount.data.length} bytes`
      );
      logger.log(
        `[search-token] Raw metadata (hex): ${Buffer.from(metadataAccount.data).toString("hex")}`
      );

      // Direct metadata extraction
      updateAuthority = new PublicKey(
        metadataAccount.data.slice(1, 33)
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
        `[search-token] Token name: ${tokenName} (${nameLength} bytes)`
      );
      offset += nameLength;

      // Extract symbol - needs to account for padding between fields
      offset += 3; // Skip padding bytes before length
      const symbolLength = metadataAccount.data[offset];
      offset += 1;
      const symbolData = metadataAccount.data.slice(
        offset,
        offset + symbolLength
      );
      tokenSymbol = symbolData.toString("utf8").replace(/\0/g, "").trim();
      logger.log(
        `[search-token] Token symbol: ${tokenSymbol} (${symbolLength} bytes)`
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
        try {
          const uriResponse = await fetch(uri); // Add timeout here if needed

          if (uriResponse.ok) {
            const uriText = await uriResponse.text();
            logger.log(`[search-token] URI response: ${uriText}`);

            try {
              const uriData = JSON.parse(uriText);
              logger.log(
                `[search-token] Parsed URI data: ${JSON.stringify(uriData)}`
              );

              // Extract image and description if available
              if (uriData.image) {
                imageUrl = uriData.image;
                logger.log(
                  `[search-token] Found image URL in URI: ${imageUrl}`
                );
              }

              if (uriData.description) {
                description = uriData.description;
                logger.log(
                  `[search-token] Found description in URI: ${description}`
                );
              }
            } catch (parseError) {
              logger.error(
                `[search-token] Error parsing URI JSON: ${parseError}`
              );
            }
          } else {
            logger.error(
              `[search-token] Failed to fetch URI: ${uriResponse.status} ${uriResponse.statusText}`
            );
          }
        } catch (fetchError) {
          logger.error(`[search-token] Error fetching URI: ${fetchError}`);
        }
      }
    }
  }

  // If we still didn't find metadata from either source, throw error
  if (!foundMetadata && !isSPL2022) {
    throw new Error(`No metadata found for token: ${mintPublicKey.toString()}`);
  }

  // For SPL-2022 tokens, we still consider them valid even without metadata
  // since they might not use the tokenMetadata extension

  // Check if we're in development mode
  const isLocalDev = process.env.LOCAL_DEV === "true";

  // Determine if requestor is the creator/authority
  // In development mode, always allow any token to be imported
  const isCreator = isLocalDev
    ? true
    : updateAuthority === requestor || mintAuthority === requestor;

  logger.log(`[search-token] Is local development mode? ${isLocalDev}`);
  logger.log(`[search-token] LOCAL_DEV value: ${process.env.LOCAL_DEV}`);
  logger.log(`[search-token] Is requestor the creator? ${isCreator}`);
  logger.log(`[search-token] Request wallet: ${requestor}`);
  logger.log(`[search-token] Update authority: ${updateAuthority}`);
  logger.log(`[search-token] Mint authority: ${mintAuthority}`);

  // Debug log for final creator check result
  if (isLocalDev) {
    logger.log(
      `[search-token] Bypassing creator check in development mode. Anyone can import this token.`
    );
  } else if (isCreator) {
    logger.log(
      `[search-token] Creator check passed - requestor is the token creator.`
    );
  } else {
    logger.log(
      `[search-token] Creator check failed - requestor is not the token creator.`
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
    tokenType: isSPL2022 ? "spl-2022" : "spl-token", // Existing field
    isToken2022: isSPL2022, // Add the boolean flag directly
    decimals: decimals,
    needsWalletSwitch: !isCreator,
  };

  logger.log(`[search-token] Final token data: ${JSON.stringify(tokenData)}`);

  return tokenData;
}

// Helper to check token balance directly on blockchain
async function checkBlockchainTokenBalance(
  c: any, // Use 'any' type for context or define a specific type
  mint: string,
  address: string,
  checkMultipleNetworks = false
): Promise<Response> {
  // Return type should be Response for Hono
  // Initialize return data
  let balance = 0;
  let foundNetwork = ""; // Renamed to avoid confusion with loop variable
  // Get explicit mainnet and devnet URLs
  const mainnetUrl = getMainnetRpcUrl();
  const devnetUrl = getDevnetRpcUrl();

  // Log detailed connection info and environment settings
  logger.log(`IMPORTANT DEBUG INFO FOR TOKEN BALANCE CHECK:`);
  logger.log(`Address: ${address}`);
  logger.log(`Mint: ${mint}`);
  logger.log(`CheckMultipleNetworks: ${checkMultipleNetworks}`);
  logger.log(`LOCAL_DEV setting: ${process.env.LOCAL_DEV}`);
  logger.log(`ENV.NETWORK setting: ${process.env.NETWORK || "not set"}`);
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
          name: process.env.NETWORK || "devnet",
          url: process.env.NETWORK === "mainnet" ? mainnetUrl : devnetUrl,
        },
      ];

  logger.log(
    `Will check these networks: ${networksToCheck.map((n) => `${n.name} (${n.url})`).join(", ")}`
  );

  // Try each network until we find a balance
  for (const network of networksToCheck) {
    try {
      logger.log(
        `Checking ${network.name} (${network.url}) for token balance...`
      );
      const connection = new Connection(network.url, "confirmed");

      // Convert string addresses to PublicKey objects
      const mintPublicKey = new PublicKey(mint);
      const userPublicKey = new PublicKey(address);

      logger.log(
        `Getting token accounts for ${address} for mint ${mint} on ${network.name}`
      );

      // Fetch token accounts with a simple RPC call
      const response = await connection.getTokenAccountsByOwner(
        userPublicKey,
        { mint: mintPublicKey },
        { commitment: "confirmed" }
      );

      // Log the number of accounts found
      logger.log(
        `Found ${response.value.length} token accounts on ${network.name}`
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
                `Account ${pubkey.toString()} has ${tokenAmount} tokens`
              );
            }
          } catch (balanceError) {
            logger.error(
              `Error getting token account balance: ${balanceError}`
            );
            // Continue with other accounts
          }
        }

        // If we found tokens on this network, use this balance
        if (networkBalance > 0) {
          balance = networkBalance;
          foundNetwork = network.name;
          logger.log(
            `SUCCESS: Found balance of ${balance} tokens on ${foundNetwork}`
          );
          break; // Stop checking other networks once we find a balance
        } else {
          logger.log(
            `No balance found on ${network.name} despite finding accounts`
          );
        }
      } else {
        logger.log(`No token accounts found on ${network.name}`);
      }
    } catch (netError) {
      logger.error(
        `Error checking ${network.name} for token balance: ${netError}`
      );
    }
  }

  logger.log(
    `Final result: Balance=${balance}, Network=${foundNetwork || "none"}`
  );
  return c.json({
    balance,
    percentage: 0, // We don't know the percentage when checking directly
    isCreator: false, // We don't know if creator when checking directly
    mint,
    address,
    network: foundNetwork || process.env.NETWORK || "unknown",
    onChain: true,
  });
}

tokenRouter.get("/tokens", async (c) => {
  const queryParams = c.req.query();
  parseTokensQuery(c.req.query());
  const isSearching = !!queryParams.search;
  const MAX_LIMIT = 50;

  const requestedLimit =
    parseInt(queryParams?.limit ? queryParams.limit : ("0" as string)) || 50;

  const limit = isSearching ? 5 : Math.min(requestedLimit, MAX_LIMIT);

  const requestedPage =
    parseInt(queryParams?.page ? queryParams.page : ("1" as string)) || 1;

  const MAX_PAGE = 1000;

  const page = Math.min(requestedPage, MAX_PAGE);

  const skip = (page - 1) * limit;
  const status = queryParams.status as string | undefined;

  const hideImportedParam = queryParams.hideImported;
  const hideImported =
    hideImportedParam === "1" ? 1 : hideImportedParam === "0" ? 0 : undefined;
  const creator = queryParams.creator as string | undefined;

  const search = queryParams.search as string | undefined;
  const sortBy = search
    ? "marketCapUSD"
    : (queryParams.sortBy as string) || "createdAt";
  const sortOrder = (queryParams.sortOrder as string) || "desc";

  const cacheKey = `tokens:${limit}:${page}:${search || ""}:${status || ""}:${hideImported === 1 ? "1" : hideImported === 0 ? "0" : "u"}:${creator || ""}:${sortBy}:${sortOrder}`;

  const redisCache = await getGlobalRedisCache();

  if (redisCache) {
    const cachedData = await redisCache.getCompressed(cacheKey);
    if (cachedData) {
      const parsedData = JSON.parse(cachedData as string) as Token[];
      return c.json(parsedData);
    } else {
      logger.log(`Cache miss for ${cacheKey}`);
    }
  }

  const db = getDB();

  const { maxVolume, maxHolders } = await getFeaturedMaxValues(db);

  const filterParams = {
    hideImported,
    status,
    creator,
    search,
    sortBy,
    maxVolume,
    maxHolders,
  };
  let baseQuery = buildTokensBaseQuery(db, filterParams);
  const countQuery = buildTokensCountBaseQuery(db, filterParams);

  const validSortColumns = {
    createdAt: tokens.createdAt,
    marketCapUSD: tokens.marketCapUSD,
    volume24h: tokens.volume24h,
    holderCount: tokens.holderCount,
    curveProgress: tokens.curveProgress,
  };

  if (sortBy === "featured") {
    baseQuery = applyFeaturedSort(baseQuery, maxVolume, maxHolders, sortOrder);
  } else {
    const sortColumn =
      validSortColumns[sortBy as keyof typeof validSortColumns] ||
      tokens.createdAt;
    if (sortOrder.toLowerCase() === "desc") {
      baseQuery = baseQuery.orderBy(
        sql`CASE 
                  WHEN ${sortColumn} IS NULL OR ${sortColumn}::text = 'NaN' THEN 1 
                  ELSE 0 
                END`,
        sql`${sortColumn} DESC`
      );
    } else {
      baseQuery = baseQuery.orderBy(sortColumn);
    }
  }

  baseQuery = baseQuery.limit(limit).offset(skip);

  let mainQuerySqlString = "N/A";
  try {
    mainQuerySqlString = baseQuery.toSQL().sql;
  } catch (sqlError) {
    logger.error("[SQL Build] Error getting SQL string:", sqlError);
  }

  let tokensResult: Token[] | undefined;
  let total = 0;

  try {
    // @ts-ignore - Drizzle's execute() type might not be perfectly inferred
    tokensResult = await baseQuery.execute(); // Remove race for simplicity/debugging
    const countResult = await countQuery.execute(); // Remove race
    total = Number(countResult[0]?.count || 0);
    await validateQueryResults({ hideImported, status }, tokensResult, {
      mainQuerySql: mainQuerySqlString,
    });
  } catch (error) {
    logger.error("Token query failed, timed out, or failed validation:", error);
    tokensResult = []; // Ensure it's an empty array on error
    total = 0;
  }

  const totalPages = Math.ceil(total / limit);

  const serializableTokensResult =
    tokensResult?.map((token) => {
      const serializableToken: Record<string, any> = {};
      if (token) {
        for (const [key, value] of Object.entries(token)) {
          if (typeof value === "bigint") {
            serializableToken[key] = (value as any).toString();
          } else {
            serializableToken[key] = value;
          }
        }
      }
      return serializableToken as Token;
    }) || [];

  if (sortBy === "featured" && page === 1) {
    // Define the two token addresses to prioritize
    const priorityTokenAddresses: string[] = [
      "8btUuvx2Bu4zTd8g1tN5wCKMULyPgqiPaDiJbFbWkFUN",
      "CdZuiJEgdwQVZBWZrd6MvYwZshsT5HvB6tJYAjzuUTAP",
      "HN8GGgzBFvuePPL3DGPg7uuq2dVgLApnNcW4pxY9a11o",
      "8R3W3H8gkkiGvSLM7X6ECy6UmBVt5daKFSCJzxiWCdog",
    ];

    const modifiedResults = await prioritizeFeaturedTokens(
      serializableTokensResult,
      priorityTokenAddresses,
      limit
    );

    serializableTokensResult.splice(
      0,
      serializableTokensResult.length,
      ...modifiedResults
    );
  }

  const responseData = {
    tokens: serializableTokensResult,
    page,
    totalPages,
    total,
    hasMore: page < totalPages,
  };

  if (redisCache) {
    try {
      await redisCache.setCompressed(
        cacheKey,
        JSON.stringify(responseData),
        15
      );
      logger.log(`Cached data for ${cacheKey} with 15s TTL`);
    } catch (cacheError) {
      logger.error(`Redis cache SET error:`, cacheError);
    }
  }

  return c.json(responseData);
});

tokenRouter.get("/token/:mint/holders", async (c) => {
  try {
    const params = parseHoldersQuery(c.req.param("mint"), c.req.query());
    const mint = params.mint;

    const redisCache = await getGlobalRedisCache();
    const cacheKey = `holdersCompressed:${mint}`;

    const cache = await redisCache.getCompressed(cacheKey);
    if (cache) {
      return c.json(cache);
    }

    const holders = await codex.queries.holders({
      input: {
        tokenId: `${mint}:1399811149`,
        sort: {
          attribute: HoldersSortAttribute.Balance,
          direction: RankingDirection.Desc,
        },
      },
    });

    const items = holders?.holders?.items?.splice(0, 50);

    /** Set cache for 20 seconds */
    await redisCache.setCompressed(cacheKey, items, 20);

    return c.json({ holders: items });
  } catch (error) {
    logger.error(`Error in token holders route: ${error}`);
    return c.json(
      {
        holders: [],
        page: 1,
        totalPages: 0,
        total: 0,
        error: "Database error",
      },
      400
    );
  }
});

tokenRouter.get("/token/:mint", async (c) => {
  try {
    const mint = parseSolanaAddress(c.req.param("mint"), "mint address");

    const cacheKey = `token:${mint}`;
    const redisCache = await getGlobalRedisCache();

    if (redisCache) {
      const cachedData = await redisCache.getCompressed(cacheKey);
      if (cachedData) {
        return c.json(cachedData);
      }
    }

    // Get token data and potentially creator profile
    const db = getDB();
    const [tokenResult, solPrice] = await Promise.all([
      db
        .select({
          // Select all fields from tokens table
          ...getTableColumns(tokens),
          // Select specific fields from users table, aliased
          creatorProfile: {
            address: users.address,
            displayName: users.display_name,
            profilePictureUrl: users.profile_picture_url,
          },
        })
        .from(tokens)
        .leftJoin(users, eq(tokens.creator, users.address)) // LEFT JOIN users on creator address
        .where(eq(tokens.mint, mint))
        .limit(1),
      getSOLPrice(), // Fetch SOL price concurrently
    ]);

    if (
      !tokenResult ||
      tokenResult.length === 0
      // || tokenResult?.[0]?.hidden === 1
    ) {
      // Don't cache 404s for the main token endpoint
      return c.json({ error: "Token not found", mint }, 404);
    }

    // Process the result - tokenResult[0] contains token fields and a creatorProfile object (which is null if no matching user was found)
    const token = tokenResult[0];

    // Set default values for critical fields if they're missing
    const TOKEN_DECIMALS = token.tokenDecimals || 6;
    const defaultReserveAmount = 1000000000000; // 1 trillion (default token supply)
    const defaultReserveLamport = Number(
      process.env.VIRTUAL_RESERVES || 28000000000
    ); // 2.8 SOL (default reserve / 28 in mainnet)

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
    // Ensure token.currentPrice is treated as SOL price per WHOLE token unit
    const tokenPriceInSol = token.currentPrice || 0; // Price is already per whole token
    token.tokenPriceUSD = tokenPriceInSol * solPrice;

    token.solPriceUSD = solPrice;

    // Get virtualReserves and curveLimit from env or set defaults
    const virtualReserves = process.env.VIRTUAL_RESERVES
      ? Number(process.env.VIRTUAL_RESERVES)
      : 28000000000;
    const curveLimit = process.env.CURVE_LIMIT
      ? Number(process.env.CURVE_LIMIT)
      : 113000000000;

    // Update virtualReserves and curveLimit
    token.virtualReserves = token.virtualReserves || virtualReserves;
    token.curveLimit = token.curveLimit || curveLimit;

    // Calculate or update curveProgress using the original formula
    token.curveProgress =
      token.status === "migrated" || token.status === "locked"
        ? 100
        : ((token.reserveLamport - token.virtualReserves) /
            (token.curveLimit - token.virtualReserves)) *
          100;

    const responseData = token;

    await redisCache.setCompressed(cacheKey, responseData, 15);

    logger.log(`Cached data for ${cacheKey} with 15s TTL`);

    return c.json(responseData);
  } catch (error) {
    logger.error(`Error getting token: ${error}`);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

tokenRouter.post("/create-token", async (c) => {
  try {
    // Require authentication
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const body = await c.req.json();
    console.log("****** body ******\n", body);
    const {
      tokenMint,
      mint,
      txId,
      twitter,
      telegram,
      farcaster,
      website,
      discord,
      imported,
    } = body;
    const mintAddress = tokenMint || mint;
    if (!mintAddress) {
      return c.json({ error: "Token mint address is required" }, 400);
    }

    logger.log(`Creating token record for: ${mintAddress}`);

    const db = getDB();

    const suspended = await db
      .select({ suspended: users.suspended })
      .from(users)
      .where(eq(users.address, user.publicKey))
      .limit(1);

    const isSuspended = suspended?.[0]?.suspended === 1;
    if (isSuspended) {
      return c.json(
        {
          error: "This account is suspended.",
        },
        403
      );
    }

    // Check if token already exists
    const existingToken = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mintAddress))
      .limit(1);

    if (existingToken && existingToken.length > 0) {
      return c.json(
        {
          error: "Token already exists",
          token: existingToken[0],
        },
        409
      );
    }

    let mintPublicKey;
    try {
      mintPublicKey = new PublicKey(mintAddress);
    } catch (e) {
      logger.error(`Invalid mint address format: ${mintAddress}`, e);
      return c.json({ error: "Invalid mint address format" }, 400);
    }
    const connection = new Connection(getMainnetRpcUrl(), "confirmed");
    const tokenInfo = await connection.getAccountInfo(mintPublicKey);
    if (tokenInfo) {
      logger.log(`[search-token] Found token on mainnet`);
      const tokenStats = await processTokenInfo(
        mintPublicKey,
        tokenInfo,
        connection,
        user.publicKey
      );

      console.log("****** tokenStats ******\n", tokenStats);

      if (!tokenStats) {
        return c.json({ error: "Failed to process token info" }, 500);
      }

      // Handle image upload if base64 data is provided
      let imageUrl = "";
      if (
        tokenStats &&
        tokenStats.image &&
        tokenStats.image.startsWith("http")
      ) {
        try {
          logger.log(`Fetching image from URL: ${tokenStats.image}`);

          const imageResponse = await fetch(tokenStats.image);
          if (!imageResponse.ok) {
            throw new Error(
              `Failed to fetch image data: ${imageResponse.status} ${imageResponse.statusText}`
            );
          }

          const contentType = imageResponse.headers.get("content-type");
          if (!contentType || !contentType.startsWith("image/")) {
            // If no content type or not an image, skip processing
            logger.warn(
              `Skipping image processing due to invalid content type: ${contentType} for URL: ${tokenStats.image}`
            );
            imageUrl = "";
          } else {
            const imageArrayBuffer = await imageResponse.arrayBuffer();
            const imageBuffer = Buffer.from(imageArrayBuffer);

            const ext = contentType.split("/")[1]?.split("+")[0] || "png";
            const filename = `${mintAddress}-${Date.now()}.${ext}`;
            logger.log(
              `Prepared image for upload: ${filename}, Type: ${contentType}, Size: ${imageBuffer.length} bytes`
            );

            imageUrl = await uploadWithS3(imageBuffer, {
              filename,
              contentType,
              basePath: "token-images",
            });
            logger.log(`Image uploaded successfully to: ${imageUrl}`);
          }
        } catch (error) {
          logger.error(
            `Error processing image from URL ${tokenStats.image}:`,
            error
          );
          imageUrl = "";
        }
      } else if (
        tokenStats &&
        tokenStats.image &&
        tokenStats.image.startsWith("data:image")
      ) {
        // already data URI
        try {
          logger.log(
            `Processing existing data URI (first 100 chars): ${tokenStats.image.substring(0, 100)}...`
          );
          const imageMatch = tokenStats.image.match(
            /^data:(image\/[a-z+]+);base64,(.*)$/
          );
          if (!imageMatch) {
            throw new Error("Invalid image data URI format provided");
          }
          const contentType = imageMatch[1];
          const base64Data = imageMatch[2];
          const imageBuffer = Buffer.from(base64Data, "base64");

          const ext = contentType.split("/")[1]?.split("+")[0] || "png";
          const filename = `${mintAddress}-${Date.now()}.${ext}`;

          imageUrl = await uploadWithS3(imageBuffer, {
            filename,
            contentType,
            basePath: "token-images",
          });
          logger.log(
            `Image from data URI uploaded successfully to: ${imageUrl}`
          );
        } catch (error) {
          logger.error(`Error processing image from data URI:`, error);
          imageUrl = "";
        }
      }

      // Create token data with all required fields from the token schema
      const now = new Date();
      console.log("****** imported ******\n", imported);
      const tokenId = crypto.randomUUID();

      // Convert imported and isToken2022 flags to numbers (0 or 1)
      const importedValue = imported === true ? 1 : 0;
      const isToken2022Value = tokenStats?.isToken2022 === true ? 1 : 0; // <<< Convert flag

      // Insert with all required fields from the schema
      await db.insert(tokens).values([
        {
          id: mintAddress,
          mint: mintAddress,
          name: tokenStats?.name || `Token ${mintAddress.slice(0, 8)}`,
          ticker: tokenStats?.symbol || "TOKEN",
          url: tokenStats?.metadataUri || "",
          image: imageUrl || "", // Use the URL from the uploader
          description: tokenStats?.description || "",
          twitter: twitter || "",
          telegram: telegram || "",
          farcaster: farcaster || "",
          website: website || "",
          discord: discord || "",
          creator: tokenStats?.creator
            ? tokenStats.creator
            : user.publicKey || "unknown",
          status: imported ? "locked" : "active",
          tokenPriceUSD: 0.00000001,
          createdAt: now,
          lastUpdated: now,
          txId: txId || "create-" + tokenId,
          imported: importedValue,
          is_token_2022: isToken2022Value, // <<< Save the flag
          // Initialize other numeric fields explicitly to avoid DB defaults issues
          currentPrice: 0,
          liquidity: 0,
          marketCapUSD: 0,
          priceChange24h: 0,
          volume24h: 0,
          holderCount: 0,
          tokenDecimals: 9, // Default or fetch dynamically if possible
          reserveAmount: 0,
          reserveLamport: 0,
          virtualReserves: 0,
          curveLimit: 0,
          curveProgress: 0,
          solPriceUSD: 0,
          hidden: 0,
          hide_from_featured: 0, // <<< Explicitly set default
        },
      ]);

      // For response, include just what we need
      const tokenData = {
        id: tokenId,
        mint: mintAddress,
        name: tokenStats?.name || `Token ${mintAddress.slice(0, 8)}`,
        ticker: tokenStats?.symbol || "TOKEN",
        description: tokenStats?.description || "",
        twitter: twitter || "",
        telegram: telegram || "",
        farcaster: farcaster || "",
        website: website || "",
        discord: discord || "",
        creator: user.publicKey || "unknown",
        status: imported ? "locked" : "active",
        url: tokenStats?.metadataUri || "",
        image: imageUrl || "",
        createdAt: now,
        imported: importedValue,
        isToken2022: isToken2022Value, // <<< Include in response if needed
      };

      // Trigger immediate updates for price and holders in the background
      // for both imported and newly created tokens
      logger.log(
        `Triggering immediate price and holder update for token: ${mintAddress}`
      );

      if (imported) {
        try {
          const redisCache = await getGlobalRedisCache();
          const importedToken = await ExternalToken.create(
            mintAddress,
            redisCache
          );
          const { marketData } = await importedToken.registerWebhook();
          // Fetch historical data in the background
          (async () => await importedToken.fetchHistoricalSwapData())();
          // Merge any immediately available market data
          if (marketData && marketData.newTokenData) {
            Object.assign(tokenData, marketData.newTokenData);
          }
        } catch (webhookError) {
          logger.error(
            `Failed to register webhook for imported token ${mintAddress}:`,
            webhookError
          );
          // Continue even if webhook registration fails, especially locally
        }
      }

      // For non-imported tokens, generate additional images in the background
      if (!imported) {
        logger.log(
          `Triggering background image generation for new token: ${mintAddress}`
        );
        // Use a simple async call if waitUntil is not available
        (async () =>
          await generateAdditionalTokenImages(
            mintAddress,
            tokenStats?.description || ""
          ))();
      }

      return c.json({ success: true, token: tokenData });
    } else {
      logger.error(`[search-token] Token ${mint} not found on mainnet`);
      return c.json({ error: "Token not found on mainnet" }, 404);
    }
  } catch (error) {
    logger.error("Error in create-token endpoint:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown internal server error";
    return c.json({ error: "Could not get token metadata" }, 400);
  }
});

tokenRouter.get("/token/:mint/refresh-holders", async (c) => {
  try {
    const mint = parseSolanaAddress(c.req.param("mint"), "mint address");

    // Require authentication
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const db = getDB();
    const tokenData = await db
      .select({ imported: tokens.imported })
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);
    const imported = tokenData.length > 0 ? tokenData[0].imported === 1 : false;

    (async () => await updateHoldersCache(mint, imported))();

    return c.json({
      success: true,
      message: `Holder update process initiated for token ${mint}`,
      // holderCount, // Removed as update runs async
    });
  } catch (error) {
    logger.error("Error initiating holders data refresh:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

tokenRouter.post("/token/:mint/update", async (c) => {
  let mint: string;
  let body: UpdateTokenBody;
  let userId: string;
  const db = getDB();

  try {
    ({ mint, body, userId } = parseUpdateTokenRequest({
      mint: c.req.param("mint"),
      body: await c.req.json(),
      user: c.get("user"),
    }));
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }

  const tokenDataResult = await db
    .select({
      creator: tokens.creator,
      url: tokens.url,
      imported: tokens.imported,
    })
    .from(tokens)
    .where(eq(tokens.mint, mint))
    .limit(1);

  if (!tokenDataResult || tokenDataResult.length === 0) {
    return c.json({ error: "Token not found" }, 404);
  }
  const currentTokenData = tokenDataResult[0];

  // Permission check
  if (userId !== currentTokenData.creator) {
    return c.json({ error: "Unauthorized" }, 403);
  }

  // Define allowed fields for update and prepare updateData
  const allowedUpdateFields = [
    "website",
    "twitter",
    "telegram",
    "discord",
    "farcaster",
  ];
  const updateData: Partial<Token> = {};
  for (const field of allowedUpdateFields) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      // @ts-ignore
      updateData[field] = body[field] ?? currentTokenData[field];
    }
  }

  const dbUpdateNeeded = Object.keys(updateData).length > 0;
  if (dbUpdateNeeded) {
    updateData.lastUpdated = new Date();
  } else {
    logger.log("[Token Update] No relevant fields provided for DB update.");
  }

  // Update DB if needed
  if (dbUpdateNeeded) {
    await db.update(tokens).set(updateData).where(eq(tokens.mint, mint));
    logger.log("[Token Update] Token DB record updated successfully.");
  }

  // Update metadata in storage (S3 API) only if it's NOT an imported token
  // AND if there were actually relevant social fields updated (check updateData)
  if (
    currentTokenData?.imported === 0 &&
    Object.keys(updateData).some((key) => allowedUpdateFields.includes(key))
  ) {
    try {
      const originalUrl = currentTokenData.url;
      if (originalUrl) {
        let objectKey = "";
        // Get S3 details - client needed later, base URL for parsing
        const {
          client: s3Client,
          bucketName,
          publicBaseUrl,
        } = await getS3Client();

        try {
          const url = new URL(originalUrl);

          // Check if URL starts with the expected public base URL (R2 or MinIO path style)
          if (originalUrl.startsWith(publicBaseUrl + "/")) {
            objectKey = url.pathname.substring(publicBaseUrl.length + 1); // +1 for the slash
          }
          // Fallback: try to infer based on common patterns if base URL doesn't match
          else {
            const parts = url.pathname.split("/").filter((p) => p);
            if (parts.length >= 2) {
              objectKey = parts.slice(-2).join("/");
            } else if (parts.length === 1) {
              objectKey = parts[0];
            }
            if (!objectKey) {
              throw new Error(
                "Could not parse object key from metadata URL structure"
              );
            }
            logger.warn(
              `[Metadata Update] Could not parse object key using current base URL (${publicBaseUrl}), using inferred key: ${objectKey} from URL: ${originalUrl}`
            );
          }
        } catch (urlParseError) {
          logger.error(
            `[Metadata Update] Failed to parse original metadata URL: ${originalUrl}`,
            urlParseError
          );
          throw new Error("Could not parse metadata URL to get object key.");
        }

        if (!objectKey) {
          throw new Error("Failed to extract object key from metadata URL.");
        }

        logger.log(`[Metadata Update] Determined object key: ${objectKey}`);

        let existingMetadata: any = null;

        // Fetch existing metadata content
        try {
          logger.log(
            `[Metadata Update] Fetching existing metadata from Bucket: ${bucketName}, Key: ${objectKey}`
          );
          const getCmd = new GetObjectCommand({
            Bucket: bucketName,
            Key: objectKey,
          });
          const response = await s3Client.send(getCmd);
          const jsonString = await response.Body?.transformToString();
          if (!jsonString) throw new Error("Empty metadata content retrieved.");
          existingMetadata = JSON.parse(jsonString);
          logger.log(
            `[Metadata Update] Successfully fetched existing metadata.`
          );
        } catch (fetchErr: any) {
          logger.warn(
            `[Metadata Update] Failed to fetch or parse existing metadata from S3 (${objectKey}): ${fetchErr.name || fetchErr.message}. Skipping S3 update.`
          );
          existingMetadata = null; // Ensure it's null so update doesn't proceed
        }

        // Only proceed with S3 update if fetch was successful
        if (existingMetadata) {
          existingMetadata.properties = existingMetadata.properties || {};
          let metadataChanged = false;
          // Update properties only if they were changed in updateData
          if (updateData.website !== undefined) {
            existingMetadata.properties.website = updateData.website;
            metadataChanged = true;
          }
          if (updateData.twitter !== undefined) {
            existingMetadata.properties.twitter = updateData.twitter;
            metadataChanged = true;
          }
          if (updateData.telegram !== undefined) {
            existingMetadata.properties.telegram = updateData.telegram;
            metadataChanged = true;
          }
          if (updateData.discord !== undefined) {
            existingMetadata.properties.discord = updateData.discord;
            metadataChanged = true;
          }
          if (updateData.farcaster !== undefined) {
            existingMetadata.properties.farcaster = updateData.farcaster;
            metadataChanged = true;
          }

          if (metadataChanged) {
            const buf = Buffer.from(
              JSON.stringify(existingMetadata, null, 2),
              "utf8"
            ); // Pretty print
            logger.log(
              `[Metadata Update] Attempting to overwrite S3 object. Bucket: ${bucketName}, Key: ${objectKey}`
            );
            const putCmd = new PutObjectCommand({
              Bucket: bucketName,
              Key: objectKey,
              Body: buf,
              ContentType: "application/json",
            });
            await s3Client.send(putCmd);
            logger.log(
              `[Metadata Update] Overwrote S3 object at key ${objectKey}; URL remains ${originalUrl}`
            );
          } else {
            logger.log(
              `[Metadata Update] No relevant social fields changed. Skipping S3 PutObject.`
            );
          }
        }
      } else {
        logger.warn(
          `[Metadata Update] Token ${mint} has no metadata URL, cannot update S3 metadata.`
        );
      }
    } catch (e) {
      logger.error(
        "[Metadata Update] Error during S3 metadata update process:",
        e
      );
    }
  }

  // Fetch updated token data to return
  const updatedTokenResult = await db
    .select() // Select all columns after update
    .from(tokens)
    .where(eq(tokens.mint, mint))
    .limit(1);

  if (updatedTokenResult.length > 0) {
    // Emit WebSocket event
    try {
      await processTokenUpdateEvent({
        ...(updatedTokenResult[0] as any), // Cast to any if needed for BigInts etc.
        event: "tokenUpdated",
        timestamp: new Date().toISOString(),
      });
      logger.log(`Emitted token update event for ${mint}`);
    } catch (wsError) {
      logger.error(`WebSocket error when emitting token update: ${wsError}`);
    }
    return c.json({
      success: true,
      message: "Token information updated successfully",
      token: updatedTokenResult[0],
    });
  } else {
    logger.error(
      `Failed to fetch updated token data for ${mint} after update.`
    );
    return c.json(
      {
        success: false,
        message: "Token updated in DB, but failed to fetch result.",
      },
      500
    );
  }
});

tokenRouter.get("/token/:mint/check-balance", async (c) => {
  try {
    const mint = parseSolanaAddress(c.req.param("mint"), "mint address");

    // Get wallet address from query parameter
    const address = parseSolanaAddress(
      c.req.query("address"),
      "wallet address"
    );
    if (!address) {
      return c.json({ error: "Invalid wallet address" }, 400);
    }

    const checkOnChain = c.req.query("onchain") === "true";

    logger.log(
      `Checking token balance for ${address} on ${mint}, onChain: ${checkOnChain}`
    );

    // --- BEGIN REDIS CACHE CHECK (only if not forcing on-chain check) ---
    const cacheKey = `balanceCheck:${mint}:${address}`;
    const redisCache = await getGlobalRedisCache();

    if (!checkOnChain && redisCache) {
      try {
        const cachedData = await redisCache.get(cacheKey);
        if (cachedData) {
          logger.log(`[Cache Hit] ${cacheKey}`);
          const parsedData = JSON.parse(cachedData);
          // Basic validation
          if (parsedData && typeof parsedData.balance !== "undefined") {
            return c.json(parsedData);
          } else {
            logger.warn(`Invalid cache data for ${cacheKey}, fetching fresh.`);
          }
        } else {
          logger.log(`[Cache Miss] ${cacheKey}`);
        }
      } catch (cacheError) {
        logger.error(`Redis cache GET error for balance check:`, cacheError);
      }
    }
    // --- END REDIS CACHE CHECK ---

    const db = getDB();

    // Get token for decimals and creator information first
    const tokenQuery = await db
      .select({
        creator: tokens.creator,
        decimals: tokens.tokenDecimals,
        imported: tokens.imported,
      }) // Select only needed fields
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    const tokenInfo = tokenQuery[0];

    // If token doesn't exist in our database, and we are forcing on-chain check
    if (!tokenInfo && checkOnChain) {
      logger.log(
        `Token ${mint} not found in database, but forcing on-chain check.`
      );
      // Pass c context to the helper function
      return await checkBlockchainTokenBalance(c, mint, address, false); // Check only configured network if token isn't known
    }

    // If token doesn't exist in our database and not forcing on-chain
    if (!tokenInfo) {
      // Don't cache 404s here
      return c.json({ error: "Token not found in DB" }, 404);
    }

    // Check if user is the token creator
    const isCreator = tokenInfo.creator === address;
    const decimals = tokenInfo.decimals || 6; // Use fetched decimals or default

    // If forcing on-chain check, skip DB holder lookup
    if (checkOnChain) {
      logger.log(`Forcing on-chain balance check for ${address} on ${mint}`);
      // Pass c context to the helper function
      return await checkBlockchainTokenBalance(c, mint, address, false); // Check only configured network
    }

    let specificHolderData: any | null = null;
    let lastUpdated: Date | null = null;
    const holdersListKey = `holders:${mint}`;
    try {
      const holdersString = await redisCache.get(holdersListKey);
      if (holdersString) {
        const allHolders: any[] = JSON.parse(holdersString);
        specificHolderData = allHolders.find((h) => h.address === address);
        // Extract lastUpdated if available (assuming it's stored)
        lastUpdated = specificHolderData?.lastUpdated
          ? new Date(specificHolderData.lastUpdated)
          : null;
      }
    } catch (redisError) {
      logger.error(
        `CheckBalance: Failed to get holders from Redis for ${mint}:`,
        redisError
      );
      // Continue, will likely result in 0 balance if not creator
    }
    // ---> END CHANGE

    let responseData;

    // if (holderQuery.length > 0) {
    if (specificHolderData) {
      // User is in the token holders list from Redis
      // const holder = holderQuery[0];
      const balance = specificHolderData.amount; // Keep as precise number

      responseData = {
        balance,
        percentage: specificHolderData.percentage,
        isCreator,
        mint,
        address,
        lastUpdated: lastUpdated, // Use timestamp from Redis data
        network: process.env.NETWORK || "unknown",
        onChain: false, // Indicate data is from cache
      };
    } else if (isCreator) {
      logger.log(
        `Creator ${address} not found in Redis holders for ${mint}, checking on-chain.`
      );
      // User is the creator but not in holders table, might have balance on-chain
      // Pass c context to the helper function
      return await checkBlockchainTokenBalance(c, mint, address, false); // Check on-chain
    } else {
      // User is not in holders table and is not the creator
      responseData = {
        balance: 0,
        percentage: 0,
        isCreator: false,
        mint,
        address,
        network: process.env.NETWORK || "unknown",
        onChain: false,
      };
    }

    // --- BEGIN REDIS CACHE SET (only if not forced on-chain) ---
    if (!checkOnChain && redisCache) {
      try {
        // Cache for a moderate duration (e.g., 60 seconds) as balances don't change instantly
        await redisCache.set(cacheKey, JSON.stringify(responseData), 60);
        logger.log(`Cached balance check for ${cacheKey} with 60s TTL`);
      } catch (cacheError) {
        logger.error(`Redis cache SET error for balance check:`, cacheError);
      }
    }
    // --- END REDIS CACHE SET ---

    return c.json(responseData);
  } catch (error) {
    logger.error(`Error checking token balance: ${error}`);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

tokenRouter.post("/search-token", async (c) => {
  let input;
  try {
    input = parseSearchTokenRequest(await c.req.json());
  } catch (err: any) {
    return c.json({ error: err.errors ?? err.message }, 400);
  }
  const { mint, requestor } = input;

  let mintPublicKey;
  try {
    mintPublicKey = new PublicKey(mint);
  } catch (e) {
    return c.json({ error: "Invalid mint address format" }, 400);
  }

  logger.log(`[search-token] Searching for token ${mint}`);

  // Check if token is already imported
  const db = getDB();
  const existingToken = await db
    .select()
    .from(tokens)
    .where(eq(tokens.mint, mint))
    .limit(1);

  if (existingToken && existingToken.length > 0) {
    logger.log(`[search-token] Token ${mint} is already imported`);
    return c.json(
      {
        error: "Token already imported",
        token: existingToken[0],
      },
      409
    );
  }

  const connection = new Connection(getMainnetRpcUrl(), "confirmed");

  try {
    const tokenInfo = await connection.getAccountInfo(mintPublicKey);
    if (tokenInfo) {
      logger.log(`[search-token] Found token on mainnet`);
      const tokenData = await processTokenInfo(
        mintPublicKey,
        tokenInfo,
        connection,
        requestor
      );

      if (!tokenData) {
        return c.json({ error: "Failed to process token info" }, 500);
      }

      return c.json(tokenData);
    } else {
      logger.error(`[search-token] Token ${mint} not found on mainnet`);
      return c.json({ error: "Token not found on mainnet" }, 404);
    }
  } catch (error) {
    logger.error(`[search-token] Error checking mainnet: ${error}`);
    return c.json({ error: "Error checking Solana network" }, 500);
  }
});

async function uploadImportImage(c: Context) {
  try {
    // Require authentication
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const { imageBase64 } = await c.req.json();
    // Removed env usage
    // const env = process.env;

    if (!imageBase64) {
      return c.json({ error: "No image data provided" }, 400);
    }

    // Extract content type and base64 data from data URL
    const imageMatch = imageBase64.match(/^data:(image\/[a-z+]+);base64,(.*)$/);
    if (!imageMatch) {
      return c.json({ error: "Invalid image data URI format" }, 400);
    }

    const contentType = imageMatch[1];
    const base64Data = imageMatch[2];
    const imageBuffer = Buffer.from(base64Data, "base64");

    // Determine file extension
    let extension = ".jpg";
    if (contentType.includes("png")) extension = ".png";
    else if (contentType.includes("gif")) extension = ".gif";
    else if (contentType.includes("svg")) extension = ".svg";
    else if (contentType.includes("webp")) extension = ".webp";

    // Generate unique filename
    const imageFilename = `${crypto.randomUUID()}${extension}`;
    // No need for imageKey construction here if using uploadWithS3
    // const imageKey = `token-images/${imageFilename}`;

    // Upload using the uploader function
    const imageUrl = await uploadWithS3(
      // Env no longer needed here
      imageBuffer,
      { filename: imageFilename, contentType, basePath: "token-images" }
    );

    return c.json({ success: true, imageUrl });
  } catch (error) {
    console.error("Error uploading import image:", error);
    return c.json({ error: "Failed to upload image" }, 500);
  }
}

// Add the upload-import-image route to the router
tokenRouter.post("/upload-import-image", uploadImportImage);

// Add this after other token routes
tokenRouter.post("/token/:mint/audio-context", async (c) => {
  try {
    const mint = c.req.param("mint");
    const user = c.get("user");

    if (!user) {
      return c.json({ error: "Authentication required" }, 401);
    }

    // Get the form data
    const formData = await c.req.formData();
    const audioFile = formData.get("audio") as File;

    if (!audioFile) {
      return c.json({ error: "No audio file provided" }, 400);
    }

    // Validate file type
    if (!audioFile.type.startsWith("audio/")) {
      return c.json(
        { error: "Invalid file type. Please upload an audio file." },
        400
      );
    }

    // Check file size (10MB limit)
    if (audioFile.size > 10 * 1024 * 1024) {
      return c.json({ error: "File size exceeds 10MB limit" }, 400);
    }

    // Read the file into a buffer
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Determine file extension from content type
    let extension = ".wav"; // Default
    if (audioFile.type.includes("mp3")) extension = ".mp3";
    else if (audioFile.type.includes("ogg")) extension = ".ogg";
    else if (audioFile.type.includes("m4a")) extension = ".m4a";

    // Create the object key
    const objectKey = `token-settings/${mint}/audio/context-${mint}${extension}`;

    // Upload to storage using existing function
    const publicUrl = await uploadToStorage(buffer, {
      contentType: audioFile.type,
      key: objectKey,
    });

    return c.json({
      success: true,
      url: publicUrl,
    });
  } catch (error) {
    logger.error("Error uploading audio context:", error);
    return c.json({ error: "Failed to upload audio context" }, 500);
  }
});

/**
 * Fetches and prioritizes specific tokens at the beginning of the result set
 * @param db Database instance
 * @param serializableResults Current serialized token results
 * @param priorityTokenAddresses Array of token mint addresses to prioritize
 * @param limit Maximum number of tokens to return
 * @returns Modified token results with priority tokens at the beginning
 */
async function prioritizeFeaturedTokens(
  serializableResults: Token[],
  priorityTokenAddresses: string[],
  limit: number
): Promise<Token[]> {
  try {
    const db = getDB();
    // Check if priority tokens exist in results
    const priorityTokensInResults = serializableResults.filter((token) =>
      priorityTokenAddresses.includes(token.mint)
    );

    // Get missing priority tokens (if any)
    const missingTokenAddresses = priorityTokenAddresses.filter(
      (addr) => !priorityTokensInResults.some((token) => token.mint === addr)
    );

    // If we have missing priority tokens, fetch them
    let missingTokens: Token[] = [];
    if (missingTokenAddresses.length > 0) {
      try {
        const priorityTokensQuery = db
          .select()
          .from(tokens)
          .where(inArray(tokens.mint, missingTokenAddresses));

        const fetchedTokens = await priorityTokensQuery.execute();

        // Convert BigInts in fetched tokens
        missingTokens = fetchedTokens.map((token) => {
          const serializableToken: Record<string, any> = {};
          for (const [key, value] of Object.entries(token)) {
            if (typeof value === "bigint") {
              serializableToken[key] = (value as any).toString();
            } else {
              serializableToken[key] = value;
            }
          }
          return serializableToken as Token;
        });

        logger.log(
          `[Featured Sort] Fetched ${missingTokens.length} additional priority tokens`
        );
      } catch (error) {
        logger.error("[Featured Sort] Error fetching priority tokens:", error);
        // Don't throw error, just continue with what we have
      }
    }

    // Remove any priority tokens from the main result to avoid duplicates
    const otherTokens = serializableResults.filter(
      (token) => !priorityTokenAddresses.includes(token.mint)
    );

    // Combine all priority tokens in the specified order, but only include tokens that exist
    const allPriorityTokens = [];
    for (const addr of priorityTokenAddresses) {
      const existingToken = priorityTokensInResults.find(
        (t) => t.mint === addr
      );
      if (existingToken) {
        allPriorityTokens.push(existingToken);
      } else {
        const fetchedToken = missingTokens.find((t) => t.mint === addr);
        if (fetchedToken) allPriorityTokens.push(fetchedToken);
        // If token doesn't exist in DB, we just skip it - no need to add null/undefined to array
      }
    }

    // Combine priority tokens with other tokens, ensuring we don't exceed the limit
    const combinedResults = [...allPriorityTokens, ...otherTokens];
    const finalResults = combinedResults.slice(0, limit); // Keep within limit

    logger.log(
      `[Featured Sort] Prioritized ${allPriorityTokens.length} tokens at the beginning`
    );

    return finalResults;
  } catch (error) {
    // If anything fails, return the original results to avoid breaking the API
    logger.error("[Featured Sort] Error in prioritization process:", error);
    return serializableResults.slice(0, limit);
  }
}

export default tokenRouter;
