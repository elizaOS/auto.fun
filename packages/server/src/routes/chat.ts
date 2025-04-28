import { Connection, PublicKey } from "@solana/web3.js";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import * as schema from "../db";
import {
  getDB,
  messages,
  messages as messagesTable,
  users as usersTable
} from "../db";
import { logger } from "../logger";
import { getGlobalRedisCache } from "../redis";
import { uploadWithS3 } from "../uploader";
import { getRpcUrl } from "../util";
import { webSocketManager } from "../websocket-manager";
import { v4 as uuidv4 } from 'uuid';

// Placeholder types - replace with your actual DB types and Env definition
// Env type is now imported from ../env.ts

// Adjust User type to match Hono context expectation (based on linter errors)
type User = { publicKey: string }; // Assuming publicKey is in JWT payload's 'sub'

type Variables = {
  user: User; // Make user mandatory after auth middleware
};

// --- Placeholder Functions ---
// Replace these with your actual implementations

// Updated to use both database and blockchain
async function checkUserTokenBalance(
  userPublicKey: string,
  tokenMint: string,
): Promise<number> {
  console.log(`Checking balance for user ${userPublicKey}, token ${tokenMint}`);
  const redisCache = await getGlobalRedisCache(); // Instantiate Redis

  // First check Redis cache
  let cachedBalance = 0;
  const holdersListKey = `holders:${tokenMint}`;
  try {
    const holdersString = await redisCache.get(holdersListKey);
    if (holdersString) {
      const allHolders: any[] = JSON.parse(holdersString);
      const specificHolderData = allHolders.find(
        (h) => h.address === userPublicKey,
      );
      if (specificHolderData) {
        // Assuming amount stored is raw, adjust for decimals (e.g., 6)
        cachedBalance = (specificHolderData.amount || 0) / Math.pow(10, 6);
      }
    }
  } catch (redisError) {
    console.error(
      `Chat: Error checking Redis balance for ${userPublicKey} / ${tokenMint}:`,
      redisError,
    );
    // Continue to blockchain check if Redis fails
  }

  // Then check blockchain balance
  let blockchainBalance = 0;
  try {
    const connection = new Connection(getRpcUrl(), "confirmed");
    const mintPublicKey = new PublicKey(tokenMint);
    const userPublicKeyObj = new PublicKey(userPublicKey);

    const response = await connection.getTokenAccountsByOwner(
      userPublicKeyObj,
      { mint: mintPublicKey },
      { commitment: "confirmed" },
    );

    if (response && response.value && response.value.length > 0) {
      for (const { pubkey } of response.value) {
        const accountInfo = await connection.getTokenAccountBalance(pubkey);
        if (accountInfo.value) {
          const amount = accountInfo.value.amount;
          const decimals = accountInfo.value.decimals;
          blockchainBalance += Number(amount) / Math.pow(10, decimals);
        }
      }
    }
  } catch (error) {
    console.error(
      `Error checking blockchain balance for ${userPublicKey} / ${tokenMint}:`,
      error,
    );
  }

  // Use the higher of the two balances (Redis vs Blockchain)
  const effectiveBalance = Math.max(cachedBalance, blockchainBalance);
  console.log(
    `Chat Balance check results - Redis: ${cachedBalance}, Blockchain: ${blockchainBalance}, Effective: ${effectiveBalance}`,
  );

  return effectiveBalance;
}

function getUserEligibleTiers(balance: number): string[] {
  const tiers: string[] = [];
  if (balance >= 1000) tiers.push("1k");
  if (balance >= 100000) tiers.push("100k");
  if (balance >= 1000000) tiers.push("1M");
  return tiers;
}

function getTierThreshold(tier: string): number {
  switch (tier) {
    case "1k":
      return 1000;
    case "100k":
      return 100000;
    case "1M":
      return 1000000;
    default:
      throw new Error("Invalid tier");
  }
}
const allowedTiers = ["1k", "100k", "1M"];
// Define ChatTier type based on allowedTiers
type ChatTier = (typeof allowedTiers)[number];

