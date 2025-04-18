import { Hono } from "hono";
import { Env } from "../env";
import { getDB, tokens, users } from "../db";
import { logger } from "../logger";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { verifyAuth } from "../auth";

// Define the router with environment typing
const adminRouter = new Hono<{
  Bindings: Env;
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

  // Check if user has admin privileges
  // This is a simplified check - in a real app, you'd check against a database of admin users
  // or use a more sophisticated role-based system

  // For now, we'll use a hardcoded list of admin addresses
  // In a production environment, this should be stored in a database or environment variable
  const adminAddresses: string[] = [
    "8gikQQppeAGd9m5y57sW4fYyZwrJZoyniHD658arcnnx",
  ];

  // Check if the user's public key is in the admin list
  const isAdmin = adminAddresses.includes(user.publicKey);
  if (!isAdmin) {
    return c.json({ error: "Admin privileges required" }, 403);
  }

  await next();
};

// Apply authentication middleware to all routes
adminRouter.use("*", verifyAuth);

// Route to update a token's social links
adminRouter.patch("/tokens/:mint/social", requireAdmin, async (c) => {
  try {
    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    const body = await c.req.json();
    const { twitter, telegram, discord, website, farcaster } = body;

    const db = getDB(c.env);

    // Check if token exists
    const tokenData = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    if (!tokenData || tokenData.length === 0) {
      return c.json({ error: "Token not found" }, 404);
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
        lastUpdated: new Date().toISOString(),
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
adminRouter.patch("/tokens/:mint/featured", requireAdmin, async (c) => {
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

    const db = getDB(c.env);

    // Check if token exists
    const tokenData = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    if (!tokenData || tokenData.length === 0) {
      return c.json({ error: "Token not found" }, 404);
    }

    // Since the 'featured' flag doesn't exist in the schema,
    // we'll use the 'status' field to indicate featured tokens
    // We'll append 'featured' to the status if it's featured
    const currentStatus = tokenData[0].status || "active";
    const newStatus = featured
      ? currentStatus.includes("featured")
        ? currentStatus
        : `${currentStatus}-featured`
      : currentStatus.replace("-featured", "");

    await db
      .update(tokens)
      .set({
        status: newStatus,
        lastUpdated: new Date().toISOString(),
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
});

// Route to set verified flag on tokens
adminRouter.patch("/tokens/:mint/verified", requireAdmin, async (c) => {
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

    const db = getDB(c.env);

    // Check if token exists
    const tokenData = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    if (!tokenData || tokenData.length === 0) {
      return c.json({ error: "Token not found" }, 404);
    }

    // Since the 'verified' flag doesn't exist in the schema,
    // we'll use the 'status' field to indicate verified tokens
    // We'll append 'verified' to the status if it's verified
    const currentStatus = tokenData[0].status || "active";
    const newStatus = verified
      ? currentStatus.includes("verified")
        ? currentStatus
        : `${currentStatus}-verified`
      : currentStatus.replace("-verified", "");

    await db
      .update(tokens)
      .set({
        status: newStatus,
        lastUpdated: new Date().toISOString(),
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

    const db = getDB(c.env);

    // Check if user exists
    const userData = await db
      .select()
      .from(users)
      .where(eq(users.address, address))
      .limit(1);

    if (!userData || userData.length === 0) {
      return c.json({ error: "User not found" }, 404);
    }

    // Since the 'suspended' flag doesn't exist in the schema,
    // we'll use a naming convention in the 'name' field to indicate suspended users
    // We'll prefix the name with '[SUSPENDED]' if the user is suspended
    const currentName = userData[0].name || address.substring(0, 8);
    const newName = suspended
      ? currentName.startsWith("[SUSPENDED]")
        ? currentName
        : `[SUSPENDED] ${currentName}`
      : currentName.replace("[SUSPENDED] ", "");

    await db
      .update(users)
      .set({
        name: newName,
      })
      .where(eq(users.address, address));

    logger.log(`Admin set suspended flag to ${suspended} for user ${address}`);

    // Get the updated user data
    const updatedUser = await db
      .select()
      .from(users)
      .where(eq(users.address, address))
      .limit(1);

    return c.json({
      success: true,
      message: `User suspended flag set to ${suspended}`,
      user: updatedUser[0],
    });
  } catch (error) {
    logger.error("Error setting user suspended flag:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
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

    const db = getDB(c.env);

    // Get user from database
    const userData = await db
      .select()
      .from(users)
      .where(eq(users.address, address))
      .limit(1);

    if (!userData || userData.length === 0) {
      return c.json({ error: "User not found" }, 404);
    }

    // Check if user is suspended (has [SUSPENDED] prefix in name)
    const user = userData[0];
    const isSuspended = user.name ? user.name.startsWith("[SUSPENDED]") : false;

    // Add empty arrays for tokensCreated, tokensHeld, and transactions if they don't exist
    // This prevents "Cannot read properties of undefined (reading 'length')" errors
    return c.json({
      user: {
        ...user,
        suspended: isSuspended,
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
adminRouter.get("/stats", requireAdmin, async (c) => {
  try {
    const db = getDB(c.env);

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
    const timeoutDuration = c.env.NODE_ENV === "test" ? 2000 : 5000;

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

    const db = getDB(c.env);

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

        // Apply filters for suspended users (checking name field for [SUSPENDED] prefix)
        if (showSuspended) {
          usersQuery = usersQuery.where(sql`${users.name} LIKE '[SUSPENDED]%'`);
        } else {
          usersQuery = usersQuery.where(
            sql`${users.name} NOT LIKE '[SUSPENDED]%' OR ${users.name} IS NULL`
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
        finalQuery = countQuery.where(sql`${users.name} LIKE '[SUSPENDED]%'`);
      } else {
        finalQuery = countQuery.where(
          sql`${users.name} NOT LIKE '[SUSPENDED]%' OR ${users.name} IS NULL`
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

export default adminRouter;
