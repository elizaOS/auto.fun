import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getDB, tokenAgents, tokens } from "../db";
import { logger } from "../logger";
// import { TwitterAgent } from "../agents/twitter/twitterAgent";
import { uploadWithS3 } from "../uploader";
import { Buffer } from "node:buffer";

// Define the router with environment typing
const agentRouter = new Hono<{ Bindings: {} }>();

agentRouter.get("/token/:mint/agents", async (c) => {
  try {
    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    const db = getDB();
    const agents = await db
      .select()
      .from(tokenAgents) // Ensure tokenAgents is imported and defined in schema
      .where(eq(tokenAgents.tokenMint, mint))
      .orderBy(tokenAgents.createdAt);

    // ** ADD Log: Check the agents data before sending **
    logger.log(
      `[GET /agents] Found agents for mint ${mint}:`,
      JSON.stringify(agents),
    );

    // Return in the format expected by the frontend { agents: [...] }
    return c.json({ agents: agents || [] });
  } catch (error) {
    logger.error("Error fetching token agents:", error);
    return c.json({ agents: [], error: "Failed to fetch agents" }, 500);
  }
});

agentRouter.delete("/token/:mint/agents/:agentId", async (c) => {
  try {
    // Require authentication
    const user = c.get("user");
    if (!user || !user.publicKey) {
      logger.warn("Agent deletion attempt failed: Authentication required");
      return c.json({ error: "Authentication required" }, 401);
    }

    const mint = c.req.param("mint");
    const agentId = c.req.param("agentId"); // Assuming agentId is the unique ID (UUID)

    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }
    // Basic UUID check (simplified)
    if (!agentId || agentId.length < 30) {
      return c.json({ error: "Missing or invalid agent ID" }, 400);
    }

    const db = getDB();

    // Find the agent to check ownership
    const agentToDelete = await db
      .select()
      .from(tokenAgents)
      .where(and(eq(tokenAgents.id, agentId), eq(tokenAgents.tokenMint, mint)))
      .limit(1);

    if (!agentToDelete || agentToDelete.length === 0) {
      return c.json(
        { error: "Agent not found or does not belong to this token" },
        404,
      );
    }

    // Check if the authenticated user is the owner of this agent link
    if (agentToDelete[0].ownerAddress !== user.publicKey) {
      logger.warn(
        `Agent deletion attempt failed: User ${user.publicKey} tried to delete agent ${agentId} owned by ${agentToDelete[0].ownerAddress}`,
      );
      return c.json(
        { error: "You can only remove agents you have connected." },
        403, // Forbidden
      );
    }

    // Delete the agent
    const result = await db
      .delete(tokenAgents)
      .where(eq(tokenAgents.id, agentId))
      .returning({ id: tokenAgents.id }); // Return ID to confirm deletion

    if (!result || result.length === 0) {
      // This might happen if the agent was deleted between the select and delete calls
      logger.warn(
        `Agent ${agentId} not found during deletion, possibly already deleted.`,
      );
      return c.json({ error: "Agent not found during deletion attempt" }, 404);
    }

    logger.log(
      `Successfully deleted agent: ID ${agentId}, Token ${mint}, User ${user.publicKey}`,
    );

    // TODO: Emit WebSocket event for agent removal?

    return c.json({ success: true, message: "Agent removed successfully" });
  } catch (error) {
    logger.error("Error deleting token agent:", error);
    return c.json({ error: "Failed to remove agent" }, 500);
  }
});

