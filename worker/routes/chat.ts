import { Connection, PublicKey } from "@solana/web3.js";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import { getRpcUrl } from "../util";

// ---=== Database Schema and Drizzle ===---
import { and, asc, eq } from "drizzle-orm"; // Import Drizzle functions
import { Context } from "hono"; // Import Context type
import * as schema from "../db"; // Import your generated schema
import { getDB } from "../db"; // Import the getDB helper
import { Env } from "../env"; // Import Env type from env.ts
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
const db = (c: Context<any>) => getDB(c.env as Env);

// --- Placeholder Functions ---
// Replace these with your actual implementations

// Updated to use both database and blockchain
async function checkUserTokenBalance(
  drizzleDb: ReturnType<typeof db>,
  userPublicKey: string,
  tokenMint: string,
  env: Env,
): Promise<number> {
  console.log(`Checking balance for user ${userPublicKey}, token ${tokenMint}`);

  // First check database balance
  let dbBalance = 0;
  try {
    const result = await drizzleDb
      .select({
        amount: schema.tokenHolders.amount,
      })
      .from(schema.tokenHolders)
      .where(
        and(
          eq(schema.tokenHolders.address, userPublicKey),
          eq(schema.tokenHolders.mint, tokenMint),
        ),
      )
      .limit(1);

    dbBalance =
      result.length > 0 && result[0].amount ? Number(result[0].amount) : 0;
  } catch (error) {
    console.error(
      `Error checking database balance for ${userPublicKey} / ${tokenMint}:`,
      error,
    );
  }

  // Then check blockchain balance
  let blockchainBalance = 0;
  try {
    const connection = new Connection(getRpcUrl(env), "confirmed");
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

  // Use the higher of the two balances
  const effectiveBalance = Math.max(dbBalance, blockchainBalance);
  console.log(
    `Balance check results - DB: ${dbBalance}, Blockchain: ${blockchainBalance}, Effective: ${effectiveBalance}`,
  );

  return effectiveBalance;
}

function getUserEligibleTiers(balance: number): string[] {
  const tiers: string[] = [];
  if (balance >= 1000) tiers.push("1k");
  if (balance >= 10000) tiers.push("10k");
  if (balance >= 100000) tiers.push("100k");
  if (balance >= 1000000) tiers.push("1M");
  return tiers;
}

function getTierThreshold(tier: string): number {
  switch (tier) {
    case "1k":
      return 1000;
    case "10k":
      return 10000;
    case "100k":
      return 100000;
    case "1M":
      return 1000000;
    default:
      throw new Error("Invalid tier");
  }
}

const allowedTiers = ["1k", "10k", "100k", "1M"];

// --- Hono App ---
const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// --- Routes (Updated GET and POST) ---

// GET /api/chat/:tokenMint/tiers - Get eligible tiers for the user
app.get("/chat/:tokenMint/tiers", async (c) => {
  const user = c.get("user");
  const tokenMint = c.req.param("tokenMint");

  if (!tokenMint) {
    return c.json({ success: false, error: "Token mint is required" }, 400);
  }

  try {
    const currentDb = db(c);
    const balance = await checkUserTokenBalance(
      currentDb,
      user.publicKey,
      tokenMint,
      c.env,
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
app.get(
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
      const currentDb = db(c);
      const balance = await checkUserTokenBalance(
        currentDb,
        user.publicKey,
        tokenMint,
        c.env,
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
      const messages = await currentDb
        .select()
        .from(schema.messages)
        .where(
          and(
            eq(schema.messages.tokenMint, tokenMint),
            eq(schema.messages.tier, tier),
          ),
        )
        .orderBy(asc(schema.messages.timestamp)) // Order by timestamp ascending for chat
        .limit(limit)
        .offset(offset);

      // Ensure timestamp is ISO string (D1 might return numbers or strings)
      const formattedMessages = messages.map((msg) => ({
        ...msg,
        timestamp:
          typeof msg.timestamp === "string"
            ? msg.timestamp
            : typeof msg.timestamp === "number"
              ? new Date(msg.timestamp).toISOString()
              : new Date().toISOString(), // Fallback if type is unexpected
      }));

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
app.post(
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

    try {
      const currentDb = db(c);
      const balance = await checkUserTokenBalance(
        currentDb,
        user.publicKey,
        tokenMint,
        c.env,
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
        id: crypto.randomUUID(), // Generate UUID for the message
        author: user.publicKey,
        tokenMint: tokenMint,
        message: message,
        parentId: parentId,
        tier: tier, // Store the tier
        replyCount: 0,
        timestamp: new Date().toISOString(),
      };

      // Insert the new message into the database
      const insertedResult = await currentDb
        .insert(schema.messages)
        .values(newMessageData)
        .returning(); // Return the inserted row

      // Check if insertion was successful (Drizzle with D1 might return limited info)
      // We fetch the inserted message by ID to be sure we have the correct data
      const insertedMessage = await currentDb
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.id, newMessageData.id))
        .limit(1);

      // --- WebSocket Broadcast Placeholder ---
      // Consider broadcasting the new message via WebSockets here
      // --- End Placeholder ---

      // Return the newly created message object (Drizzle returns an array)
      if (insertedMessage && insertedMessage.length > 0) {
        // Ensure timestamp is ISO string
        const finalMessage = {
          ...insertedMessage[0],
          timestamp:
            typeof insertedMessage[0].timestamp === "string"
              ? insertedMessage[0].timestamp
              : typeof insertedMessage[0].timestamp === "number"
                ? new Date(insertedMessage[0].timestamp).toISOString()
                : new Date().toISOString(), // Fallback
        };
        return c.json({ success: true, message: finalMessage }, 201);
      } else {
        // Log the result if available for debugging
        console.error("Insertion result (if any):", insertedResult);
        throw new Error("Failed to insert message or retrieve inserted row.");
      }
    } catch (error) {
      console.error(`Error posting message to ${tier}:`, error);
      return c.json({ success: false, error: "Failed to post message" }, 500);
    }
  },
);

// DELETE /api/chat/:tokenMint/:tier/message/:messageId - Delete a message
app.delete(
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

export default app;

// Basic WebSocket Server Stub (Illustrative - needs proper implementation)
// You would typically run this alongside Hono or integrate using Hono's WebSocket support
/*
const webSocketServer = {
    clients: new Map(), // Map<roomId, Set<WebSocket>>
    broadcastToRoom: (tokenMint: string, tier: string, data: any) => {
        const roomId = `${tokenMint}-${tier}`;
        const roomClients = webSocketServer.clients.get(roomId);
        if (roomClients) {
            const message = JSON.stringify(data);
            roomClients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(message);
                }
            });
        }
    },
    // Add methods for handling connections, disconnections, subscriptions etc.
};
*/
