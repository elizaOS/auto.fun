import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { getDB, tokens, users } from "../db";
import { logger } from "../util";
// Assume an auth middleware exists and is imported, e.g.:
// import { authMiddleware } from "../middleware/auth";

// --- Random Name Generation ---
const ADJECTIVES = ["Happy", "Silly", "Lazy", "Grumpy", "Clever", "Quick", "Shiny", "Fluffy", "Brave", "Calm", "Eager", "Jolly"];
const ANIMALS = ["Ape", "Bear", "Cat", "Dog", "Elk", "Fox", "Goat", "Hippo", "Iguana", "Jaguar", "Koala", "Lion", "Mouse", "Newt", "Owl", "Panda"];

function generateRandomName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${adj} ${animal}`;
}
// --- End Random Name Generation ---


const app = new Hono<{
  Variables: {
    // Ensure your auth middleware populates this structure
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

    const db = getDB();

    // Get user information including new fields
    const userResult = await db
      .select({
        id: users.id,
        address: users.address,
        displayName: users.display_name, // Select new field
        profilePictureUrl: users.profile_picture_url, // Select new field
        points: users.points,
        rewardPoints: users.rewardPoints,
        createdAt: users.createdAt,
        suspended: users.suspended,
        // name: users.name, // Original name field
      })
      .from(users)
      .where(eq(users.address, address))
      .limit(1);

    const user = userResult[0];

    if (!user) {
      // Optionally, create a user record here if not found,
      // or return 404 if profiles are only for known users.
      // For now, return 404.
      return c.json({ error: "User not found" }, 404);
    }

    // Generate a random display name IF one doesn't exist (is null/undefined/empty)
    const displayName = user.displayName || generateRandomName();

    // Get the 20 latest transactions for this user (Placeholder)
    const transactions: any[] = [];

    // Get tokens created by this user
    const tokensCreated = await db
      .select()
      .from(tokens)
      .where(eq(tokens.creator, address));

    return c.json({
      user: {
        ...user,
        displayName, // Return potentially generated name
        profilePictureUrl: user.profilePictureUrl // Return profile picture URL (can be null)
      },
      transactions,
      tokensCreated,
    });
  } catch (error) {
    logger.error(`Error fetching user data for ${c.req.param("address")}:`, error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown server error" },
      500,
    );
  }
});

// --- PUT /users/profile - Update user profile ---
// TODO: Apply your actual authentication middleware here
// Example: app.use('/profile', authMiddleware);

app.put('/profile', async (c) => {
    const currentUser = c.var.user; // Assuming middleware sets this
    if (!currentUser || !currentUser.publicKey) {
        // This should ideally be handled by the auth middleware itself
        return c.json({ error: "Unauthorized: No user session found." }, 401);
    }
    const userPublicKey = currentUser.publicKey;

    try {
        const body = await c.req.json<{ displayName?: string; profilePictureUrl?: string | null }>();
        const { displayName, profilePictureUrl } = body;

        const updateData: Partial<{ display_name: string; profile_picture_url: string | null }> = {};
        let validationError: string | null = null;

        // Validate Display Name
        if (displayName !== undefined) {
            if (typeof displayName !== 'string' || displayName.trim().length === 0 || displayName.length > 50) {
               validationError = "Invalid display name: must be a non-empty string between 1 and 50 characters.";
            } else {
                 // Trim whitespace before saving
                updateData.display_name = displayName.trim();
            }
        }

        // Validate Profile Picture URL
        if (profilePictureUrl !== undefined && !validationError) {
             if (profilePictureUrl === null || profilePictureUrl === "") {
                // Allow clearing the profile picture
                updateData.profile_picture_url = null;
             } else if (typeof profilePictureUrl !== 'string') {
                 validationError = "Invalid profile picture URL: must be a string or null.";
             } else {
                 try {
                    // Basic URL validation: Check if it can be parsed and is http/https
                    const parsedUrl = new URL(profilePictureUrl);
                    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
                        throw new Error("URL must use http or https protocol.");
                    }
                    updateData.profile_picture_url = profilePictureUrl;
                 } catch (e) {
                    validationError = "Invalid profile picture URL format.";
                 }
             }
        }

        if (validationError) {
            return c.json({ error: validationError }, 400);
        }

        if (Object.keys(updateData).length === 0) {
            return c.json({ error: "No update data provided (include displayName or profilePictureUrl)." }, 400);
        }

        const db = getDB();
        const updateResult = await db.update(users)
                .set(updateData)
                .where(eq(users.address, userPublicKey))
                .returning({ updatedAddress: users.address }); // Check if update happened

         if (!updateResult || updateResult.length === 0) {
              // This might mean the user doesn't exist in the DB, though they passed auth.
              // Or a concurrent deletion happened.
               logger.warn(`Profile update attempt for non-existent/mismatched user: ${userPublicKey}`);
              return c.json({ error: "Profile update failed: User not found or mismatch." }, 404);
         }


        // Fetch the updated user data to return it
        const updatedUserResult = await db
            .select({
                id: users.id,
                address: users.address,
                displayName: users.display_name,
                profilePictureUrl: users.profile_picture_url,
                points: users.points,
                rewardPoints: users.rewardPoints,
                createdAt: users.createdAt,
                suspended: users.suspended,
            })
            .from(users)
            .where(eq(users.address, userPublicKey))
            .limit(1);

        const updatedUser = updatedUserResult[0];

         if (!updatedUser) {
              // Should not happen if update succeeded, but handle defensively
              logger.error(`Failed to fetch user ${userPublicKey} immediately after profile update`);
              return c.json({ error: "Failed to retrieve updated profile information." }, 500);
         }

        // Ensure a display name is returned (should always have one post-update or from generation logic)
        const finalDisplayName = updatedUser.displayName || generateRandomName(); // Fallback just in case


        return c.json({
            message: "Profile updated successfully.",
            user: {
                ...updatedUser,
                 displayName: finalDisplayName,
                 profilePictureUrl: updatedUser.profilePictureUrl // Ensure this matches DB state
            }
        });

    } catch (error: any) {
        // Log detailed error for debugging
        logger.error(`Error updating profile for ${userPublicKey}: ${error?.message || error}`, { stack: error?.stack });

        // Handle specific known errors like unique constraints if display_name had one
        // if (error?.code === '23505' && error?.constraint?.includes('display_name')) {
        //     return c.json({ error: "Display name already taken."}, 409);
        // }

        // Handle JSON parsing errors
        if (error instanceof SyntaxError) {
             return c.json({ error: "Invalid request body: Could not parse JSON." }, 400);
        }

        // Generic error for other cases
        return c.json(
            { error: "An unexpected error occurred while updating the profile." },
            500
        );
    }
});
// --- End PUT /users/profile ---


export default app;