// Define Hono app with AuthVariables
const chatRouter = new Hono<{ Variables: Variables }>();

// --- Routes (Updated GET and POST) ---

// GET /api/chat/:tokenMint/tiers - Get eligible tiers for the user
chatRouter.get(
    "/chat/:tokenMint/tiers",
    async (c) => {
      const user = c.get("user");
      const tokenMint = c.req.param("tokenMint");

      if (!tokenMint) {
        return c.json({ success: false, error: "Token mint is required" }, 400);
      }

      try {
        const balance = await checkUserTokenBalance(
          user.publicKey,
          tokenMint,
        );
        const eligibleTiers = getUserEligibleTiers(balance);
        return c.json({ success: true, tiers: eligibleTiers, balance });
      } catch (error) {
        console.error("Error fetching eligible tiers:", error);
        return c.json(
          { success: false, error: "Failed to fetch eligible tiers" },
          500,
        );
      }
    }
);

// GET /api/chat/:tokenMint/:tier - Get messages for a specific tier
chatRouter.get(
  "/chat/:tokenMint/:tier",
  validator("param", (value, c) => {
    // Basic validation
    const tier = value["tier"];
    if (!tier || !allowedTiers.includes(tier)) {
      return c.text("Invalid tier parameter", 400);
    }
    return { tier: tier as ChatTier, tokenMint: value["tokenMint"] }; // Cast tier
  }),
  validator("query", (value, c) => {
    const limit = parseInt(value["limit"] as string || "50");
    const offset = parseInt(value["offset"] as string || "0");
    if (limit < 1 || limit > 100) {
      return c.text("Invalid limit parameter", 400);
    }
    if (offset < 0) {
      return c.text("Invalid offset parameter", 400);
    }
    return { limit, offset };
  }),
  async (c) => {
    const { tokenMint, tier } = c.req.valid("param");
    const { limit, offset } = c.req.valid("query");
    const user = c.get("user"); // User object OR undefined (from upstream optional auth?)
    const currentDb = getDB();

    try {
      let hasPermission = false;
      let requiredBalance = 0;

      // --- Permission Logic ---
      if (tier === "1k") {
        // Anyone can view 1k tier
        hasPermission = true;
      } else if (user) {
        // Authenticated user required for >1k tiers
        const balance = await checkUserTokenBalance(
          user.publicKey, // Safe to access user here
          tokenMint,
        );

        if (tier === "100k") {
          requiredBalance = getTierThreshold("1k"); // Need 1k+ balance to view 100k
          hasPermission = balance >= requiredBalance;
        } else if (tier === "1M") {
          requiredBalance = getTierThreshold("100k"); // Need 100k+ balance to view 1M
          hasPermission = balance >= requiredBalance;
        }
      }
      // --- End Permission Logic ---

      if (!hasPermission) {
        // If user is authenticated but lacks balance for >1k tiers
        if (user && tier !== "1k") {
           return c.json(
             {
               success: false,
               error: `Insufficient balance. You need ${requiredBalance.toLocaleString()} tokens to view the ${tier} tier.`,
             },
             403, // Forbidden
           );
        }
        // If user is not authenticated and trying to access >1k tiers
        else if (!user && tier !== "1k") {
             return c.json({ success: false, error: "Authentication required to view this tier." }, 401);
        }
        // Should not happen for 1k tier due to logic above, but as a fallback:
        else {
             return c.json({ success: false, error: "Permission denied." }, 403);
        }
      }

      // Fetch messages from the database
      const messages = await currentDb
        .select()
        .from(schema.messages)
        .where(
          and(
            eq(schema.messages.tokenMint, tokenMint),
            eq(schema.messages.tier, tier),
          ),
        )
        .orderBy(asc(schema.messages.timestamp)) // Order ascending for offset
        .limit(limit)
        .offset(offset);

      // --- Fetch Profile Information for Authors ---
      let messagesWithProfileInfo = messages; // Initialize with original messages
      const authors = [...new Set(messages.map((msg: any) => msg.author))].filter(Boolean); // Get unique, non-null authors

      if (authors.length > 0) {
        try {
          const profiles = await currentDb
            .select({
              address: usersTable.address,
              // Adjust column names if they differ in your schema.users table
              displayName: usersTable.display_name,
              profileImage: usersTable.profile_picture_url,
            })
            .from(usersTable)
            .where(inArray(usersTable.address, authors));

          const authorMap = new Map(profiles.map((p) => [p.address, p]));

          messagesWithProfileInfo = messages.map((msg: any) => {
            const profile = authorMap.get(msg.author);
            return {
              ...msg,
              // Use optional chaining or provide fallbacks if profile might be missing
              displayName: profile?.displayName ?? null,
              profileImage: profile?.profileImage ?? null,
              timestamp: new Date(msg.timestamp).toISOString(), // Ensure ISO string format
            };
          });
        } catch (dbError) {
          logger.error("Error fetching user profiles for chat messages:", dbError);
          // Proceed with messages lacking profile info if fetch fails
          // Ensure timestamps are still formatted
           messagesWithProfileInfo = messages.map((msg: any) => ({
               ...msg,
               timestamp: new Date(msg.timestamp).toISOString(),
           }));
        }
      } else {
         // Ensure timestamps are formatted even if no authors/profiles to fetch
         messagesWithProfileInfo = messages.map((msg: any) => ({
             ...msg,
             timestamp: new Date(msg.timestamp).toISOString(),
         }));
      }
      // --- End Profile Fetch ---

      // Return the messages (potentially enriched with profile info)
      return c.json({ success: true, messages: messagesWithProfileInfo });

    } catch (error: any) {
      logger.error(`Error fetching messages for ${tier} / ${tokenMint}:`, error);
      if (error instanceof HTTPException) {
        return error.getResponse();
      }
      return c.json({ success: false, error: "Failed to fetch messages." }, 500);
    }
  },
);

