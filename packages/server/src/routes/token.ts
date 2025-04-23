import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"; // S3 Import
import {
  AccountInfo,
  Connection,
  ParsedAccountData,
  PublicKey
} from "@solana/web3.js";
import { and, count, eq, or, sql, SQL } from "drizzle-orm";
import { PgSelect } from "drizzle-orm/pg-core";
import { Context, Hono } from "hono";
import { Buffer } from 'node:buffer'; // Buffer import
import { getDB, Token, tokens } from "../db";
import { ExternalToken } from "../externalToken";
import { getSOLPrice } from "../mcap";
import { getGlobalRedisCache } from "../redis";
import { uploadWithS3 } from "../uploader"; // Import the S3 uploader
import {
  applyFeaturedSort,
  calculateFeaturedScore,
  getDevnetRpcUrl,
  getFeaturedMaxValues,
  getMainnetRpcUrl,
  getRpcUrl,
} from "../util";
import { getWebSocketClient } from "../websocket-client";
import { generateAdditionalTokenImages } from "./generation";

// S3 Client Helper (copied from uploader.ts, using process.env)
let s3ClientInstance: S3Client | null = null;
function getS3Client(): S3Client {
  if (s3ClientInstance) return s3ClientInstance;
  const accountId = process.env.S3_ACCOUNT_ID;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const bucketName = process.env.S3_BUCKET_NAME;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    logger.error("Missing R2 S3 API environment variables.");
    throw new Error("Missing required R2 S3 API environment variables.");
  }
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  s3ClientInstance = new S3Client({ region: "auto", endpoint, credentials: { accessKeyId, secretAccessKey } });
  logger.log(`S3 Client initialized for endpoint: ${endpoint}`);
  return s3ClientInstance;
}

// Basic logger implementation if not globally available
const logger = {
  log: (...args: any[]) => console.log("[INFO]", ...args),
  warn: (...args: any[]) => console.warn("[WARN]", ...args),
  error: (...args: any[]) => console.error("[ERROR]", ...args),
};

