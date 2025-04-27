import { eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { Buffer } from 'node:buffer'; // Ensure Buffer is imported
import randomAnimalName from 'random-animal-name'; // Import the library
import { getDB, tokens as tokensTable, User, users as usersTable } from "../db";
import { uploadWithS3 } from "../uploader"; // Import the S3 uploader utility
import { logger } from "../util";
import { generateMedia, MediaType } from "./generation"; // Import generation utilities
import { uploadToStorage } from "./files";
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, AccountLayout } from '@solana/spl-token';
import { HTTPException } from 'hono/http-exception';
import { getRpcUrl } from "../util"; // Ensure logger is imported and correct path for getRpcUrl

// --- Random Name Generation (Using Library) ---
function generateRandomName(): string {
  // Directly return the result from the library
  return randomAnimalName(); 
}
// --- End Random Name Generation ---

// --- Helper: Ensure User Profile ---
export async function ensureUserProfile(address: string): Promise<User> {
    const db = getDB();
    logger.log(`[ensureUserProfile] Checking for user: ${address}`);
    let userResult = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.address, address))
        .limit(1);

    let user = userResult[0];

    if (!user) {
        logger.log(`[ensureUserProfile] User ${address} not found, attempting creation.`);
        const defaultDisplayName = generateRandomName();
        const newUserInsertData = {
            address: address,
            display_name: defaultDisplayName,
            profile_picture_url: "/user-placeholder.png",
        };
        try {
            logger.log(`[ensureUserProfile] Inserting new user for ${address} with name ${defaultDisplayName}`);
            await db.insert(usersTable).values(newUserInsertData).returning();
            logger.log(`[ensureUserProfile] Insert successful for ${address}. Refetching...`);
            userResult = await db.select().from(usersTable).where(eq(usersTable.address, address)).limit(1);
            user = userResult[0];
            if (!user) { 
                 logger.error(`[ensureUserProfile] CRITICAL: Failed find user profile immediately after creation for ${address}`);
                 throw new Error(`Failed find user profile immediately after creation for ${address}`); 
            }
            logger.log(`[ensureUserProfile] User ${address} created and fetched successfully.`);
        } catch (insertError: any) {
            logger.error(`[ensureUserProfile] FAILED to insert new user profile for ${address}:`, insertError);
            logger.error(`[ensureUserProfile] Insert error code: ${insertError.code}, constraint: ${insertError.constraint}`); // Log specific DB error details
            // Attempt to fetch again in case of race condition
            logger.log(`[ensureUserProfile] Attempting to fetch again after insert error for ${address}`);
            userResult = await db.select().from(usersTable).where(eq(usersTable.address, address)).limit(1);
            user = userResult[0];
            if (!user) { 
                 logger.error(`[ensureUserProfile] Still failed to find user profile after insert error for ${address}`);
                 throw new Error(`Failed to create or find user profile for ${address}`); 
            }
            logger.log(`[ensureUserProfile] Found user ${address} after insert error (likely race condition).`);
        }
    } else if (!user.display_name || !user.profile_picture_url) {
        logger.log(`[ensureUserProfile] User ${address} found. Checking name/pic.`);
        const updatePayload: Partial<User> = {};
        if (!user.display_name) {
            const defaultDisplayName = generateRandomName();
            updatePayload.display_name = defaultDisplayName;
            logger.log(`[ensureUserProfile] Generating default name: ${defaultDisplayName}`);
        }
        if (!user.profile_picture_url) {
             updatePayload.profile_picture_url = "/user-placeholder.png";
             logger.log(`[ensureUserProfile] Setting default profile picture.`);
        }
        
        if (Object.keys(updatePayload).length > 0) {
             try {
                  logger.log(`[ensureUserProfile] Updating user ${address} with defaults:`, updatePayload);
                  await db
                     .update(usersTable)
                     .set(updatePayload)
                     .where(eq(usersTable.address, address));
                  // Update the local user object after successful DB update
                  if (updatePayload.display_name) user.display_name = updatePayload.display_name;
                  if (updatePayload.profile_picture_url) user.profile_picture_url = updatePayload.profile_picture_url;
                  logger.log(`[ensureUserProfile] Updated user ${address} with defaults successfully.`);
             } catch (updateError: any) {
                  logger.error(`[ensureUserProfile] FAILED to update profile defaults for ${address}:`, updateError);
                  // Continue with the fetched user, defaults might not be critical immediately
             }
        }
    } else {
         logger.log(`[ensureUserProfile] User ${address} found with existing name and picture.`);
    }

    logger.log(`[ensureUserProfile] Returning user object for ${address}: DisplayName=${user?.display_name}`);
    return user;
}
// --- End Helper ---


