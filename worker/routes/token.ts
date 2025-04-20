import { Connection, PublicKey } from "@solana/web3.js";
import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { updateTokens } from "../cron";
import { getDB, tokenAgents, tokenHolders, tokens } from "../db";
import { Env } from "../env";
import { ExternalToken } from "../externalToken";
import { logger } from "../util";
import { getSOLPrice } from "../mcap";
import {
  applyFeaturedSort,
  checkBlockchainTokenBalance,
  getFeaturedMaxValues,
  getFeaturedScoreExpression,
  processTokenInfo,
  processTokenUpdateEvent,
  updateHoldersCache,
} from "../util";
import { generateAdditionalTokenImages } from "./generation";

// Define the router with environment typing
const tokenRouter = new Hono<{
  Bindings: Env;
  Variables: {
    user?: { publicKey: string } | null;
  };
}>();

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

    // Check if this is a special generation image request
    // Format: generation-[mint]-[number].jpg
    const generationMatch = filename.match(
      /^generation-([A-Za-z0-9]{32,44})-([1-9][0-9]*)\.jpg$/,
    );

    let imageKey;
    if (generationMatch) {
      const [_, mint, number] = generationMatch;
      // This is a special request for a generation image
      imageKey = `generations/${mint}/gen-${number}.jpg`;
      logger.log(
        `[/image/:filename] Detected generation image request: ${imageKey}`,
      );
    } else {
      // Regular image request
      imageKey = `token-images/${filename}`;
    }

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
        const prefix = imageKey.split("/")[0] + "/";
        const objects = await c.env.R2.list({
          prefix,
          limit: 10,
        });
        logger.log(
          `[/image/:filename] Files in ${prefix} directory: ${objects.objects.map((o) => o.key).join(", ")}`,
        );
      } catch (listError) {
        logger.error(
          `[/image/:filename] Error listing files in directory: ${listError}`,
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

tokenRouter.get("/tokens", async (c) => {
  try {
    const queryParams = c.req.query();
    const isSearching = !!queryParams.search;

    const limit = isSearching ? 5 : parseInt(queryParams.limit as string) || 50;
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

    const shouldHideImported = queryParams.hideImported
      ? Number(queryParams.hideImported) === 1
      : false;

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

        tokensQuery = tokensQuery.where(sql`${tokens.image} != ''`);

        if (creator) {
          tokensQuery = tokensQuery.where(eq(tokens.creator, creator));
        }

        if (shouldHideImported) {
          tokensQuery = tokensQuery.where(sql`${tokens.imported} != 1`);
        }

        console.log("shouldHideImported? ", shouldHideImported);

        // By default, don't show hidden tokens
        tokensQuery = tokensQuery.where(sql`(${tokens.hidden} != 1)`);

        const validSortColumns = {
          marketCapUSD: tokens.marketCapUSD,
          createdAt: tokens.createdAt,
          holderCount: tokens.holderCount,
          tokenPriceUSD: tokens.tokenPriceUSD,
          name: tokens.name,
          ticker: tokens.ticker,
          volume24h: tokens.volume24h,
          curveProgress: tokens.curveProgress,
          featured: tokens.featured,
        };

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
          /** If tokens have featured, they should appear first */
          // tokensQuery = tokensQuery.orderBy(desc(tokens.featured));

          // // Apply the weighted sort with the max values
          tokensQuery = applyFeaturedSort(
            tokensQuery,
            maxVolume,
            maxHolders,
            sortOrder,
          );
        } else {
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

      // By default, don't count hidden tokens
      finalQuery = countQuery.where(
        sql`(${tokens.hidden} = 0 OR ${tokens.hidden} IS NULL)`,
      );

      // Ensure tokens without images are also excluded from the count
      finalQuery = finalQuery.where(sql`${tokens.image} != ''`);

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

    let featuredTokens: any = [];
    if (sortBy === "featured" && page === 1) {
      featuredTokens = await db
        .select()
        .from(tokens)
        .where(and(eq(tokens.featured, 1), eq(tokens.hidden, 0)))
        .orderBy(desc(tokens.marketCapUSD));
    }

    const featuredLength = featuredTokens?.length || 0;
    const returnTokens: typeof tokensResult = [];

    // Add featured tokens first if they exist
    if (featuredTokens && featuredTokens.length > 0) {
      returnTokens.push(...featuredTokens);
    }

    // Filter out tokens that are already in featuredTokens
    if (tokensResult && tokensResult.length > 0) {
      const filteredTokens =
        featuredTokens && featuredTokens.length > 0
          ? tokensResult.filter(
              (token) =>
                !featuredTokens.some(
                  (featured) => featured.mint === token.mint,
                ),
            )
          : tokensResult;

      // Add filtered tokens up to the limit
      const remainingSpace = limit - featuredLength;
      if (remainingSpace > 0) {
        returnTokens.push(...filteredTokens.slice(0, remainingSpace));
      }
    }

    return c.json({
      tokens: returnTokens,
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

/**
 * used for importing tokens
 * will only search in mainnet because it's easier to test popular solana tokens that way.
 * we don't want to accidentally import devnet tokens into our system
 */
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

  const connection = new Connection(c.env.MAINNET_SOLANA_RPC_URL, "confirmed");

  // Try to find the token on mainnet
  try {
    const tokenInfo = await connection.getAccountInfo(mintPublicKey);
    if (tokenInfo) {
      logger.log(
        `[search-token] Found token on primary network (${c.env.NETWORK || "default"})`,
      );
      // Continue with the token info we found
      return await processTokenInfo(
        c,
        mintPublicKey,
        tokenInfo,
        connection,
        requestor,
      );
    }
  } catch (error) {
    logger.error(`[search-token] Error checking primary network: ${error}`);
  }
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

    const db = getDB(c.env);

    // Get holders from database directly
    // const holders = await db
    //   .select()
    //   .from(tokenHolders)
    //   .where(eq(tokenHolders.mint, mint))
    //   .orderBy(desc(tokenHolders.amount));

    const holders = await db
      .select()
      .from(tokenHolders)
      .where(
        sql`
    (${tokenHolders.mint} = ${mint}) AND
    (${tokenHolders.lastUpdated}, ${tokenHolders.mint}, ${tokenHolders.address}) IN (
      SELECT MAX(${tokenHolders.lastUpdated}), ${tokenHolders.mint}, ${tokenHolders.address}
      FROM ${tokenHolders}
      WHERE ${tokenHolders.mint} = ${mint}
      GROUP BY ${tokenHolders.mint}, ${tokenHolders.address}
    )`,
      )
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

tokenRouter.get("/token/:mint", async (c) => {
  console.log("token/:mint");
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
    const token = tokenData[0];

    if (!tokenData || tokenData.length === 0) {
      return c.json({ error: "Token not found", mint }, 404);
    }

    // Get fresh SOL price
    const solPrice = await getSOLPrice(c.env);

    /**
     * Use DB as source of truth for imported tokens since we have
     * fetched and stored all the market data. we don't need to calculate
     * anything based on our program variables.
     */
    if (Number(token.imported) === 1) {
      const updatedToken = await db
        .update(tokens)
        .set({
          solPriceUSD: solPrice,
          currentPrice: (token.tokenPriceUSD || 0) / solPrice,
          marketCapUSD:
            (token.tokenPriceUSD || 0) * (token.tokenSupplyUiAmount || 0),
        })
        .where(eq(tokens.mint, mint))
        .returning();
      return c.json(updatedToken[0]);
    }

    // Check for additional images and generate if needed
    // This will run in the background without delaying the response
    if (Number(token.imported) === 0) {
      try {
        // Check if generation images exist
        const generationImagesPrefix = `generations/${mint}/`;
        let hasGenerationImages = false;

        if (c.env.R2) {
          const objects = await c.env.R2.list({
            prefix: generationImagesPrefix,
            limit: 1,
          });

          hasGenerationImages = objects.objects.length > 0;
          logger.log(
            `Token ${mint} has generation images: ${hasGenerationImages}`,
          );

          if (!hasGenerationImages) {
            // Generate additional images in the background
            c.executionCtx.waitUntil(
              generateAdditionalTokenImages(
                c.env,
                mint,
                token.description || "",
              ),
            );
            logger.log(
              `Initiated background generation of additional images for token ${mint}`,
            );
          }
        }
      } catch (imageCheckError) {
        logger.error(
          `Error checking for generation images: ${imageCheckError}`,
        );
        // Don't block the response if this check fails
      }
    }

    // Only refresh holder data if explicitly requested
    // const refreshHolders = c.req.query("refresh_holders") === "true";
    // if (refreshHolders) {
    const imported = Number(token.imported) === 1;
    logger.log(`Refreshing holders data for token ${mint}`);
    // c.executionCtx.waitUntil(updateHoldersCache(c.env, mint, imported));
    // }

    // Set default values for critical fields if they're missing
    const TOKEN_DECIMALS = token.tokenDecimals || 6;
    const defaultReserveAmount = 1000000000000; // 1 trillion (default token supply)
    const defaultReserveLamport = Number(c.env.VIRTUAL_RESERVES || 28000000000); // 2.8 SOL (default reserve / 28 in mainnet)

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

    // const tokenMarketData = await calculateTokenMarketData(token, solPrice, c.env);

    // Update solPriceUSD
    token.solPriceUSD = solPrice;

    // Calculate or update marketCapUSD if we have tokenPriceUSD
    token.marketCapUSD = token.tokenPriceUSD * (token.tokenSupplyUiAmount || 0);

    // Get virtualReserves and curveLimit from env or set defaults
    const virtualReserves = c.env.VIRTUAL_RESERVES
      ? Number(c.env.VIRTUAL_RESERVES)
      : 28000000000;
    const curveLimit = c.env.CURVE_LIMIT
      ? Number(c.env.CURVE_LIMIT)
      : 113000000000;

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

    console.log("currentPrice", token.currentPrice);
    console.log("tokenPriceUSD", token.tokenPriceUSD);
    console.log("marketCapUSD", token.marketCapUSD);

    // Format response with additional data
    return c.json(token);
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
      imageUrl,
      metadataUrl,
      imported,
      creator,
    } = body;

    const mintAddress = tokenMint || mint;
    if (!mintAddress) {
      return c.json({ error: "Token mint address is required" }, 400);
    }

    logger.log(`Creating token record for: ${mintAddress}`);

    const db = getDB(c.env);

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
      // Create token data with all required fields from the token schema
      const now = new Date().toISOString();
      const tokenId = crypto.randomUUID();
      console.log("****** imported ******\n", imported);

      // Convert imported to number (1 for true, 0 for false)
      const importedValue = imported === true ? 1 : 0;

      // Insert with all required fields from the schema
      await db.insert(tokens).values({
        id: tokenId,
        mint: mintAddress,
        name: name || `Token ${mintAddress.slice(0, 8)}`,
        ticker: symbol || "TOKEN",
        url: metadataUrl || "",
        image: imageUrl || "",
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
      });

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
      c.executionCtx.waitUntil(updateTokens(c.env));

      if (imported) {
        const importedToken = new ExternalToken(c.env, mintAddress);
        const { marketData } = await importedToken.registerWebhook();
        // Fetch historical data in the background
        c.executionCtx.waitUntil(importedToken.fetchHistoricalSwapData());
        // Merge any immediately available market data
        Object.assign(tokenData, marketData.newTokenData);
      }

      // For non-imported tokens, generate additional images in the background
      logger.log(
        `Triggering background image generation for new token: ${mintAddress}`,
      );
      c.executionCtx.waitUntil(
        generateAdditionalTokenImages(c.env, mintAddress, description || ""),
      );

      return c.json({ success: true, token: tokenData });
    } catch (error) {
      logger.error("Error creating token:", error);
      return c.json(
        { error: "Failed to create token record", details: error },
        500,
      );
    }
  } catch (error) {
    logger.error("Error in create-token endpoint:", error);
    return c.json({ error: "Internal server error", details: error }, 500);
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
    const imported = Number(c.req.query("imported") || 0) === 1;
    const holderCount = await updateHoldersCache(c.env, mint, imported);

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
        farcaster: body.farcaster ?? tokenData[0].farcaster,
        lastUpdated: new Date().toISOString(),
      })
      .where(eq(tokens.mint, mint));

    logger.log("Token updated successfully");
    if (tokenData[0]?.imported === 0) {
      try {
        // 1) fetch the existing JSON
        const originalUrl = tokenData[0].url;
        if (originalUrl) {
          const url = new URL(originalUrl);
          const parts = url.pathname.split("/");
          // grab only the filename portion
          const filename = parts.pop();
          if (!filename) throw new Error("Could not parse metadata filename");
          const objectKey = `token-metadata/${filename}`;
          // 2) Fetch
          const res = await fetch(originalUrl);
          const json = await res.json();
          json.properties = json.properties || {};
          json.properties.website = body.website ?? json.properties.website;
          json.properties.twitter = body.twitter ?? json.properties.twitter;
          json.properties.telegram = body.telegram ?? json.properties.telegram;
          json.properties.discord = body.discord ?? json.properties.discord;
          json.properties.farcaster =
            body.farcaster ?? json.properties.farcaster;
          // const stored = await c.env.R2.get(objectKey);

          // 3) Serialize back to an ArrayBuffer
          const buf = new TextEncoder().encode(JSON.stringify(json))
            .buffer as ArrayBuffer;

          // 4) Overwrite the same key in R2
          await c.env.R2.put(objectKey, buf, {
            httpMetadata: { contentType: "application/json" },
            customMetadata: { publicAccess: "true" },
          });

          logger.log(
            `Overwrote R2 object at key ${objectKey}; URL remains ${originalUrl}`,
          );
        }
      } catch (e) {
        logger.error("Failed to re‑upload metadata JSON:", e);
      }
    }
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
                  twitterImageUrl = `${c.env.API_URL}/api/twitter-image/${imageId}`;
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

// Check for generated images on a token by mint address in R2
tokenRouter.get("/check-generated-images/:mint", async (c) => {
  try {
    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    if (!c.env.R2) {
      logger.error("R2 storage is not available");
      return c.json({ images: [] }, 200); // Return empty list if R2 not available
    }

    // Check for generated images in R2
    const generationImagesPrefix = `generations/${mint}/`;
    logger.log(
      `Checking for generated images with prefix: ${generationImagesPrefix}`,
    );

    // Try to list objects with the given prefix
    try {
      const objects = await c.env.R2.list({
        prefix: generationImagesPrefix,
        limit: 10, // Reasonable limit
      });

      // Extract the filenames from the full paths
      const imageKeys = objects.objects.map((obj) => {
        const parts = obj.key.split("/");
        return parts[parts.length - 1]; // Get just the filename
      });

      logger.log(
        `Found ${imageKeys.length} generated images for token ${mint}`,
      );

      // For security, we don't return the full image keys but just the existence
      // and let the frontend construct URLs based on naming conventions
      return c.json({
        success: true,
        hasImages: imageKeys.length > 0,
        count: imageKeys.length,
        pattern:
          imageKeys.length > 0
            ? `generations/${mint}/gen-[1-${imageKeys.length}].jpg`
            : null,
      });
    } catch (error) {
      logger.error(`Error listing generated images: ${error}`);
      return c.json({
        success: false,
        hasImages: false,
        error: "Failed to list generated images",
      });
    }
  } catch (error) {
    logger.error(`Error checking generated images: ${error}`);
    return c.json(
      {
        success: false,
        hasImages: false,
        error: "Server error",
      },
      500,
    );
  }
});

export default tokenRouter;
