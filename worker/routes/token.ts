import { Connection, PublicKey } from "@solana/web3.js";
import { desc, eq, sql, and } from "drizzle-orm";
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
} from "../db";
import { Env } from "../env";
import { logger } from "../logger";
import { getSOLPrice } from "../mcap";
import { getRpcUrl, applyFeaturedSort, getFeaturedMaxValues } from "../util";
import { createTestSwap } from "../websocket"; // Import only createTestSwap
import { getWebSocketClient } from "../websocket-client";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  AccountInfo,
} from "@solana/web3.js";

// Define the router with environment typing
const tokenRouter = new Hono<{
  Bindings: Env;
  Variables: {
    user?: { publicKey: string } | null;
  };
}>();

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
    const sortBy = (queryParams.sortBy as string) || "createdAt";
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

    // Prepare a basic query
    const tokenQuery = async () => {
      try {
        // Start with a basic query
        let tokensQuery = db.select().from(tokens) as any;

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
          // Get max values for normalization first
          const { maxVolume, maxHolders } = await getFeaturedMaxValues(db);
          
          // Apply the weighted sort with the max values (no await)
          // Use method chaining to preserve the query builder's type
          tokensQuery = applyFeaturedSort(tokensQuery, maxVolume, maxHolders, sortOrder);
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

// Get specific token via mint id
tokenRouter.get("/token/:mint", async (c) => {
  try {
    const mint = c.req.param("mint");

    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    console.log("GETTING DB");

    // In test environment, return real errors instead of mocked responses
    const db = getDB(c.env);

    // Get real token data from the database
    const tokenData = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    if (!tokenData || tokenData.length === 0) {
      return c.json({ error: "Token not found" }, 404);
    }

    // Only refresh holder data if explicitly requested
    const refreshHolders = c.req.query("refresh_holders") === "true";
    if (refreshHolders) {
      logger.log(`Refreshing holders data for token ${mint}`);
      await updateHoldersCache(c.env, mint);
    }

    // Get fresh SOL price
    const solPrice = await getSOLPrice(c.env);
    const token = tokenData[0];

    // Set default values for critical fields if they're missing
    const TOKEN_DECIMALS = Number(c.env.DECIMALS || 6);

    // Make sure reserveAmount and reserveLamport have values
    token.reserveAmount = token.reserveAmount || Number(c.env.TOKEN_SUPPLY);
    token.reserveLamport = token.reserveLamport || Number(c.env.VIRTUAL_RESERVES);

    // Update or set default values for missing fields
    if (!token.currentPrice && token.reserveAmount && token.reserveLamport) {
      token.currentPrice =
        Number(token.reserveLamport) /
        1e9 /
        (Number(token.reserveAmount) / Math.pow(10, TOKEN_DECIMALS));
    }

    console.log(token);

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

    // Calculate marketCapUSD
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

    // Calculate curveProgress using the original formula
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

    token.holderCount = holdersCountQuery[0]?.count || 0;

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

    // Matching the same response as /token/:mint
    return c.json({
      ...token,
      latestSwap,
    });
  } catch (error) {
    logger.error("Error fetching token:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
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
        existingToken[0].image === "" &&
        existingToken[0].url === ""
      ) {
        await db
          .update(tokens)
          .set({
            image: imageUrl || "",
            url: metadataUrl || "",
            lastUpdated: new Date().toISOString(),
          })
          .where(eq(tokens.mint, tokenMint));

        logger.log(`Updated image and metadata URLs for token ${tokenMint}`);

        // Return the updated token
        const updatedToken = {
          ...existingToken[0],
          image: imageUrl || existingToken[0].image,
          url: metadataUrl || existingToken[0].url,
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

// Add direct token creation endpoint
tokenRouter.post("/create-token", async (c) => {
  console.log("****** create-token ******\n");
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
      name,
      symbol,
      txId,
      description,
      twitter,
      telegram,
      website,
      discord,
      agentLink,
      imageUrl,
      metadataUrl,
    } = body;

    if (!tokenMint) {
      return c.json({ error: "Token mint address is required" }, 400);
    }

    logger.log(`Creating token record for: ${tokenMint}`);

    const db = getDB(c.env);

    // Check if token already exists
    const existingToken = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, tokenMint))
      .limit(1);

    if (existingToken && existingToken.length > 0) {
      logger.log(`Token ${tokenMint} already exists in database`);
      return c.json({
        success: true,
        tokenFound: true,
        message: "Token already exists in database",
        token: existingToken[0],
      });
    }

    try {
      // Create token data with all required fields from the token schema
      const now = new Date().toISOString();
      const tokenId = crypto.randomUUID();

      // Insert with all required fields from the schema
      await db.insert(tokens).values({
        id: tokenId,
        mint: tokenMint,
        name: name || `Token ${tokenMint.slice(0, 8)}`,
        ticker: symbol || "TOKEN",
        url: metadataUrl || "", // Use metadataUrl if provided
        image: imageUrl || "", // Use imageUrl if provided
        description: description || "",
        twitter: twitter || "",
        telegram: telegram || "",
        website: website || "",
        discord: discord || "",
        creator: user.publicKey || "unknown",
        status: "active",
        tokenPriceUSD: 0,
        createdAt: now,
        lastUpdated: now,
        txId: txId || "",
      });

      // For response, include just what we need
      const tokenData = {
        id: tokenId,
        mint: tokenMint,
        name: name || `Token ${tokenMint.slice(0, 8)}`,
        ticker: symbol || "TOKEN",
        description: description || "",
        twitter: twitter || "",
        telegram: telegram || "",
        website: website || "",
        discord: discord || "",
        agentLink: agentLink || "",
        creator: user.publicKey || "unknown",
        status: "active",
        url: metadataUrl || "",
        image: imageUrl || "",
        createdAt: now,
      };

      // Emit WebSocket event
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

      return c.json({
        success: true,
        token: tokenData,
        message: "Token created successfully",
      });
    } catch (dbError) {
      logger.error(`Database error creating token: ${dbError}`);
      return c.json(
        {
          success: false,
          error: "Failed to create token in database",
          details:
            dbError instanceof Error
              ? dbError.message
              : "Unknown database error",
        },
        500,
      );
    }
  } catch (error) {
    logger.error("Error creating token:", error);
    return c.json(
      {
        success: false,
        error: "Failed to create token",
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
    const connection = new Connection(
      (env.NETWORK === "devnet"
        ? env.DEVNET_SOLANA_RPC_URL
        : env.MAINNET_SOLANA_RPC_URL) || "https://api.devnet.solana.com",
    );
    const db = getDB(env);

    // Get all token accounts for this mint
    let largestAccounts;
    try {
      largestAccounts = await connection.getTokenLargestAccounts(
        new PublicKey(mint),
      );
    } catch (error: any) {
      // If we get rate limited, wait and retry once
      if (error.toString().includes("429")) {
        logger.warn(
          `Rate limited when fetching token accounts for ${mint}, retrying after delay...`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
        largestAccounts = await connection.getTokenLargestAccounts(
          new PublicKey(mint),
        );
      } else {
        throw error;
      }
    }

    if (!largestAccounts.value || largestAccounts.value.length === 0) {
      logger.log(`No accounts found for token ${mint}`);
      return 0;
    }

    // Calculate total supply from all accounts
    const totalSupply = largestAccounts.value.reduce(
      (sum, account) => sum + Number(account.amount),
      0,
    );

    // Create an array to store holder records
    const holders: TokenHolder[] = [];

    // Process each account - get owner and details
    for (const account of largestAccounts.value) {
      if (Number(account.amount) === 0) continue;

      try {
        // Add a small delay between requests to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 200));

        const accountInfo = await connection.getParsedAccountInfo(
          account.address,
        );
        // Skip if account not found
        if (!accountInfo.value) continue;

        const parsedData = accountInfo.value.data as any;
        if (!parsedData.parsed?.info?.owner) continue;

        const owner = parsedData.parsed.info.owner;

        holders.push({
          id: crypto.randomUUID(),
          mint,
          address: owner,
          amount: Number(account.amount),
          percentage: (Number(account.amount) / totalSupply) * 100,
          lastUpdated: new Date().toISOString(),
        });
      } catch (error: any) {
        logger.error(
          `Error processing account ${account.address.toString()}:`,
          error,
        );
        // Continue with other accounts even if one fails
        continue;
      }
    }

    // Clear existing holders and insert new ones
    await db.delete(tokenHolders).where(eq(tokenHolders.mint, mint));

    if (holders.length > 0) {
      // Insert in batches to avoid overwhelming the database
      for (let i = 0; i < holders.length; i += 50) {
        const batch = holders.slice(i, i + 50);
        await db.insert(tokenHolders).values(batch);
      }
    }

    // Update token holder count
    await db
      .update(tokens)
      .set({
        holderCount: holders.length,
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
          holderCount: holders.length,
          timestamp: new Date().toISOString(),
        });

        logger.log(`Emitted holder update event for token ${mint}`);
      }
    } catch (wsError) {
      // Don't fail if WebSocket fails
      logger.error(`WebSocket error when emitting holder update: ${wsError}`);
    }

    return holders.length;
  } catch (error) {
    logger.error(`Error updating holders for token ${mint}:`, error);
    return 0;
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

    logger.log(
      `Refreshing holders data for token ${mint} requested by ${user.publicKey}`,
    );

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

    logger.log(
      `Refreshing swap data for token ${mint} requested by ${user.publicKey}`,
    );

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
      logger.log(
        `Emitted ${recentSwaps.length} recent swaps for token ${mint}`,
      );
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

    logger.log(`Adding test holder data for token ${mint}`);

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

    logger.log(`Checking holder data in database for token ${mint}`);

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

    logger.log(`Adding all test data for token ${mint}`);

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
        address: "DvmXXp4tSXYwZJhM5HjtEUvQ6SfxwkA7daE1jQgCX1ri", // Example address
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

    logger.log(`Checking swap data in database for token ${mint}`);

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
  console.log("******* swaps endpoint called for mint:", c.req.param("mint"));
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

    console.log(`Found ${swapsResult.length} swaps for mint ${mint}`);
    if (swapsResult.length > 0) {
      console.log("Sample swap data:", swapsResult[0]);
    }

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

    console.log(`Returning response with ${formattedSwaps.length} swaps`);
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
  console.log(
    "******* api/swaps endpoint called for mint:",
    c.req.param("mint"),
  );
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

    console.log(
      `Found ${swapsResult.length} swaps for mint ${mint} in api/swaps endpoint`,
    );
    if (swapsResult.length > 0) {
      console.log("Sample swap data:", swapsResult[0]);
    }

    // If no swaps found and we're in dev mode, create some test data
    if (
      swapsResult.length === 0 &&
      (c.env.NODE_ENV === "development" || c.env.NODE_ENV === "test")
    ) {
      console.log("No swaps found in api/swaps, adding test data");

      // Create mock swap data with exact fields expected by frontend
      const now = new Date();
      const swapRecords: Swap[] = [];

      // Create 5 test swaps
      for (let i = 0; i < 5; i++) {
        const timestamp = new Date(now.getTime() - i * 3600000).toISOString(); // 1 hour apart
        const direction = i % 2; // Alternate between 0 (buy) and 1 (sell)

        swapRecords.push({
          id: crypto.randomUUID(),
          tokenMint: mint,
          priceImpact: 0,
          user: "DvmXXp4tSXYwZJhM5HjtEUvQ6SfxwkA7daE1jQgCX1ri", // Example user
          type: direction === 0 ? "buy" : "sell", // Add type field to fix linter error
          direction: direction,
          amountIn: 2000000000 + Math.random() * 1000000000, // Random amount (2-3 SOL)
          amountOut: 5000000000 + Math.random() * 2000000000, // Random amount (5-7 tokens)
          price: 0.0001 + Math.random() * 0.0001,
          txId: `test-tx-${i}-${crypto.randomUUID().slice(0, 8)}`,
          timestamp: timestamp,
        });
      }

      // Insert test swaps
      try {
        await db.insert(swaps).values(swapRecords);
        console.log("Added test swap data in api/swaps endpoint");

        // Return the newly added data
        return c.json({
          swaps: swapRecords.map((swap) => ({
            ...swap,
            directionText: swap.direction === 0 ? "buy" : "sell",
          })),
          page: 1,
          totalPages: 1,
          total: swapRecords.length,
        });
      } catch (err) {
        console.error("Error adding test swaps:", err);
      }
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
      // Create a new object with exactly the expected fields
      return {
        txId: typeof swap.txId === "string" ? swap.txId : "", // Must be string
        timestamp:
          typeof swap.timestamp === "string"
            ? swap.timestamp
            : new Date().toISOString(), // Must be string in ISO format
        user: typeof swap.user === "string" ? swap.user : "", // Must be string
        direction: typeof swap.direction === "number" ? swap.direction : 0, // Must be 0 or 1
        amountIn: typeof swap.amountIn === "number" ? swap.amountIn : 0, // Must be number
        amountOut: typeof swap.amountOut === "number" ? swap.amountOut : 0, // Must be number
        // These extra fields won't affect validation
        directionText: swap.direction === 0 ? "buy" : "sell",
      };
    });

    const response = {
      swaps: formattedSwaps,
      page,
      totalPages,
      total: totalSwaps,
    };

    console.log(
      `Returning response with ${formattedSwaps.length} swaps from api/swaps endpoint`,
    );
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

    // Emit to token-specific room
    await wsClient.emit(`token-${swap.tokenMint}`, "newSwap", swap);
    logger.log(`Emitted swap event for token ${swap.tokenMint}`);

    // Optionally emit to global room for activity feed
    if (shouldEmitGlobal) {
      await wsClient.emit("global", "newSwap", swap);
      logger.log("Emitted swap event to global feed");
    }

    return;
  } catch (error) {
    logger.error("Error processing swap event:", error);
    throw error;
  }
}

// Add endpoint to create a test swap for WebSocket testing
tokenRouter.post("/dev/create-test-swap/:mint", async (c) => {
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

    const { userAddress } = (await c.req.json()) as { userAddress?: string };

    // Create a test swap
    const testSwap = createTestSwap(mint, userAddress);

    // Get DB connection
    const db = getDB(c.env);

    // Save the test swap to the database
    await db.insert(swaps).values(testSwap);

    // Emit WebSocket events
    await processSwapEvent(c.env, testSwap);

    return c.json({
      success: true,
      message: "Test swap created and WebSocket event emitted",
      swap: testSwap,
    });
  } catch (error) {
    logger.error("Error creating test swap:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

// Function to process a token update and emit WebSocket events
export async function processTokenUpdateEvent(
  env: Env,
  tokenData: any,
  shouldEmitGlobal: boolean = false,
): Promise<void> {
  try {
    // Get WebSocket client
    const wsClient = getWebSocketClient(env);

    // Always emit to token-specific room
    await wsClient.emit(`token-${tokenData.mint}`, "updateToken", tokenData);
    logger.log(`Emitted token update event for ${tokenData.mint}`);

    // Optionally emit to global room for activity feed
    if (shouldEmitGlobal) {
      await wsClient.emit("global", "updateToken", {
        ...tokenData,
        timestamp: new Date(),
      });
      logger.log("Emitted token update event to global feed");
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
      return c.json({
        balance: 0,
        percentage: 0,
        isCreator: true,
        mint,
        address,
      });
    } else if (isLocalMode || (c.env as any).LOCAL_DEV === "true") {
      // In local mode or with LOCAL_DEV enabled, check blockchain even if not in holders table
      logger.log(
        `User ${address} not in holders table, but in local/dev mode, trying blockchain lookup`,
      );
      return await checkBlockchainTokenBalance(c, mint, address, isLocalMode);
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
  try {
    // Initialize return data
    let balance = 0;
    let foundNetwork = ""; // Renamed to avoid confusion with loop variable

    // Import the functions to get both mainnet and devnet RPC URLs
    const { getMainnetRpcUrl, getDevnetRpcUrl } = await import("../util");

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
              const accountInfo =
                await connection.getTokenAccountBalance(pubkey);
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
  } catch (error) {
    logger.error(`Error in blockchain token balance check: ${error}`);
    return c.json({
      balance: 0,
      percentage: 0,
      isCreator: false,
      mint,
      address,
      error: error.message,
    });
  }
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
