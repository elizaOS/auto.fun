import { sql } from "drizzle-orm";
import { drizzle, DrizzleD1Database } from "drizzle-orm/d1";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { Env } from "./env";
import { logger } from "./logger";

// Token schema
export const tokens = sqliteTable("tokens", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ticker: text("ticker").notNull(),
  url: text("url").notNull(),
  image: text("image").notNull(),
  twitter: text("twitter"),
  telegram: text("telegram"),
  website: text("website"),
  description: text("description"),
  mint: text("mint").notNull().unique(),
  creator: text("creator").notNull(),
  nftMinted: text("nft_minted", { mode: "text" }),
  lockId: text("lock_id", { mode: "text" }),
  lockedAmount: text("locked_amount", { mode: "text" }),
  lockedAt: text("locked_at", { mode: "text" }),
  harvestedAt: text("harvested_at", { mode: "text" }),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at", { mode: "text" }).notNull(),
  lastUpdated: text("last_updated", { mode: "text" }).notNull(),
  completedAt: text("completed_at", { mode: "text" }),
  withdrawnAt: text("withdrawn_at", { mode: "text" }),
  migratedAt: text("migrated_at", { mode: "text" }),
  marketId: text("market_id", { mode: "text" }),
  baseVault: text("base_vault", { mode: "text" }),
  quoteVault: text("quote_vault", { mode: "text" }),
  withdrawnAmount: real("withdrawn_amount"),
  reserveAmount: real("reserve_amount"),
  reserveLamport: real("reserve_lamport"),
  virtualReserves: real("virtual_reserves"),
  liquidity: real("liquidity"),
  currentPrice: real("current_price"),
  marketCapUSD: real("market_cap_usd"),
  tokenPriceUSD: real("token_price_usd"),
  solPriceUSD: real("sol_price_usd"),
  curveProgress: real("curve_progress"),
  curveLimit: real("curve_limit"),
  priceChange24h: real("price_change_24h"),
  price24hAgo: real("price_24h_ago"),
  volume24h: real("volume_24h"),
  inferenceCount: integer("inference_count"),
  lastVolumeReset: text("last_volume_reset"),
  lastPriceUpdate: text("last_price_update"),
  holderCount: integer("holder_count"),
  txId: text("tx_id"),
});

// Swap schema
export const swaps = sqliteTable("swaps", {
  id: text("id").primaryKey(),
  tokenMint: text("token_mint", { mode: "text" }).notNull(),
  user: text("user").notNull(),
  type: text("type").notNull(),
  direction: integer("direction").notNull(), // 0 = Buy (SOL->Token), 1 = Sell (Token->SOL)
  amountIn: real("amount_in"),
  amountOut: real("amount_out"),
  priceImpact: real("price_impact"),
  price: real("price").notNull(),
  txId: text("tx_id", { mode: "text" }).notNull().unique(),
  timestamp: text("timestamp").notNull(),
});

// Fees schema
export const fees = sqliteTable("fees", {
  id: text("id").primaryKey(),
  tokenMint: text("token_mint", { mode: "text" }).notNull(),
  user: text("user"),
  direction: integer("direction"),
  feeAmount: text("fee_amount", { mode: "text" }),
  tokenAmount: text("token_amount", { mode: "text" }),
  solAmount: text("sol_amount", { mode: "text" }),
  type: text("type").notNull(), // swap, migration
  txId: text("tx_id", { mode: "text" }),
  timestamp: text("timestamp").notNull(),
});

// TokenHolder schema
export const tokenHolders = sqliteTable("token_holders", {
  id: text("id").primaryKey(),
  mint: text("mint").notNull(),
  address: text("address").notNull(),
  amount: real("amount").notNull(),
  percentage: real("percentage").notNull(),
  lastUpdated: text("last_updated", { mode: "text" }).notNull(),
});

// Agent schema
export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  ownerAddress: text("owner_address", { mode: "text" }).notNull(),
  contractAddress: text("contract_address", { mode: "text" })
    .notNull()
    .references(() => tokens.mint),
  txId: text("tx_id", { mode: "text" }).notNull(),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  systemPrompt: text("system_prompt", { mode: "text" }),
  bio: text("bio"),
  lore: text("lore"),
  messageExamples: text("message_examples", { mode: "text" }),
  postExamples: text("post_examples", { mode: "text" }),
  adjectives: text("adjectives"),
  people: text("people"),
  topics: text("topics"),
  modelProvider: text("model_provider", { mode: "text" }).default("claude"),
  styleAll: text("style_all", { mode: "text" }),
  styleChat: text("style_chat", { mode: "text" }),
  stylePost: text("style_post", { mode: "text" }),
  twitterUsername: text("twitter_username", { mode: "text" }),
  twitterPassword: text("twitter_password", { mode: "text" }),
  twitterEmail: text("twitter_email", { mode: "text" }),
  twitterCookie: text("twitter_cookie", { mode: "text" }),
  postFreqMin: integer("post_freq_min"),
  postFreqMax: integer("post_freq_max"),
  pollIntervalSec: integer("poll_interval_sec"),
  ecsTaskId: text("ecs_task_id", { mode: "text" }),
  createdAt: integer("created_at", { mode: "timestamp" }).default(
    sql`CURRENT_TIMESTAMP`,
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(
    sql`CURRENT_TIMESTAMP`,
  ),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

// Create messages table without self-referencing first
export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  author: text("author").notNull(),
  tokenMint: text("token_mint", { mode: "text" }).notNull(),
  message: text("message").notNull(),
  parentId: text("parent_id", { mode: "text" }),
  replyCount: integer("reply_count"),
  likes: integer("likes").notNull().default(0),
  timestamp: text("timestamp").notNull(),
});

