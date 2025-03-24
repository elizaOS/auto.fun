import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import {
  tokens,
  schema,
  getDB,
  swaps,
  fees,
  tokenHolders,
  messages,
  messageLikes,
  users,
  vanityKeypairs,
  mediaGenerations,
  personalities,
  cachePrices,
} from "../../db";
import { Env } from "../../env";
import { eq, and, sql } from "drizzle-orm";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

// Test environment setup
const createTestEnv = (): Env => {
  return {
    NODE_ENV: "test",
    NETWORK: "devnet",
    DECIMALS: "9",
    TOKEN_SUPPLY: "1000000000000000000",
    VIRTUAL_RESERVES: "1000000000",
    CURVE_LIMIT: "1000000000000",
    API_KEY: "test-api-key",
    USER_API_KEY: "test-user-api-key",
    ADMIN_KEY: "test-admin-key",
    ADMIN_API_KEY: "test-admin-api-key",
    FAL_API_KEY: "test-fal-api-key",
    SWAP_FEE: "1.5",
    CODEX_API_KEY: process.env.CODEX_API_KEY || "test-codex-api-key",
    DB: {} as any, // Will be populated in beforeAll
    WEBSOCKET_DO: {} as any,
  };
};

// Test token data
const TEST_TOKEN_DATA = {
  id: "test-token-1",
  name: "Test Token",
  ticker: "TEST",
  url: "https://test-token.com",
  image: "https://test-token.com/image.png",
  mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // BONK token
  creator: "test-creator",
  status: "active",
  createdAt: new Date().toISOString(),
  lastUpdated: new Date().toISOString(),
  currentPrice: 0.00000123,
  marketId: "test-market-id",
  reserveAmount: 1000000000,
  marketCapUSD: 12345,
  tokenPriceUSD: 0.000123,
  solPriceUSD: 100.5,
  volume24h: 12345.67,
};

// Test swap data
const TEST_SWAP_DATA = {
  id: "test-swap-1",
  tokenMint: TEST_TOKEN_DATA.mint,
  user: "test-user-address",
  type: "market",
  direction: 0, // Buy
  amountIn: 1.5,
  amountOut: 1000000,
  priceImpact: 0.01,
  price: 0.0000015,
  txId: "test-tx-id-1",
  timestamp: new Date().toISOString(),
};

// Test fee data
const TEST_FEE_DATA = {
  id: "test-fee-1",
  tokenMint: TEST_TOKEN_DATA.mint,
  user: "test-user-address",
  direction: 0,
  feeAmount: "0.015",
  tokenAmount: "1000000",
  solAmount: "1.5",
  type: "swap",
  txId: "test-tx-id-1",
  timestamp: new Date().toISOString(),
};

// Test token holder data
const TEST_HOLDER_DATA = {
  id: "test-holder-1",
  mint: TEST_TOKEN_DATA.mint,
  address: "test-holder-address",
  amount: 10000000,
  percentage: 0.05,
  lastUpdated: new Date().toISOString(),
};

// Test agent data
const TEST_AGENT_DATA = {
  id: "test-agent-1",
  ownerAddress: "test-owner-address",
  contractAddress: TEST_TOKEN_DATA.mint,
  txId: "test-tx-id-agent",
  symbol: "AGENT",
  name: "Test Agent",
  description: "A test agent",
  systemPrompt: "You are a test agent",
  bio: "Test agent bio",
  modelProvider: "claude",
  createdAt: new Date().toISOString(),
};

// Test message data
const TEST_MESSAGE_DATA = {
  id: "test-message-1",
  author: "test-author",
  tokenMint: TEST_TOKEN_DATA.mint,
  message: "This is a test message",
  replyCount: 0,
  likes: 0,
  timestamp: new Date().toISOString(),
};

// Test message like data
const TEST_MESSAGE_LIKE_DATA = {
  id: "test-message-like-1",
  messageId: "test-message-1",
  userAddress: "test-user-address",
  timestamp: new Date().toISOString(),
};

// Test personality data
const TEST_PERSONALITY_DATA = {
  name: "Test Personality",
  description: "A test personality",
};

// Test user data
const TEST_USER_DATA = {
  id: "test-user-1",
  name: "Test User",
  address: "test-user-address",
  avatar: "https://example.com/avatar.png",
  createdAt: new Date().toISOString(),
};

// Test vanity keypair data
const TEST_VANITY_KEYPAIR_DATA = {
  id: "test-keypair-1",
  address: "test-vanity-address",
  secretKey: "test-secret-key",
  createdAt: new Date().toISOString(),
  used: 0,
};

// Test media generation data
const TEST_MEDIA_GENERATION_DATA = {
  id: "test-media-1",
  mint: TEST_TOKEN_DATA.mint,
  type: "image",
  prompt: "A test prompt",
  mediaUrl: "https://example.com/image.png",
  timestamp: new Date().toISOString(),
};

// Test cache price data
const TEST_CACHE_PRICE_DATA = {
  id: "test-cache-1",
  type: "sol",
  symbol: "SOL",
  price: "100.5",
  timestamp: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
};

