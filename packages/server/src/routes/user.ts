import { Hono } from "hono";
import { Env } from "../env";
import { getDB, tokens, users } from "../db";
import { desc, eq, sql } from "drizzle-orm";
import { logger } from "../util";

const app = new Hono<{
  Bindings: Env;
  Variables: {
    user?: { publicKey: string } | null;
  };
}>();

// GET /users/:address - Get user information, latest transactions, and created tokens
app.get("/:address", async (c) => {
  try {
    const address = c.req.param("address");
    if (!address) {
      return c.json({ error: "Address is required" }, 400);
    }

    const db = getDB(c.env);

    // Get user information
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.address, address))
      .limit(1);

    const user = userResult[0];

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    // Get the 20 latest transactions for this user
    const transactions: any[] = []; // Return empty array for now

    // Get tokens created by this user
    const tokensCreated = await db
      .select()
      .from(tokens)
      .where(eq(tokens.creator, address));

    return c.json({
      user,
      transactions, // Now always empty
      tokensCreated,
    });
  } catch (error) {
    logger.error("Error fetching user data:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

export default app;
