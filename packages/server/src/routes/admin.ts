import { PutObjectCommand } from "@aws-sdk/client-s3";
import { and, count, desc, eq, or, sql, SQL } from "drizzle-orm";
import { PgSelect } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import { Buffer } from "node:buffer";
import { getDB, Token, tokens, users } from "../db";
import { logger } from "../logger";
import { getS3Client } from "../s3Client"; // Import shared S3 client
import { applyFeaturedSort, getFeaturedMaxValues } from "../util";
import { adminAddresses } from "./adminAddresses";
import { uploadToStorage } from "./files";

// Define the router with environment typing
const adminRouter = new Hono<{
  Variables: {
    user?: { publicKey: string } | null;
  };
}>();

// Middleware to check if user has admin privileges
const requireAdmin = async (c: any, next: Function) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const isAdmin = adminAddresses.includes(user.publicKey);
  if (!isAdmin) {
    return c.json({ error: "Admin privileges required" }, 403);
  }

  logger.info(`Admin access being used by: ${user.publicKey}`);
  await next();
};

// New middleware that checks for admin OR moderator status
const requireAdminOrModerator = async (c: any, next: Function) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const isAdmin = adminAddresses.includes(user.publicKey);

  if (isAdmin) {
    // Set a context variable to indicate this is a full admin
    c.set("isFullAdmin", true);
    logger.info(`Admin access being used by: ${user.publicKey}`);

    await next();
    return;
  }

  // Check if user is a moderator
  const db = getDB();
  const moderatorCheck = await db
    .select({ isModerator: users.isModerator })
    .from(users)
    .where(eq(users.address, user.publicKey))
    .limit(1);

  const isModerator =
    moderatorCheck.length > 0 && moderatorCheck[0].isModerator === 1;

  if (!isModerator) {
    return c.json({ error: "Admin or moderator privileges required" }, 403);
  }

  logger.info(`Moderator access being used by: ${user.publicKey}`)

  // Mark this user as a moderator but not a full admin
  c.set("isFullAdmin", false);
  await next();
};

