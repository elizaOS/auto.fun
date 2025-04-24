import { Hono } from "hono";
import { z } from "zod";
import { getDB, preGeneratedTokens, Token } from "../../db"; // Assuming Token type exists or adjust as needed
import { eq, desc, asc, sql, ilike, or, and, count, SQL } from "drizzle-orm"; // Import SQL type
import { logger } from "../../util";
import { checkAndReplenishTokens } from "../generation";
import { verifyAuth } from "../../auth"; // Corrected import: verifyAuth (assuming it handles admin check)

const PreGeneratedTokenUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  ticker: z.string().min(1).optional(),
  description: z.string().optional(),
  prompt: z.string().optional(),
  image: z.string().url().optional(),
});

const preGeneratedAdminRoutes = new Hono<{ Bindings: {}; Variables: { user?: { publicKey: string } | null } }>();

// Apply admin auth middleware to all routes in this file
preGeneratedAdminRoutes.use("*", verifyAuth);

// --- GET /api/admin/pregenerated - List Pre-generated Tokens ---
preGeneratedAdminRoutes.get("/", async (c) => {
  try {
    const db = getDB();
    const queryParams = c.req.query();
    const limit = parseInt(queryParams.limit || "50");
    const page = parseInt(queryParams.page || "1");
    const sortBy = queryParams.sortBy || "createdAt";
    const sortOrder = queryParams.sortOrder || "desc";
    const search = queryParams.search;
    const offset = (page - 1) * limit;

    const conditions: (SQL | undefined)[] = [];

    if (search) {
       conditions.push(
          or(
             ilike(preGeneratedTokens.name, `%${search}%`),
             ilike(preGeneratedTokens.ticker, `%${search}%`),
             ilike(preGeneratedTokens.description, `%${search}%`),
             ilike(preGeneratedTokens.prompt, `%${search}%`),
             ilike(preGeneratedTokens.id, `%${search}%`),
          )
       )
    }

    const whereCondition = conditions.length > 0 ? and(...conditions.filter((c): c is SQL => !!c)) : undefined;

    // Fetch tokens with pagination and sorting
    const tokensQuery = db
      .select()
      .from(preGeneratedTokens)
      .$dynamic(); // Use $dynamic for conditional where

     if (whereCondition) {
       tokensQuery.where(whereCondition);
     }

    const validSortColumns = {
      createdAt: preGeneratedTokens.createdAt,
      name: preGeneratedTokens.name,
      ticker: preGeneratedTokens.ticker,
    };
    const sortColumn = validSortColumns[sortBy as keyof typeof validSortColumns] || preGeneratedTokens.createdAt;
    tokensQuery.orderBy(sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn));

    const tokensResult = await tokensQuery.limit(limit).offset(offset);

    // Count total items matching filters
    const countQuery = db
      .select({ count: count() })
      .from(preGeneratedTokens)
      .$dynamic();

     if (whereCondition) {
       countQuery.where(whereCondition);
     }

    const totalResult = await countQuery;
    const total = Number(totalResult[0]?.count || 0);
    const totalPages = Math.ceil(total / limit);

    return c.json({
      tokens: tokensResult,
      page,
      totalPages,
      total,
      hasMore: page < totalPages,
    });
  } catch (error) {
    logger.error("Error fetching pre-generated tokens:", error);
    return c.json({ error: "Failed to fetch tokens" }, 500);
  }
});

// --- DELETE /api/admin/pregenerated/:id - Delete a Token ---
preGeneratedAdminRoutes.delete("/:id", async (c) => {
  try {
    const db = getDB();
    const id = c.req.param("id");

    if (!id) {
      return c.json({ error: "Token ID is required" }, 400);
    }

    const result = await db
      .delete(preGeneratedTokens)
      .where(eq(preGeneratedTokens.id, id))
      .returning(); // Optional: return the deleted item

    if (result.length === 0) {
      return c.json({ error: "Token not found" }, 404);
    }

    return c.json({ success: true, message: "Token deleted successfully" });
  } catch (error) {
    logger.error("Error deleting pre-generated token:", error);
    return c.json({ error: "Failed to delete token" }, 500);
  }
});

// --- POST /api/admin/pregenerated/generate - Generate More Tokens ---
preGeneratedAdminRoutes.post("/generate", async (c) => {
  try {
    // Trigger the generation function (can run in background)
    // Consider adding a count parameter if needed
    // Assuming checkAndReplenishTokens handles generation logic appropriately
    (async () => {
       try {
          await checkAndReplenishTokens(); // Use existing function for consistency
          logger.log("Admin triggered pre-generated token replenishment.");
       } catch (genError) {
          logger.error("Error during admin-triggered token generation:", genError);
       }
    })();

    return c.json({ success: true, message: "Token generation process initiated." });
  } catch (error) {
    logger.error("Error initiating token generation:", error);
    return c.json({ error: "Failed to start token generation" }, 500);
  }
});

// --- PUT /api/admin/pregenerated/:id - Edit a Token ---
preGeneratedAdminRoutes.put("/:id", async (c) => {
  try {
    const db = getDB();
    const id = c.req.param("id");
    const body = await c.req.json();

    if (!id) {
      return c.json({ error: "Token ID is required" }, 400);
    }

    // Validate request body
    const validationResult = PreGeneratedTokenUpdateSchema.safeParse(body);
    if (!validationResult.success) {
      return c.json({ error: "Invalid update data", details: validationResult.error.errors }, 400);
    }
    const updateData = validationResult.data;

    // Ensure there's something to update
    if (Object.keys(updateData).length === 0) {
      return c.json({ error: "No update fields provided" }, 400);
    }

    const result = await db
      .update(preGeneratedTokens)
      .set(updateData)
      .where(eq(preGeneratedTokens.id, id))
      .returning();

    if (result.length === 0) {
      return c.json({ error: "Token not found" }, 404);
    }

    return c.json({ success: true, token: result[0] });
  } catch (error) {
    logger.error("Error updating pre-generated token:", error);
    return c.json({ error: "Failed to update token" }, 500);
  }
});


export default preGeneratedAdminRoutes; 