// POST /api/chat/:tokenMint/:tier - Post a new message to a specific tier
chatRouter.post(
  "/chat/:tokenMint/:tier",
  validator("param", (value, c) => {
    const tier = value["tier"];
    if (!tier || !allowedTiers.includes(tier)) {
      return c.text("Invalid tier parameter", 400);
    }
    // Add tokenMint validation if missing
    const tokenMint = value["tokenMint"];
     if (!tokenMint || typeof tokenMint !== 'string' || tokenMint.length < 32 || tokenMint.length > 44) {
       return c.text("Invalid tokenMint parameter", 400);
     }
    return { tier: tier as ChatTier, tokenMint: tokenMint };
  }),
  validator("json", (value, c) => {
    const message = value["message"] || ""; // Default to empty string if null/undefined
    const media = value["media"]; // Optional base64 image string
    const parentId = value["parentId"];

    // Validate message content (only if no media is provided)
    if (!media && (typeof message !== "string" || message.trim().length === 0 || message.length > 1000)) {
      return c.text("Message is required when no image is provided and must be 1-1000 characters.", 400);
    }
    // Validate message length even if media is provided (caption length)
    if (typeof message !== "string" || message.length > 1000) {
       return c.text("Caption cannot exceed 1000 characters.", 400);
    }

    // Validate media format if present
    if (media && (typeof media !== "string" || !media.startsWith('data:image/'))) {
       return c.text("Invalid media format. Must be a base64 data URI.", 400);
    }

    if (parentId && typeof parentId !== "string") {
      return c.text("Invalid parentId", 400);
    }

    // Return validated/trimmed data
    return {
        message: message.trim(), // Trim caption/message
        parentId: parentId || null,
        media: media || null // Return null if not provided
    };
  }),
  async (c) => {
    const { tier, tokenMint } = c.req.valid("param");
    const { message, parentId, media } = c.req.valid("json");
    const user = c.get("user"); // User should be available from upstream middleware
    const senderClientId = c.req.header('X-WebSocket-ID');
    const currentDb = getDB();

    if (!user || !user.publicKey) {
        // This check might be redundant if upstream guarantees user, but good for safety
        return c.json({ success: false, error: "Authentication required." }, 401);
    }

    try {
      // --- Permission Check ---
      const requiredBalance = getTierThreshold(tier);
      const userBalance = await checkUserTokenBalance(
        user.publicKey,
        tokenMint,
      );

      if (userBalance < requiredBalance) {
        throw new HTTPException(403, {
          message: `Insufficient balance. Need ${requiredBalance} tokens to post in this tier.`,
        });
      }

      // --- Media Upload logic ---
      let mediaUrl: string | null = null;
      if (media) {
        try {
          // Extract mime type and base64 data
          const matches = media.match(/^data:(image\/(.+));base64,(.*)$/);
          if (!matches || matches.length !== 4) {
            throw new Error("Invalid media data format.");
          }
          const contentType = matches[1]; // e.g., "image/jpeg"
          const extension = matches[2]; // e.g., "jpeg"
          const base64Data = matches[3];

          // Convert base64 to buffer
          const buffer = Buffer.from(base64Data, 'base64');

          // Pass the buffer, contentType, and the specific key to the uploader
          mediaUrl = await uploadWithS3(buffer, contentType); // Pass s3Key

        } catch (uploadError) {
          logger.error("Error processing or uploading media:", uploadError);
          // mediaUrl will remain null if upload fails
        }
      }
      // --- End Media Upload ---

      // --- Insert Message into DB ---
      const messageId = crypto.randomUUID();
      const newMessageData = {
        id: messageId,
        author: user.publicKey,
        tokenMint: tokenMint,
        message: message, // Caption or text
        parentId: parentId,
        replyCount: 0,
        // REMOVE likes: 0, // Ensure 'likes' column is handled correctly or removed
        timestamp: new Date(),
        tier: tier,
        media: mediaUrl, // Use the mediaUrl (will be null if upload failed)
      };

      await currentDb.insert(schema.messages).values(newMessageData);
      logger.info(`Inserted message ${messageId} into DB.`);

      // --- Fetch Author Profile for Broadcast/Response ---
      let authorProfile = { displayName: null, profileImage: null } as { displayName: string | null, profileImage: string | null };
      try {
          const profileResult = await currentDb.select({
              // Adjust column names if they differ in your schema.users table
              displayName: usersTable.display_name,
              profileImage: usersTable.profile_picture_url,
          })
          .from(usersTable)
          .where(eq(usersTable.address, user.publicKey))
          .limit(1);

          if (profileResult.length > 0) {
              authorProfile = profileResult[0];
          }
      } catch (profileError) {
          logger.error(`Error fetching profile for author ${user.publicKey}:`, profileError);
          // Proceed without profile info if fetch fails
      }
      // --- End Profile Fetch ---


      // --- Prepare Final Message Data (for broadcast and response) ---
      const finalMessageData = {
        ...newMessageData,
        timestamp: newMessageData.timestamp.toISOString(), // Ensure ISO string format
        displayName: authorProfile.displayName,
        profileImage: authorProfile.profileImage,
      };
      logger.info('Broadcasting/Returning message data:', finalMessageData);


      // --- Broadcast via WebSocket ---
      const roomName = `chat:${tokenMint}:${tier}`;
      logger.info(`Broadcasting new message to room: ${roomName}`);
      webSocketManager.broadcastToRoom(
        roomName,
        'newChatMessage',
        finalMessageData, // Send message with profile info
        senderClientId // Exclude sender if ID provided
      ).catch((err: Error) => {
        logger.error(`Error broadcasting message to room ${roomName}:`, err);
      });

      // --- Return Success Response ---
      return c.json({ success: true, message: finalMessageData }, 201); // Return the created message data with profile info

    } catch (error: any) {
      logger.error(`Error posting message to ${tier} for ${tokenMint}:`, error);
      if (error instanceof HTTPException) {
        return error.getResponse();
      }
      return c.json({ success: false, error: "Failed to post message." }, 500);
    }
  },
);