// MessageLike schema
export const messageLikes = sqliteTable("message_likes", {
  id: text("id").primaryKey(),
  messageId: text("message_id", { mode: "text" }).notNull(),
  userAddress: text("user_address", { mode: "text" }).notNull(),
  timestamp: text("timestamp").notNull(),
});

// Personality schema
export const personalities = sqliteTable("personalities", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(
    sql`CURRENT_TIMESTAMP`,
  ),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(
    sql`CURRENT_TIMESTAMP`,
  ),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

// User schema
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  address: text("address").notNull().unique(),
  avatar: text("avatar")
    .notNull()
    .default(
      "https://ipfs.io/ipfs/bafkreig4ob6pq5qy4v6j62krj4zkh2kc2pnv5egqy7f65djqhgqv3x56pq",
    ),
  createdAt: text("created_at", { mode: "text" }).notNull(),
});

// VanityKeypair schema
export const vanityKeypairs = sqliteTable("vanity_keypairs", {
  id: text("id").primaryKey(),
  address: text("address").notNull().unique(),
  secretKey: text("secret_key", { mode: "text" }).notNull(),
  createdAt: text("created_at", { mode: "text" }).notNull(),
  used: integer("used").notNull().default(0),
});

// Media Generation table
export const mediaGenerations = sqliteTable("media_generations", {
  id: text("id").primaryKey(),
  mint: text("mint").notNull(),
  type: text("type").notNull(), // "image", "video", "audio"
  prompt: text("prompt").notNull(),
  mediaUrl: text("media_url", { mode: "text" }).notNull(),
  negativePrompt: text("negative_prompt", { mode: "text" }),
  numInferenceSteps: integer("num_inference_steps"),
  seed: integer("seed"),
  // Video specific metadata
  numFrames: integer("num_frames"),
  fps: integer("fps"),
  motionBucketId: integer("motion_bucket_id"),
  duration: integer("duration"),
  // Audio specific metadata
  durationSeconds: integer("duration_seconds"),
  bpm: integer("bpm"),
  creator: text("creator"),
  timestamp: text("timestamp").notNull(),
  dailyGenerationCount: integer("daily_generation_count"),
  lastGenerationReset: text("last_generation_reset", { mode: "text" }),
});

// Cache table for prices
export const cachePrices = sqliteTable("cache_prices", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // "sol", "token", etc.
  symbol: text("symbol").notNull(),
  price: text("price").notNull(), // Store as string to preserve precision
  timestamp: text("timestamp").notNull(),
  expiresAt: text("expires_at", { mode: "text" }).notNull(), // When this cache entry should expire
});

export function getDB(env: Env) {
  try {
    // For non-test environments, use D1 database
    const drizzleSchema = { tokens, swaps, fees, tokenHolders, agents, messages, messageLikes, users, personalities, vanityKeypairs, mediaGenerations, cachePrices }
    return drizzle(env.DB as any, { schema: drizzleSchema }) as DrizzleD1Database<typeof drizzleSchema>;
  } catch (error) {
    console.error("Error initializing DB:", error);
    throw error;
  }
}

// Type definitions for common query results
export type Token = typeof schema.tokens.$inferSelect;
export type TokenInsert = typeof schema.tokens.$inferInsert;

export type Swap = typeof schema.swaps.$inferSelect;
export type SwapInsert = typeof schema.swaps.$inferInsert;

export type Fee = typeof schema.fees.$inferSelect;
export type FeeInsert = typeof schema.fees.$inferInsert;

export type TokenHolder = typeof schema.tokenHolders.$inferSelect;
export type TokenHolderInsert = typeof schema.tokenHolders.$inferInsert;

export type Agent = typeof schema.agents.$inferSelect;
export type AgentInsert = typeof schema.agents.$inferInsert;

export type Message = typeof schema.messages.$inferSelect;
export type MessageInsert = typeof schema.messages.$inferInsert;

export type MessageLike = typeof schema.messageLikes.$inferSelect;
export type MessageLikeInsert = typeof schema.messageLikes.$inferInsert;

export type Personality = typeof schema.personalities.$inferSelect;
export type PersonalityInsert = typeof schema.personalities.$inferInsert;

export type User = typeof schema.users.$inferSelect;
export type UserInsert = typeof schema.users.$inferInsert;

export type VanityKeypair = typeof schema.vanityKeypairs.$inferSelect;
export type VanityKeypairInsert = typeof schema.vanityKeypairs.$inferInsert;

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

// Export schema for type inference
export { schema };
