import { eq, inArray, sql, and, desc } from "drizzle-orm";
import { Hono } from "hono";
import {
  getDB,
  messageLikes,
  messages,
  messages as messagesTable,
} from "../db";
import { Env } from "../env";
import { logger } from "../logger";
// Create a router for admin routes
const messagesRouter = new Hono<{
  Bindings: Env;
  Variables: {
    user?: { publicKey: string } | null;
  };
}>();

// Get all root messages (no parentId) for a token
messagesRouter.get("/messages/:mint", async (c) => {
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

    const db = getDB(c.env);

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

    // If we have real results, check if user is logged in to add hasLiked field
    const userPublicKey = c.get("user")?.publicKey;
    let messagesWithLikes = result.messages;

    if (userPublicKey && result.messages.length > 0) {
      try {
        messagesWithLikes = await addHasLikedToMessages(
          db,
          result.messages,
          userPublicKey,
        );
      } catch (error) {
        logger.error("Error adding likes info to messages:", error);
        // Continue with messages without like info
      }
    }

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

// Get replies for a specific message
messagesRouter.get("/messages/:messageId/replies", async (c) => {
  try {
    const messageId = c.req.param("messageId");
    const db = getDB(c.env);

    // Get replies for this message
    const repliesResult = await db
      .select()
      .from(messagesTable)
      .where(eq(messages.parentId, messageId))
      .orderBy(desc(messages.timestamp));

    // If user is logged in, add hasLiked field to replies
    const userPublicKey = c.get("user")?.publicKey;
    let repliesWithLikes = repliesResult;

    if (userPublicKey && repliesResult.length > 0) {
      repliesWithLikes = await addHasLikedToMessages(
        db,
        repliesResult,
        userPublicKey,
      );
    }

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
messagesRouter.get("/messages/:messageId/thread", async (c) => {
  try {
    const messageId = c.req.param("messageId");
    const db = getDB(c.env);

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
    const userPublicKey = c.get("user")?.publicKey;
    let parentWithLikes = parentResult;
    let repliesWithLikes = repliesResult;

    if (userPublicKey) {
      if (parentResult.length > 0) {
        parentWithLikes = await addHasLikedToMessages(
          db,
          parentResult,
          userPublicKey,
        );
      }

      if (repliesResult.length > 0) {
        repliesWithLikes = await addHasLikedToMessages(
          db,
          repliesResult,
          userPublicKey,
        );
      }
    }

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
messagesRouter.post("/messages/:mint", async (c) => {
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

    const db = getDB(c.env);

    // Create the message
    const messageData = {
      id: crypto.randomUUID(),
      message: body.message,
      parentId: body.parentId || null,
      tokenMint: mint,
      author: user.publicKey,
      replyCount: 0,
      likes: 0,
      timestamp: new Date().toISOString(),
    };

    // Insert the message
    await db.insert(messages).values(messageData);

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

// Like a message
messagesRouter.post("/messages/:messageId/likes", async (c) => {
  try {
    // Require authentication
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const messageId = c.req.param("messageId");
    const userAddress = user.publicKey;

    const db = getDB(c.env);

    // Find the message
    const message = await db
      .select()
      .from(messagesTable)
      .where(eq(messages.id, messageId))
      .limit(1);

    if (message.length === 0) {
      return c.json({ error: "Message not found" }, 404);
    }

    // Check if user already liked this message
    const existingLike = await db
      .select()
      .from(messageLikes)
      .where(
        and(
          eq(messageLikes.messageId, messageId),
          eq(messageLikes.userAddress, userAddress),
        ),
      )
      .limit(1);

    if (existingLike.length > 0) {
      return c.json({ error: "Already liked this message" }, 400);
    }

    // Create like record
    await db.insert(messageLikes).values({
      id: crypto.randomUUID(),
      messageId,
      userAddress,
      timestamp: new Date().toISOString(),
    });

    // Increment message likes
    await db
      .update(messages)
      .set({
        likes: sql`${messages.likes} + 1`,
      } as any)
      .where(eq(messages.id, messageId));

    // Get updated message
    const updatedMessage = await db
      .select()
      .from(messagesTable)
      .where(eq(messages.id, messageId))
      .limit(1);

    return c.json({ ...updatedMessage[0], hasLiked: true });
  } catch (error) {
    logger.error("Error liking message:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

// Helper function to add hasLiked field to messages
async function addHasLikedToMessages(
  db: ReturnType<typeof getDB>,
  messagesList: Array<any>,
  userAddress: string,
): Promise<Array<any>> {
  if (
    !Array.isArray(messagesList) ||
    messagesList.length === 0 ||
    !userAddress
  ) {
    return messagesList;
  }

  // Extract message IDs
  const messageIds = messagesList.map((message) => message.id);

  // Query for likes by this user for these messages
  const userLikes = await db
    .select()
    .from(messageLikes)
    .where(
      and(
        inArray(messageLikes.messageId, messageIds),
        eq(messageLikes.userAddress, userAddress),
      ),
    );

  // Create a Set of liked message IDs for quick lookup
  const likedMessageIds = new Set(
    userLikes.map((like: { messageId: string }) => like.messageId),
  );

  // Add hasLiked field to each message
  return messagesList.map((message) => ({
    ...message,
    hasLiked: likedMessageIds.has(message.id),
  }));
}

export default messagesRouter;