// --- Validation Function ---
async function validateQueryResults(
  params: { hideImported?: number; status?: string },
  results: Token[] | null | undefined,
  sqlStrings?: { mainQuerySql?: string }, // Optional parameter for SQL string
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
      (token) => token.status !== "active",
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
      (token) => token.status !== "locked",
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
  },
): PgSelect {
  const { hideImported, status, creator, search, sortBy, maxVolume, maxHolders } = params;
  // Select specific columns needed eventually (adjust as needed)
  // Selecting all initially, will be refined before sorting
  let query = db.select().from(tokens).$dynamic();
  const conditions: (SQL | undefined)[] = [];

  if (hideImported === 1) {
    conditions.push(sql`${tokens.imported} = 0`);
    logger.log(`[Query Build] Adding condition: imported = 0`);
  }
  let specificStatusApplied = false;
  if (status === "active") {
    conditions.push(sql`${tokens.status} = 'active'`);
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
        sql`${tokens.name} ILIKE ${'%' + search + '%'}`, // Use standard SQL LIKE
        sql`${tokens.ticker} ILIKE ${'%' + search + '%'}`, // Use standard SQL LIKE
        sql`${tokens.mint} ILIKE ${'%' + search + '%'}`, // Use standard SQL LIKE
      ),
    );
    logger.log(`[Query Build] Adding condition: search LIKE ${search}`);
  }

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
  },
): PgSelect {
  let query = db.select({ count: count() }).from(tokens).$dynamic();
  const { hideImported, status, creator, search } = params;
  const conditions: (SQL | undefined)[] = [];

  if (hideImported === 1) {
    conditions.push(sql`${tokens.imported} = 0`);
    logger.log(`[Count Build] Adding condition: imported = 0`);
  }
  let specificStatusApplied = false;
  if (status === "active") {
    conditions.push(sql`${tokens.status} = 'active'`);
    logger.log(`[Count Build] Adding condition: status = 'active'`);
    specificStatusApplied = true;
  } else if (status === "locked") {
    conditions.push(sql`${tokens.status} = 'locked'`);
    logger.log(`[Count Build] Adding condition: status = 'locked'`);
    specificStatusApplied = true;
  }
  if (!specificStatusApplied) {
    conditions.push(sql`${tokens.status} != 'pending'`);
    logger.log(`[Count Build] Adding condition: status != 'pending'`);
  }
  conditions.push(sql`(${tokens.hidden} != 1 OR ${tokens.hidden} IS NULL)`);
  logger.log(`[Count Build] Adding condition: hidden != 1 OR hidden IS NULL`);
  if (creator) {
    conditions.push(eq(tokens.creator, creator));
    logger.log(`[Count Build] Adding condition: creator = ${creator}`);
  }
  if (search) {
    conditions.push(
      or(
        sql`${tokens.name} ILIKE ${'%' + search + '%'}`, // Use standard SQL LIKE
        sql`${tokens.ticker} ILIKE ${'%' + search + '%'}`, // Use standard SQL LIKE
        sql`${tokens.mint} ILIKE ${'%' + search + '%'}`, // Use standard SQL LIKE
      ),
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

// --- Endpoint to serve images from storage (S3 API) ---
tokenRouter.get("/image/:filename", async (c) => {
  const filename = c.req.param("filename");
  logger.log(`[/image/:filename] Request received for filename: ${filename}`);
  try {
    if (!filename) {
      logger.warn("[/image/:filename] Filename parameter is missing");
      return c.json({ error: "Filename parameter is required" }, 400);
    }

    const s3Client = getS3Client();
    const bucketName = process.env.S3_BUCKET_NAME;
    if (!bucketName) {
      logger.error("[/image/:filename] S3_BUCKET_NAME not configured.");
      return c.json({ error: "Storage is not available" }, 500);
    }

    // Determine potential object key (might be generation or token image)
    const generationMatch = filename.match(
      /^generation-([A-Za-z0-9]{32,44})-([1-9][0-9]*)\.jpg$/,
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
        `[/image/:filename] Attempting to get object from S3 key: ${imageKey}`,
      );
      const getCmd = new GetObjectCommand({ Bucket: bucketName, Key: imageKey });
      const objectResponse = await s3Client.send(getCmd);

      logger.log(
        `[/image/:filename] Found object in S3: Size=${objectResponse.ContentLength}, Type=${objectResponse.ContentType}`,
      );

      let contentType = objectResponse.ContentType || "image/jpeg";
      if (filename.endsWith(".png")) contentType = "image/png";
      else if (filename.endsWith(".gif")) contentType = "image/gif";
      else if (filename.endsWith(".svg")) contentType = "image/svg+xml";
      else if (filename.endsWith(".webp")) contentType = "image/webp";

      const data = await objectResponse.Body?.transformToByteArray();
      if (!data) {
        logger.error(`[/image/:filename] Image body stream is empty for ${imageKey}`);
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
        `[/image/:filename] Serving ${filename} with type ${contentType}`,
      );
      return new Response(dataBuffer, {
        headers: {
          "Content-Type": contentType,
          "Content-Length": objectResponse.ContentLength?.toString() ?? '0',
          "Cache-Control": "public, max-age=31536000",
          ...corsHeaders,
        },
      });

    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        logger.warn(
          `[/image/:filename] Image not found in S3 for key: ${imageKey}`,
        );
        // DEBUG: List files in the directory
        try {
          const prefix = imageKey.substring(0, imageKey.lastIndexOf('/') + 1);
          const listCmd = new ListObjectsV2Command({ Bucket: bucketName, Prefix: prefix, MaxKeys: 10 });
          const listResponse = await s3Client.send(listCmd);
          const keys = listResponse.Contents?.map((o: any) => o.Key ?? 'unknown-key') ?? [];
          logger.log(
            `[/image/:filename] Files in ${prefix} directory: ${keys.join(", ")}`,
          );
        } catch (listError) {
          logger.error(
            `[/image/:filename] Error listing files in directory: ${listError}`,
          );
        }
        return c.json({ error: "Image not found" }, 404);
      } else {
        logger.error(`[/image/:filename] Error fetching image ${imageKey} from S3:`, error);
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
    `[/metadata/:filename] Request received for filename: ${filename}, temp=${isTemp}`,
  );

  try {
    if (!filename || !filename.endsWith(".json")) {
      logger.error("[/metadata/:filename] Invalid filename format:", filename);
      return c.json({ error: "Filename parameter must end with .json" }, 400);
    }

    const s3Client = getS3Client();
    const bucketName = process.env.S3_BUCKET_NAME;
    if (!bucketName) {
      logger.error("[/metadata/:filename] S3_BUCKET_NAME not configured.");
      return c.json({ error: "Storage is not available" }, 500);
    }

    const primaryKey = isTemp ? `token-metadata-temp/${filename}` : `token-metadata/${filename}`;
    const fallbackKey = isTemp ? `token-metadata/${filename}` : `token-metadata-temp/${filename}`;
    let objectResponse;
    let objectKey = primaryKey;

    try {
      logger.log(`[/metadata/:filename] Checking primary location: ${primaryKey}`);
      const getPrimaryCmd = new GetObjectCommand({ Bucket: bucketName, Key: primaryKey });
      objectResponse = await s3Client.send(getPrimaryCmd);
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        logger.log(`[/metadata/:filename] Not found in primary location, checking fallback: ${fallbackKey}`);
        objectKey = fallbackKey;
        try {
          const getFallbackCmd = new GetObjectCommand({ Bucket: bucketName, Key: fallbackKey });
          objectResponse = await s3Client.send(getFallbackCmd);
        } catch (fallbackError: any) {
          if (fallbackError.name === 'NoSuchKey') {
            logger.error(`[/metadata/:filename] Metadata not found in either location for ${filename}`);
            return c.json({ error: "Metadata not found" }, 404);
          } else {
            logger.error(`[/metadata/:filename] Error fetching fallback metadata ${fallbackKey}:`, fallbackError);
            throw fallbackError;
          }
        }
      } else {
        logger.error(`[/metadata/:filename] Error fetching primary metadata ${primaryKey}:`, error);
        throw error;
      }
    }

    const contentType = objectResponse.ContentType || "application/json";
    const data = await objectResponse.Body?.transformToString();
    if (data === undefined) {
      logger.error(`[/metadata/:filename] Metadata body stream is empty for ${objectKey}`);
      return c.json({ error: "Failed to read metadata content" }, 500);
    }

    logger.log(
      `[/metadata/:filename] Found metadata: Key=${objectKey}, Size=${objectResponse.ContentLength}, Type=${contentType}`,
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
    logger.error(`[/metadata/:filename] Error serving metadata ${filename}:`, error);
    return c.json({ error: "Failed to serve metadata JSON" }, 500);
  }
});

export async function processSwapEvent(
  swap: any,
  shouldEmitGlobal: boolean = true,
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
    // Check for process is not ideal in Cloudflare Workers, use env var instead
    const debugWs = process.env.DEBUG_WEBSOCKET === "true";
    if (debugWs) {
      logger.log(`Emitted swap event for token ${swap.tokenMint}`);
    }

    // Optionally emit to global room for activity feed
    if (shouldEmitGlobal) {
      await wsClient.emit("global", "newSwap", enrichedSwap);

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
        // Use fetch with timeout/error handling
        try {
          const uriResponse = await fetch(uri); // Add timeout here if needed

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
                logger.log(
                  `[search-token] Found image URL in URI: ${imageUrl}`,
                );
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
        } catch (fetchError) {
          logger.error(`[search-token] Error fetching URI: ${fetchError}`);
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
        try {
          const uriResponse = await fetch(uri); // Add timeout here if needed

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
                logger.log(
                  `[search-token] Found image URL in URI: ${imageUrl}`,
                );
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
        } catch (fetchError) {
          logger.error(`[search-token] Error fetching URI: ${fetchError}`);
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

// Helper to check token balance directly on blockchain
async function checkBlockchainTokenBalance(
  c: any, // Use 'any' type for context or define a specific type
  mint: string,
  address: string,
  checkMultipleNetworks = false,
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
    network: foundNetwork || process.env.NETWORK || "unknown",
    onChain: true,
  });
}

// Function to process a token update and emit WebSocket events
export async function processTokenUpdateEvent(
  tokenData: any,
  shouldEmitGlobal: boolean = false,
  isNewTokenEvent: boolean = false, // Add the new flag
): Promise<void> {
  try {
    // Get WebSocket client
    const wsClient = getWebSocketClient();

    // Get DB connection and calculate featuredScore
    const db = getDB();
    const { maxVolume, maxHolders } = await getFeaturedMaxValues(db);

    // Create enriched token data with featuredScore
    const enrichedTokenData = {
      ...tokenData,
      featuredScore: calculateFeaturedScore(
        tokenData,
        maxVolume,
        maxHolders,
      ),
    };

    // Always emit to token-specific room
    await wsClient.emit(
      `token-${tokenData.mint}`,
      "updateToken",
      enrichedTokenData,
    );

    // Use env var for debug check
    const debugWs = process.env.DEBUG_WEBSOCKET === "true";
    if (debugWs) {
      logger.log(`Emitted token update event for ${tokenData.mint}`);
    }

    // Handle global emission based on flags
    if (isNewTokenEvent) {
      // If it's a new token event, *only* emit the global "newToken" event
      await wsClient.emit("global", "newToken", {
        ...enrichedTokenData,
        timestamp: new Date(),
      });
      if (debugWs) {
        logger.log(`Emitted NEW token event to global feed: ${tokenData.mint}`);
      }
    } else if (shouldEmitGlobal) {
      // Otherwise, if shouldEmitGlobal is true (and it's not a new token), emit "updateToken" globally
      await wsClient.emit("global", "updateToken", {
        ...enrichedTokenData,
        timestamp: new Date(),
      });

      if (debugWs) {
        logger.log("Emitted token update event to global feed");
      }
    }

    return;
  } catch (error) {
    logger.error("Error processing token update event:", error);
    // Don't throw to avoid breaking other functionality
  }
}

export async function updateHoldersCache(
  mint: string,
  imported: boolean = false,
): Promise<number> {
  const env = process.env;
  try {
    // Use the utility function to get the RPC URL with proper API key
    const connection = new Connection(process.env.NETWORK! === "devnet" ?
      process.env.DEVNET_SOLANA_RPC_URL! : process.env.MAINNET_SOLANA_RPC_URL!,
      {
        commitment: "confirmed",
        confirmTransactionInitialTimeout: 60000, // 60 seconds
      }

    );

    const db = getDB();
    const redisCache = await getGlobalRedisCache(); // Instantiate Redis cache

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
    // Change type from TokenHolder to any or a new local type if needed
    const holders: any[] = [];

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

        // Use a consistent structure, maybe matching old DB schema if needed
        holders.push({
          // id: crypto.randomUUID(), // No longer needed for DB
          mint, // Keep for context within the stored object
          address: ownerAddress,
          amount: tokenBalance,
          percentage: 0, // Will calculate after we have the total
          lastUpdated: new Date(), // Keep track of update time
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

    const holdersListKey = `holders:${mint}`;
    try {
      // Store the entire list, stringified. No TTL.
      await redisCache.set(holdersListKey, JSON.stringify(holders));
      logger.log(
        `Stored ${holders.length} holders in Redis list ${holdersListKey}`,
      );
    } catch (redisError) {
      logger.error(`Failed to store holders in Redis for ${mint}:`, redisError);
    }

    try {
      const wsClient = getWebSocketClient();
      const limitedHolders = holders.slice(0, 50); // Emit only top 50
      wsClient.emit(`token-${mint}`, "newHolder", limitedHolders);
    } catch (wsError) {
      logger.error(`WebSocket error when emitting holder update:`, wsError);
    }


    await db
      .update(tokens)
      .set({
        holderCount: holders.length, // Use full count
        lastUpdated: new Date(),
      })
      .where(eq(tokens.mint, mint));

    // Emit WebSocket event to notify of token update (with new holder count)
    try {
      const tokenData = await db
        .select()
        .from(tokens)
        .where(eq(tokens.mint, mint))
        .limit(1);

      if (tokenData && tokenData.length > 0) {
        await processTokenUpdateEvent({
          ...tokenData[0],
          event: "holdersUpdated",
          holderCount: holders.length, // Use full count here too
          timestamp: new Date().toISOString(),
        });
      }
    } catch (wsError) {
      logger.error(`WebSocket error when emitting holder update: ${wsError}`);
    }

    return holders.length; // Return full count
  } catch (error) {
    logger.error(`Error updating holders for token ${mint}:`, error);
    return 0;
  }
}

// --- END VALIDATION FUNCTION ---

// --- Route Handler ---
tokenRouter.get("/tokens", async (c) => {
  // --- Parameter Reading ---
  const queryParams = c.req.query();
  const isSearching = !!queryParams.search;
  const limit = isSearching ? 5 : parseInt(queryParams.limit as string) || 50;
  const page = parseInt(queryParams.page as string) || 1;
  const skip = (page - 1) * limit;
  const status = queryParams.status as string | undefined;
  const hideImportedParam = queryParams.hideImported;
  // Ensure hideImported is number or undefined, handle potential string '1' or '0'
  const hideImported =
    hideImportedParam === "1" ? 1 : hideImportedParam === "0" ? 0 : undefined;
  const creator = queryParams.creator as string | undefined;
  const search = queryParams.search as string | undefined;
  const sortBy = search
    ? "marketCapUSD"
    : (queryParams.sortBy as string) || "createdAt";
  const sortOrder = (queryParams.sortOrder as string) || "desc";

  logger.log(
    `[GET /tokens] Received params: sortBy=${sortBy}, sortOrder=${sortOrder}, hideImported=${hideImported}, status=${status}, search=${search}, creator=${creator}, limit=${limit}, page=${page}`,
  );

  // --- RE-ENABLE CACHE GET ---
  const cacheKey = `tokens:${limit}:${page}:${search || ""}:${status || ""}:${hideImported === 1 ? "1" : hideImported === 0 ? "0" : "u"}:${creator || ""}:${sortBy}:${sortOrder}`; // Refined key slightly
  const redisCache = await getGlobalRedisCache(); // Ensure env is cast if needed
  if (redisCache) {
    try {
      const cachedData = await redisCache.get(cacheKey);
      if (cachedData) {
        logger.log(`Cache hit for ${cacheKey}`);
        const parsedData = JSON.parse(cachedData);
        // Log retrieved cache data (optional, for debugging)
        // logger.log(`[Cache Check] Retrieved data for ${cacheKey}:`, typeof parsedData === 'object' && parsedData !== null ? JSON.stringify(parsedData).substring(0, 200) + "..." : String(parsedData));

        // Corrected validation check
        if (
          parsedData &&
          Array.isArray(parsedData.tokens)
          // Removed length check to allow caching empty results
          // && parsedData.tokens.length > 0
        ) {
          logger.log(
            `[Cache Check] Cache data VALID for ${cacheKey}, returning cached version.`,
          );
          return c.json(parsedData); // Return cached data
        } else {
          logger.warn(
            `Cache data is empty or invalid for ${cacheKey}, fetching fresh data.`,
          );
        }
      } else {
        logger.log(`Cache miss for ${cacheKey}`);
      }
    } catch (cacheError) {
      logger.error(`Redis cache GET error:`, cacheError);
      // Continue without cache if GET fails
    }
  }
  // --- END RE-ENABLE CACHE GET ---

  const db = getDB();

  // Get max values needed by builder for column selection
  const { maxVolume, maxHolders } = await getFeaturedMaxValues(db);

  // --- Build Base Queries ---
  // Pass sorting info needed for column selection to builder
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
  const countQuery = buildTokensCountBaseQuery(db, filterParams); // Count query doesn't need sorting info

  // --- Apply Sorting to Main Query ---
  // Column selection is now done inside buildTokensBaseQuery
  const validSortColumns = {
    createdAt: tokens.createdAt,
    marketCapUSD: tokens.marketCapUSD,
    volume24h: tokens.volume24h,
    holderCount: tokens.holderCount,
    curveProgress: tokens.curveProgress,
    // Add other valid columns here
  };

  if (sortBy === "featured") {
    // REMOVE baseQuery.select - done in builder
    baseQuery = applyFeaturedSort(
      baseQuery,
      maxVolume,
      maxHolders,
      sortOrder,
    );
    logger.log(`[Query Build] Applied sort: featured weighted`);
  } else {
    // REMOVE baseQuery.select - done in builder
    const sortColumn =
      validSortColumns[sortBy as keyof typeof validSortColumns] ||
      tokens.createdAt;
    if (sortOrder.toLowerCase() === "desc") {
      baseQuery = baseQuery.orderBy(
        sql`CASE 
                  WHEN ${sortColumn} IS NULL OR ${sortColumn}::text = 'NaN' THEN 1 
                  ELSE 0 
                END`,
        sql`${sortColumn} DESC`,
      );
      logger.log(`[Query Build] Applied sort: ${sortBy} DESC`);
    } else {
      baseQuery = baseQuery.orderBy(sortColumn);
      logger.log(`[Query Build] Applied sort: ${sortBy} ASC`);
    }
  }

  // --- Apply Pagination to Main Query ---
  baseQuery = baseQuery.limit(limit).offset(skip);
  logger.log(
    `[Query Build] Applied pagination: limit=${limit}, offset=${skip}`,
  );

  // --- Get SQL representation BEFORE execution ---
  // Ensure baseQuery and countQuery are accessible here
  let mainQuerySqlString = "N/A";
  let countQuerySqlString = "N/A";
  try {
    mainQuerySqlString = baseQuery.toSQL().sql;
    countQuerySqlString = countQuery.toSQL().sql;
    logger.log(`[SQL Build] Main Query SQL (approx): ${mainQuerySqlString}`);
    logger.log(
      `[SQL Build] Count Query SQL (approx): ${countQuerySqlString}`,
    );
  } catch (sqlError) {
    logger.error("[SQL Build] Error getting SQL string:", sqlError);
  }
  // --- END SQL Generation ---

  // --- Execute Queries (Sequentially is safer for SQLite) ---
  // const timeoutDuration = (process.env.NODE_ENV === "test" || process.env.LOCAL_DEV === 'true') ? 20000 : 10000; // Longer timeout for dev/test
  // const timeoutPromise = new Promise((_, reject) =>
  //   setTimeout(() => reject(new Error("Query timed out")), timeoutDuration),
  // );
  // const countTimeoutPromise = new Promise<number>((_, reject) =>
  //   setTimeout(
  //     () => reject(new Error("Count query timed out")),
  //     timeoutDuration, // Use same timeout for count
  //   ),
  // );

  let tokensResult: Token[] | undefined;
  let total = 0;
  try {
    logger.log("[Execution] Awaiting baseQuery...");
    // @ts-ignore - Drizzle's execute() type might not be perfectly inferred
    // tokensResult = await Promise.race([baseQuery.execute(), timeoutPromise]);
    tokensResult = await baseQuery.execute(); // Remove race for simplicity/debugging
    logger.log(
      `[Execution] baseQuery finished, ${tokensResult?.length} results. Awaiting countQuery...`,
    );
    // @ts-ignore - Drizzle's execute() type might not be perfectly inferred
    // const countResult = await Promise.race([
    //   countQuery.execute(),
    //   countTimeoutPromise,
    // ]);
    const countResult = await countQuery.execute(); // Remove race
    total = Number(countResult[0]?.count || 0);
    logger.log(`[Execution] countQuery finished, total: ${total}`);

    // --- Pass SQL to VALIDATION CALL ---
    // Pass the generated SQL string
    await validateQueryResults({ hideImported, status }, tokensResult, {
      mainQuerySql: mainQuerySqlString,
    });
    // --- END VALIDATION CALL ---
  } catch (error) {
    logger.error(
      "Token query failed, timed out, or failed validation:",
      error,
    );
    tokensResult = []; // Ensure it's an empty array on error
    total = 0;
  }

  // --- Process and Return ---
  const totalPages = Math.ceil(total / limit);

  // Ensure BigInts are handled before caching/returning
  const serializableTokensResult =
    tokensResult?.map((token) => {
      const serializableToken: Record<string, any> = {};
      if (token) {
        // Use Object.entries for potentially better type inference
        for (const [key, value] of Object.entries(token)) {
          if (typeof value === "bigint") {
            // Explicitly cast value to any before calling toString()
            serializableToken[key] = (value as any).toString();
          } else {
            serializableToken[key] = value;
          }
        }
      }
      return serializableToken as Token; // Keep cast for now
    }) || [];

  const responseData = {
    tokens: serializableTokensResult,
    page,
    totalPages,
    total,
    hasMore: page < totalPages,
  };

  // Merge ephemeral stats from Redis into each token
  if (redisCache) {
    await Promise.all(
      responseData.tokens.map(async (t) => {
        const statsJson = await redisCache.get(`token:stats:${t.mint}`);
        if (statsJson) Object.assign(t, JSON.parse(statsJson));
      }),
    );
  }

  // --- RE-ENABLE CACHE SET ---
  if (
    redisCache
    // Cache even if results are empty to prevent re-querying immediately
    // && serializableTokensResult &&
    // serializableTokensResult.length > 0
  ) {
    // Cache only if results exist
    try {
      // Cache duration remains 15 seconds for the /tokens list endpoint
      await redisCache.set(cacheKey, JSON.stringify(responseData), 15);
      logger.log(`Cached data for ${cacheKey} with 15s TTL`);
    } catch (cacheError) {
      logger.error(`Redis cache SET error:`, cacheError);
    }
  }
  // --- END RE-ENABLE CACHE SET ---

  // Final log and return
  const returnedMints =
    serializableTokensResult
      ?.slice(0, 5)
      .map((t) => t.mint)
      .join(", ") || "none";
  logger.log(
    `[API Response] Returning ${serializableTokensResult?.length ?? 0} tokens. First 5 mints: ${returnedMints}`,
  );

  return c.json(responseData);

});

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

    let allHolders: any[] = [];
    const redisCache = await getGlobalRedisCache();
    const holdersListKey = `holders:${mint}`;
    try {

      const holdersString = await redisCache.get(holdersListKey);
      if (holdersString) {
        allHolders = JSON.parse(holdersString);
        logger.log(
          `Retrieved ${allHolders.length} holders from Redis key ${holdersListKey}`,
        );
        const ts = await redisCache.get(`${holdersListKey}:lastUpdated`);
        if (!ts || Date.now() - new Date(ts).getTime() > 5 * 60_000) {
          // >5 min old (or never set) → refresh in background
          void updateHoldersCache(mint)
            .then((cnt) => logger.log(`Async holders refresh for ${mint}, got ${cnt}`))
            .catch((err) => logger.error(`Async holders refresh failed:`, err));
        }
      } else {
        logger.log(`No holders found in Redis for key ${holdersListKey}`);
        // Return empty if not found in cache (as updateHoldersCache should populate it)
        return c.json({
          holders: [],
          page: 1,
          totalPages: 0,
          total: 0,
        });
      }
    } catch (redisError) {
      logger.error(`Failed to get holders from Redis for ${mint}:`, redisError);
      return c.json({ error: "Failed to retrieve holder data" }, 500);
    }
    // ---> END CHANGE

    const totalHolders = allHolders.length;

    if (totalHolders === 0) {
      // This case is handled above if Redis returns null/empty
      // Kept for safety, but should be unreachable if Redis logic is correct
      const responseData = {
        holders: [],
        page: 1,
        totalPages: 0,
        total: 0,
      };
      return c.json(responseData);
    }

    // Paginate results in application code
    const paginatedHolders = allHolders.slice(offset, offset + limit);
    const totalPages = Math.ceil(totalHolders / limit);

    const responseData = {
      holders: paginatedHolders,
      page: page,
      totalPages: totalPages,
      total: totalHolders,
    };

    return c.json(responseData);
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
      500,
    );
  }
});

tokenRouter.get("/token/:mint/price", async (c) => {
  try {
    const mint = c.req.param("mint");

    // Validate mint address
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // --- BEGIN REDIS CACHE CHECK ---
    const cacheKey = `tokenPrice:${mint}`;
    const redisCache = await getGlobalRedisCache();

    if (redisCache) {
      try {
        const cachedData = await redisCache.get(cacheKey);
        if (cachedData) {
          logger.log(`[Cache Hit] ${cacheKey}`);
          const parsedData = JSON.parse(cachedData);
          // Basic validation (check for price existence)
          if (parsedData && typeof parsedData.price !== "undefined") {
            return c.json(parsedData);
          } else {
            logger.warn(`Invalid cache data for ${cacheKey}, fetching fresh.`);
          }
        } else {
          logger.log(`[Cache Miss] ${cacheKey}`);
        }
      } catch (cacheError) {
        logger.error(`Redis cache GET error for price:`, cacheError);
      }
    }
    // --- END REDIS CACHE CHECK ---

    // Get token data from database
    const db = getDB();
    const tokenData = await db
      .select({
        // Select only necessary fields
        currentPrice: tokens.currentPrice,
        tokenPriceUSD: tokens.tokenPriceUSD,
        liquidity: tokens.liquidity,
        marketCapUSD: tokens.marketCapUSD,
        priceChange24h: tokens.priceChange24h,
        volume24h: tokens.volume24h,
      })
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    if (!tokenData || tokenData.length === 0) {
      // Don't cache 404s for price, as token might appear later
      return c.json({ error: "Token not found" }, 404);
    }

    const token = tokenData[0];

    // Prepare response data
    const responseData = {
      price: token.currentPrice ?? 0, // Use nullish coalescing for defaults
      priceUSD: token.tokenPriceUSD ?? 0,
      marketCap: token.liquidity ?? 0, // Assuming marketCap = liquidity here? Check definition
      marketCapUSD: token.marketCapUSD ?? 0,
      priceChange24h: token.priceChange24h ?? 0,
      volume24h: token.volume24h ?? 0,
      timestamp: Date.now(), // Add timestamp for freshness context
    };

    // --- BEGIN REDIS CACHE SET ---
    if (redisCache) {
      try {
        await redisCache.set(cacheKey, JSON.stringify(responseData), 15); // 30s TTL
        logger.log(`Cached price for ${cacheKey} with 15s TTL`);
      } catch (cacheError) {
        logger.error(`Redis cache SET error for price:`, cacheError);
      }
    }
    // --- END REDIS CACHE SET ---

    // Return actual token price data
    return c.json(responseData);
  } catch (error) {
    logger.error(`Error getting token price: ${error}`);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

tokenRouter.get("/token/:mint", async (c) => {
  console.log("token/:mint");
  try {
    const mint = c.req.param("mint");

    // Validate mint address
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // Create a cache key based on the mint address
    const cacheKey = `token:${mint}`;
    const redisCache = await getGlobalRedisCache();
    if (redisCache) {
      try {
        const cachedData = await redisCache.get(cacheKey);
        if (cachedData) {
          logger.log(`[Cache Hit] ${cacheKey}`);
          const parsedData = JSON.parse(cachedData);
          // Basic validation
          if (parsedData && parsedData.mint === mint) {
            return c.json(parsedData);
          } else {
            logger.warn(`Invalid cache data for ${cacheKey}, fetching fresh.`);
          }
        } else {
          logger.log(`[Cache Miss] ${cacheKey}`);
        }
      } catch (cacheError) {
        logger.error(`Redis cache error:`, cacheError);
        // Continue without caching if there's an error
      }
    }

    // Get token data
    const db = getDB();
    const [tokenData, solPrice] = await Promise.all([
      db.select().from(tokens).where(eq(tokens.mint, mint)).limit(1),
      getSOLPrice(),
    ]);

    if (!tokenData || tokenData.length === 0) {
      // Don't cache 404s for the main token endpoint
      return c.json({ error: "Token not found", mint }, 404);
    }

    const token = tokenData[0];

    // Set default values for critical fields if they're missing
    const TOKEN_DECIMALS = token.tokenDecimals || 6;
    const defaultReserveAmount = 1000000000000; // 1 trillion (default token supply)
    const defaultReserveLamport = Number(process.env.VIRTUAL_RESERVES || 28000000000); // 2.8 SOL (default reserve / 28 in mainnet)

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

    // const tokenMarketData = await calculateTokenMarketData(token, solPrice, process.env);

    // Update solPriceUSD
    token.solPriceUSD = solPrice;

    // Calculate or update marketCapUSD if we have tokenPriceUSD
    // token.marketCapUSD = token.tokenPriceUSD * (token.tokenSupplyUiAmount || 0);

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

    // Merge ephemeral stats from Redis
    if (redisCache) {
      const statsJson = await redisCache.get(`token:stats:${mint}`);
      if (statsJson) Object.assign(token, JSON.parse(statsJson));
    }

    // Format response with additional data
    const responseData = token;
    if (redisCache) {
      try {
        // Cache for 30 seconds (increased from 10s)
        await redisCache.set(cacheKey, JSON.stringify(responseData), 15);
        logger.log(`Cached data for ${cacheKey} with 15s TTL`);
      } catch (cacheError) {
        logger.error(`Error caching token data:`, cacheError);
      }
    }

    return c.json(responseData);
  } catch (error) {
    logger.error(`Error getting token: ${error}`);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
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
      name,
      symbol,
      txId,
      description,
      twitter,
      telegram,
      farcaster,
      website,
      discord,
      imageBase64,
      metadataUrl,
      imported,
      creator,
    } = body;

    const mintAddress = tokenMint || mint;
    if (!mintAddress) {
      return c.json({ error: "Token mint address is required" }, 400);
    }

    logger.log(`Creating token record for: ${mintAddress}`);

    const db = getDB();

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
        409,
      );
    }

    try {
      // Handle image upload if base64 data is provided
      let imageUrl = "";
      if (imageBase64) {
        try {
          // Extract the base64 data from the data URL
          const imageMatch = imageBase64.match(/^data:(image\/[a-z+]+);base64,(.*)$/);
          if (!imageMatch) {
            throw new Error("Invalid image data URI format");
          }
          const contentType = imageMatch[1];
          const base64Data = imageMatch[2];
          const imageBuffer = Buffer.from(base64Data, "base64");

          // Generate a unique filename
          const ext = contentType.split('/')[1] || 'png'; // Extract extension
          const filename = `${mintAddress}-${Date.now()}.${ext}`;

          // Upload using the uploader function (which now uses S3)
          imageUrl = await uploadWithS3(
            // Pass necessary env vars if uploader expects them (it shouldn't anymore)
            imageBuffer,
            { filename, contentType, basePath: 'token-images' }
          );

        } catch (error) {
          logger.error("Error uploading image via S3 uploader:", error);
          // Continue without image if upload fails
          imageUrl = ""; // Ensure imageUrl is empty
        }
      }

      // Create token data with all required fields from the token schema
      const now = new Date();
      console.log("****** imported ******\n", imported);
      const tokenId = crypto.randomUUID();

      // Convert imported to number (1 for true, 0 for false)
      const importedValue = imported === true ? 1 : 0;

      // Insert with all required fields from the schema
      await db.insert(tokens).values([
        {
          id: mintAddress, // Use mintAddress as the primary key/ID
          mint: mintAddress,
          name: name || `Token ${mintAddress.slice(0, 8)}`,
          ticker: symbol || "TOKEN",
          url: metadataUrl || "",
          image: imageUrl || "", // Use the URL from the uploader
          description: description || "",
          twitter: twitter || "",
          telegram: telegram || "",
          farcaster: farcaster || "",
          website: website || "",
          discord: discord || "",
          creator: creator ? creator : user.publicKey || "unknown",
          status: imported ? "locked" : "active",
          tokenPriceUSD: 0.00000001,
          createdAt: now,
          lastUpdated: now,
          txId: txId || "create-" + tokenId,
          imported: importedValue,
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
        },
      ]);

      // For response, include just what we need
      const tokenData = {
        id: tokenId,
        mint: mintAddress,
        name: name || `Token ${mintAddress.slice(0, 8)}`,
        ticker: symbol || "TOKEN",
        description: description || "",
        twitter: twitter || "",
        telegram: telegram || "",
        farcaster: farcaster || "",
        website: website || "",
        discord: discord || "",
        creator: user.publicKey || "unknown",
        status: imported ? "locked" : "active",
        url: metadataUrl || "",
        image: imageUrl || "",
        createdAt: now,
        imported: importedValue,
      };

      // Trigger immediate updates for price and holders in the background
      // for both imported and newly created tokens
      logger.log(
        `Triggering immediate price and holder update for token: ${mintAddress}`,
      );

      if (imported) {
        try {
          const redisCache = await getGlobalRedisCache();
          const importedToken = await ExternalToken.create(mintAddress, redisCache);
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
            webhookError,
          );
          // Continue even if webhook registration fails, especially locally
        }
      }

      // For non-imported tokens, generate additional images in the background
      if (!imported) {
        logger.log(
          `Triggering background image generation for new token: ${mintAddress}`,
        );
        // Use a simple async call if waitUntil is not available
        (async () => await generateAdditionalTokenImages(mintAddress, description || ""))();
      }

      return c.json({ success: true, token: tokenData });
    } catch (error) {
      logger.error("Error creating token:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unknown error creating token record";
      return c.json(
        { error: "Failed to create token record", details: errorMessage },
        500,
      );
    }
  } catch (error) {
    logger.error("Error in create-token endpoint:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown internal server error";
    return c.json(
      { error: "Internal server error", details: errorMessage },
      500,
    );
  }
});

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
    // Determine if token is imported - fetch from DB first
    const db = getDB();
    const tokenData = await db
      .select({ imported: tokens.imported })
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);
    const imported = tokenData.length > 0 ? tokenData[0].imported === 1 : false;

    // Run update in background (simple async call)
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
      500,
    );
  }
});