describe("Database Operations", () => {
  let testEnv: Env;
  let db: any;
  let sqliteClient: any;

  beforeAll(async () => {
    // Initialize test database using SQLite in-memory database
    sqliteClient = createClient({
      url: "file::memory:",
    });

    // Create a mock D1 client that wraps the SQLite client
    // This ensures compatibility with functions expecting a D1 interface
    const mockD1Client = {
      ...sqliteClient,
      prepare: (query: string) => {
        // Create a mock prepared statement that matches D1's interface
        return {
          bind: (...params: any[]) => {
            // Return an object that conforms to the expected interface
            return {
              all: async () => {
                try {
                  // Execute the query directly via libsql
                  const result = await sqliteClient.execute({
                    sql: query,
                    args: params,
                  });
                  return result.rows || [];
                } catch (error) {
                  console.error("Error executing query:", error);
                  throw error;
                }
              },
              run: async () => {
                try {
                  // Execute the query directly via libsql
                  return await sqliteClient.execute({
                    sql: query,
                    args: params,
                  });
                } catch (error) {
                  console.error("Error executing query:", error);
                  throw error;
                }
              },
            };
          },
        };
      },
    };

    // Initialize the DrizzleORM with the wrapped mock client
    const drizzleDB = drizzle(sqliteClient, { schema });

    // Initialize test environment
    testEnv = createTestEnv();
    testEnv.DB = mockD1Client; // Use the mock D1 client
    db = drizzleDB;

    // Create the token table
    await sqliteClient.execute(`
      CREATE TABLE IF NOT EXISTS tokens (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        ticker TEXT NOT NULL,
        url TEXT NOT NULL,
        image TEXT NOT NULL,
        twitter TEXT,
        telegram TEXT,
        website TEXT,
        description TEXT,
        mint TEXT NOT NULL UNIQUE,
        creator TEXT NOT NULL,
        nft_minted TEXT,
        lock_id TEXT,
        locked_amount TEXT,
        locked_at TEXT,
        harvested_at TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        last_updated TEXT NOT NULL,
        completed_at TEXT,
        withdrawn_at TEXT,
        migrated_at TEXT,
        market_id TEXT,
        base_vault TEXT,
        quote_vault TEXT,
        withdrawn_amount REAL,
        reserve_amount REAL,
        reserve_lamport REAL,
        virtual_reserves REAL,
        liquidity REAL,
        current_price REAL,
        market_cap_usd REAL,
        token_price_usd REAL,
        sol_price_usd REAL,
        curve_progress REAL,
        curve_limit REAL,
        price_change_24h REAL,
        price_24h_ago REAL,
        volume_24h REAL,
        inference_count INTEGER,
        last_volume_reset TEXT,
        last_price_update TEXT,
        holder_count INTEGER,
        tx_id TEXT
      )
    `);

    // Create swaps table
    await sqliteClient.execute(`
      CREATE TABLE IF NOT EXISTS swaps (
        id TEXT PRIMARY KEY,
        token_mint TEXT NOT NULL,
        user TEXT NOT NULL,
        type TEXT NOT NULL,
        direction INTEGER NOT NULL,
        amount_in REAL,
        amount_out REAL,
        price_impact REAL,
        price REAL NOT NULL,
        tx_id TEXT NOT NULL UNIQUE,
        timestamp TEXT NOT NULL
      )
    `);

    // Create fees table
    await sqliteClient.execute(`
      CREATE TABLE IF NOT EXISTS fees (
        id TEXT PRIMARY KEY,
        token_mint TEXT NOT NULL,
        user TEXT,
        direction INTEGER,
        fee_amount TEXT,
        token_amount TEXT,
        sol_amount TEXT,
        type TEXT NOT NULL,
        tx_id TEXT,
        timestamp TEXT NOT NULL
      )
    `);

    // Create token_holders table
    await sqliteClient.execute(`
      CREATE TABLE IF NOT EXISTS token_holders (
        id TEXT PRIMARY KEY,
        mint TEXT NOT NULL,
        address TEXT NOT NULL,
        amount REAL NOT NULL,
        percentage REAL NOT NULL,
        last_updated TEXT NOT NULL
      )
    `);

    // Create messages table
    await sqliteClient.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        author TEXT NOT NULL,
        token_mint TEXT NOT NULL,
        message TEXT NOT NULL,
        parent_id TEXT,
        reply_count INTEGER,
        likes INTEGER NOT NULL DEFAULT 0,
        timestamp TEXT NOT NULL
      )
    `);

    // Create message_likes table
    await sqliteClient.execute(`
      CREATE TABLE IF NOT EXISTS message_likes (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
        user_address TEXT NOT NULL,
        timestamp TEXT NOT NULL
      )
    `);

    // Create personalities table
    await sqliteClient.execute(`
      CREATE TABLE IF NOT EXISTS personalities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        created_at INTEGER DEFAULT CURRENT_TIMESTAMP,
        updated_at INTEGER DEFAULT CURRENT_TIMESTAMP,
        deleted_at INTEGER
      )
    `);

    // Create users table
    await sqliteClient.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT,
        address TEXT NOT NULL UNIQUE,
        avatar TEXT NOT NULL DEFAULT 'https://ipfs.io/ipfs/bafkreig4ob6pq5qy4v6j62krj4zkh2kc2pnv5egqy7f65djqhgqv3x56pq',
        created_at TEXT NOT NULL
      )
    `);

    // Create vanity_keypairs table
    await sqliteClient.execute(`
      CREATE TABLE IF NOT EXISTS vanity_keypairs (
        id TEXT PRIMARY KEY,
        address TEXT NOT NULL UNIQUE,
        secret_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        used INTEGER NOT NULL DEFAULT 0
      )
    `);

    // Create media_generations table
    await sqliteClient.execute(`
      CREATE TABLE IF NOT EXISTS media_generations (
        id TEXT PRIMARY KEY,
        mint TEXT NOT NULL,
        type TEXT NOT NULL,
        prompt TEXT NOT NULL,
        media_url TEXT NOT NULL,
        negative_prompt TEXT,
        num_inference_steps INTEGER,
        seed INTEGER,
        num_frames INTEGER,
        fps INTEGER,
        motion_bucket_id INTEGER,
        duration INTEGER,
        duration_seconds INTEGER,
        bpm INTEGER,
        creator TEXT,
        timestamp TEXT NOT NULL,
        daily_generation_count INTEGER,
        last_generation_reset TEXT
      )
    `);

    // Create cache_prices table
    await sqliteClient.execute(`
      CREATE TABLE IF NOT EXISTS cache_prices (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        symbol TEXT NOT NULL,
        price TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )
    `);
  });

  beforeEach(async () => {
    // Clean up previous test data
    try {
      await sqliteClient.execute("DELETE FROM tokens");
      await sqliteClient.execute("DELETE FROM swaps");
      await sqliteClient.execute("DELETE FROM fees");
      await sqliteClient.execute("DELETE FROM token_holders");
      await sqliteClient.execute("DELETE FROM messages");
      await sqliteClient.execute("DELETE FROM message_likes");
      await sqliteClient.execute("DELETE FROM personalities");
      await sqliteClient.execute("DELETE FROM users");
      await sqliteClient.execute("DELETE FROM vanity_keypairs");
      await sqliteClient.execute("DELETE FROM media_generations");
      await sqliteClient.execute("DELETE FROM cache_prices");
    } catch (e) {
      console.error("Error cleaning up test database:", e);
    }
  });

  afterAll(async () => {
    // Clean up the test database
    try {
      await sqliteClient.execute("DROP TABLE IF EXISTS tokens");
      await sqliteClient.execute("DROP TABLE IF EXISTS swaps");
      await sqliteClient.execute("DROP TABLE IF EXISTS fees");
      await sqliteClient.execute("DROP TABLE IF EXISTS token_holders");
      await sqliteClient.execute("DROP TABLE IF EXISTS messages");
      await sqliteClient.execute("DROP TABLE IF EXISTS message_likes");
      await sqliteClient.execute("DROP TABLE IF EXISTS personalities");
      await sqliteClient.execute("DROP TABLE IF EXISTS users");
      await sqliteClient.execute("DROP TABLE IF EXISTS vanity_keypairs");
      await sqliteClient.execute("DROP TABLE IF EXISTS media_generations");
      await sqliteClient.execute("DROP TABLE IF EXISTS cache_prices");
    } catch (e) {
      console.error("Error dropping test tables:", e);
    }
  });

  describe("Token Operations", () => {
    it("should insert a new token", async () => {
      try {
        // Insert a token using Drizzle ORM
        const result = await db.insert(tokens).values(TEST_TOKEN_DATA);

        // Verify using ORM query
        const insertedToken = await db.query.tokens.findFirst({
          where: eq(tokens.id, TEST_TOKEN_DATA.id),
        });

        expect(insertedToken).toBeDefined();
        expect(insertedToken?.id).toBe(TEST_TOKEN_DATA.id);
        expect(insertedToken?.mint).toBe(TEST_TOKEN_DATA.mint);

        console.log(`Inserted test token with ID: ${insertedToken?.id}`);
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should retrieve tokens from database", async () => {
      try {
        // First insert a token
        await db.insert(tokens).values(TEST_TOKEN_DATA);

        // Query using ORM
        const dbTokens = await db.query.tokens.findMany();

        // Verify results
        expect(Array.isArray(dbTokens)).toBe(true);
        expect(dbTokens.length).toBeGreaterThan(0);

        // Check that our test token is in the results
        const testToken = dbTokens.find(
          (token) => token.mint === TEST_TOKEN_DATA.mint,
        );
        expect(testToken).toBeDefined();
        expect(testToken?.name).toBe(TEST_TOKEN_DATA.name);
        expect(testToken?.ticker).toBe(TEST_TOKEN_DATA.ticker);

        console.log("Retrieved token data:", testToken);
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should update an existing token", async () => {
      try {
        // First insert a token
        await db.insert(tokens).values(TEST_TOKEN_DATA);

        // Update values
        const updatedPrice = 0.00000456;
        const updatedMarketCap = 45678;
        const updatedTime = new Date().toISOString();

        // Update using ORM
        await db
          .update(tokens)
          .set({
            currentPrice: updatedPrice,
            marketCapUSD: updatedMarketCap,
            lastUpdated: updatedTime,
          })
          .where(eq(tokens.mint, TEST_TOKEN_DATA.mint));

        // Retrieve the updated token
        const updatedToken = await db.query.tokens.findFirst({
          where: eq(tokens.mint, TEST_TOKEN_DATA.mint),
        });

        // Verify the update
        expect(updatedToken).toBeDefined();
        expect(updatedToken?.currentPrice).toBe(updatedPrice);
        expect(updatedToken?.marketCapUSD).toBe(updatedMarketCap);

        console.log("Updated token data:", updatedToken);
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should delete a token", async () => {
      try {
        // First insert a token
        await db.insert(tokens).values(TEST_TOKEN_DATA);

        // Verify it exists
        const beforeDelete = await db.query.tokens.findFirst({
          where: eq(tokens.mint, TEST_TOKEN_DATA.mint),
        });
        expect(beforeDelete).toBeDefined();

        // Delete using ORM
        await db.delete(tokens).where(eq(tokens.mint, TEST_TOKEN_DATA.mint));

        // Verify it's gone
        const afterDelete = await db.query.tokens.findFirst({
          where: eq(tokens.mint, TEST_TOKEN_DATA.mint),
        });
        expect(afterDelete).toBeUndefined();

        console.log(
          `Successfully deleted token with mint: ${TEST_TOKEN_DATA.mint}`,
        );
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });
  });

  describe("Swap Operations", () => {
    it("should insert a new swap", async () => {
      try {
        // First insert a token (for foreign key reference)
        await db.insert(tokens).values(TEST_TOKEN_DATA);

        // Insert a swap using Drizzle ORM
        const result = await db.insert(swaps).values(TEST_SWAP_DATA);

        // Verify using ORM query
        const insertedSwap = await db.query.swaps.findFirst({
          where: eq(swaps.id, TEST_SWAP_DATA.id),
        });

        expect(insertedSwap).toBeDefined();
        expect(insertedSwap?.id).toBe(TEST_SWAP_DATA.id);
        expect(insertedSwap?.tokenMint).toBe(TEST_SWAP_DATA.tokenMint);
        expect(insertedSwap?.direction).toBe(TEST_SWAP_DATA.direction);
        expect(insertedSwap?.price).toBe(TEST_SWAP_DATA.price);
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should retrieve swaps from database", async () => {
      try {
        // First insert a token (for foreign key reference)
        await db.insert(tokens).values(TEST_TOKEN_DATA);

        // Insert a swap
        await db.insert(swaps).values(TEST_SWAP_DATA);

        // Insert a second swap with different direction
        const sellSwapData = {
          ...TEST_SWAP_DATA,
          id: "test-swap-2",
          direction: 1, // Sell
          txId: "test-tx-id-2",
        };
        await db.insert(swaps).values(sellSwapData);

        // Query using ORM
        const allSwaps = await db.query.swaps.findMany();

        // Verify results
        expect(Array.isArray(allSwaps)).toBe(true);
        expect(allSwaps.length).toBe(2);

        // Query only buy swaps
        const buySwaps = await db.query.swaps.findMany({
          where: eq(swaps.direction, 0),
        });

        expect(buySwaps.length).toBe(1);
        expect(buySwaps[0].id).toBe(TEST_SWAP_DATA.id);

        // Query only sell swaps
        const sellSwaps = await db.query.swaps.findMany({
          where: eq(swaps.direction, 1),
        });

        expect(sellSwaps.length).toBe(1);
        expect(sellSwaps[0].id).toBe(sellSwapData.id);
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should update an existing swap", async () => {
      try {
        // First insert a token
        await db.insert(tokens).values(TEST_TOKEN_DATA);

        // Insert a swap
        await db.insert(swaps).values(TEST_SWAP_DATA);

        // Update values
        const updatedAmountIn = 2.5;
        const updatedAmountOut = 2000000;

        // Update using ORM
        await db
          .update(swaps)
          .set({
            amountIn: updatedAmountIn,
            amountOut: updatedAmountOut,
          })
          .where(eq(swaps.id, TEST_SWAP_DATA.id));

        // Retrieve the updated swap
        const updatedSwap = await db.query.swaps.findFirst({
          where: eq(swaps.id, TEST_SWAP_DATA.id),
        });

        // Verify the update
        expect(updatedSwap).toBeDefined();
        expect(updatedSwap?.amountIn).toBe(updatedAmountIn);
        expect(updatedSwap?.amountOut).toBe(updatedAmountOut);
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should delete a swap", async () => {
      try {
        // First insert a token
        await db.insert(tokens).values(TEST_TOKEN_DATA);

        // Insert a swap
        await db.insert(swaps).values(TEST_SWAP_DATA);

        // Verify it exists
        const beforeDelete = await db.query.swaps.findFirst({
          where: eq(swaps.id, TEST_SWAP_DATA.id),
        });
        expect(beforeDelete).toBeDefined();

        // Delete using ORM
        await db.delete(swaps).where(eq(swaps.id, TEST_SWAP_DATA.id));

        // Verify it's gone
        const afterDelete = await db.query.swaps.findFirst({
          where: eq(swaps.id, TEST_SWAP_DATA.id),
        });
        expect(afterDelete).toBeUndefined();
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });
  });

  describe("Fee Operations", () => {
    it("should insert a new fee", async () => {
      try {
        // First insert a token (for reference)
        await db.insert(tokens).values(TEST_TOKEN_DATA);

        // Insert a fee using Drizzle ORM
        const result = await db.insert(fees).values(TEST_FEE_DATA);

        // Verify using ORM query
        const insertedFee = await db.query.fees.findFirst({
          where: eq(fees.id, TEST_FEE_DATA.id),
        });

        expect(insertedFee).toBeDefined();
        expect(insertedFee?.id).toBe(TEST_FEE_DATA.id);
        expect(insertedFee?.tokenMint).toBe(TEST_FEE_DATA.tokenMint);
        expect(insertedFee?.type).toBe(TEST_FEE_DATA.type);
        expect(insertedFee?.feeAmount).toBe(TEST_FEE_DATA.feeAmount);
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should retrieve fees from database", async () => {
      try {
        // First insert a token
        await db.insert(tokens).values(TEST_TOKEN_DATA);

        // Insert a fee
        await db.insert(fees).values(TEST_FEE_DATA);

        // Insert a second fee with different type
        const migrationFeeData = {
          ...TEST_FEE_DATA,
          id: "test-fee-2",
          type: "migration",
          txId: "test-tx-id-2",
        };
        await db.insert(fees).values(migrationFeeData);

        // Query using ORM
        const allFees = await db.query.fees.findMany();

        // Verify results
        expect(Array.isArray(allFees)).toBe(true);
        expect(allFees.length).toBe(2);

        // Query only swap fees
        const swapFees = await db.query.fees.findMany({
          where: eq(fees.type, "swap"),
        });

        expect(swapFees.length).toBe(1);
        expect(swapFees[0].id).toBe(TEST_FEE_DATA.id);

        // Query only migration fees
        const migrationFees = await db.query.fees.findMany({
          where: eq(fees.type, "migration"),
        });

        expect(migrationFees.length).toBe(1);
        expect(migrationFees[0].id).toBe(migrationFeeData.id);
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should update an existing fee", async () => {
      try {
        // First insert a token
        await db.insert(tokens).values(TEST_TOKEN_DATA);

        // Insert a fee
        await db.insert(fees).values(TEST_FEE_DATA);

        // Update values
        const updatedFeeAmount = "0.025";
        const updatedTokenAmount = "2000000";

        // Update using ORM
        await db
          .update(fees)
          .set({
            feeAmount: updatedFeeAmount,
            tokenAmount: updatedTokenAmount,
          })
          .where(eq(fees.id, TEST_FEE_DATA.id));

        // Retrieve the updated fee
        const updatedFee = await db.query.fees.findFirst({
          where: eq(fees.id, TEST_FEE_DATA.id),
        });

        // Verify the update
        expect(updatedFee).toBeDefined();
        expect(updatedFee?.feeAmount).toBe(updatedFeeAmount);
        expect(updatedFee?.tokenAmount).toBe(updatedTokenAmount);
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should delete a fee", async () => {
      try {
        // First insert a token
        await db.insert(tokens).values(TEST_TOKEN_DATA);

        // Insert a fee
        await db.insert(fees).values(TEST_FEE_DATA);

        // Verify it exists
        const beforeDelete = await db.query.fees.findFirst({
          where: eq(fees.id, TEST_FEE_DATA.id),
        });
        expect(beforeDelete).toBeDefined();

        // Delete using ORM
        await db.delete(fees).where(eq(fees.id, TEST_FEE_DATA.id));

        // Verify it's gone
        const afterDelete = await db.query.fees.findFirst({
          where: eq(fees.id, TEST_FEE_DATA.id),
        });
        expect(afterDelete).toBeUndefined();
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });
  });

  describe("Token Holder Operations", () => {
    it("should insert a new token holder", async () => {
      try {
        // First insert a token (for reference)
        await db.insert(tokens).values(TEST_TOKEN_DATA);

        // Insert a token holder using Drizzle ORM
        const result = await db.insert(tokenHolders).values(TEST_HOLDER_DATA);

        // Verify using ORM query
        const insertedHolder = await db.query.tokenHolders.findFirst({
          where: eq(tokenHolders.id, TEST_HOLDER_DATA.id),
        });

        expect(insertedHolder).toBeDefined();
        expect(insertedHolder?.id).toBe(TEST_HOLDER_DATA.id);
        expect(insertedHolder?.mint).toBe(TEST_HOLDER_DATA.mint);
        expect(insertedHolder?.address).toBe(TEST_HOLDER_DATA.address);
        expect(insertedHolder?.amount).toBe(TEST_HOLDER_DATA.amount);
        expect(insertedHolder?.percentage).toBe(TEST_HOLDER_DATA.percentage);
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should retrieve token holders from database", async () => {
      try {
        // First insert a token
        await db.insert(tokens).values(TEST_TOKEN_DATA);

        // Insert a token holder
        await db.insert(tokenHolders).values(TEST_HOLDER_DATA);

        // Insert a second holder
        const secondHolderData = {
          ...TEST_HOLDER_DATA,
          id: "test-holder-2",
          address: "test-holder-address-2",
          amount: 20000000,
          percentage: 0.1,
        };
        await db.insert(tokenHolders).values(secondHolderData);

        // Query using ORM
        const allHolders = await db.query.tokenHolders.findMany();

        // Verify results
        expect(Array.isArray(allHolders)).toBe(true);
        expect(allHolders.length).toBe(2);

        // Query by specific amount threshold
        const largeHolders = await db.query.tokenHolders.findMany({
          where: sql`${tokenHolders.amount} > 15000000`,
        });

        expect(largeHolders.length).toBe(1);
        expect(largeHolders[0].id).toBe(secondHolderData.id);
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should update an existing token holder", async () => {
      try {
        // First insert a token
        await db.insert(tokens).values(TEST_TOKEN_DATA);

        // Insert a token holder
        await db.insert(tokenHolders).values(TEST_HOLDER_DATA);

        // Update values
        const updatedAmount = 15000000;
        const updatedPercentage = 0.075;
        const updatedTime = new Date().toISOString();

        // Update using ORM
        await db
          .update(tokenHolders)
          .set({
            amount: updatedAmount,
            percentage: updatedPercentage,
            lastUpdated: updatedTime,
          })
          .where(eq(tokenHolders.id, TEST_HOLDER_DATA.id));

        // Retrieve the updated holder
        const updatedHolder = await db.query.tokenHolders.findFirst({
          where: eq(tokenHolders.id, TEST_HOLDER_DATA.id),
        });

        // Verify the update
        expect(updatedHolder).toBeDefined();
        expect(updatedHolder?.amount).toBe(updatedAmount);
        expect(updatedHolder?.percentage).toBe(updatedPercentage);
        expect(updatedHolder?.lastUpdated).toBe(updatedTime);
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should delete a token holder", async () => {
      try {
        // First insert a token
        await db.insert(tokens).values(TEST_TOKEN_DATA);

        // Insert a token holder
        await db.insert(tokenHolders).values(TEST_HOLDER_DATA);

        // Verify it exists
        const beforeDelete = await db.query.tokenHolders.findFirst({
          where: eq(tokenHolders.id, TEST_HOLDER_DATA.id),
        });
        expect(beforeDelete).toBeDefined();

        // Delete using ORM
        await db
          .delete(tokenHolders)
          .where(eq(tokenHolders.id, TEST_HOLDER_DATA.id));

        // Verify it's gone
        const afterDelete = await db.query.tokenHolders.findFirst({
          where: eq(tokenHolders.id, TEST_HOLDER_DATA.id),
        });
        expect(afterDelete).toBeUndefined();
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });
  });

  describe("Message Operations", () => {
    it("should insert a new message", async () => {
      try {
        // First insert a token (for reference)
        await db.insert(tokens).values(TEST_TOKEN_DATA);

        // Insert a message using Drizzle ORM
        const result = await db.insert(messages).values(TEST_MESSAGE_DATA);

        // Verify using ORM query
        const insertedMessage = await db.query.messages.findFirst({
          where: eq(messages.id, TEST_MESSAGE_DATA.id),
        });

        expect(insertedMessage).toBeDefined();
        expect(insertedMessage?.id).toBe(TEST_MESSAGE_DATA.id);
        expect(insertedMessage?.author).toBe(TEST_MESSAGE_DATA.author);
        expect(insertedMessage?.tokenMint).toBe(TEST_MESSAGE_DATA.tokenMint);
        expect(insertedMessage?.message).toBe(TEST_MESSAGE_DATA.message);
        expect(insertedMessage?.likes).toBe(0);
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should create message replies", async () => {
      try {
        // First insert a token
        await db.insert(tokens).values(TEST_TOKEN_DATA);

        // Insert a parent message
        await db.insert(messages).values(TEST_MESSAGE_DATA);

        // Insert a reply message
        const replyMessageData = {
          id: "test-message-reply-1",
          author: "test-reply-author",
          tokenMint: TEST_TOKEN_DATA.mint,
          message: "This is a reply message",
          parentId: TEST_MESSAGE_DATA.id,
          likes: 0,
          timestamp: new Date().toISOString(),
        };

        await db.insert(messages).values(replyMessageData);

        // Update parent's reply count
        await db
          .update(messages)
          .set({
            replyCount: 1,
          })
          .where(eq(messages.id, TEST_MESSAGE_DATA.id));

        // Verify reply was created
        const reply = await db.query.messages.findFirst({
          where: eq(messages.parentId, TEST_MESSAGE_DATA.id),
        });

        expect(reply).toBeDefined();
        expect(reply?.id).toBe(replyMessageData.id);
        expect(reply?.parentId).toBe(TEST_MESSAGE_DATA.id);

        // Verify parent has reply count updated
        const parent = await db.query.messages.findFirst({
          where: eq(messages.id, TEST_MESSAGE_DATA.id),
        });

        expect(parent).toBeDefined();
        expect(parent?.replyCount).toBe(1);
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should update a message's like count", async () => {
      try {
        // First insert a token
        await db.insert(tokens).values(TEST_TOKEN_DATA);

        // Insert a message
        await db.insert(messages).values(TEST_MESSAGE_DATA);

        // Update likes
        const updatedLikes = 5;

        // Update using ORM
        await db
          .update(messages)
          .set({
            likes: updatedLikes,
          })
          .where(eq(messages.id, TEST_MESSAGE_DATA.id));

        // Retrieve the updated message
        const updatedMessage = await db.query.messages.findFirst({
          where: eq(messages.id, TEST_MESSAGE_DATA.id),
        });

        // Verify the update
        expect(updatedMessage).toBeDefined();
        expect(updatedMessage?.likes).toBe(updatedLikes);
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should delete a message", async () => {
      try {
        // First insert a token
        await db.insert(tokens).values(TEST_TOKEN_DATA);

        // Insert a message
        await db.insert(messages).values(TEST_MESSAGE_DATA);

        // Verify it exists
        const beforeDelete = await db.query.messages.findFirst({
          where: eq(messages.id, TEST_MESSAGE_DATA.id),
        });
        expect(beforeDelete).toBeDefined();

        // Delete using ORM
        await db.delete(messages).where(eq(messages.id, TEST_MESSAGE_DATA.id));

        // Verify it's gone
        const afterDelete = await db.query.messages.findFirst({
          where: eq(messages.id, TEST_MESSAGE_DATA.id),
        });
        expect(afterDelete).toBeUndefined();
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });
  });

  describe("Message Like Operations", () => {
    it("should insert a new message like", async () => {
      try {
        // First insert a token
        await db.insert(tokens).values(TEST_TOKEN_DATA);

        // Insert a message
        await db.insert(messages).values(TEST_MESSAGE_DATA);

        // Insert a message like using Drizzle ORM
        const result = await db
          .insert(messageLikes)
          .values(TEST_MESSAGE_LIKE_DATA);

        // Verify using ORM query
        const insertedLike = await db.query.messageLikes.findFirst({
          where: eq(messageLikes.id, TEST_MESSAGE_LIKE_DATA.id),
        });

        expect(insertedLike).toBeDefined();
        expect(insertedLike?.id).toBe(TEST_MESSAGE_LIKE_DATA.id);
        expect(insertedLike?.messageId).toBe(TEST_MESSAGE_LIKE_DATA.messageId);
        expect(insertedLike?.userAddress).toBe(
          TEST_MESSAGE_LIKE_DATA.userAddress,
        );
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should retrieve message likes from database", async () => {
      try {
        // First insert a token
        await db.insert(tokens).values(TEST_TOKEN_DATA);

        // Insert a message
        await db.insert(messages).values(TEST_MESSAGE_DATA);

        // Insert two message likes
        await db.insert(messageLikes).values(TEST_MESSAGE_LIKE_DATA);

        const secondLikeData = {
          id: "test-message-like-2",
          messageId: TEST_MESSAGE_DATA.id,
          userAddress: "test-user-address-2",
          timestamp: new Date().toISOString(),
        };

        await db.insert(messageLikes).values(secondLikeData);

        // Query using ORM
        const messageLikesResult = await db.query.messageLikes.findMany({
          where: eq(messageLikes.messageId, TEST_MESSAGE_DATA.id),
        });

        // Verify results
        expect(Array.isArray(messageLikesResult)).toBe(true);
        expect(messageLikesResult.length).toBe(2);

        // Update message like count
        await db
          .update(messages)
          .set({
            likes: messageLikesResult.length,
          })
          .where(eq(messages.id, TEST_MESSAGE_DATA.id));

        // Verify message has updated like count
        const updatedMessage = await db.query.messages.findFirst({
          where: eq(messages.id, TEST_MESSAGE_DATA.id),
        });

        expect(updatedMessage).toBeDefined();
        expect(updatedMessage?.likes).toBe(2);
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should delete a message like", async () => {
      try {
        // First insert a token
        await db.insert(tokens).values(TEST_TOKEN_DATA);

        // Insert a message
        await db.insert(messages).values(TEST_MESSAGE_DATA);

        // Insert a message like
        await db.insert(messageLikes).values(TEST_MESSAGE_LIKE_DATA);

        // Update message like count
        await db
          .update(messages)
          .set({
            likes: 1,
          })
          .where(eq(messages.id, TEST_MESSAGE_DATA.id));

        // Verify message like exists
        const beforeDelete = await db.query.messageLikes.findFirst({
          where: eq(messageLikes.id, TEST_MESSAGE_LIKE_DATA.id),
        });
        expect(beforeDelete).toBeDefined();

        // Delete using ORM
        await db
          .delete(messageLikes)
          .where(eq(messageLikes.id, TEST_MESSAGE_LIKE_DATA.id));

        // Verify it's gone
        const afterDelete = await db.query.messageLikes.findFirst({
          where: eq(messageLikes.id, TEST_MESSAGE_LIKE_DATA.id),
        });
        expect(afterDelete).toBeUndefined();

        // Update message like count
        await db
          .update(messages)
          .set({
            likes: 0,
          })
          .where(eq(messages.id, TEST_MESSAGE_DATA.id));

        // Verify message has updated like count
        const updatedMessage = await db.query.messages.findFirst({
          where: eq(messages.id, TEST_MESSAGE_DATA.id),
        });

        expect(updatedMessage).toBeDefined();
        expect(updatedMessage?.likes).toBe(0);
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });
  });

  describe("User Operations", () => {
    it("should insert a new user", async () => {
      try {
        // Insert a user using Drizzle ORM
        const result = await db.insert(users).values(TEST_USER_DATA);

        // Verify using ORM query
        const insertedUser = await db.query.users.findFirst({
          where: eq(users.id, TEST_USER_DATA.id),
        });

        expect(insertedUser).toBeDefined();
        expect(insertedUser?.id).toBe(TEST_USER_DATA.id);
        expect(insertedUser?.name).toBe(TEST_USER_DATA.name);
        expect(insertedUser?.address).toBe(TEST_USER_DATA.address);
        expect(insertedUser?.avatar).toBe(TEST_USER_DATA.avatar);
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should enforce unique address constraint", async () => {
      try {
        // Insert a user
        await db.insert(users).values(TEST_USER_DATA);

        // Try to insert another user with the same address
        const duplicateUser = {
          ...TEST_USER_DATA,
          id: "test-user-2",
        };

        // This should fail due to unique constraint on address
        let error;
        try {
          await db.insert(users).values(duplicateUser);
        } catch (e) {
          error = e;
        }

        // Verify it failed
        expect(error).toBeDefined();
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should update an existing user", async () => {
      try {
        // Insert a user
        await db.insert(users).values(TEST_USER_DATA);

        // Update values
        const updatedName = "Updated User Name";
        const updatedAvatar = "https://example.com/updated-avatar.png";

        // Update using ORM
        await db
          .update(users)
          .set({
            name: updatedName,
            avatar: updatedAvatar,
          })
          .where(eq(users.id, TEST_USER_DATA.id));

        // Retrieve the updated user
        const updatedUser = await db.query.users.findFirst({
          where: eq(users.id, TEST_USER_DATA.id),
        });

        // Verify the update
        expect(updatedUser).toBeDefined();
        expect(updatedUser?.name).toBe(updatedName);
        expect(updatedUser?.avatar).toBe(updatedAvatar);
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should delete a user", async () => {
      try {
        // Insert a user
        await db.insert(users).values(TEST_USER_DATA);

        // Verify it exists
        const beforeDelete = await db.query.users.findFirst({
          where: eq(users.id, TEST_USER_DATA.id),
        });
        expect(beforeDelete).toBeDefined();

        // Delete using ORM
        await db.delete(users).where(eq(users.id, TEST_USER_DATA.id));

        // Verify it's gone
        const afterDelete = await db.query.users.findFirst({
          where: eq(users.id, TEST_USER_DATA.id),
        });
        expect(afterDelete).toBeUndefined();
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });
  });

  describe("Vanity Keypair Operations", () => {
    it("should insert a new vanity keypair", async () => {
      try {
        // Insert a vanity keypair using Drizzle ORM
        const result = await db
          .insert(vanityKeypairs)
          .values(TEST_VANITY_KEYPAIR_DATA);

        // Verify using ORM query
        const insertedKeypair = await db.query.vanityKeypairs.findFirst({
          where: eq(vanityKeypairs.id, TEST_VANITY_KEYPAIR_DATA.id),
        });

        expect(insertedKeypair).toBeDefined();
        expect(insertedKeypair?.id).toBe(TEST_VANITY_KEYPAIR_DATA.id);
        expect(insertedKeypair?.address).toBe(TEST_VANITY_KEYPAIR_DATA.address);
        expect(insertedKeypair?.secretKey).toBe(
          TEST_VANITY_KEYPAIR_DATA.secretKey,
        );
        expect(insertedKeypair?.used).toBe(0);
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should retrieve unused vanity keypairs", async () => {
      try {
        // Insert a vanity keypair
        await db.insert(vanityKeypairs).values(TEST_VANITY_KEYPAIR_DATA);

        // Insert a second vanity keypair that's used
        const usedKeypairData = {
          ...TEST_VANITY_KEYPAIR_DATA,
          id: "test-keypair-2",
          address: "test-vanity-address-2",
          used: 1,
        };

        await db.insert(vanityKeypairs).values(usedKeypairData);

        // Query only unused keypairs
        const unusedKeypairs = await db.query.vanityKeypairs.findMany({
          where: eq(vanityKeypairs.used, 0),
        });

        // Verify results
        expect(Array.isArray(unusedKeypairs)).toBe(true);
        expect(unusedKeypairs.length).toBe(1);
        expect(unusedKeypairs[0].id).toBe(TEST_VANITY_KEYPAIR_DATA.id);
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should mark a keypair as used", async () => {
      try {
        // Insert a vanity keypair
        await db.insert(vanityKeypairs).values(TEST_VANITY_KEYPAIR_DATA);

        // Update to mark as used
        await db
          .update(vanityKeypairs)
          .set({
            used: 1,
          })
          .where(eq(vanityKeypairs.id, TEST_VANITY_KEYPAIR_DATA.id));

        // Retrieve the updated keypair
        const updatedKeypair = await db.query.vanityKeypairs.findFirst({
          where: eq(vanityKeypairs.id, TEST_VANITY_KEYPAIR_DATA.id),
        });

        // Verify the update
        expect(updatedKeypair).toBeDefined();
        expect(updatedKeypair?.used).toBe(1);
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should delete a vanity keypair", async () => {
      try {
        // Insert a vanity keypair
        await db.insert(vanityKeypairs).values(TEST_VANITY_KEYPAIR_DATA);

        // Verify it exists
        const beforeDelete = await db.query.vanityKeypairs.findFirst({
          where: eq(vanityKeypairs.id, TEST_VANITY_KEYPAIR_DATA.id),
        });
        expect(beforeDelete).toBeDefined();

        // Delete using ORM
        await db
          .delete(vanityKeypairs)
          .where(eq(vanityKeypairs.id, TEST_VANITY_KEYPAIR_DATA.id));

        // Verify it's gone
        const afterDelete = await db.query.vanityKeypairs.findFirst({
          where: eq(vanityKeypairs.id, TEST_VANITY_KEYPAIR_DATA.id),
        });
        expect(afterDelete).toBeUndefined();
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });
  });

  describe("Media Generation Operations", () => {
    it("should insert a new media generation", async () => {
      try {
        // First insert a token (for reference)
        await db.insert(tokens).values(TEST_TOKEN_DATA);

        // Insert a media generation using Drizzle ORM
        const result = await db
          .insert(mediaGenerations)
          .values(TEST_MEDIA_GENERATION_DATA);

        // Verify using ORM query
        const insertedMedia = await db.query.mediaGenerations.findFirst({
          where: eq(mediaGenerations.id, TEST_MEDIA_GENERATION_DATA.id),
        });

        expect(insertedMedia).toBeDefined();
        expect(insertedMedia?.id).toBe(TEST_MEDIA_GENERATION_DATA.id);
        expect(insertedMedia?.mint).toBe(TEST_MEDIA_GENERATION_DATA.mint);
        expect(insertedMedia?.type).toBe(TEST_MEDIA_GENERATION_DATA.type);
        expect(insertedMedia?.prompt).toBe(TEST_MEDIA_GENERATION_DATA.prompt);
        expect(insertedMedia?.mediaUrl).toBe(
          TEST_MEDIA_GENERATION_DATA.mediaUrl,
        );
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should retrieve media generations by type", async () => {
      try {
        // First insert a token
        await db.insert(tokens).values(TEST_TOKEN_DATA);

        // Insert an image generation
        await db.insert(mediaGenerations).values(TEST_MEDIA_GENERATION_DATA);

        // Insert a video generation
        const videoGenerationData = {
          ...TEST_MEDIA_GENERATION_DATA,
          id: "test-media-2",
          type: "video",
          numFrames: 30,
          fps: 24,
          duration: 1250,
        };

        await db.insert(mediaGenerations).values(videoGenerationData);

        // Query image generations
        const images = await db.query.mediaGenerations.findMany({
          where: eq(mediaGenerations.type, "image"),
        });

        // Verify results
        expect(Array.isArray(images)).toBe(true);
        expect(images.length).toBe(1);
        expect(images[0].id).toBe(TEST_MEDIA_GENERATION_DATA.id);

        // Query video generations
        const videos = await db.query.mediaGenerations.findMany({
          where: eq(mediaGenerations.type, "video"),
        });

        expect(videos.length).toBe(1);
        expect(videos[0].id).toBe(videoGenerationData.id);
        expect(videos[0].numFrames).toBe(videoGenerationData.numFrames);
        expect(videos[0].fps).toBe(videoGenerationData.fps);
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should update generation count", async () => {
      try {
        // First insert a token
        await db.insert(tokens).values(TEST_TOKEN_DATA);

        // Insert a media generation
        await db.insert(mediaGenerations).values(TEST_MEDIA_GENERATION_DATA);

        // Update daily generation count
        const updatedCount = 5;
        const updatedReset = new Date().toISOString();

        // Update using ORM
        await db
          .update(mediaGenerations)
          .set({
            dailyGenerationCount: updatedCount,
            lastGenerationReset: updatedReset,
          })
          .where(eq(mediaGenerations.id, TEST_MEDIA_GENERATION_DATA.id));

        // Retrieve the updated media generation
        const updatedMedia = await db.query.mediaGenerations.findFirst({
          where: eq(mediaGenerations.id, TEST_MEDIA_GENERATION_DATA.id),
        });

        // Verify the update
        expect(updatedMedia).toBeDefined();
        expect(updatedMedia?.dailyGenerationCount).toBe(updatedCount);
        expect(updatedMedia?.lastGenerationReset).toBe(updatedReset);
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should delete a media generation", async () => {
      try {
        // First insert a token
        await db.insert(tokens).values(TEST_TOKEN_DATA);

        // Insert a media generation
        await db.insert(mediaGenerations).values(TEST_MEDIA_GENERATION_DATA);

        // Verify it exists
        const beforeDelete = await db.query.mediaGenerations.findFirst({
          where: eq(mediaGenerations.id, TEST_MEDIA_GENERATION_DATA.id),
        });
        expect(beforeDelete).toBeDefined();

        // Delete using ORM
        await db
          .delete(mediaGenerations)
          .where(eq(mediaGenerations.id, TEST_MEDIA_GENERATION_DATA.id));

        // Verify it's gone
        const afterDelete = await db.query.mediaGenerations.findFirst({
          where: eq(mediaGenerations.id, TEST_MEDIA_GENERATION_DATA.id),
        });
        expect(afterDelete).toBeUndefined();
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });
  });

  describe("Cache Price Operations", () => {
    it("should insert a new cache price", async () => {
      try {
        // Insert a cache price using Drizzle ORM
        const result = await db
          .insert(cachePrices)
          .values(TEST_CACHE_PRICE_DATA);

        // Verify using ORM query
        const insertedCache = await db.query.cachePrices.findFirst({
          where: eq(cachePrices.id, TEST_CACHE_PRICE_DATA.id),
        });

        expect(insertedCache).toBeDefined();
        expect(insertedCache?.id).toBe(TEST_CACHE_PRICE_DATA.id);
        expect(insertedCache?.type).toBe(TEST_CACHE_PRICE_DATA.type);
        expect(insertedCache?.symbol).toBe(TEST_CACHE_PRICE_DATA.symbol);
        expect(insertedCache?.price).toBe(TEST_CACHE_PRICE_DATA.price);
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should retrieve non-expired cache prices", async () => {
      try {
        // Insert a cache price
        await db.insert(cachePrices).values(TEST_CACHE_PRICE_DATA);

        // Insert an expired cache price
        const expiredCacheData = {
          ...TEST_CACHE_PRICE_DATA,
          id: "test-cache-2",
          expiresAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        };

        await db.insert(cachePrices).values(expiredCacheData);

        // Query using ORM for non-expired entries
        const now = new Date().toISOString();
        const validCaches = await db.query.cachePrices.findMany({
          where: sql`${cachePrices.expiresAt} > ${now}`,
        });

        // Verify results
        expect(Array.isArray(validCaches)).toBe(true);
        expect(validCaches.length).toBe(1);
        expect(validCaches[0].id).toBe(TEST_CACHE_PRICE_DATA.id);
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should update an existing cache price", async () => {
      try {
        // Insert a cache price
        await db.insert(cachePrices).values(TEST_CACHE_PRICE_DATA);

        // Update values
        const updatedPrice = "105.75";
        const updatedTimestamp = new Date().toISOString();
        const updatedExpiresAt = new Date(Date.now() + 7200000).toISOString(); // 2 hours from now

        // Update using ORM
        await db
          .update(cachePrices)
          .set({
            price: updatedPrice,
            timestamp: updatedTimestamp,
            expiresAt: updatedExpiresAt,
          })
          .where(eq(cachePrices.id, TEST_CACHE_PRICE_DATA.id));

        // Retrieve the updated cache
        const updatedCache = await db.query.cachePrices.findFirst({
          where: eq(cachePrices.id, TEST_CACHE_PRICE_DATA.id),
        });

        // Verify the update
        expect(updatedCache).toBeDefined();
        expect(updatedCache?.price).toBe(updatedPrice);
        expect(updatedCache?.timestamp).toBe(updatedTimestamp);
        expect(updatedCache?.expiresAt).toBe(updatedExpiresAt);
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });

    it("should delete expired cache prices", async () => {
      try {
        // Insert an expired cache price
        const expiredCacheData = {
          ...TEST_CACHE_PRICE_DATA,
          expiresAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        };

        await db.insert(cachePrices).values(expiredCacheData);

        // Verify it exists
        const beforeDelete = await db.query.cachePrices.findFirst({
          where: eq(cachePrices.id, expiredCacheData.id),
        });
        expect(beforeDelete).toBeDefined();

        // Delete expired cache entries
        const now = new Date().toISOString();
        await db
          .delete(cachePrices)
          .where(sql`${cachePrices.expiresAt} < ${now}`);

        // Verify it's gone
        const afterDelete = await db.query.cachePrices.findFirst({
          where: eq(cachePrices.id, expiredCacheData.id),
        });
        expect(afterDelete).toBeUndefined();
      } catch (error) {
        console.error("Test failed with error:", error);
        throw error;
      }
    });
  });
});