agentRouter.post("/token/:mint/connect-twitter-agent", async (c) => {
  try {
    // Require authentication
    const user = c.get("user");
    if (!user || !user.publicKey) {
      logger.warn("Agent connection attempt failed: Authentication required");
      return c.json({ error: "Authentication required" }, 401);
    }

    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    const body = await c.req.json();
    const { accessToken, userId } = body;

    if (!accessToken || !userId) {
      return c.json({ error: "Missing Twitter credentials" }, 400);
    }

    // Step 1: Attempt to fetch Twitter user info
    let twitterUserId = userId;
    let twitterUserName = `user_${userId.substring(0, 5)}`;
    let twitterImageUrl = "/default-avatar.png";
    let fetchedOriginalUrl = ""; // Store the original URL temporarily

    try {
      // Try to fetch user profile
      logger.log(`Fetching Twitter profile for user ID: ${userId}`);
      const profileResponse = await fetch(
        "https://api.twitter.com/2/users/me?user.fields=profile_image_url",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        logger.log("Twitter profile data:", profileData);

        if (profileData.data && profileData.data.id) {
          twitterUserId = profileData.data.id;
          if (profileData.data.username) {
            twitterUserName = `@${profileData.data.username}`;
          }
          if (profileData.data.profile_image_url) {
            fetchedOriginalUrl = profileData.data.profile_image_url.replace("_normal", "_400x400");
            twitterImageUrl = fetchedOriginalUrl; // Use larger image URL by default
          }
        }
      } else {
        logger.warn(
          `Twitter profile fetch failed with status: ${profileResponse.status}`,
        );
      }
    } catch (profileError) {
      logger.error("Error fetching Twitter profile:", profileError);
    }

    // Step 2: Upload profile image if a valid URL was fetched
    let finalImageUrl = twitterImageUrl; // Initialize with fetched or default URL
    if (fetchedOriginalUrl) { // Only attempt upload if we got a URL from Twitter
        try {
            logger.log("Fetching Twitter profile image from URL:", fetchedOriginalUrl);
            const imageResponse = await fetch(fetchedOriginalUrl);
            if (imageResponse.ok) {
                const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
                const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
                const fileExtension = contentType.split("/")[1] || "jpg";
                // Use twitterUserId which should be unique
                const filename = `agent-profiles/${twitterUserId}-${Date.now()}.${fileExtension}`;

                // Use uploadWithS3 (which uses S3)
                finalImageUrl = await uploadWithS3(
                    imageBuffer,
                    { filename, contentType, basePath: 'agent-profiles' }
                );
                logger.log("Uploaded Twitter profile image via S3:", finalImageUrl);
            } else {
                logger.warn(`Failed to fetch Twitter profile image: ${imageResponse.status}, using original URL: ${fetchedOriginalUrl}`);
                finalImageUrl = fetchedOriginalUrl; // Keep original URL if fetch fails
            }
        } catch (imageError) {
            logger.error("Error fetching/uploading Twitter profile image:", imageError);
            finalImageUrl = fetchedOriginalUrl; // Keep original URL on error
        }
    }

    // Step 3: Check if this Twitter user is already connected to this token
    const db = getDB();
    const existingAgent = await db
      .select()
      .from(tokenAgents)
      .where(
        and(
          eq(tokenAgents.tokenMint, mint),
          eq(tokenAgents.twitterUserId, twitterUserId),
        ),
      )
      .limit(1);

    if (existingAgent && existingAgent.length > 0) {
      logger.warn(
        `Agent creation attempt failed: Twitter user ${twitterUserId} already linked to token ${mint}`,
      );
      return c.json(
        {
          error: "This Twitter account is already connected to this token.",
          agent: existingAgent[0],
        },
        409, // Conflict
      );
    }

    // Step 4: Check if the owner is the token creator to mark as official
    const tokenData = await db
      .select({ creator: tokens.creator })
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    const isOfficial =
      tokenData &&
      tokenData.length > 0 &&
      tokenData[0].creator === user.publicKey;

    // Step 5: Create new agent
    const newAgentData: any = {
      id: crypto.randomUUID(),
      tokenMint: mint,
      ownerAddress: user.publicKey,
      twitterUserId: twitterUserId,
      twitterUserName: twitterUserName,
      twitterImageUrl: finalImageUrl, // Use the potentially uploaded S3 URL
      official: isOfficial ? 1 : 0,
      createdAt: new Date(),
    };

    const result = await db
      .insert(tokenAgents)
      .values(newAgentData)
      .returning();

    if (!result || result.length === 0) {
      throw new Error("Failed to insert new agent into database.");
    }

    const newAgent = result[0];
    logger.log(
      `Successfully created agent link: Token ${mint}, Twitter ${twitterUserName}, Owner ${user.publicKey}`,
    );

    // TODO: Emit WebSocket event for new agent?

    // Step 6: Initialize the Twitter Agent class (Commented out)
    /*
    try {
      const twitterAgentInstance = new TwitterAgent(newAgent);
      logger.log(`Initialized TwitterAgent class for agent ${newAgent.id}`);
      // Example: Start monitoring or perform initial setup
      (async () => await twitterAgentInstance.startMonitoring())(); // Simple async call
    } catch (agentInitError) {
      logger.error(
        `Failed to initialize TwitterAgent class for ${newAgent.id}:`,
        agentInitError,
      );
    }
    */

    return c.json(newAgent, 201);
  } catch (error) {
    logger.error("Error connecting Twitter agent:", error);
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to connect Twitter agent",
      },
      500,
    );
  }
});

// ===== Placeholder for other Agent routes (Update, Delete) =====
// GET /agents/:id - Fetch specific agent details
// PUT /agents/:id - Update agent settings (e.g., status)
// DELETE /agents/:id - Remove an agent link

// Example PUT route structure (needs logic for auth, validation, cleanup)
agentRouter.put("/:id", async (c) => {
    // ... (Authentication & Authorization logic as before) ...
    // ... (Fetch agent & check ownership) ...
    // ... (Parse body for allowed update fields like status) ...
    // ... (Update DB) ...
    // ... (Perform actions based on update, e.g., stop/start monitoring - commented out) ...
    /*
    if (updatedAgent.length > 0 && updatedAgent[0].provider === "twitter") {
      try {
        const twitterAgentInstance = new TwitterAgent(updatedAgent[0]);
        if (status === "inactive" || status === "paused") {
          // await twitterAgentInstance.stopMonitoring();
          logger.log(`Stopped monitoring for agent ${id} due to status change.`);
        } else if (status === "active") {
          // await twitterAgentInstance.startMonitoring();
          logger.log(`Resumed monitoring for agent ${id} due to status change.`);
        }
      } catch (agentActionError) {
        logger.error(
          `Error performing action for agent ${id} after status update:`,
          agentActionError,
        );
      }
    }
    */
    return c.json({ message: "Agent update placeholder" }); // Placeholder
});

// Example DELETE route structure (needs logic for auth, validation, cleanup)
agentRouter.delete("/:id", async (c) => {
    // ... (Authentication & Authorization logic as before) ...
    // ... (Fetch agent & check ownership) ...
    // ... (Perform cleanup actions - commented out) ...
     /*
    if (agentToDelete.provider === "twitter") {
      try {
        // Need full agent data to instantiate class
        const fullAgent = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
        if(fullAgent.length > 0) {
           const twitterAgentInstance = new TwitterAgent(fullAgent[0]);
          // await twitterAgentInstance.stopMonitoring(); // Ensure monitoring stops
          // await twitterAgentInstance.cleanup(); // Perform any provider-specific cleanup
          logger.log(`Performed cleanup for Twitter agent ${id}`);
        }
      } catch (cleanupError) {
        logger.error(`Error during cleanup for agent ${id}:`, cleanupError);
        // Decide whether to proceed with deletion despite cleanup error
      }
    }
    */
    // ... (Delete from DB) ...
    return c.json({ success: true, message: "Agent delete placeholder" }); // Placeholder
});

export default agentRouter;