const app = new Hono<{
  Variables: {
    // Ensure your auth middleware populates this structure
    user?: { publicKey: string } | null;
  };
}>();

// --- Define Specific Routes BEFORE Parameterized Routes --- 

// --- GET /api/user/platform-tokens --- 
// Moved this route definition *before* /:address
// Assuming auth middleware runs before this route
app.get('/platform-tokens', async (c) => {
    const user = c.get('user'); 
    if (!user || !user.publicKey) {
        throw new HTTPException(401, { message: 'Authentication required.' });
    }

    const currentDb = getDB();
    const connection = new Connection(getRpcUrl(), 'confirmed');
    const ownerPublicKey = new PublicKey(user.publicKey);

    logger.info(`Fetching platform tokens for user: ${user.publicKey}`);

    try {
        // 1. Get all token accounts owned by the user
        const userTokenAccountsResponse = await connection.getTokenAccountsByOwner(
            ownerPublicKey,
            { programId: TOKEN_PROGRAM_ID },
            { commitment: 'confirmed' }
        );

        // 2. Filter for accounts with balance > 0 and decode
        const userHeldTokens = userTokenAccountsResponse.value
            .map(accountInfo => {
                try {
                    const decoded = AccountLayout.decode(accountInfo.account.data);
                    if (decoded.amount > BigInt(0)) {
                        return {
                            mint: new PublicKey(decoded.mint).toBase58(),
                            amount: decoded.amount
                        };
                    }
                } catch (e) {
                    logger.warn(`Failed to decode token account ${accountInfo.pubkey.toBase58()}: ${e}`);
                }
                return null;
            })
            .filter((token): token is { mint: string; amount: bigint } => token !== null);

        const userHeldMints = userHeldTokens.map(t => t.mint);
        logger.log(`User ${user.publicKey} holds ${userHeldMints.length} unique token mints (with balance > 0).`);

        if (userHeldMints.length === 0) {
            return c.json({ success: true, tokens: [] });
        }

        // 3. Query DB for platform tokens held by the user
        const platformHeldTokensData = await currentDb
            .select({
                mint: tokensTable.mint,
                name: tokensTable.name,
                ticker: tokensTable.ticker,
                image: tokensTable.image,
                decimals: tokensTable.tokenDecimals,
                // Attempt to select fields needed for value calculation
                marketCapUSD: tokensTable.marketCapUSD, 
                solPriceUSD: tokensTable.solPriceUSD,
                tokenSupplyUiAmount: tokensTable.tokenSupplyUiAmount,
                // status: tokensTable.status, // Could also be useful
            })
            .from(tokensTable)
            .where(inArray(tokensTable.mint, userHeldMints));

        logger.log(`Found ${platformHeldTokensData.length} matching platform tokens held by user ${user.publicKey}. Selected fields including marketCapUSD, solPriceUSD, tokenSupplyUiAmount.`);

        // 4. Combine data and format response (Matches ProfileToken structure)
        const combinedTokens = platformHeldTokensData.map(platformToken => {
            const userTokenData = userHeldTokens.find(ut => ut.mint === platformToken.mint);
            const userAmount = userTokenData?.amount || BigInt(0);
            const decimals = platformToken.decimals ?? 6;
            const tokensHeldUi = Number(userAmount) / Math.pow(10, decimals);

            // Calculate solValue if possible using fetched data
            let calculatedSolValue = 0;
            if (
                platformToken.marketCapUSD && 
                platformToken.solPriceUSD && 
                platformToken.tokenSupplyUiAmount && 
                platformToken.solPriceUSD > 0 && // Avoid division by zero
                platformToken.tokenSupplyUiAmount > 0 // Avoid division by zero
            ) {
                const tokenPriceUSD = platformToken.marketCapUSD / platformToken.tokenSupplyUiAmount;
                const priceSOL = tokenPriceUSD / platformToken.solPriceUSD;
                calculatedSolValue = tokensHeldUi * priceSOL;
            }

            // TODO: Add bonding curve value calculation if necessary and data is available
            // For now, we use the market cap calculation if possible, otherwise 0.

            return {
                mint: platformToken.mint,
                name: platformToken.name ?? 'Unknown',
                ticker: platformToken.ticker ?? '???',
                image: platformToken.image ?? null,
                tokensHeld: tokensHeldUi, // Return UI amount for frontend use
                solValue: calculatedSolValue, // Use calculated value
            };
        });

        return c.json({ success: true, tokens: combinedTokens });

    } catch (error: any) {
        logger.error(`Error fetching platform tokens for ${user.publicKey}:`, error);
        if (error instanceof HTTPException) {
            return error.getResponse();
        }
        return c.json({ success: false, error: 'Failed to fetch platform tokens.' }, 500);
    }
});

