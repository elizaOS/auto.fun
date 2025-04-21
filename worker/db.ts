import { Pool } from "pg";
import { drizzle, } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  real,
  timestamp,
  uniqueIndex,
  unique
} from "drizzle-orm/pg-core";
import { Env } from "./env";


// Token schema
export const tokens = pgTable("tokens", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  ticker: text("ticker").notNull(),
  url: text("url").notNull(),
  image: text("image").notNull(),
  twitter: text("twitter"),
  telegram: text("telegram"),
  website: text("website"),
  discord: text("discord"),
  farcaster: text("farcaster"),
  description: text("description"),
  mint: text("mint").notNull().unique(),
  creator: text("creator").notNull(),
  nftMinted: text("nft_minted"),
  lockId: text("lock_id"),
  lockedAmount: text("locked_amount"),
  lockedAt: timestamp("locked_at"),
  harvestedAt: timestamp("harvested_at"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastUpdated: timestamp("last_updated").notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: timestamp("completed_at"),
  withdrawnAt: timestamp("withdrawn_at"),
  migratedAt: timestamp("migrated_at"),
  marketId: text("market_id"),
  baseVault: text("base_vault"),
  quoteVault: text("quote_vault"),
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
  lastVolumeReset: timestamp("last_volume_reset"),
  lastPriceUpdate: timestamp("last_price_update"),
  holderCount: integer("holder_count"),
  txId: text("tx_id"),

  // New fields
  migration: text("migration"),
  withdrawnAmounts: text("withdrawn_amounts"),
  poolInfo: text("pool_info"),
  lockLpTxId: text("lock_lp_tx_id"),
  imported: integer("imported").default(0),
  featured: integer("featured").default(0),
  verified: integer("verified").default(0),
  hidden: integer("hidden").default(0),
  tokenSupply: text("token_supply").default("1000000000000000"),
  tokenSupplyUiAmount: real("token_supply_ui_amount").default(1000000000),
  tokenDecimals: integer("token_decimals").default(6),
  lastSupplyUpdate: timestamp("last_supply_update"),
});
// Swap schema
export const swaps = pgTable("swaps", {
  id: text("id").primaryKey(),
  tokenMint: text("token_mint").notNull(),
  user: text("user").notNull(),
  type: text("type").notNull(),
  direction: integer("direction").notNull(),
  amountIn: real("amount_in"),
  amountOut: real("amount_out"),
  priceImpact: real("price_impact"),
  price: real("price").notNull(),
  txId: text("tx_id").notNull().unique(),
  timestamp: timestamp("timestamp").notNull(),
});

// Fees schema
export const fees = pgTable("fees", {
  id: text("id").primaryKey(),
  tokenMint: text("token_mint").notNull(),
  user: text("user"),
  direction: integer("direction"),
  feeAmount: text("fee_amount"),
  tokenAmount: text("token_amount"),
  solAmount: text("sol_amount"),
  type: text("type").notNull(),
  txId: text("tx_id"),
  timestamp: timestamp("timestamp").notNull(),
});

// TokenHolder schema
export const tokenHolders = pgTable(
  "token_holders",
  {
    id: text("id").primaryKey(),
    mint: text("mint").notNull(),
    address: text("address").notNull(),
    amount: real("amount").notNull(),
    percentage: real("percentage").notNull(),
    lastUpdated: timestamp("last_updated").notNull(),
  },
  (table) => ({
    mintAddressUnique: unique().on(table.mint, table.address),
  }),
);

// Messages schema
export const messages = pgTable("messages", {
  id: text("id").primaryKey(),
  author: text("author").notNull(),
  tokenMint: text("token_mint").notNull(),
  message: text("message").notNull(),
  parentId: text("parent_id"),
  replyCount: integer("reply_count"),
  likes: integer("likes").notNull().default(0),
  timestamp: timestamp("timestamp").notNull(),
});

// MessageLike schema
export const messageLikes = pgTable("message_likes", {
  id: text("id").primaryKey(),
  messageId: text("message_id").notNull(),
  userAddress: text("user_address").notNull(),
  timestamp: timestamp("timestamp").notNull(),
});

// Personality schema
export const personalities = pgTable("personalities", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
  deletedAt: timestamp("deleted_at"),
});

