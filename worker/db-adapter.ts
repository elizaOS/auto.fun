import { drizzle } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import { Env } from "./env";
import { sql } from "drizzle-orm";
import {
  tokens,
  swaps,
  fees,
  tokenHolders,
  agents,
  messages,
  messageLikes,
  users,
  personalities,
  vanityKeypairs,
  mediaGenerations,
  cachePrices,
} from "./db";
import { logger } from "./logger";

// Import better-sqlite3 only in Node.js environment
let Database: any;
let fs: any;
let betterSqliteInstance: any;

try {
  // These imports will only work in Node.js environment, not in a worker
  if (typeof process !== "undefined") {
    Database = require("better-sqlite3");
    fs = require("fs");
  }
} catch (error) {
  logger.warn(
    "better-sqlite3 import failed, this is expected in Cloudflare Workers",
    error,
  );
}

const SQLITE_PATH = "./local-dev.sqlite";

// Schema for all tables
const schema = {
  tokens,
  swaps,
  fees,
  tokenHolders,
  agents,
  messages,
  messageLikes,
  users,
  personalities,
  vanityKeypairs,
  mediaGenerations,
  cachePrices,
};

// Initialize SQLite database for local development
function initSQLite() {
  try {
    if (!Database) {
      return null;
    }

    const dbExists = fs.existsSync(SQLITE_PATH);
    const db = new Database(SQLITE_PATH);

    if (!dbExists) {
      logger.info("Creating new SQLite database for local development");

      // Create all tables
      db.exec(`
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
          nftMinted TEXT,
          lockId TEXT,
          lockedAmount TEXT,
          lockedAt TEXT,
          harvestedAt TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          createdAt TEXT NOT NULL,
          lastUpdated TEXT NOT NULL,
          completedAt TEXT,
          withdrawnAt TEXT,
          migratedAt TEXT,
          marketId TEXT,
          baseVault TEXT,
          quoteVault TEXT,
          withdrawnAmount REAL,
          reserveAmount REAL,
          reserveLamport REAL,
          virtualReserves REAL,
          liquidity REAL,
          currentPrice REAL,
          marketCapUSD REAL,
          tokenPriceUSD REAL,
          solPriceUSD REAL,
          curveProgress REAL,
          curveLimit REAL,
          priceChange24h REAL,
          price24hAgo REAL,
          volume24h REAL,
          inferenceCount INTEGER,
          lastVolumeReset TEXT,
          lastPriceUpdate TEXT,
          holderCount INTEGER,
          txId TEXT
        );

        CREATE TABLE IF NOT EXISTS swaps (
          id TEXT PRIMARY KEY,
          tokenMint TEXT NOT NULL,
          user TEXT NOT NULL,
          type TEXT NOT NULL,
          direction INTEGER NOT NULL,
          amountIn REAL NOT NULL,
          amountOut REAL NOT NULL,
          priceImpact REAL,
          price REAL NOT NULL,
          txId TEXT NOT NULL UNIQUE,
          timestamp TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS fees (
          id TEXT PRIMARY KEY,
          tokenMint TEXT NOT NULL,
          user TEXT,
          direction INTEGER,
          feeAmount TEXT,
          tokenAmount TEXT,
          solAmount TEXT,
          type TEXT NOT NULL,
          txId TEXT,
          timestamp TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tokenHolders (
          id TEXT PRIMARY KEY,
          mint TEXT NOT NULL,
          address TEXT NOT NULL,
          amount REAL NOT NULL,
          percentage REAL NOT NULL,
          lastUpdated TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS agents (
          id TEXT PRIMARY KEY,
          ownerAddress TEXT NOT NULL,
          contractAddress TEXT NOT NULL,
          txId TEXT NOT NULL,
          symbol TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          systemPrompt TEXT,
          bio TEXT,
          lore TEXT,
          messageExamples TEXT,
          postExamples TEXT,
          adjectives TEXT,
          people TEXT,
          topics TEXT,
          modelProvider TEXT DEFAULT 'claude',
          styleAll TEXT,
          styleChat TEXT,
          stylePost TEXT,
          twitterUsername TEXT,
          twitterPassword TEXT,
          twitterEmail TEXT,
          twitterCookie TEXT,
          personalities TEXT,
          ecsTaskId TEXT,
          createdAt INTEGER DEFAULT (strftime('%s', 'now')),
          updatedAt INTEGER DEFAULT (strftime('%s', 'now')),
          deletedAt INTEGER
        );

        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          author TEXT NOT NULL,
          tokenMint TEXT NOT NULL,
          message TEXT NOT NULL,
          parentId TEXT,
          replyCount INTEGER NOT NULL DEFAULT 0,
          likes INTEGER NOT NULL DEFAULT 0,
          timestamp TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS messageLikes (
          id TEXT PRIMARY KEY,
          messageId TEXT NOT NULL,
          userAddress TEXT NOT NULL,
          timestamp TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS personalities (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          createdAt INTEGER DEFAULT (strftime('%s', 'now')),
          updatedAt INTEGER DEFAULT (strftime('%s', 'now')),
          deletedAt INTEGER
        );

        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          name TEXT,
          address TEXT NOT NULL UNIQUE,
          avatar TEXT NOT NULL DEFAULT 'https://ipfs.io/ipfs/bafkreig4ob6pq5qy4v6j62krj4zkh2kc2pnv5egqy7f65djqhgqv3x56pq',
          createdAt TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS vanityKeypairs (
          id TEXT PRIMARY KEY,
          address TEXT NOT NULL UNIQUE,
          secretKey TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          used INTEGER NOT NULL DEFAULT 0
        );

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
          timestamp TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS cache_prices (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          symbol TEXT NOT NULL,
          price TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          expires_at TEXT NOT NULL
        );
      `);

      // Add some test data
      db.exec(`
        -- Insert a test token
        INSERT INTO tokens (
          id, name, ticker, url, image, mint, creator, 
          status, createdAt, lastUpdated, tokenPriceUSD, marketCapUSD, volume24h
        ) VALUES (
          'test-token-1',
          'Test Token',
          'TEST',
          'https://example.com',
          'https://placehold.co/600x400?text=TEST',
          'TEST123456789012345678901234567890123456789',
          'TEST987654321098765432109876543210987654321',
          'active',
          '${new Date().toISOString()}',
          '${new Date().toISOString()}',
          1.5,
          1000000,
          50000
        );
      `);
    }

    return db;
  } catch (error) {
    logger.error("Error initializing SQLite database:", error);
    return null;
  }
}

