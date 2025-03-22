import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getDB } from "../db";
import { getDBWithFallback } from "../db-adapter";
import { createTestEnv, generateTestId } from "./helpers/test-utils";
import crypto from "crypto";
import * as schema from "../db";

// Create a mock environment using our helper
const mockEnv = createTestEnv();

// Helper type for the database
type DB = ReturnType<typeof getDB>;

describe("Database initialization", () => {
  beforeEach(() => {
    // Restore all mocks before each test
    vi.restoreAllMocks();

    // Mock crypto.randomUUID with a properly formatted UUID
    vi.spyOn(crypto, "randomUUID").mockImplementation(
      () => "00000000-0000-4000-a000-000000000000",
    );
  });

  it("should initialize DB with mock data in test environment", async () => {
    const db = getDB(mockEnv) as any;
    expect(db).toBeDefined();

    // Test token queries
    const tokenResult = await db.select().from(db.tokens);
    expect(Array.isArray(tokenResult)).toBe(true);

    if (tokenResult.length > 0) {
      expect(tokenResult[0].name).toBeDefined();
      expect(tokenResult[0].mint).toBeDefined();
    }
  });

  it("should properly insert and retrieve data", async () => {
    const db = getDB(mockEnv) as any;

    // Test inserting new token
    const newTokenId = generateTestId("token");
    const newMint = generateTestId("mint");

    await db.insert(db.tokens).values({
      id: newTokenId,
      name: "Test Token",
      ticker: "TEST",
      url: "https://example.com",
      image: "https://example.com/image.png",
      mint: newMint,
      creator: "test-creator",
      status: "active",
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    });

    // Verify token was inserted by querying directly
    const tokens = await db.select().from(db.tokens);
    const foundToken = tokens.find((token) => token.id === newTokenId);
    expect(foundToken).toBeDefined();
    expect(foundToken?.name).toBe("Test Token");
  });

  it("should initialize DB with fallback in test environment", async () => {
    // Skip this test in CI environments where it might timeout
    if (process.env.CI) {
      return;
    }

    const db = getDBWithFallback(mockEnv) as any;
    expect(db).toBeDefined();

    // Test basic query - this should return an empty array in fallback mode
    const tokens = await db.select().from(db.tokens);
    expect(Array.isArray(tokens)).toBe(true);
  }, 10000); // Set timeout to 10 seconds

  it("should handle CRUD operations properly", async () => {
    const db = getDB(mockEnv) as any;

    // Generate unique IDs for this test
    const uniqueId = generateTestId("crud");
    const testMint = generateTestId("mint");

    // 1. Create: Insert new token
    await db.insert(db.tokens).values({
      id: uniqueId,
      name: "CRUD Test Token",
      ticker: "CRUD",
      url: "https://example.com/crud",
      image: "https://example.com/crud.png",
      mint: testMint,
      creator: "crud-creator",
      status: "active",
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    });

    // 2. Read: Fetch all tokens and find the one we created
    let tokens = await db.select().from(db.tokens);
    const foundToken = tokens.find((token) => token.id === uniqueId);
    expect(foundToken).toBeDefined();
    expect(foundToken?.name).toBe("CRUD Test Token");

    // 3. Update: Modify the token - use plain object condition for our mock
    await db
      .update(db.tokens)
      .set({ name: "Updated Token", lastUpdated: new Date().toISOString() })
      .where({ id: uniqueId });

    // Verify update by fetching all tokens again and finding our updated one
    tokens = await db.select().from(db.tokens);
    const updatedToken = tokens.find((token) => token.id === uniqueId);
    expect(updatedToken).toBeDefined();
    expect(updatedToken?.name).toBe("Updated Token");

    // 4. Delete: Remove the token (in real tests we'd use this, but we'll keep it for mock consistency)
    await db.delete(db.tokens).where({ id: uniqueId });

    // Verify deletion by checking it's no longer in the results
    tokens = await db.select().from(db.tokens);
    const deletedToken = tokens.find((token) => token.id === uniqueId);
    expect(deletedToken).toBeUndefined();
  });
});

describe("Database tables schema", () => {
  it("should have all tables defined properly", async () => {
    const db = getDB(mockEnv) as any;

    // Test inserting and querying each table type

    // 1. Test tokens table (already tested above)

    // 2. Test swaps table
    const swapId = generateTestId("swap");
    await db.insert(db.swaps).values({
      id: swapId,
      tokenMint: mockEnv.tokenPubkey!,
      user: "test-user",
      type: "market",
      direction: 0,
      amountIn: 10,
      amountOut: 9.5,
      price: 1.0,
      txId: generateTestId("tx"),
      timestamp: new Date().toISOString(),
    });

    // Find the swap in the results
    const swaps = await db.select().from(db.swaps);
    const foundSwap = swaps.find((swap) => swap.id === swapId);
    expect(foundSwap).toBeDefined();
    expect(foundSwap?.tokenMint).toBe(mockEnv.tokenPubkey);

    // 3. Test messages table
    const messageId = generateTestId("message");
    await db.insert(db.messages).values({
      id: messageId,
      author: "test-author",
      tokenMint: mockEnv.tokenPubkey!,
      message: "Hello, world!",
      timestamp: new Date().toISOString(),
    });

    // Find the message in the results
    const messages = await db.select().from(db.messages);
    const foundMessage = messages.find((message) => message.id === messageId);
    expect(foundMessage).toBeDefined();
    expect(foundMessage?.message).toBe("Hello, world!");

    // 4. Test users table
    const userId = generateTestId("user");
    const userAddress = generateTestId("address");
    await db.insert(db.users).values({
      id: userId,
      name: "Test User",
      address: userAddress,
      createdAt: new Date().toISOString(),
    });

    // Find the user in the results
    const users = await db.select().from(db.users);
    const foundUser = users.find((user) => user.id === userId);
    expect(foundUser).toBeDefined();
    expect(foundUser?.name).toBe("Test User");
  });
});