// Route to update a token's social links
adminRouter.post("/tokens/:mint/social", requireAdminOrModerator, async (c) => {
  try {
    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    const body = await c.req.json();
    const { twitter, telegram, discord, website, farcaster } = body;

    const db = getDB();

    // Check if token exists
    const tokenData = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    if (!tokenData || tokenData.length === 0) {
      return c.json({ error: "Token not found" }, 400);
    }

    // Update token with the new social links
    await db
      .update(tokens)
      .set({
        twitter: twitter ?? tokenData[0].twitter,
        telegram: telegram ?? tokenData[0].telegram,
        discord: discord ?? tokenData[0].discord,
        website: website ?? tokenData[0].website,
        farcaster: farcaster ?? tokenData[0].farcaster,
        lastUpdated: new Date(),
      })
      .where(eq(tokens.mint, mint));

    logger.log(`Admin updated social links for token ${mint}`);

    // Get the updated token data
    const updatedToken = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    return c.json({
      success: true,
      message: "Token social links updated successfully",
      token: updatedToken[0],
    });
  } catch (error) {
    logger.error("Error updating token social links:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

// Route to set featured flag on tokens
adminRouter.post(
  "/tokens/:mint/featured",
  requireAdminOrModerator,
  async (c) => {
    try {
      const mint = c.req.param("mint");
      if (!mint || mint.length < 32 || mint.length > 44) {
        return c.json({ error: "Invalid mint address" }, 400);
      }

      const body = await c.req.json();
      const { featured } = body;

      if (featured === undefined || typeof featured !== "boolean") {
        return c.json({ error: "Featured flag must be a boolean" }, 400);
      }

      const db = getDB();

      // Check if token exists
      const tokenData = await db
        .select()
        .from(tokens)
        .where(eq(tokens.mint, mint))
        .limit(1);

      if (!tokenData || tokenData.length === 0) {
        return c.json({ error: "Token not found" }, 404);
      }

      await db
        .update(tokens)
        .set({
          featured: featured ? 1 : 0,
          lastUpdated: new Date(),
        })
        .where(eq(tokens.mint, mint));

      logger.log(`Admin set featured flag to ${featured} for token ${mint}`);

      // Get the updated token data
      const updatedToken = await db
        .select()
        .from(tokens)
        .where(eq(tokens.mint, mint))
        .limit(1);

      return c.json({
        success: true,
        message: `Token featured flag set to ${featured}`,
        token: updatedToken[0],
      });
    } catch (error) {
      logger.error("Error setting token featured flag:", error);
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  }
);

// Route to set verified flag on tokens
adminRouter.post(
  "/tokens/:mint/verified",
  requireAdminOrModerator,
  async (c) => {
    try {
      const mint = c.req.param("mint");
      if (!mint || mint.length < 32 || mint.length > 44) {
        return c.json({ error: "Invalid mint address" }, 400);
      }

      const body = await c.req.json();
      const { verified } = body;

      if (verified === undefined || typeof verified !== "boolean") {
        return c.json({ error: "Verified flag must be a boolean" }, 400);
      }

      const db = getDB();

      // Check if token exists
      const tokenData = await db
        .select()
        .from(tokens)
        .where(eq(tokens.mint, mint))
        .limit(1);

      if (!tokenData || tokenData.length === 0) {
        return c.json({ error: "Token not found" }, 404);
      }

      await db
        .update(tokens)
        .set({
          verified: verified ? 1 : 0,
          lastUpdated: new Date(),
        })
        .where(eq(tokens.mint, mint));

      logger.log(`Admin set verified flag to ${verified} for token ${mint}`);

      // Get the updated token data
      const updatedToken = await db
        .select()
        .from(tokens)
        .where(eq(tokens.mint, mint))
        .limit(1);

      return c.json({
        success: true,
        message: `Token verified flag set to ${verified}`,
        token: updatedToken[0],
      });
    } catch (error) {
      logger.error("Error setting token verified flag:", error);
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  }
);

// Route to set hidden flag on tokens
adminRouter.post("/tokens/:mint/hidden", requireAdminOrModerator, async (c) => {
  try {
    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    const body = await c.req.json();
    const { hidden } = body;

    if (hidden === undefined || typeof hidden !== "boolean") {
      return c.json({ error: "Hidden flag must be a boolean" }, 400);
    }

    const db = getDB();

    // Check if token exists
    const tokenData = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    if (!tokenData || tokenData.length === 0) {
      return c.json({ error: "Token not found" }, 404);
    }

    // Update the hidden field directly
    await db
      .update(tokens)
      .set({
        hidden: hidden ? 1 : 0,
        lastUpdated: new Date(),
      })
      .where(eq(tokens.mint, mint));

    logger.log(`Admin set hidden flag to ${hidden} for token ${mint}`);

    // Get the updated token data
    const updatedToken = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    return c.json({
      success: true,
      message: `Token hidden flag set to ${hidden}`,
      token: updatedToken[0],
    });
  } catch (error) {
    logger.error("Error setting token hidden flag:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

// Route to set a user to suspended
adminRouter.post(
  "/users/:address/suspended",
  requireAdminOrModerator,
  async (c) => {
    try {
      const address = c.req.param("address");
      if (!address || address.length < 32 || address.length > 44) {
        return c.json({ error: "Invalid wallet address" }, 400);
      }

      const body = await c.req.json();
      const { suspended } = body;

      if (suspended === undefined || typeof suspended !== "boolean") {
        return c.json({ error: "Suspended flag must be a boolean" }, 400);
      }

      const db = getDB();

      // Check if user exists
      const userData = await db
        .select()
        .from(users)
        .where(eq(users.address, address))
        .limit(1);

      if (!userData || userData.length === 0) {
        return c.json({ error: "User not found" }, 404);
      }

      // Update the suspended field directly
      await db
        .update(users)
        .set({
          suspended: suspended ? 1 : 0,
        })
        .where(eq(users.address, address));

      logger.log(
        `Admin set suspended flag to ${suspended} for user ${address}`
      );

      // Get the updated user data
      const updatedUser = await db
        .select()
        .from(users)
        .where(eq(users.address, address))
        .limit(1);

      // For backward compatibility, also check if the name has the [SUSPENDED] prefix
      // and include a suspended property in the response
      const isSuspended = updatedUser[0].suspended === 1;

      return c.json({
        success: true,
        message: `User suspended flag set to ${suspended}`,
        user: {
          ...updatedUser[0],
          suspended: isSuspended,
        },
      });
    } catch (error) {
      logger.error("Error setting user suspended flag:", error);
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  }
);

// Route to get a single user by address
adminRouter.get("/users/:address", requireAdminOrModerator, async (c) => {
  try {
    const address = c.req.param("address");
    if (!address || address.length < 32 || address.length > 44) {
      return c.json({ error: "Invalid wallet address" }, 400);
    }

    const db = getDB();

    // Get user from database
    const userData = await db
      .select()
      .from(users)
      .where(eq(users.address, address))
      .limit(1);

    if (!userData || userData.length === 0) {
      return c.json({ error: "User not found" }, 404);
    }

    // Get suspended status from the suspended field
    const user = userData[0];
    const isSuspended = user.suspended === 1;

    // For backward compatibility, also check if the name has the [SUSPENDED] prefix
    const isNameSuspended = user.name
      ? user.name.startsWith("[SUSPENDED]")
      : false;

    // Use the suspended field if it's set, otherwise fall back to the name check
    const finalSuspendedStatus = isSuspended || isNameSuspended;

    // Add empty arrays for tokensCreated, tokensHeld, and transactions if they don't exist
    // This prevents "Cannot read properties of undefined (reading 'length')" errors
    return c.json({
      user: {
        ...user,
        suspended: finalSuspendedStatus,
        tokensCreated: [],
        tokensHeld: [],
        transactions: [],
        totalVolume: 0,
      },
    });
  } catch (error) {
    logger.error("Error getting user:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

// Route to get admin statistics
adminRouter.get("/stats", requireAdminOrModerator, async (c) => {
  try {
    const db = getDB();

    // Get total user count
    const userCountResult = await db
      .select({ count: sql`count(*)` })
      .from(users);
    const userCount = Number(userCountResult[0]?.count || 0);

    // Get total token count
    const tokenCountResult = await db
      .select({ count: sql`count(*)` })
      .from(tokens);
    const tokenCount = Number(tokenCountResult[0]?.count || 0);

    // Calculate 24h volume by summing the volume24h field from all tokens
    // In a real app, this would likely come from a transactions table with proper date filtering
    const volumeResult = await db
      .select({ totalVolume: sql`SUM(volume_24h)` })
      .from(tokens);
    const volume24h = Number(volumeResult[0]?.totalVolume || 0);

    return c.json({
      stats: {
        userCount,
        tokenCount,
        volume24h,
      },
    });
  } catch (error) {
    logger.error("Error getting admin stats:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

// Route to retrieve users in a paginated way
adminRouter.get("/users", requireAdminOrModerator, async (c) => {
  try {
    const queryParams = c.req.query();
    const isSearching = !!queryParams.search;

    const limit = isSearching ? 5 : parseInt(queryParams.limit as string) || 50;
    const page = parseInt(queryParams.page as string) || 1;
    const skip = (page - 1) * limit;

    // Get search params for filtering
    const search = queryParams.search as string;
    const sortBy = search
      ? "createdAt"
      : (queryParams.sortBy as string) || "createdAt";
    const sortOrder = (queryParams.sortOrder as string) || "desc";
    const showSuspended = queryParams.suspended === "true";

    // Use a shorter timeout for test environments
    const timeoutDuration = process.env.NODE_ENV === "test" ? 2000 : 5000;

    // Create a timeout promise to prevent hanging
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Database query timed out")),
        timeoutDuration
      )
    );

    const countTimeoutPromise = new Promise<number>((_, reject) =>
      setTimeout(
        () => reject(new Error("Count query timed out")),
        timeoutDuration / 2
      )
    );

    const db = getDB();

    // Prepare a basic query
    const userQuery = async () => {
      try {
        // Get all columns from the users table programmatically
        const allUsersColumns = Object.fromEntries(
          Object.entries(users)
            .filter(
              ([key, value]) => typeof value === "object" && "name" in value
            )
            .map(([key, value]) => [key, value])
        );

        // Start with a basic query
        let usersQuery = db.select(allUsersColumns).from(users) as any;

        // Apply filters for suspended users using the suspended field
        // For backward compatibility, also check the name prefix
        if (showSuspended) {
          usersQuery = usersQuery.where(
            sql`${users.suspended} = 1 OR ${users.name} LIKE '[SUSPENDED]%'`
          );
        } else {
          usersQuery = usersQuery.where(
            sql`(${users.suspended} = 0 OR ${users.suspended} IS NULL) AND (${users.name} NOT LIKE '[SUSPENDED]%' OR ${users.name} IS NULL)`
          );
        }

        if (search) {
          // This is a simplified implementation - in production you'd use a proper search mechanism
          usersQuery = usersQuery.where(
            sql`(${users.name} LIKE ${"%" + search + "%"} OR 
                 ${users.address} LIKE ${"%" + search + "%"})`
          );
        }

        // Apply sorting - map frontend sort values to actual DB columns
        const validSortColumns = {
          createdAt: users.createdAt,
          points: users.points,
          name: users.name,
          address: users.address,
        };

        // Use the mapped column or default to createdAt
        const sortColumn =
          validSortColumns[sortBy as keyof typeof validSortColumns] ||
          users.createdAt;

        if (sortOrder.toLowerCase() === "desc") {
          usersQuery = usersQuery.orderBy(desc(sortColumn));
        } else {
          usersQuery = usersQuery.orderBy(sortColumn);
        }

        // Apply pagination
        usersQuery = usersQuery.limit(limit).offset(skip);

        // Execute the query
        return await usersQuery;
      } catch (error) {
        logger.error("Error in user query:", error);
        return [];
      }
    };

    const countPromise = async () => {
      const countQuery = db.select({ count: sql`count(*)` }).from(users);
      let finalQuery: any = countQuery;

      if (showSuspended) {
        finalQuery = countQuery.where(
          sql`${users.suspended} = 1 OR ${users.name} LIKE '[SUSPENDED]%'`
        );
      } else {
        finalQuery = countQuery.where(
          sql`(${users.suspended} = 0 OR ${users.suspended} IS NULL) AND (${users.name} NOT LIKE '[SUSPENDED]%' OR ${users.name} IS NULL)`
        );
      }

      if (search) {
        finalQuery = countQuery.where(
          sql`(${users.name} LIKE ${"%" + search + "%"} OR 
               ${users.address} LIKE ${"%" + search + "%"})`
        );
      }

      const totalCountResult = await finalQuery;
      return Number(totalCountResult[0]?.count || 0);
    };

    // Try to execute the query with a timeout
    let usersResult;
    let total = 0;

    try {
      [usersResult, total] = await Promise.all([
        Promise.race([userQuery(), timeoutPromise]),
        Promise.race([countPromise(), countTimeoutPromise]),
      ]);
    } catch (error) {
      logger.error("User query failed or timed out:", error);
      usersResult = [];
    }

    const totalPages = Math.ceil(total / limit);

    // Add empty arrays for tokensCreated, tokensHeld, and transactions for each user
    const usersWithDefaults = usersResult.map((user: any) => ({
      ...user,
      tokensCreated: [],
      tokensHeld: [],
      transactions: [],
      totalVolume: 0,
    }));

    return c.json({
      users: usersWithDefaults,
      page,
      totalPages,
      total,
      hasMore: page < totalPages,
    });
  } catch (error) {
    logger.error("Error in users route:", error);
    // Return empty results rather than error
    return c.json({
      users: [],
      page: 1,
      totalPages: 0,
      total: 0,
    });
  }
});

const requireTokenOwner = async (c: any, next: Function) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const tokenMint = c.req.param("mint");
  if (!tokenMint) {
    return c.json({ error: "Token mint required" }, 400);
  }

  // Fetch token data to check ownership using Drizzle syntax
  const db = getDB();
  const tokenResult = await db
    .select({ creator: tokens.creator })
    .from(tokens)
    .where(eq(tokens.mint, tokenMint))
    .limit(1);

  const tokenCreator = tokenResult[0]?.creator;

  if (!tokenCreator || tokenCreator !== user.publicKey) {
    logger.warn(
      `Ownership check failed: User ${user.publicKey} tried to access owner route for token ${tokenMint} owned by ${tokenCreator || "not found"}`
    );
    return c.json({ error: "Token ownership required" }, 403);
  }

  await next();
};

// Create owner router for token owner specific endpoints
const ownerRouter = new Hono<{
  Variables: {
    user?: { publicKey: string } | null;
  };
}>();

// Route to update a token's social links (owner version)
ownerRouter.post("/tokens/:mint/social", async (c) => {
  const mint = c.req.param("mint");
  const body = await c.req.json();

  try {
    const db = getDB();

    // Update social links
    await db
      .update(tokens)
      .set({
        website: body.website || null,
        twitter: body.twitter || null,
        telegram: body.telegram || null,
        discord: body.discord || null,
        farcaster: body.farcaster || null,
        lastUpdated: new Date(),
      })
      .where(eq(tokens.mint, mint));

    // Get the updated token data
    const updatedToken = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    return c.json({
      success: true,
      message: "Token social links updated successfully",
      token: updatedToken[0],
    });
  } catch (error) {
    console.error("Error updating token social links:", error);
    return c.json({ error: "Failed to update token social links" }, 500);
  }
});

ownerRouter.use("*", requireTokenOwner);

// --- Build Base Query for Admin Tokens (Omits hidden filter) ---
function buildAdminTokensBaseQuery(
  db: any,
  params: {
    hideImported?: number;
    search?: string;
    sortBy?: string;
    maxVolume?: number;
    maxHolders?: number;
  }
): PgSelect {
  const { hideImported, search, sortBy, maxVolume, maxHolders } = params;
  // Select all columns initially, similar to the original builder
  let query = db.select().from(tokens).$dynamic();
  const conditions: (SQL | undefined)[] = [];

  if (hideImported === 1) {
    conditions.push(sql`${tokens.imported} = 0`);
    logger.log(`[Admin Query Build] Adding condition: imported = 0`);
  }

  if (search) {
    conditions.push(
      or(
        sql`${tokens.name} ILIKE ${"%" + search + "%"}`,
        sql`${tokens.ticker} ILIKE ${"%" + search + "%"}`,
        sql`${tokens.mint} ILIKE ${"%" + search + "%"}`
      )
    );
    logger.log(`[Admin Query Build] Adding condition: search LIKE ${search}`);
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions.filter((c): c is SQL => !!c)));
  }
  return query;
}

// --- Build Count Query for Admin Tokens (Omits hidden filter) ---
function buildAdminTokensCountBaseQuery(
  db: any,
  params: {
    hideImported?: number;
    search?: string;
  }
): PgSelect {
  let query = db.select({ count: count() }).from(tokens).$dynamic();
  const { hideImported, search } = params;
  const conditions: (SQL | undefined)[] = [];

  if (hideImported === 1) {
    conditions.push(sql`${tokens.imported} = 0`);
    logger.log(`[Admin Count Build] Adding condition: imported = 0`);
  }

  if (search) {
    conditions.push(
      or(
        sql`${tokens.name} ILIKE ${"%" + search + "%"}`,
        sql`${tokens.ticker} ILIKE ${"%" + search + "%"}`,
        sql`${tokens.mint} ILIKE ${"%" + search + "%"}`
      )
    );
    logger.log(`[Admin Count Build] Adding condition: search LIKE ${search}`);
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions.filter((c): c is SQL => !!c)));
  }
  return query;
}

// --- NEW: Route to retrieve ALL tokens (including hidden) for Admin Panel ---
adminRouter.get("/tokens", requireAdminOrModerator, async (c) => {
  // --- Parameter Reading (similar to /api/tokens) ---
  const queryParams = c.req.query();
  const isSearching = !!queryParams.search;
  const limit = isSearching ? 5 : parseInt(queryParams.limit as string) || 50;
  const page = parseInt(queryParams.page as string) || 1;
  const skip = (page - 1) * limit;
  const hideImportedParam = queryParams.hideImported;
  const hideImported = hideImportedParam === "1" ? 1 : undefined;
  const search = queryParams.search as string | undefined;

  // Adjust sortBy logic for admin if needed (e.g., different default)
  let sortBy = queryParams.sortBy as string | undefined;
  let sortOrder = (queryParams.sortOrder as string)?.toLowerCase() || "desc";

  // Handle frontend-specific sort keys if passed directly
  if (sortBy === "all") {
    sortBy = "featured";
    sortOrder = "desc";
  } else if (sortBy === "oldest") {
    sortBy = "createdAt";
    sortOrder = "asc";
  } else if (!sortBy) {
    sortBy = "createdAt";
    sortOrder = "desc";
  }

  logger.log(
    `[GET /api/admin/tokens] Received params: sortBy=${sortBy}, sortOrder=${sortOrder}, hideImported=${hideImported}, search=${search}, limit=${limit}, page=${page}`
  );

  // No caching for the admin endpoint to ensure freshness
  const db = getDB();

  // --- Get max values for featured sort (if used) ---
  const { maxVolume, maxHolders } = await getFeaturedMaxValues(db);

  // --- Build Base Queries using ADMIN builders ---
  const filterParams = {
    hideImported,
    search,
    sortBy,
    maxVolume,
    maxHolders,
  };
  let baseQuery = buildAdminTokensBaseQuery(db, filterParams);
  const countQuery = buildAdminTokensCountBaseQuery(db, filterParams);

  // --- Apply Sorting to Main Query ---
  const validSortColumns: Record<string, any> = {
    createdAt: tokens.createdAt,
    marketCapUSD: tokens.marketCapUSD,
  };

  if (sortBy === "featured") {
    baseQuery = applyFeaturedSort(baseQuery, maxVolume, maxHolders, sortOrder);
    logger.log(`[Admin Query Build] Applied sort: featured weighted`);
  } else {
    const sortColumn = validSortColumns[sortBy] || tokens.createdAt;
    if (sortOrder === "desc") {
      baseQuery = baseQuery.orderBy(
        sql`CASE WHEN ${sortColumn} IS NULL OR ${sortColumn}::text = 'NaN' THEN 1 ELSE 0 END`,
        sql`${sortColumn} DESC NULLS LAST`
      );
      logger.log(`[Admin Query Build] Applied sort: ${sortBy} DESC`);
    } else {
      baseQuery = baseQuery.orderBy(
        sql`CASE WHEN ${sortColumn} IS NULL OR ${sortColumn}::text = 'NaN' THEN 1 ELSE 0 END`,
        sql`${sortColumn} ASC NULLS LAST`
      );
      logger.log(`[Admin Query Build] Applied sort: ${sortBy} ASC`);
    }
  }

  // --- Apply Pagination ---
  baseQuery = baseQuery.limit(limit).offset(skip);
  logger.log(
    `[Admin Query Build] Applied pagination: limit=${limit}, offset=${skip}`
  );

  // --- Execute Queries ---
  let tokensResult: Token[] | undefined;
  let total = 0;
  try {
    logger.log("[Admin Execution] Awaiting baseQuery...");
    // Cast to any[] as a workaround for persistent Drizzle/TS type inference issues
    tokensResult = (await baseQuery.execute()) as any[];
    logger.log(
      `[Admin Execution] baseQuery finished, ${tokensResult?.length} results. Awaiting countQuery...`
    );
    const countResult = await countQuery.execute();
    total = Number(countResult[0]?.count || 0);
    logger.log(`[Admin Execution] countQuery finished, total: ${total}`);
  } catch (error) {
    logger.error("Admin Token query failed:", error);
    tokensResult = [];
    total = 0;
  }

  // --- Process and Return ---
  const totalPages = Math.ceil(total / limit);

  // Map results to plain objects with necessary conversions
  const resultTokens =
    tokensResult?.map((token) => {
      const plainToken: Record<string, any> = { ...token }; // Start with plain object

      // Convert BigInts to strings
      for (const [key, value] of Object.entries(plainToken)) {
        if (typeof value === "bigint") {
          plainToken[key] = value.toString();
        }
        // Add other conversions like Dates if needed
      }

      // Ensure flags are booleans
      plainToken.hidden = !!plainToken.hidden;
      plainToken.featured = !!plainToken.featured;
      plainToken.verified = !!plainToken.verified;

      return plainToken; // Return the plain, processed object
    }) || [];

  const responseData = {
    tokens: resultTokens, // This is now any[]
    page,
    totalPages,
    total,
    hasMore: page < totalPages,
  };

  logger.log(
    `[Admin API Response] Returning ${responseData.tokens.length} tokens.`
  );
  return c.json(responseData);
});
// --- END NEW ADMIN GET TOKENS ROUTE ---

// --- Route to update core token details (name, ticker, image, url, description) ---
adminRouter.put("/tokens/:mint/details", requireAdminOrModerator, async (c) => {
  try {
    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    const body = await c.req.json();
    // Add description to destructuring
    const { name, ticker, image, url, description } = body;

    // Basic validation (can be more sophisticated)
    if (name !== undefined && (typeof name !== "string" || name === "")) {
      return c.json({ error: "Invalid name provided" }, 400);
    }
    if (ticker !== undefined && (typeof ticker !== "string" || ticker === "")) {
      return c.json({ error: "Invalid ticker provided" }, 400);
    }
    // Allow empty string for image/url/description to clear the field
    if (image !== undefined && typeof image !== "string") {
      return c.json({ error: "Invalid image URL provided" }, 400);
    }
    if (url !== undefined && typeof url !== "string") {
      return c.json({ error: "Invalid metadata URL provided" }, 400);
    }
    if (description !== undefined && typeof description !== "string") {
      return c.json({ error: "Invalid description provided" }, 400);
    }

    const db = getDB();

    // Check if token exists
    const tokenData = await db
      .select({ id: tokens.id })
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    if (!tokenData || tokenData.length === 0) {
      return c.json({ error: "Token not found" }, 404);
    }

    // Prepare update data - only include fields that were provided in the request
    const updatePayload: Partial<Token> = { lastUpdated: new Date() };
    if (name !== undefined) updatePayload.name = name;
    if (ticker !== undefined) updatePayload.ticker = ticker;
    if (image !== undefined) updatePayload.image = image;
    if (url !== undefined) updatePayload.url = url;
    if (description !== undefined) updatePayload.description = description; // Add description

    // Only update if there are changes other than lastUpdated
    if (Object.keys(updatePayload).length <= 1) {
      // Return current token data even if no changes were made?
      const currentToken = await db
        .select()
        .from(tokens)
        .where(eq(tokens.mint, mint))
        .limit(1);
      return c.json({
        success: true,
        message: "No details provided to update.",
        token: currentToken[0],
      });
    }

    // Update token with the new details
    await db.update(tokens).set(updatePayload).where(eq(tokens.mint, mint));

    logger.log(`Admin updated details for token ${mint}`);

    // Get the updated token data to return
    const updatedToken = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    return c.json({
      success: true,
      message: "Token details updated successfully",
      token: updatedToken[0], // Return the full updated token
    });
  } catch (error) {
    logger.error(
      `Error updating token details for ${c.req.param("mint")}:`,
      error
    );
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown error updating details",
      },
      500
    );
  }
});
// --- END PUT ROUTE ---

// --- NEW: Route to update metadata JSON ---
adminRouter.post(
  "/tokens/:mint/metadata",
  requireAdminOrModerator,
  async (c) => {
    try {
      const mint = c.req.param("mint");
      if (!mint || mint.length < 32 || mint.length > 44) {
        return c.json({ error: "Invalid mint address" }, 400);
      }

      // Get updated metadata content from request body
      const body = await c.req.text(); // Expect raw JSON string
      let updatedMetadata: object;
      try {
        updatedMetadata = JSON.parse(body);
      } catch (e) {
        return c.json({ error: "Invalid JSON format provided" }, 400);
      }

      const db = getDB();

      // Get token data, including URL and imported status
      const tokenData = await db
        .select({ url: tokens.url, imported: tokens.imported })
        .from(tokens)
        .where(eq(tokens.mint, mint))
        .limit(1);

      if (!tokenData || tokenData.length === 0) {
        return c.json({ error: "Token not found" }, 404);
      }

      const token = tokenData[0];

      // --- Check if token is imported ---
      if (token.imported === 1) {
        logger.warn(
          `Admin attempted to update metadata for imported token ${mint}`
        );
        return c.json(
          { error: "Cannot update metadata for imported tokens" },
          403
        );
      }

      // --- Check if original metadata URL exists ---
      if (!token.url) {
        return c.json(
          { error: "Token does not have existing metadata URL to update" },
          400
        );
      }

      // --- Extract S3 Object Key from URL ---
      let objectKey = "";
      // Get public base URL from shared client to help parse
      const { publicBaseUrl } = await getS3Client();

      // Define potential prefixes
      const expectedR2Prefix = "https://storage.autofun.tech/"; // Hardcode for now, or get dynamically
      const expectedMinioPrefixPattern = /^http:\/\/localhost:9000\/[^\/]+\//; // Matches http://localhost:9000/bucketname/
      const localApiPrefix = "/api/metadata/"; // Assuming API route is consistent

      if (token.url.startsWith(publicBaseUrl + "/")) {
        // Check primary case: starts with current base URL
        objectKey = new URL(token.url).pathname.substring(
          publicBaseUrl.length + 1
        );
      } else if (token.url.startsWith(expectedR2Prefix)) {
        // Check legacy/hardcoded R2 prefix
        objectKey = token.url.substring(expectedR2Prefix.length);
        logger.warn(
          `[Admin Metadata Update] URL ${token.url} used R2 prefix directly.`
        );
      } else if (expectedMinioPrefixPattern.test(token.url)) {
        // Check if it looks like a MinIO path URL
        objectKey = new URL(token.url).pathname.substring(1); // Get path after hostname (includes bucket)
        logger.warn(
          `[Admin Metadata Update] URL ${token.url} matched MinIO pattern.`
        );
      } else {
        // Fallback for local API path or other unknowns
        try {
          const parsedUrl = new URL(token.url);
          const path = parsedUrl.pathname;
          if (path.startsWith(localApiPrefix)) {
            const filename = path.substring(localApiPrefix.length);
            // Attempt to construct a likely S3 key (assuming token-metadata prefix)
            objectKey = `token-metadata/${filename}`;
            logger.log(
              `[Admin Metadata Update] Parsed local API URL. Constructed S3 key: ${objectKey}`
            );
          } else {
            logger.error(
              `[Admin Metadata Update] Could not determine S3 key from unexpected URL format for ${mint}: ${token.url}`
            );
            return c.json(
              {
                error:
                  "Cannot determine storage key from token metadata URL format",
              },
              500
            );
          }
        } catch (urlParseError) {
          logger.error(
            `[Admin Metadata Update] Failed to parse metadata URL to get object key for ${mint}: ${token.url}`,
            urlParseError
          );
          return c.json(
            {
              error: "Could not determine storage key from token metadata URL",
            },
            500
          );
        }
      }

      if (!objectKey) {
        logger.error(
          `[Admin Metadata Update] Failed to extract a valid object key for ${mint} from URL: ${token.url}`
        );
        return c.json(
          { error: "Failed to extract valid storage key from metadata URL" },
          500
        );
      }
      logger.log(`[Admin Metadata Update] Determined object key: ${objectKey}`);

      // --- Upload updated metadata to S3 ---
      // Use shared client
      const { client: s3Client, bucketName } = await getS3Client();

      const metadataBuffer = Buffer.from(
        JSON.stringify(updatedMetadata, null, 2),
        "utf8"
      ); // Pretty print JSON

      // --- Add Logging Here ---
      logger.log(
        `Attempting S3 PutObject: Bucket=${bucketName}, Key=${objectKey}, ContentLength=${metadataBuffer.length}`
      );
      // --- End Logging ---

      const putCommand = new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        Body: metadataBuffer,
        ContentType: "application/json",
        CacheControl: "public, max-age=3600", // Shorter cache for potentially changing metadata? Or keep long? Let's use 1 hour.
        Metadata: { publicAccess: "true" }, // Ensure public access if needed
      });

      logger.log(
        `Uploading updated metadata to S3: Bucket=${bucketName}, Key=${objectKey}`
      );
      await s3Client.send(putCommand);
      logger.log(`S3 metadata update successful for Key: ${objectKey}`);

      // Optionally, update the token's lastUpdated timestamp in the DB
      await db
        .update(tokens)
        .set({ lastUpdated: new Date() })
        .where(eq(tokens.mint, mint));

      return c.json({
        success: true,
        message: "Token metadata updated successfully",
        metadataUrl: token.url, // Return the original URL which should now point to updated content
      });
    } catch (error) {
      logger.error(
        `Error updating token metadata for ${c.req.param("mint")}:`,
        error
      );
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Unknown error updating metadata",
        },
        500
      );
    }
  }
);
// --- END METADATA UPDATE ROUTE ---

// --- NEW: Route to upload a new image for a token ---
adminRouter.post("/tokens/:mint/image", requireAdminOrModerator, async (c) => {
  try {
    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    const body = await c.req.json();
    if (!body.imageBase64) {
      logger.warn(
        `[/admin/tokens/:mint/image] Request missing imageBase64 for mint: ${mint}`
      );
      return c.json({ error: "Image data (imageBase64) is required" }, 400);
    }

    // Basic regex to extract content type and base64 data
    const matches = body.imageBase64.match(
      /^data:(image\/[A-Za-z-+.]+);base64,(.+)$/
    );
    if (!matches || matches.length !== 3) {
      logger.warn(
        `[/admin/tokens/:mint/image] Invalid image data format for mint: ${mint}`
      );
      return c.json(
        { error: "Invalid image format (expected data:image/...;base64,...)" },
        400
      );
    }

    const contentType = matches[1];
    const imageData = matches[2];
    const imageBuffer = Buffer.from(imageData, "base64");

    const db = getDB();

    // Check if token exists
    const tokenData = await db
      .select({ id: tokens.id, ticker: tokens.ticker }) // Select ticker for filename
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    if (!tokenData || tokenData.length === 0) {
      return c.json({ error: "Token not found" }, 404);
    }

    // Generate filename (e.g., using mint and timestamp for uniqueness)
    const sanitizedMint = mint.substring(0, 8); // Use part of mint for readability
    let extension = ".jpg"; // Default
    if (contentType === "image/png") extension = ".png";
    else if (contentType === "image/gif") extension = ".gif";
    else if (contentType === "image/svg+xml") extension = ".svg";
    else if (contentType === "image/webp") extension = ".webp";
    const imageFilename = `${sanitizedMint}_${Date.now()}${extension}`;
    const imageKey = `token-images/${imageFilename}`; // Store in standard token-images path

    // --- Upload Image using shared function ---
    logger.log(
      `[/admin/tokens/:mint/image] Uploading new image to Storage key: ${imageKey}`
    );
    const imageUrl = await uploadToStorage(imageBuffer, {
      contentType,
      key: imageKey,
    });
    logger.log(
      `[/admin/tokens/:mint/image] New image uploaded successfully: ${imageUrl}`
    );
    // --- End Image Upload ---

    // --- Update Token in Database ---
    await db
      .update(tokens)
      .set({
        image: imageUrl, // Update the image URL
        lastUpdated: new Date(),
      })
      .where(eq(tokens.mint, mint));
    logger.log(
      `[/admin/tokens/:mint/image] Updated token ${mint} image URL in DB.`
    );
    // --- End DB Update ---

    // Get the fully updated token data to return
    const updatedToken = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    return c.json({
      success: true,
      message: "Token image updated successfully",
      imageUrl: imageUrl, // Return the new URL
      token: updatedToken[0], // Return the full updated token
    });
  } catch (error) {
    logger.error(
      `Error updating token image for ${c.req.param("mint")}:`,
      error
    );
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown error updating image",
      },
      500
    );
  }
});
// --- END IMAGE UPLOAD ROUTE ---

// --- NEW: Route to DELETE a token ---
adminRouter.delete("/tokens/:mint", requireAdminOrModerator, async (c) => {
  try {
    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    const db = getDB();

    // Check if token exists before attempting delete (optional but good practice)
    const tokenData = await db
      .select({ id: tokens.id })
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    if (!tokenData || tokenData.length === 0) {
      // Return success even if not found, as the desired state (deleted) is achieved
      logger.warn(`Admin attempt to delete non-existent token ${mint}`);
      return c.json({
        success: true,
        message: "Token not found or already deleted",
      });
      // Alternatively, return 404: return c.json({ error: "Token not found" }, 404);
    }

    // Delete the token
    const deleteResult = await db
      .delete(tokens)
      .where(eq(tokens.mint, mint))
      .returning({ deletedId: tokens.id }); // Optional: confirm which ID was deleted

    if (deleteResult.length === 0) {
      // Should not happen if the select check passed, but handle just in case
      logger.error(`Failed to delete token ${mint} after existence check.`);
      return c.json({ error: "Failed to delete token" }, 500);
    }

    logger.log(
      `Admin deleted token ${mint} (ID: ${deleteResult[0].deletedId})`
    );

    // Optionally: Add logic here to delete associated data (e.g., holders, S3 assets) if needed

    return c.json({
      success: true,
      message: `Token ${mint} deleted successfully`,
    });
  } catch (error) {
    logger.error(`Error deleting token ${c.req.param("mint")}:`, error);
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown error deleting token",
      },
      500
    );
  }
});
// --- END DELETE TOKEN ROUTE ---

// Routes for managing moderators (only accessible by full admins)
// Get list of current moderators
adminRouter.get("/moderators", requireAdminOrModerator, async (c) => {
  try {
    const db = getDB();

    // Get all moderator users
    const moderators = await db
      .select()
      .from(users)
      .where(eq(users.isModerator, 1));

    return c.json({
      moderators: moderators.map((mod) => ({
        ...mod,
        isAdmin: adminAddresses.includes(mod.address),
      })),
    });
  } catch (error) {
    logger.error("Error fetching moderators:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

// Add a new moderator
adminRouter.post("/moderators", requireAdmin, async (c) => {
  try {
    const body = await c.req.json();
    const { address } = body;

    if (!address || address.length < 32 || address.length > 44) {
      return c.json({ error: "Invalid wallet address" }, 400);
    }

    const db = getDB();

    // Check if user exists
    let userData = await db
      .select()
      .from(users)
      .where(eq(users.address, address))
      .limit(1);

    // If user doesn't exist, create them
    if (!userData || userData.length === 0) {
      await db.insert(users).values({
        address,
        isModerator: 1,
      });

      // Get the newly created user
      userData = await db
        .select()
        .from(users)
        .where(eq(users.address, address))
        .limit(1);
    } else {
      // Update existing user to be a moderator
      await db
        .update(users)
        .set({ isModerator: 1 })
        .where(eq(users.address, address));

      // Get updated user data
      userData = await db
        .select()
        .from(users)
        .where(eq(users.address, address))
        .limit(1);
    }

    logger.log(`Admin set ${address} as a moderator`);

    return c.json({
      success: true,
      message: `User ${address} is now a moderator`,
      moderator: userData[0],
    });
  } catch (error) {
    logger.error("Error adding moderator:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

// Remove a moderator
adminRouter.delete("/moderators/:address", requireAdmin, async (c) => {
  try {
    const address = c.req.param("address");

    if (!address || address.length < 32 || address.length > 44) {
      return c.json({ error: "Invalid wallet address" }, 400);
    }

    // Don't allow removing admins from moderator status
    if (adminAddresses.includes(address)) {
      return c.json(
        { error: "Cannot remove admin from moderator status" },
        403
      );
    }

    const db = getDB();

    // Check if user exists and is a moderator
    const userData = await db
      .select()
      .from(users)
      .where(and(eq(users.address, address), eq(users.isModerator, 1)))
      .limit(1);

    if (!userData || userData.length === 0) {
      return c.json({ error: "User not found or not a moderator" }, 404);
    }

    // Update user to remove moderator status
    await db
      .update(users)
      .set({ isModerator: 0 })
      .where(eq(users.address, address));

    logger.log(`Admin removed moderator status from ${address}`);

    return c.json({
      success: true,
      message: `User ${address} is no longer a moderator`,
    });
  } catch (error) {
    logger.error("Error removing moderator:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

export { adminRouter, ownerRouter };
