import { desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { verifyAuth } from "../auth";
import { getDB, tokens, users } from "../db";
import { logger } from "../logger";
import { adminAddresses } from "./adminAddresses";

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

  await next();
};

// Apply authentication middleware to all routes
adminRouter.use("*", verifyAuth);

// Route to update a token's social links
adminRouter.post("/tokens/:mint/social", requireAdmin, async (c) => {
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
      500,
    );
  }
});

// Route to set featured flag on tokens
adminRouter.post("/tokens/:mint/featured", requireAdmin, async (c) => {
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
      500,
    );
  }
});

// Route to set verified flag on tokens
adminRouter.post("/tokens/:mint/verified", requireAdmin, async (c) => {
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
      500,
    );
  }
});

// Route to set hidden flag on tokens
adminRouter.post("/tokens/:mint/hidden", requireAdmin, async (c) => {
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
      500,
    );
  }
});

// Route to set a user to suspended
adminRouter.post("/users/:address/suspended", requireAdmin, async (c) => {
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

    logger.log(`Admin set suspended flag to ${suspended} for user ${address}`);

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
      500,
    );
  }
});

// Route to get a single user by address
adminRouter.get("/users/:address", requireAdmin, async (c) => {
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
      500,
    );
  }
});

// Route to get admin statistics
adminRouter.get("/stats", requireAdmin, async (c) => {
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
      500,
    );
  }
});

// Route to retrieve users in a paginated way
adminRouter.get("/users", requireAdmin, async (c) => {
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
        timeoutDuration,
      ),
    );

    const countTimeoutPromise = new Promise<number>((_, reject) =>
      setTimeout(
        () => reject(new Error("Count query timed out")),
        timeoutDuration / 2,
      ),
    );

    const db = getDB();

    // Prepare a basic query
    const userQuery = async () => {
      try {
        // Get all columns from the users table programmatically
        const allUsersColumns = Object.fromEntries(
          Object.entries(users)
            .filter(
              ([key, value]) => typeof value === "object" && "name" in value,
            )
            .map(([key, value]) => [key, value]),
        );

        // Start with a basic query
        let usersQuery = db.select(allUsersColumns).from(users) as any;

        // Apply filters for suspended users using the suspended field
        // For backward compatibility, also check the name prefix
        if (showSuspended) {
          usersQuery = usersQuery.where(
            sql`${users.suspended} = 1 OR ${users.name} LIKE '[SUSPENDED]%'`,
          );
        } else {
          usersQuery = usersQuery.where(
            sql`(${users.suspended} = 0 OR ${users.suspended} IS NULL) AND (${users.name} NOT LIKE '[SUSPENDED]%' OR ${users.name} IS NULL)`,
          );
        }

        if (search) {
          // This is a simplified implementation - in production you'd use a proper search mechanism
          usersQuery = usersQuery.where(
            sql`(${users.name} LIKE ${"%" + search + "%"} OR 
                 ${users.address} LIKE ${"%" + search + "%"})`,
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
          sql`${users.suspended} = 1 OR ${users.name} LIKE '[SUSPENDED]%'`,
        );
      } else {
        finalQuery = countQuery.where(
          sql`(${users.suspended} = 0 OR ${users.suspended} IS NULL) AND (${users.name} NOT LIKE '[SUSPENDED]%' OR ${users.name} IS NULL)`,
        );
      }

      if (search) {
        finalQuery = countQuery.where(
          sql`(${users.name} LIKE ${"%" + search + "%"} OR 
               ${users.address} LIKE ${"%" + search + "%"})`,
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
  const tokenResult = await db.select({ creator: tokens.creator })
                               .from(tokens)
                               .where(eq(tokens.mint, tokenMint))
                               .limit(1);

  const tokenCreator = tokenResult[0]?.creator;

  if (!tokenCreator || tokenCreator !== user.publicKey) {
    logger.warn(`Ownership check failed: User ${user.publicKey} tried to access owner route for token ${tokenMint} owned by ${tokenCreator || 'not found'}`);
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

export { adminRouter, ownerRouter };
