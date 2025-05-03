import { eq } from "drizzle-orm";
import { Context, Hono } from "hono";
import {
  authenticate,
  authStatus,
  generateNonce,
  logout
} from "../auth/auth";
import { getDB, users } from "../db";
import { awardUserPoints } from "../points";
import { logger } from "../util";

const authRouter = new Hono<{
  Variables: {
    user?: { publicKey: string } | null;
  };
}>();

authRouter.post("/register", async (c) => {
  try {

    const body = await c.req.json();

    // Validate input
    if (!body.address || body.address.length < 32 || body.address.length > 44) {
      return c.json({ error: "Invalid address" }, 400);
    }

    const db = getDB();

    // Check if user already exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.address, body.address))
      .limit(1);

    let user;
    if (existingUser.length === 0) {
      // Create new user
      const userData = {
        id: crypto.randomUUID(),
        name: body.name || "",
        address: body.address,
        createdAt: new Date(),
      };

      await db.insert(users).values(userData).onConflictDoNothing();
      // ** Points system **
      // Award points for registration
      awardUserPoints(
        userData.address,
        { type: "wallet_connected" },
        "User registered",
      );
      user = userData;
      logger.log(`New user registered: ${user.address}`);
    } else {
      user = existingUser[0];
      logger.log(`Existing user logged in: ${user.address}`);
    }

    return c.json({ user });
  } catch (error) {
    logger.error("Error registering user:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

authRouter.post("/authenticate", (c: Context) => authenticate(c));
authRouter.post("/generate-nonce", (c: Context) => generateNonce(c));
authRouter.post("/logout", (c: Context) => logout(c));
authRouter.get("/auth-status", (c: Context) => authStatus(c));

export default authRouter;