// DELETE /api/chat/:tokenMint/:tier/message/:messageId - Delete a message
chatRouter.delete(
  "/chat/:tokenMint/:tier/message/:messageId",
  validator("param", (value, c) => {
    // Basic validation
    const tier = value["tier"];
    const messageId = value["messageId"];
    if (!tier || !allowedTiers.includes(tier)) {
      return c.text("Invalid tier parameter", 400);
    }
    if (!messageId || typeof messageId !== "string") {
      return c.text("Invalid messageId parameter", 400);
    }
    return { tier: tier as ChatTier, tokenMint: value["tokenMint"], messageId }; // Cast tier
  }),
  async (c) => {
    const user = c.get("user");
    const { tokenMint, tier, messageId } = c.req.valid("param");

    try {
      const currentDb = getDB();
      // 1. Fetch the message to check author
      const messageToDelete = await currentDb
        .select({ author: schema.messages.author })
        .from(schema.messages)
        .where(eq(schema.messages.id, messageId))
        .limit(1);

      if (messageToDelete.length === 0) {
        throw new HTTPException(404, { message: "Message not found" });
      }
      // Authorization check: Ensure the user owns the message
      if (messageToDelete[0].author !== user.publicKey) {
        throw new HTTPException(403, {
          message: "You are not authorized to delete this message",
        });
      }

      // 2. Delete the message
      const deleteResult = await currentDb
        .delete(schema.messages)
        .where(eq(schema.messages.id, messageId));

      // D1 delete doesn't provide reliable rowCount, check if message existed before
      // The check above ensures it existed and user was authorized.
      console.log(
        `Attempted to delete message ${messageId}. Result:`,
        deleteResult,
      );

      return c.json({ success: true, message: "Message deleted" });
    } catch (error) {
      console.error(`Error deleting message ${messageId}:`, error);
      if (error instanceof HTTPException) {
        return error.getResponse();
      }
      return c.json({ success: false, error: "Failed to delete message" }, 500);
    }
  },
);