// --- Define Parameterized Route AFTER Specific Routes ---

app.get("/:address", async (c) => {
  const address = c.req.param("address");
  logger.log(`Address parameter: ${address}`);

  if (!address) {
    logger.warn("GET /users/ - Address parameter missing");
    return c.json({ error: "Address is required" }, 400);
  }

  try {
    const user = await ensureUserProfile(address);

    if (!user) {
         logger.error(`ensureUserProfile returned null/undefined unexpectedly for ${address}`);
         return c.json({ error: "Failed to retrieve or create user profile." }, 500);
    }

    const db = getDB();
    const tokensCreated = await db
      .select()
      .from(tokensTable)
      .where(eq(tokensTable.creator, address));

    const responseData = {
       user: {
         id: user.id,
         address: user.address,
         displayName: user.display_name || generateRandomName(),
         profilePictureUrl: user.profile_picture_url,
         points: user.points,
         rewardPoints: user.rewardPoints,
         createdAt: user.createdAt,
         suspended: user.suspended,
       },
       tokensCreated,
       transactions: [],
    };
    return c.json(responseData);
  } catch (error) {
    // <<< LOGGING POINT 2 >>>
    logger.error(`!!! ERROR in GET /users/${address} handler:`, error);
    const message = error instanceof Error ? error.message : "Unknown server error processing user profile";
    const statusCode = message.includes("Failed to create or find user") ? 500 : 500;
    return c.json({ error: message }, statusCode);
  }
});

// --- PUT /users/profile - Update user profile ---
// TODO: Apply your actual authentication middleware here
// Example: app.use('/profile', authMiddleware);

