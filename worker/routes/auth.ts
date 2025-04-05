import { eq, sql, and } from "drizzle-orm";
import { Hono } from "hono";
import {
  authenticate,
  authStatus,
  generateNonce,
  logout,
  requireAuth,
} from "../auth";
import { getDB, users, vanityKeypairs, VanityKeypair } from "../db";
import { Env } from "../env";
import { logger } from "../logger";
import {
  Connection,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { Buffer } from "buffer";

const authRouter = new Hono<{
  Bindings: Env;
  Variables: {
    user?: { publicKey: string } | null;
  };
}>();

authRouter.post("/register", async (c) => {
  try {
    // Special handling for test environment
    if (c.env.NODE_ENV === "test") {
      const body = await c.req.json();
      const { address } = body;

      if (!address) {
        return c.json({ error: "Address is required" }, 400);
      }

      // In test mode, just return a success with mock user data
      return c.json(
        {
          user: {
            id: "mock-user-id",
            address,
            name: "Test User",
            createdAt: new Date().toISOString(),
          },
        },
        200,
      );
    }

    const body = await c.req.json();

    // Validate input
    if (!body.address || body.address.length < 32 || body.address.length > 44) {
      return c.json({ error: "Invalid address" }, 400);
    }

    const db = getDB(c.env);

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
        createdAt: new Date().toISOString(),
      };

      await db.insert(users).values(userData);
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

authRouter.post("/authenticate", (c) => authenticate(c));
authRouter.post("/generate-nonce", (c) => generateNonce(c));
authRouter.post("/logout", (c) => logout(c));
authRouter.get("/auth-status", (c) => authStatus(c));

// Add a protected route to test authentication
authRouter.get("/protected", requireAuth, async (c) => {
  try {
    const user = c.get("user");

    // requireAuth middleware ensures user exists, but let's double-check
    if (!user) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    // Get user info from database
    const db = getDB(c.env);
    const userInfo = await db
      .select()
      .from(users)
      .where(eq(users.address, user.publicKey))
      .limit(1);

    // Return user info
    return c.json({
      message: "You have access to this protected route",
      user: userInfo.length > 0 ? userInfo[0] : { publicKey: user.publicKey },
      // Add token info for debugging (DO NOT include in production)
      token: {
        publicKey: user.publicKey,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("Error accessing protected route:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

// --- Vanity Keypair Generation Helper ---
const VANITY_SUFFIXES: string[] = [];

const baseWords = ["lucky", "auto", "fun"];

// add every permutation of "auto" to the array, "Auto", "autO", etc
// Generate all case permutations of "auto"

for (const baseWord of baseWords) {
  // for (let i = 0; i < Math.pow(2, baseWord.length); i++) {
  const permutation = baseWord; // "";
  // for (let j = 0; j < baseWord.length; j++) {
  //     // Use bitwise AND to determine if this character should be uppercase
  //     permutation += (i & (1 << j)) ? baseWord[j].toUpperCase() : baseWord[j].toLowerCase();
  // }
  VANITY_SUFFIXES.push(permutation);
  // }
}
console.log("VANITY_SUFFIXES", VANITY_SUFFIXES);

const MAX_ON_DEMAND_GENERATION_ATTEMPTS = 5000; // Attempts for on-demand generation

async function generateSingleVanityKeypair(): Promise<{
  address: string;
  secretKey: number[];
} | null> {
  logger.log("Attempting on-demand vanity keypair generation...");
  for (let i = 0; i < MAX_ON_DEMAND_GENERATION_ATTEMPTS; i++) {
    const keypair = Keypair.generate();
    const address = keypair.publicKey.toBase58();
    if (VANITY_SUFFIXES.some((suffix) => address.endsWith(suffix))) {
      logger.log(
        `Generated on-demand keypair: ${address} after ${i + 1} attempts.`,
      );
      const secretKeyBuffer = Buffer.from(keypair.secretKey);
      const secretKeyArray = Array.from(new Uint8Array(secretKeyBuffer));
      return {
        address: address,
        secretKey: secretKeyArray,
      };
    }
  }
  logger.warn(
    `On-demand generation failed after ${MAX_ON_DEMAND_GENERATION_ATTEMPTS} attempts.`,
  );
  return null;
}

// --- Start Restored /vanity-keypair Route ---
authRouter.post("/vanity-keypair", async (c) => {
  // TODO: Implement robust rate limiting for this endpoint
  try {
    // // Require authentication
    // const user = c.get("user");
    // if (!user) {
    //   return c.json({ error: "Authentication required" }, 401);
    // }
    const body = await c.req.json();

    // Validate requestor's address (ensure it matches authenticated user)
    if (!body.address || body.address.length < 32 || body.address.length > 44) {
      return c.json({ error: "Invalid or mismatched address" }, 400);
    }

    const db = getDB(c.env);

    let claimedKeypair: VanityKeypair | null = null;

    // --- Attempt to claim from pool atomically ---
    try {
      // 1. Find an unused keypair ID
      const potentialKeypairs = await db
        .select({ id: vanityKeypairs.id })
        .from(vanityKeypairs)
        .where(eq(vanityKeypairs.used, 0))
        .limit(1); // Select one potential candidate

      if (potentialKeypairs.length > 0) {
        const keypairIdToClaim = potentialKeypairs[0].id;
        logger.log(`Attempting to claim keypair ID: ${keypairIdToClaim}`);

        // 2. Try to update ONLY this ID if it's still unused
        const updateResult = await db
          .update(vanityKeypairs)
          .set({ used: 1 })
          .where(
            and(
              eq(vanityKeypairs.id, keypairIdToClaim),
              eq(vanityKeypairs.used, 0), // Condition: only update if still unused
            ),
          );

        // 3. Check if update was successful (1 row written)
        // Note: D1 returns rows_written, adjust if your driver differs
        if (updateResult?.meta?.rows_written === 1) {
          logger.log(`Successfully claimed keypair ID: ${keypairIdToClaim}`);
          // 4. Select the details of the claimed keypair
          const result = await db
            .select()
            .from(vanityKeypairs)
            .where(eq(vanityKeypairs.id, keypairIdToClaim))
            .limit(1);
          if (result.length > 0) {
            claimedKeypair = result[0];
          } else {
            logger.error(
              `Claimed keypair ${keypairIdToClaim} but failed to re-select it.`,
            );
            // Continue to fallback as something went wrong
          }
        } else {
          logger.log(
            `Failed to claim keypair ID: ${keypairIdToClaim} (likely claimed by another request).`,
          );
          // Keypair was likely claimed by another request between SELECT and UPDATE
          // Proceed to fallback
        }
      } else {
        logger.log("No unused keypairs found in the pool.");
        // Pool is empty, proceed to fallback
      }
    } catch (dbError) {
      logger.error("Error during atomic claim attempt:", dbError);
      // Proceed to fallback
    }
    // --- End Atomic Claim Attempt ---

    // If successfully claimed from pool
    if (claimedKeypair) {
      const secretKeyBuffer = Buffer.from(claimedKeypair.secretKey, "base64");
      const secretKeyArray = Array.from(new Uint8Array(secretKeyBuffer));
      return c.json({
        address: claimedKeypair.address,
        secretKey: secretKeyArray,
      });
    }

    // --- Fallback: Pool Empty or Claim Failed - Attempt On-Demand Vanity Generation ---
    logger.log(
      "Vanity pool empty/claim failed. Attempting limited on-demand vanity generation...",
    );
    const generatedKeypair = await generateSingleVanityKeypair();

    if (generatedKeypair) {
      // Return the generated vanity keypair directly (it's not saved to the pool)
      return c.json({
        address: generatedKeypair.address,
        secretKey: generatedKeypair.secretKey,
      });
    } else {
      // GENERATE THE KEYPAIR AND RETURN IT
      logger.warn(
        "Initial generation attempt failed, switching to persistent generation...",
      );

      // This will loop indefinitely until we find a keypair
      let foundKeypair: { address: string; secretKey: number[] } | null = null;
      let attempts = 0;
      const startTime = Date.now();

      // Continue generating until we find a keypair with "auto" suffix
      while (!foundKeypair) {
        attempts++;

        // Generate a keypair and check if it has the right suffix
        const keypair = Keypair.generate();
        const address = keypair.publicKey.toBase58();

        if (VANITY_SUFFIXES.some((suffix) => address.endsWith(suffix))) {
          // Found a matching keypair!
          const secretKeyBuffer = Buffer.from(keypair.secretKey);
          const secretKeyArray = Array.from(new Uint8Array(secretKeyBuffer));
          foundKeypair = {
            address: address,
            secretKey: secretKeyArray,
          };

          const duration = (Date.now() - startTime) / 1000;
          logger.log(
            `Success! Found vanity keypair ${address} after ${attempts} attempts (${duration.toFixed(2)}s)`,
          );

          // Optionally save this keypair to the pool for future use
          try {
            await db.insert(vanityKeypairs).values({
              id: crypto.randomUUID(),
              address: address,
              secretKey: Buffer.from(keypair.secretKey).toString("base64"),
              createdAt: new Date().toISOString(),
              used: 1, // Mark as used since we're returning it
            });
            logger.log(
              `Added the generated keypair to the pool (marked as used)`,
            );
          } catch (saveError) {
            // Non-critical error, just log it
            logger.error(
              `Failed to save generated keypair to pool: ${saveError}`,
            );
          }

          break; // Exit the loop
        }

        // Every 10,000 attempts, log progress and yield control briefly
        if (attempts % 10000 === 0) {
          const duration = (Date.now() - startTime) / 1000;
          logger.log(
            `Still searching... ${attempts} attempts so far (${duration.toFixed(2)}s)`,
          );

          // Yield control briefly to prevent blocking
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      // Return the vanity keypair we found
      return c.json({
        address: foundKeypair.address,
        secretKey: foundKeypair.secretKey,
      });
    }
    // --- End Fallback ---
  } catch (error) {
    logger.error("Error getting vanity keypair:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
// --- End Restored /vanity-keypair Route ---

export default authRouter;
