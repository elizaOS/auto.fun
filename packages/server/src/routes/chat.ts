import { Connection, PublicKey } from "@solana/web3.js";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import {
  getDB,
  messages,
  messages as messagesTable,
} from "../db";
import { logger } from "../logger";
import { getRpcUrl } from "../util";
import { uploadWithS3 } from "../uploader";

// ---=== Database Schema and Drizzle ===---
import { Context } from "hono"; // Import Context type
import * as schema from "../db"; // Import your generated schema
import { getGlobalRedisCache } from "../redis";
import { webSocketManager } from "../websocket-manager"; // Import the manager
// ---=================================---

// Placeholder types - replace with your actual DB types and Env definition
// Env type is now imported from ../env.ts

// Adjust User type to match Hono context expectation (based on linter errors)
type User = { publicKey: string }; // Assuming publicKey is in JWT payload's 'sub'

// Define context variables for Hono
type Variables = {
  user: User; // Make user mandatory after auth middleware
};

// Helper function to get DB instance - using broader type to handle context variations
const db = (c: Context<any>) => getDB();

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

// --- Hono App ---
const chatRouter = new Hono<{ Variables: Variables }>();

// --- Routes (Updated GET and POST) ---

// GET /api/chat/:tokenMint/tiers - Get eligible tiers for the user
chatRouter.get("/chat/:tokenMint/tiers", async (c) => {
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
});

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
  async (c) => {
    const user = c.get("user");
    const { tokenMint, tier } = c.req.valid("param");
    const limit = parseInt(c.req.query("limit") || "100"); // Increase default limit
    const offset = parseInt(c.req.query("offset") || "0");

    try {
      const balance = await checkUserTokenBalance(
        user.publicKey,
        tokenMint,
      );
      const requiredBalance = getTierThreshold(tier);

      if (balance < requiredBalance) {
        return c.json(
          {
            success: false,
            error: `Insufficient balance. Need ${requiredBalance.toLocaleString()} tokens.`,
          },
          403,
        );
      }

      // Fetch messages from the database
      const currentDb = db(c);
      const messages = await currentDb
        .select()
        .from(schema.messages)
        .where(
          and(
            eq(schema.messages.tokenMint, tokenMint),
            eq(schema.messages.tier, tier),
          ),
        )
        .orderBy(asc(schema.messages.timestamp))
        .limit(limit)
        .offset(offset);


      // Ensure timestamp is properly formatted
      const formattedMessages = messages.map((msg) => {
        const formattedMsg = {
          ...msg,
          timestamp: msg.timestamp instanceof Date 
            ? msg.timestamp.toISOString() 
            : typeof msg.timestamp === 'string' 
              ? msg.timestamp 
              : new Date(msg.timestamp).toISOString(),
        };
        return formattedMsg;
      });

      return c.json({ success: true, messages: formattedMessages });
    } catch (error) {
      console.error(`Error fetching messages for ${tier}:`, error);
      return c.json({ success: false, error: "Failed to fetch messages" }, 500);
    }
  },
);

// Define ChatTier type based on allowedTiers
type ChatTier = (typeof allowedTiers)[number];