// Get DB instance with proper fallbacks for development and production
export function getDBWithFallback(env: Env) {
  try {
    // For test environment, always use a mock database
    if (env.NODE_ENV === "test") {
      logger.info(
        "Using mock database in test environment via getDBWithFallback",
      );
      return createMockDB();
    }

    // For development environment with SQLite
    if (env.NODE_ENV === "development") {
      // First try to initialize SQLite
      if (!betterSqliteInstance) {
        betterSqliteInstance = initSQLite();
      }

      if (betterSqliteInstance) {
        return drizzle(betterSqliteInstance, { schema });
      }
    }

    // For Cloudflare D1
    if (env.DB) {
      // Cast the D1 database to any to work around type issues
      // This is safe because drizzle-orm/d1 is designed to work with Cloudflare D1
      return drizzleD1(env.DB as any, { schema });
    }

    // Fall back to mock DB if all else fails
    logger.warn("No valid database connection, using mock database");
    return createMockDB();
  } catch (error) {
    logger.error("Database connection error, using mock database:", error);
    return createMockDB();
  }
}

// Create a mock database that returns empty arrays or placeholders
function createMockDB() {
  // Create a simple mockData structure similar to the one in getDB
  const mockData = {
    tokens: [],
    agents: [],
    tokenHolders: [],
    users: [],
    messages: [],
    messageLikes: [],
    swaps: [],
    fees: [],
    vanityKeypairs: [],
    personalities: [],
    mediaGenerations: [],
  };

  // Return a simple object that implements the basic DB interface
  return {
    tokens: { name: "tokens" },
    agents: { name: "agents" },
    tokenHolders: { name: "tokenHolders" },
    users: { name: "users" },
    messages: { name: "messages" },
    messageLikes: { name: "messageLikes" },
    swaps: { name: "swaps" },
    fees: { name: "fees" },
    vanityKeypairs: { name: "vanityKeypairs" },
    personalities: { name: "personalities" },
    mediaGenerations: { name: "mediaGenerations" },
    select: () => ({
      from: (table) => {
        const tableName = typeof table === "string" ? table : table.name;
        return Promise.resolve(mockData[tableName] || []);
      },
    }),
    insert: () => ({
      values: () => Promise.resolve({ rowsAffected: 1 }),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve({ rowsAffected: 1 }),
      }),
    }),
    delete: () => ({
      where: () => Promise.resolve({ rowsAffected: 1 }),
    }),
  };
}

// Get mock data for specific tables
function getMockDataForTable(tableName: string): any[] {
  const now = new Date().toISOString();

  switch (tableName) {
    case "tokens":
      return [
        {
          id: "mock-token-1",
          name: "Mock Token",
          ticker: "MOCK",
          url: "https://example.com",
          image: "https://placehold.co/600x400?text=MOCK",
          mint: "MOCK123456789012345678901234567890123456789",
          creator: "MOCK987654321098765432109876543210987654321",
          status: "active",
          createdAt: now,
          lastUpdated: now,
          tokenPriceUSD: 1.0,
          marketCapUSD: 1000000,
          volume24h: 50000,
        },
      ];

    case "media_generations":
      return [
        {
          id: "mock-generation-1",
          mint: "MOCK123456789012345678901234567890123456789",
          type: "image",
          prompt: "A beautiful landscape",
          media_url: "https://placehold.co/600x400?text=MockImage",
          timestamp: now,
        },
      ];

    // Add other tables as needed
    default:
      return [];
  }
}