tokenRouter.post("/token/:mint/update", async (c) => {
  try {
    console.log("****** token/:mint/update ******\n");
    // console.log(c)
    // Get auth headers and extract from cookies
    // const authHeader = c.req.header("Authorization") || "none";
    // const publicKeyCookie = getCookie(c, "publicKey");
    // const authTokenCookie = getCookie(c, "auth_token");

    // logger.log("Token update request received");
    // logger.log("Authorization header:", authHeader);
    // logger.log("Auth cookie present:", !!authTokenCookie);
    // logger.log("PublicKey cookie:", publicKeyCookie);

    // Require authentication
    const user = c.get("user");
    // console.log("User from context:", user);

    if (!user) {
      logger.error("Authentication required - no user in context");

      // For development purposes, if in dev mode and there's a publicKey in the body, use that
      // Use a more secure way to enable dev overrides if needed (e.g., specific header/env var)
      // if (process.env.NODE_ENV === "development") {
      //   try {
      //     const body = await c.req.json();
      //     if (body._devWalletOverride && process.env.NODE_ENV === "development") {
      //       logger.log(
      //         "DEVELOPMENT: Using wallet override:",
      //         body._devWalletOverride,
      //       );
      //       c.set("user", { publicKey: body._devWalletOverride });
      //     } else {
      //       return c.json({ error: "Authentication required" }, 401);
      //     }
      //   } catch (e) {
      //     logger.error("Failed to parse request body for dev override");
      //     return c.json({ error: "Authentication required" }, 401);
      //   }
      // } else {
      return c.json({ error: "Authentication required" }, 401);
      // }
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
    const db = getDB();

    // Get the token to check permissions
    const tokenDataResult = await db // Renamed to avoid conflict
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    if (!tokenDataResult || tokenDataResult.length === 0) {
      logger.error(`Token not found: ${mint}`);
      return c.json({ error: "Token not found" }, 404);
    }
    const currentTokenData = tokenDataResult[0]; // Assign to new variable

    // Log for debugging auth issues
    logger.log(`Update attempt for token ${mint}`);
    logger.log(`User wallet: ${authenticatedUser.publicKey}`);
    logger.log(`Token creator: ${currentTokenData.creator}`);

    // Try multiple ways to compare addresses
    let isCreator = false;

    try {
      // Try normalized comparison with PublicKey objects
      const normalizedWallet = new PublicKey(
        authenticatedUser.publicKey,
      ).toString();
      const normalizedCreator = new PublicKey(
        currentTokenData.creator,
      ).toString();

      logger.log("Normalized wallet:", normalizedWallet);
      logger.log("Normalized creator:", normalizedCreator);

      isCreator = normalizedWallet === normalizedCreator;
      logger.log("Exact match after normalization:", isCreator);

      if (!isCreator) {
        // Case-insensitive as fallback
        const caseMatch =
          authenticatedUser.publicKey.toLowerCase() ===
          currentTokenData.creator.toLowerCase();
        logger.log("Case-insensitive match:", caseMatch);
        isCreator = caseMatch;
      }
    } catch (error) {
      logger.error("Error normalizing addresses:", error);

      // Fallback to simple comparison
      isCreator = authenticatedUser.publicKey === currentTokenData.creator;
      logger.log("Simple equality check:", isCreator);
    }

    // Special dev override if enabled
    // Removed admin override for security, use specific dev flags if needed
    // if (process.env.NODE_ENV === "development" && body._forceAdmin === true) {
    //   logger.log("DEVELOPMENT: Admin access override enabled");
    //   isCreator = true;
    // }

    // Check if user is the token creator
    if (!isCreator) {
      logger.error("User is not authorized to update this token");
      return c.json(
        {
          error: "Only the token creator can update token information",
          userAddress: authenticatedUser.publicKey,
          creatorAddress: currentTokenData.creator,
        },
        403,
      );
    }

    // At this point, user is authenticated and authorized
    logger.log("User is authorized to update token");

    // Define allowed fields for update
    const allowedUpdateFields = [
      "website",
      "twitter",
      "telegram",
      "discord",
      "farcaster",
    ];
    const updateData: Partial<Token> = {}; // Use Partial<Token> for type safety

    for (const field of allowedUpdateFields) {
      // @ts-ignore - Dynamically assigning properties
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        // @ts-ignore - Dynamically assigning properties
        updateData[field] = body[field] ?? currentTokenData[field];
      }
    }
    updateData.lastUpdated = new Date(); // Always update lastUpdated

    // Update token with the new social links if there's anything to update
    if (Object.keys(updateData).length > 1) {
      // Check if more than just lastUpdated changed
      await db.update(tokens).set(updateData).where(eq(tokens.mint, mint));
      logger.log("Token updated successfully");
    } else {
      logger.log("No changes detected, skipping database update.");
    }

    // Update metadata in storage (S3 API) only if it's NOT an imported token
    if (
      currentTokenData?.imported === 0 &&
      Object.keys(updateData).length > 1
    ) {
      try {
        // 1) fetch the existing JSON
        const originalUrl = currentTokenData.url;
        if (originalUrl) {
          // Extract the object key from the FULL URL (assuming it includes the base path)
          let objectKey = "";
          try {
            const url = new URL(originalUrl);
            // Assumes URL format like: https://..../autofun-storage/token-metadata/uuid-filename.json
            const storageBasePath = "/autofun-storage/"; // Or dynamically get if needed
            const basePathIndex = url.pathname.indexOf(storageBasePath);
            if (basePathIndex !== -1) {
              objectKey = url.pathname.substring(basePathIndex + storageBasePath.length);
            } else {
              // Fallback or different logic if URL format is different
              const parts = url.pathname.split("/");
              if (parts.length >= 2) {
                objectKey = `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
              } else {
                throw new Error("Could not parse object key from metadata URL");
              }
              logger.warn(`Could not find expected base path in URL, using inferred key: ${objectKey}`);
            }
          } catch (urlParseError) {
            logger.error(`Failed to parse original metadata URL: ${originalUrl}`, urlParseError);
            throw new Error("Could not parse metadata URL to get object key.");
          }

          if (!objectKey) {
            throw new Error("Failed to extract object key from metadata URL.");
          }


          const s3Client = getS3Client();
          const bucketName = process.env.S3_BUCKET_NAME;
          if (!bucketName) {
            throw new Error("S3_BUCKET_NAME not configured for metadata update.");
          }

          // 2) Fetch existing metadata content
          let json: any;
          try {
            const getCmd = new GetObjectCommand({ Bucket: bucketName, Key: objectKey });
            const response = await s3Client.send(getCmd);
            const jsonString = await response.Body?.transformToString();
            if (!jsonString) throw new Error("Empty metadata content retrieved.");
            json = JSON.parse(jsonString);
          } catch (fetchErr) {
            logger.error(
              `Failed to fetch or parse existing metadata from S3 (${objectKey}):`,
              fetchErr,
            );
            throw new Error("Failed to fetch existing metadata for update."); // Rethrow to indicate failure
          }

          json.properties = json.properties || {};
          // Update properties based on allowed fields that were actually changed
          if (updateData.website !== undefined)
            json.properties.website = updateData.website;
          if (updateData.twitter !== undefined)
            json.properties.twitter = updateData.twitter;
          if (updateData.telegram !== undefined)
            json.properties.telegram = updateData.telegram;
          if (updateData.discord !== undefined)
            json.properties.discord = updateData.discord;
          if (updateData.farcaster !== undefined)
            json.properties.farcaster = updateData.farcaster;

          // 3) Serialize back to Buffer
          const buf = Buffer.from(JSON.stringify(json), 'utf8');

          // 4) Overwrite the same key using S3 PutObject
          const putCmd = new PutObjectCommand({
            Bucket: bucketName,
            Key: objectKey,
            Body: buf,
            ContentType: "application/json",
            Metadata: { publicAccess: "true" }
          });
          await s3Client.send(putCmd);

          logger.log(
            `Overwrote S3 object at key ${objectKey}; URL remains ${originalUrl}`,
          );
        } else {
          logger.warn(
            `Token ${mint} has no metadata URL, cannot update S3 metadata.`,
          );
        }
      } catch (e) {
        logger.error("Failed to re-upload metadata JSON via S3 API:", e);
        // Decide if this failure should prevent success response (maybe return partial success?)
      }
    }
    // Get the updated token data
    const updatedTokenResult = await db // Renamed again
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    // Emit WebSocket event for token update if needed
    if (updatedTokenResult.length > 0) {
      try {
        await processTokenUpdateEvent({
          ...updatedTokenResult[0],
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
        token: updatedTokenResult[0],
      });
    } else {
      logger.error(
        `Failed to fetch updated token data for ${mint} after update.`,
      );
      return c.json(
        {
          success: false, // Indicate partial failure maybe?
          message:
            "Token information updated in DB, but failed to fetch result.",
        },
        500,
      );
    }
  } catch (error) {
    logger.error("Error updating token:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

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
    // Local mode check removed - rely on LOCAL_DEV env var or specific flags if needed
    // const mode = c.req.query("mode");
    // const isLocalMode = mode === "local";
    const checkOnChain = c.req.query("onchain") === "true";

    logger.log(
      `Checking token balance for ${address} on ${mint}, onChain: ${checkOnChain}`,
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
        `Token ${mint} not found in database, but forcing on-chain check.`,
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
        redisError,
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
        `Creator ${address} not found in Redis holders for ${mint}, checking on-chain.`,
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
      500,
    );
  }
});

tokenRouter.post("/search-token", async (c) => {
  const body = await c.req.json();
  const { mint, requestor } = body;

  if (!mint || typeof mint !== "string") {
    return c.json({ error: "Invalid mint address" }, 400);
  }
  let mintPublicKey;
  try {
    mintPublicKey = new PublicKey(mint);
  } catch (e) {
    return c.json({ error: "Invalid mint address format" }, 400);
  }

  if (!requestor || typeof requestor !== "string") {
    return c.json({ error: "Missing or invalid requestor" }, 400);
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
      409,
    );
  }

  const connection = new Connection(getMainnetRpcUrl(), "confirmed");

  try {
    const tokenInfo = await connection.getAccountInfo(mintPublicKey);
    if (tokenInfo) {
      logger.log(`[search-token] Found token on mainnet`);
      return await processTokenInfo(
        c,
        mintPublicKey,
        tokenInfo,
        connection,
        requestor,
      );
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
      { filename: imageFilename, contentType, basePath: 'token-images' }
    );

    return c.json({ success: true, imageUrl });
  } catch (error) {
    console.error("Error uploading import image:", error);
    return c.json({ error: "Failed to upload image" }, 500);
  }
}

// Add the upload-import-image route to the router
tokenRouter.post("/upload-import-image", uploadImportImage);

export default tokenRouter;