app.put('/profile', async (c) => {
    const currentUser = c.var.user;
    if (!currentUser || !currentUser.publicKey) {
        return c.json({ error: "Unauthorized: No user session found." }, 401);
    }
    const userPublicKey = currentUser.publicKey;

    try {
        // Ensure profile exists before attempting update
        await ensureUserProfile(userPublicKey);

        const body = await c.req.json<{ displayName?: string; profilePictureUrl?: string | null }>();
        const { displayName, profilePictureUrl } = body;

        const updateData: Partial<{ display_name: string | null; profile_picture_url: string | null }> = {};
        let validationError: string | null = null;

        // Validate Display Name (Allow clearing by setting to null or empty string)
        if (displayName !== undefined) {
            if (displayName === null || displayName.trim().length === 0) {
                 // Allow clearing the display name - set to null in DB
                 // If you want to re-generate random on clear, handle that elsewhere
                 updateData.display_name = null;
            } else if (displayName.length > 50) {
               validationError = "Display name cannot exceed 50 characters.";
            } else {
                updateData.display_name = displayName.trim();
            }
        }
        
        // Validate Profile Picture URL
        if (profilePictureUrl !== undefined && !validationError) {
             if (profilePictureUrl === null || profilePictureUrl === "") {
                updateData.profile_picture_url = null;
             } else if (typeof profilePictureUrl !== 'string') {
                 validationError = "Invalid profile picture URL: must be a string or null.";
             } else {
                 try {
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
            return c.json({ message: "No profile fields provided for update." }, 200); // Not an error if nothing sent
        }

        const db = getDB();
        const updateResult = await db.update(usersTable)
                .set(updateData)
                .where(eq(usersTable.address, userPublicKey))
                .returning({ updatedAddress: usersTable.address });

         if (!updateResult || updateResult.length === 0) {
               logger.warn(`Profile update failed for user: ${userPublicKey}`);
              return c.json({ error: "Profile update failed: User not found or mismatch." }, 404);
         }

        // Fetch the fully updated user data to return
        const updatedUser = await ensureUserProfile(userPublicKey);

        return c.json({
            message: "Profile updated successfully.",
            user: {
               id: updatedUser.id,
               address: updatedUser.address,
               displayName: updatedUser.display_name || generateRandomName(), // Add fallback just in case update failed silently
               profilePictureUrl: updatedUser.profile_picture_url,
               points: updatedUser.points,
               rewardPoints: updatedUser.rewardPoints,
               createdAt: updatedUser.createdAt,
               suspended: updatedUser.suspended,
            }
        });

    } catch (error: any) {
        logger.error(`Error updating profile for ${userPublicKey}: ${error?.message || error}`, { stack: error?.stack });
        if (error instanceof SyntaxError) {
             return c.json({ error: "Invalid request body: Could not parse JSON." }, 400);
        }
        return c.json(
            { error: "An unexpected error occurred while updating the profile." },
            500
        );
    }
});
// --- End PUT /users/profile ---

// --- POST /users/profile/picture - Upload Profile Picture ---
app.post('/profile/picture', async (c) => {
    const currentUser = c.var.user;
    if (!currentUser || !currentUser.publicKey) {
        return c.json({ error: "Unauthorized" }, 401);
    }
    const userPublicKey = currentUser.publicKey;

    try {
        const formData = await c.req.formData();
        const file = formData.get('profilePicture') as File;
        
        if (!file) {
            return c.json({ error: "No file uploaded" }, 400);
        }

        if (!file.type.startsWith('image/')) {
            return c.json({ error: "Invalid file type. Please upload an image." }, 400);
        }

        if (file.size > 5 * 1024 * 1024) {
            return c.json({ error: "File size exceeds 5MB limit" }, 400);
        }

        const arrayBuffer = await file.arrayBuffer();
        const imageBuffer = Buffer.from(arrayBuffer);

        const ext = file.type.split('/')[1] || 'png';
        const filename = `profile_${userPublicKey}_${Date.now()}.${ext}`;
        const key = `profile-pictures/${filename}`;

        const imageUrl = await uploadToStorage(imageBuffer, {
            contentType: file.type,
            key: key
        });

        if (!imageUrl) {
            throw new Error("Failed to upload image to storage");
        }

        await ensureUserProfile(userPublicKey);

        const db = getDB();
        await db.update(usersTable)
             .set({ profile_picture_url: imageUrl })
             .where(eq(usersTable.address, userPublicKey));

        const updatedUser = await ensureUserProfile(userPublicKey);

        return c.json({
            message: "Profile picture uploaded successfully.",
            user: {
               id: updatedUser.id,
               address: updatedUser.address,
               displayName: updatedUser.display_name || generateRandomName(),
               profilePictureUrl: updatedUser.profile_picture_url,
               points: updatedUser.points,
               rewardPoints: updatedUser.rewardPoints,
               createdAt: updatedUser.createdAt,
               suspended: updatedUser.suspended,
            }
        });

    } catch (error: any) {
         logger.error(`Error uploading profile picture for ${userPublicKey}: ${error?.message || error}`, { stack: error?.stack });
         return c.json(
            { error: "Failed to upload profile picture." },
            500
         );
    }
});

// --- POST /users/profile/picture/generate --- Implement Logic --- 
app.post('/profile/picture/generate', async (c) => {
     const currentUser = c.var.user;
    if (!currentUser || !currentUser.publicKey) {
        return c.json({ error: "Unauthorized" }, 401);
    }
    const userPublicKey = currentUser.publicKey;

    try {
        // 1. Ensure user profile exists & get display name
        const user = await ensureUserProfile(userPublicKey);
        const displayName = user.display_name || "Anonymous User"; // Use display name or fallback

        // 2. Generate a simple prompt
        const prompt = `Abstract profile picture representing ${displayName}, vibrant colors, digital art style`;
        logger.log(`Generating profile picture for ${userPublicKey} with prompt: "${prompt}"`);

        // 3. Generate the image using the generic media generation utility
        const generationResult = await generateMedia({
            prompt: prompt,
            type: MediaType.IMAGE,
            width: 512, // Specify size for profile pics
            height: 512,
            mode: "fast" // Use fast mode for quicker generation
        });

        // 4. Extract Image URL from result (handle potential variations)
        let generatedImageUrl: string | undefined;
        const resultData = generationResult as any; // Cast to any to inspect properties

        if (Array.isArray(resultData?.images) && resultData.images.length > 0 && resultData.images[0]?.url) {
            generatedImageUrl = resultData.images[0].url; // Fal V1 format?
        } else if (Array.isArray(resultData?.data?.images) && resultData.data.images.length > 0 && resultData.data.images[0]?.url) {
            generatedImageUrl = resultData.data.images[0].url; // Fal V2 format?
        } else if (typeof resultData?.image?.url === 'string') {
            generatedImageUrl = resultData.image.url; // Another possible format
        } else if (typeof resultData?.mediaUrl === 'string') { // Check for a direct mediaUrl
             generatedImageUrl = resultData.mediaUrl;
        }
        // Add more checks here based on actual observed responses from generateMedia

        if (!generatedImageUrl || !generatedImageUrl.startsWith('http')) { // Also check if it's a valid URL
             logger.error("Image generation failed or returned invalid format/URL.", generationResult);
             throw new Error("Failed to generate image from the generation service.");
        }
        logger.log(`Generated image URL: ${generatedImageUrl}`);

         // 5. Download the generated image
         let imageBuffer: Buffer;
         let contentType: string;
         try {
             const imageResponse = await fetch(generatedImageUrl);
             if (!imageResponse.ok) {
                 throw new Error(`Failed to download generated image: ${imageResponse.statusText}`);
             }
             contentType = imageResponse.headers.get("content-type") || "image/png"; // Default to png
             const arrayBuffer = await imageResponse.arrayBuffer();
             imageBuffer = Buffer.from(arrayBuffer);

              // Validate downloaded image size
             if (imageBuffer.length > 5 * 1024 * 1024) { // 5MB Limit
                 throw new Error("Generated image file size exceeds 5MB limit.");
             }

         } catch (downloadError) {
             logger.error(`Error downloading generated image from ${generatedImageUrl}:`, downloadError);
             throw new Error("Failed to retrieve the generated image.");
         }

        // 6. Upload the downloaded image buffer to our storage
        const ext = contentType.split('/')[1]?.split('+')?.[0] || 'png'; // Handle types like image/svg+xml
        const filename = `profile_${userPublicKey}_${Date.now()}_gen.${ext}`;
        const storageUrl = await uploadWithS3(imageBuffer, {
            filename,
            contentType,
            basePath: 'profile-pictures'
        });

        if (!storageUrl) {
            throw new Error("Failed to upload generated image to storage.");
        }
        logger.log(`Uploaded generated image to: ${storageUrl}`);

        // 7. Update user record in DB
        const db = getDB();
        await db.update(usersTable)
            .set({ profile_picture_url: storageUrl })
            .where(eq(usersTable.address, userPublicKey));

        // 8. Fetch the final updated user profile
        const updatedUser = await ensureUserProfile(userPublicKey);

        // 9. Return success response
        return c.json({
            message: "Profile picture generated successfully.",
            user: {
               id: updatedUser.id,
               address: updatedUser.address,
               displayName: updatedUser.display_name || generateRandomName(), // Fallback
               profilePictureUrl: updatedUser.profile_picture_url,
               points: updatedUser.points,
               rewardPoints: updatedUser.rewardPoints,
               createdAt: updatedUser.createdAt,
               suspended: updatedUser.suspended,
            }
        });

    } catch (error: any) {
        logger.error(`Error generating profile picture for ${userPublicKey}: ${error?.message || error}`, { stack: error?.stack });
        return c.json(
            { error: error.message || "Failed to generate profile picture." },
            500
        );
    }
});

export default app;