// POST /api/chat/:tokenMint/:tier - Post a new message to a specific tier
chatRouter.post(
  "/chat/:tokenMint/:tier",
  validator("param", (value, c) => {
    // Basic validation
    const tier = value["tier"];
    if (!tier || !allowedTiers.includes(tier)) {
      return c.text("Invalid tier parameter", 400);
    }
    return { tier: tier as ChatTier, tokenMint: value["tokenMint"] }; // Cast tier
  }),
  validator("json", (value, c) => {
    // Basic validation
    const message = value["message"];
    if (
      !message ||
      typeof message !== "string" ||
      message.trim().length === 0 ||
      message.length > 1000
    ) {
      // Add length limit
      return c.text("Invalid message content", 400);
    }
    const parentId = value["parentId"];
    if (parentId && typeof parentId !== "string") {
      return c.text("Invalid parentId", 400);
    }
    return { message: message.trim(), parentId: parentId || null };
  }),
  async (c) => {
    const user = c.get("user");
    const { tokenMint, tier } = c.req.valid("param");
    const { message, parentId } = c.req.valid("json");
    // Attempt to get clientId if passed by client (e.g., in header or body)
    const senderClientId = c.req.header('X-Client-ID'); // Example: Check header

    try {
      const balance = await checkUserTokenBalance(
        user.publicKey,
        tokenMint,
      );
      const requiredBalance = getTierThreshold(tier);

      if (balance < requiredBalance) {
        return c.json(
          {
            success: false,
            error: `Insufficient balance. Need ${requiredBalance.toLocaleString()} tokens to post.`,
          },
          403,
        );
      }

      const newMessageData = {
        id: crypto.randomUUID(),
        author: user.publicKey,
        tokenMint: tokenMint,
        message: message,
        parentId: parentId,
        tier: tier,
        replyCount: 0,
        timestamp: new Date(),
        media: null,
      };

      console.log('Creating new message with timestamp:', newMessageData.timestamp);

      const currentDb = db(c);
      await currentDb
        .insert(schema.messages)
        .values(newMessageData);

      const insertedMessage = await currentDb
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.id, newMessageData.id))
        .limit(1);

      console.log('Retrieved message from DB:', insertedMessage[0]);

      if (insertedMessage && insertedMessage.length > 0) {
        const finalMessage = {
          ...insertedMessage[0],
          timestamp: new Date(insertedMessage[0].timestamp).toISOString(),
        };

        console.log('Sending final message with timestamp:', finalMessage.timestamp);

        const roomName = `chat:${tokenMint}:${tier}`;
        logger.info(`Broadcasting new message to room: ${roomName}`);
        webSocketManager.broadcastToRoom(
            roomName,
            'newChatMessage',
            finalMessage,
            senderClientId
        ).catch((err: Error) => {
            logger.error(`Error broadcasting message to room ${roomName}:`, err);
        });

        return c.json({ success: true, message: finalMessage }, 201);
      } else {
        throw new Error("Failed to insert message or retrieve inserted row.");
      }
    } catch (error) {
      console.error(`Error posting message to ${tier}:`, error);
      return c.json({ success: false, error: "Failed to post message" }, 500);
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
      const currentDb = db(c);
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

// Get all root messages (no parentId) for a token
chatRouter.get("/chat/:mint", async (c) => {
  try {
    const mint = c.req.param("mint");

    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    // Parse pagination parameters
    const limit = parseInt(c.req.query("limit") || "20");
    const page = parseInt(c.req.query("page") || "1");
    const offset = (page - 1) * limit;

    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Messages query timed out")), 5000),
    );

    const db = getDB();

    // Query root messages with timeout protection
    const messagesQueryPromise = async () => {
      try {
        // Get count of all root messages (no parentId) for pagination
        const totalMessagesQuery = await db
          .select()
          .from(messagesTable)
          .where(
            and(
              eq(messagesTable.tokenMint, mint),
              sql`${messagesTable.parentId} IS NULL`,
            ),
          );

        const totalMessages = totalMessagesQuery.length || 0;

        // Get actual messages from database
        const messagesResult = await db
          .select()
          .from(messagesTable)
          .where(
            and(
              eq(messagesTable.tokenMint, mint),
              sql`${messagesTable.parentId} IS NULL`,
            ),
          )
          .orderBy(desc(messagesTable.timestamp))
          .limit(limit)
          .offset(offset);

        return { messages: messagesResult || [], total: totalMessages };
      } catch (error) {
        logger.error("Database error in messages query:", error);
        return { messages: [], total: 0 };
      }
    };

    // Execute query with timeout
    const result = (await Promise.race([
      messagesQueryPromise(),
      timeoutPromise,
    ]).catch((error) => {
      logger.error("Messages query failed or timed out:", error);
      return { messages: [], total: 0 };
    })) as { messages: any[]; total: number };

    const messagesWithLikes = result.messages;

    const totalPages = Math.ceil(result.total / limit);

    return c.json({
      messages: messagesWithLikes,
      page,
      totalPages,
      total: result.total,
      hasMore: page < totalPages,
    });
  } catch (error) {
    logger.error("Error in messages route:", error);
    // Return empty results in case of general errors
    return c.json(
      {
        messages: [],
        page: 1,
        totalPages: 0,
        total: 0,
        error: "Failed to fetch messages",
      },
      500,
    );
  }
});

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