// User schema
export const users = pgTable("users", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name"),
  address: text("address").notNull().unique(),
  points: integer("points").notNull().default(0),
  rewardPoints: integer("reward_points").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  suspended: integer("suspended").notNull().default(0),
});

// VanityKeypair schema
export const vanityKeypairs = pgTable("vanity_keypairs", {
  id: text("id").primaryKey(),
  address: text("address").notNull().unique(),
  secretKey: text("secret_key").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  used: integer("used").notNull().default(0),
});

// MediaGenerations schema
export const mediaGenerations = pgTable("media_generations", {
  id: text("id").primaryKey(),
  mint: text("mint").notNull(),
  type: text("type").notNull(),
  prompt: text("prompt").notNull(),
  mediaUrl: text("media_url").notNull(),
  negativePrompt: text("negative_prompt"),
  numInferenceSteps: integer("num_inference_steps"),
  seed: integer("seed"),
  numFrames: integer("num_frames"),
  fps: integer("fps"),
  motionBucketId: integer("motion_bucket_id"),
  duration: integer("duration"),
  durationSeconds: integer("duration_seconds"),
  bpm: integer("bpm"),
  creator: text("creator"),
  timestamp: timestamp("timestamp").notNull(),
  dailyGenerationCount: integer("daily_generation_count"),
  lastGenerationReset: timestamp("last_generation_reset"),
});

// CachePrices schema
export const cachePrices = pgTable("cache_prices", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  symbol: text("symbol").notNull(),
  price: text("price").notNull(),
  timestamp: timestamp("timestamp").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

// PreGeneratedTokens schema
export const preGeneratedTokens = pgTable("pre_generated_tokens", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ticker: text("ticker").notNull(),
  description: text("description").notNull(),
  prompt: text("prompt").notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  used: integer("used").notNull().default(0),
});

// OAuthVerifiers schema
export const oauthVerifiers = pgTable("oauth_verifiers", {
  id: text("id").primaryKey(),
  state: text("state").notNull().unique(),
  codeVerifier: text("code_verifier").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

// AccessTokens schema
export const accessTokens = pgTable("access_tokens", {
  id: text("id").primaryKey(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

// TokenAgents schema
export const tokenAgents = pgTable("token_agents", {
  id: text("id").primaryKey(),
  tokenMint: text("token_mint").notNull(),
  ownerAddress: text("owner_address").notNull(),
  twitterUserId: text("twitter_user_id").notNull(),
  twitterUserName: text("twitter_user_name").notNull(),
  twitterImageUrl: text("twitter_image_url").notNull(),
  official: integer("official").notNull().default(0),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// VanityGenerationInstances schema
export const vanityGenerationInstances = pgTable("vanity_generation_instances", {
  id: text("id").primaryKey(),
  instanceId: text("instance_id"),
  ipAddress: text("ip_address"),
  status: text("status").notNull().default("stopped"),
  jobId: text("job_id"),
  lastHeartbeat: timestamp("last_heartbeat"),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export const metadata = pgTable("metadata", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});


export function getDB(env: Env) {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  // pass your schema here
  return drizzle(pool, { schema });
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

export type PreGeneratedToken = typeof schema.preGeneratedTokens.$inferSelect;
export type PreGeneratedTokenInsert =
  typeof schema.preGeneratedTokens.$inferInsert;

export type TokenAgent = typeof tokenAgents.$inferSelect;
export type TokenAgentInsert = typeof tokenAgents.$inferInsert;

// Add type export for the new table
export type VanityGenerationInstance =
  typeof vanityGenerationInstances.$inferSelect;
export type VanityGenerationInstanceInsert =
  typeof vanityGenerationInstances.$inferInsert;

export type Metadata = typeof metadata.$inferSelect
export type MetadataInsert = typeof metadata.$inferInsert;

// Schema for all tables
const schema = {
  tokens,
  swaps,
  fees,
  tokenHolders,
  messages,
  messageLikes,
  users,
  personalities,
  vanityKeypairs,
  mediaGenerations,
  cachePrices,
  preGeneratedTokens,
  oauthVerifiers,
  accessTokens,
  tokenAgents,
  vanityGenerationInstances,
};

// Export schema for type inference
export { schema };
