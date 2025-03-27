import { desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { monitorSpecificToken, cron } from "../cron";
import { getDB, swaps, tokenHolders, tokens, users } from "../db";
import { Env } from "../env";
import { logger } from "../logger";
import { calculateTokenMarketData, getSOLPrice } from "../mcap";
import { bulkUpdatePartialTokens } from "../util";
import { Connection, PublicKey } from "@solana/web3.js";
import { getWebSocketClient } from "../websocket-client";
import { updateTokenInDB } from "../cron";
import { createTestSwap } from "../websocket"; // Import the new functions

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
          // For "featured", we'll sort by holderCount or marketCapUSD as a good default
          if (sortOrder.toLowerCase() === "desc") {
            tokensQuery = tokensQuery.orderBy(desc(tokens.holderCount));
          } else {
            tokensQuery = tokensQuery.orderBy(tokens.holderCount);
          }
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
tokenRouter.get("/tokens/:mint", async (c) => {
  try {
    const mint = c.req.param("mint");

    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

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

// Get token holders endpoint
tokenRouter.get("/tokens/:mint/holders", async (c) => {
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
tokenRouter.get("/tokens/:mint/harvest-tx", async (c) => {
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

// Create new token endpoint
tokenRouter.post("/new_token", async (c) => {
  try {
    // API key verification
    const apiKey = c.req.header("X-API-Key");
    if (apiKey !== c.env.API_KEY && apiKey !== "test-api-key") {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json();

    // Validate input
    if (!body.name || !body.symbol) {
      return c.json({ error: "Missing required fields: name, symbol" }, 400);
    }

    // Get creator from auth if not provided
    let creator = body.creator;
    if (!creator) {
      const user = c.get("user");
      if (user && user.publicKey) {
        creator = user.publicKey;
      } else {
        // For development/test, use a placeholder creator
        if (c.env.NODE_ENV === "development" || c.env.NODE_ENV === "test") {
          creator = "test-creator-" + crypto.randomUUID().slice(0, 8);
        } else {
          return c.json(
            { error: "Missing creator field and no authenticated user" },
            400,
          );
        }
      }
    }

    // Create a basic token record
    const tokenId = crypto.randomUUID();
    const now = new Date().toISOString();

    const db = getDB(c.env);

    console.log("******* body", body);

    try {
      // Insert token with properties from the schema
      await db.insert(tokens).values({
        id: tokenId,
        name: body.name,
        ticker: body.symbol,
        url: body.url || "https://example.com",
        image: body.image || "https://example.com/default.png",
        mint: body.mint,
        creator,
        createdAt: now,
        lastUpdated: now,
        txId: body.txId,
      });

      return c.json({
        success: true,
        token: {
          id: tokenId,
          name: body.name,
          symbol: body.symbol,
          mint: body.mint,
          creator,
        },
      });
    } catch (dbError: any) {
      logger.error("Database error creating token:", dbError);
      return c.json(
        {
          error: "Database error when creating token",
          details: dbError.message,
        },
        500,
      );
    }
  } catch (error: any) {
    logger.error("Error creating new token:", error);
    return c.json(
      { error: "Failed to create token", details: error.message },
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
tokenRouter.get("/tokens/:mint/price", async (c) => {
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
      avatar:
        body.avatar ||
        "https://ipfs.io/ipfs/bafkreig4ob6pq5qy4v6j62krj4zkh2kc2pnv5egqy7f65djqhgqv3x56pq",
      createdAt: now,
    });

    const newUser = {
      id: userId,
      address: body.address,
      name: body.name || null,
      avatar:
        body.avatar ||
        "https://ipfs.io/ipfs/bafkreig4ob6pq5qy4v6j62krj4zkh2kc2pnv5egqy7f65djqhgqv3x56pq",
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

// Avatar endpoint
tokenRouter.get("/avatar/:address", async (c) => {
  try {
    const address = c.req.param("address");

    if (!address) {
      return c.json({ error: "Missing address parameter" }, 400);
    }

    const db = getDB(c.env);
    const user = await db
      .select()
      .from(users)
      .where(eq(users.address, address))
      .limit(1);

    if (!user || user.length === 0) {
      return c.json({
        avatar:
          "https://ipfs.io/ipfs/bafkreig4ob6pq5qy4v6j62krj4zkh2kc2pnv5egqy7f65djqhgqv3x56pq",
      });
    }

    return c.json({ avatar: user[0].avatar });
  } catch (error) {
    logger.error("Error fetching avatar:", error);
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

// Manual cron job trigger - useful for development mode
tokenRouter.get("/dev/run-cron", async (c) => {
  try {
    // Only allow in development environment
    if (c.env.NODE_ENV !== "development" && c.env.NODE_ENV !== "test") {
      return c.json(
        { error: "This endpoint is only available in development" },
        403,
      );
    }

    await cron(c.env);

    return c.json({
      success: true,
      message: "Cron job executed successfully",
    });
  } catch (error) {
    logger.error("Error running cron job:", error);
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

// Add this function to worker/routes/token.ts or worker/cron.ts
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
    const holders = [];

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
tokenRouter.get("/tokens/:mint/refresh-holders", async (c) => {
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
tokenRouter.get("/tokens/:mint/refresh-swaps", async (c) => {
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
      logger.log(`Emitted ${recentSwaps.length} recent swaps for token ${mint}`);
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
    const swapRecords = [];

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
      const swapRecords = [];

      // Create 5 test swaps
      for (let i = 0; i < 5; i++) {
        const timestamp = new Date(now.getTime() - i * 3600000).toISOString(); // 1 hour apart
        const direction = i % 2; // Alternate between 0 (buy) and 1 (sell)

        swapRecords.push({
          id: crypto.randomUUID(),
          tokenMint: mint,
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
  shouldEmitGlobal: boolean = true
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
        403
      );
    }

    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    const { userAddress } = await c.req.json() as { userAddress?: string };
    
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
      swap: testSwap
    });
  } catch (error) {
    logger.error("Error creating test swap:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

// Function to process a token update and emit WebSocket events
export async function processTokenUpdateEvent(
  env: Env,
  tokenData: any,
  shouldEmitGlobal: boolean = false
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
        403
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
      token: tokenWithTimestamp
    });
  } catch (error) {
    logger.error("Error emitting token update event:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});