// Get new messages since a timestamp for a specific tier
chatRouter.get("/chat/:mint/:tier/updates", async (c) => {
  try {
    const mint = c.req.param("mint");
    const tier = c.req.param("tier");
    const since = c.req.query("since");

    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    if (!since) {
      return c.json({ error: "Missing 'since' parameter" }, 400);
    }

    if (!tier || !["1k", "100k", "1M"].includes(tier)) {
      return c.json({ error: "Invalid tier" }, 400);
    }

    const db = getDB();

    // Get messages newer than the specified timestamp
    const messagesResult = await db
      .select()
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.tokenMint, mint),
          eq(messagesTable.tier, tier),
          sql`${messagesTable.timestamp} > ${new Date(since)}`
        )
      )
      .orderBy(desc(messagesTable.timestamp))
      .limit(50);

    return c.json({
      success: true,
      messages: messagesResult || []
    });
  } catch (error) {
    logger.error("Error fetching message updates:", error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

// Get replies for a specific message
chatRouter.get("/chat/:messageId/replies", async (c) => {
  try {
    const messageId = c.req.param("messageId");
    const db = getDB();

    // Get replies for this message
    const repliesResult = await db
      .select()
      .from(messagesTable)
      .where(eq(messages.parentId, messageId))
      .orderBy(desc(messages.timestamp));

    const repliesWithLikes = repliesResult;

    return c.json(repliesWithLikes);
  } catch (error) {
    logger.error("Error fetching replies:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

// Get message thread (parent and replies)
chatRouter.get("/chat/:messageId/thread", async (c) => {
  try {
    const messageId = c.req.param("messageId");
    const db = getDB();

    // Get the parent message
    const parentResult = await db
      .select()
      .from(messagesTable)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (parentResult.length === 0) {
      return c.json({ error: "Message not found" }, 404);
    }

    // Get replies for this message
    const repliesResult = await db
      .select()
      .from(messagesTable)
      .where(eq(messages.parentId, messageId))
      .orderBy(desc(messages.timestamp));

    // If user is logged in, add hasLiked field
    const parentWithLikes = parentResult;
    const repliesWithLikes = repliesResult;

    return c.json({
      parent: parentWithLikes[0],
      replies: repliesWithLikes,
    });
  } catch (error) {
    logger.error("Error fetching message thread:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

export default chatRouter;