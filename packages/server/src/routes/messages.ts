import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import {
  getDB,
  messages,
  messages as messagesTable,
} from "../db";
import { logger } from "../logger";
// Create a router for admin routes
const messagesRouter = new Hono<{
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
messagesRouter.get("/messages/:mint/:tier/updates", async (c) => {
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
messagesRouter.get("/messages/:messageId/replies", async (c) => {
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
messagesRouter.get("/messages/:messageId/thread", async (c) => {
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

    const db = getDB();

    // Create the message
    const messageData = {
      id: crypto.randomUUID(),
      message: body.message,
      parentId: body.parentId || null,
      tokenMint: mint,
      author: user.publicKey,
      replyCount: 0,
      likes: 0,
      timestamp: new Date(),
    };

    // Insert the message
    await db.insert(messages).values([messageData]).onConflictDoNothing();

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

export default messagesRouter;