// Create a new message or reply
chatRouter.post("/chat/:mint", async (c) => {
  try {
    // Require authentication
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    const body = await c.req.json();

    // Validate input
    if (
      !body.message ||
      typeof body.message !== "string" ||
      body.message.length < 1 ||
      body.message.length > 500
    ) {
      return c.json(
        { error: "Message must be between 1 and 500 characters" },
        400,
      );
    }

    const db = getDB();

    // Create the message
    const messageData = {
      id: crypto.randomUUID(),
      author: user.publicKey,
      tokenMint: mint,
      message: body.message,
      parentId: body.parentId || null,
      replyCount: 0,
      likes: 0,
      timestamp: new Date(),
      tier: "1",
      media: body.media || null,
    };

    // Insert the message
    await db.insert(messages).values(messageData).onConflictDoNothing();

    // If this is a reply, increment the parent's replyCount
    if (body.parentId) {
      await db
        .update(messages)
        .set({
          replyCount: messageData.replyCount + 1,
        } as any)
        .where(eq(messagesTable.id, body.parentId));
    }

    return c.json({ ...messageData, hasLiked: false });
  } catch (error) {
    logger.error("Error creating message:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

// Add new endpoint for uploading chat images
chatRouter.post("/chat/:tokenMint/:tier/upload-image", async (c) => {
  try {
    const user = c.get("user");
    const { tokenMint, tier } = c.req.param();
    const { imageBase64, caption } = await c.req.json();

    if (!user) {
      return c.json({ error: "Authentication required" }, 401);
    }

    if (!imageBase64) {
      return c.json({ error: "No image data provided" }, 400);
    }

    // Validate tier
    if (!["1k", "100k", "1M"].includes(tier)) {
      return c.json({ error: "Invalid tier" }, 400);
    }

    // Extract content type and base64 data
    const imageMatch = imageBase64.match(/^data:(image\/[a-z+]+);base64,(.*)$/);
    if (!imageMatch) {
      return c.json({ error: "Invalid image data URI format" }, 400);
    }

    const contentType = imageMatch[1];
    const base64Data = imageMatch[2];
    const imageBuffer = Buffer.from(base64Data, "base64");

    // Determine file extension
    let extension = ".jpg";
    if (contentType.includes("png")) extension = ".png";
    else if (contentType.includes("gif")) extension = ".gif";
    else if (contentType.includes("svg")) extension = ".svg";
    else if (contentType.includes("webp")) extension = ".webp";

    // Generate filename with wallet ID and timestamp
    const timestamp = Date.now();
    const filename = `${user.publicKey}-${timestamp}${extension}`;
    const imageKey = `chat-images/${tokenMint}/${tier}/${filename}`;

    // Upload using the uploader function
    const imageUrl = await uploadWithS3(
      imageBuffer,
      { 
        filename,
        contentType,
        basePath: `chat-images/${tokenMint}/${tier}`
      }
    );

    // Validate that the image URL is from auto.fun domain
    if (!imageUrl.includes('.auto.fun')) {
      logger.error(`Rejected non-auto.fun image URL: ${imageUrl}`);
      return c.json({ error: "Invalid image URL domain" }, 400);
    }

    // Create a new message with the image URL
    const messageData = {
      id: crypto.randomUUID(),
      author: user.publicKey,
      tokenMint: tokenMint,
      message: caption || "",
      parentId: null,
      replyCount: 0,
      likes: 0,
      timestamp: new Date(),
      tier: tier,
      media: imageUrl
    };

    const currentDb = db(c);
    await currentDb.insert(schema.messages).values(messageData);

    const insertedMessage = await currentDb
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.id, messageData.id))
      .limit(1);

    if (insertedMessage && insertedMessage.length > 0) {
      const finalMessage = {
        ...insertedMessage[0],
        timestamp: new Date(insertedMessage[0].timestamp).toISOString(),
      };

      const roomName = `chat:${tokenMint}:${tier}`;
      logger.info(`Broadcasting new message to room: ${roomName}`);
      webSocketManager.broadcastToRoom(
        roomName,
        'newChatMessage',
        finalMessage
      ).catch((err: Error) => {
        logger.error(`Error broadcasting message to room ${roomName}:`, err);
      });

      return c.json({ success: true, message: finalMessage }, 201);
    }

    return c.json({ success: true, imageUrl });
  } catch (error) {
    console.error("Error uploading chat image:", error);
    return c.json({ error: "Failed to upload image" }, 500);
  }
});

export default chatRouter;