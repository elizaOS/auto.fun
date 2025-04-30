import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  real,
  timestamp,
  unique,
  index
} from "drizzle-orm/pg-core";

export const tokens = pgTable("tokens", {
  id: text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
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
  createdAt: timestamp("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  lastUpdated: timestamp("last_updated")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
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
  is_token_2022: integer("is_token_2022").default(0),
  hide_from_featured: integer("hide_from_featured").default(0),
  tokenSupply: text("token_supply").default("1000000000000000"),
  tokenSupplyUiAmount: real("token_supply_ui_amount").default(1000000000),
  tokenDecimals: integer("token_decimals").default(6),
  lastSupplyUpdate: timestamp("last_supply_update"),
},
  (table) => ({
    tickerIndex: index("tokens_ticker_idx").on(table.ticker),
    creatorIndex: index("tokens_creator_idx").on(table.creator),
    statusIndex: index("tokens_status_idx").on(table.status),
    marketIndex: index("tokens_market_idx").on(table.marketId),
    mintIndex: index("tokens_mint_idx").on(table.mint),
    lockIdIndex: index("tokens_lock_id_idx").on(table.lockId),
    hiddenIndex: index("tokens_hidden_idx").on(table.hidden),
    importedIndex: index("tokens_imported_idx").on(table.imported),
    featuredIndex: index("tokens_featured_idx").on(table.featured),
    verifiedIndex: index("tokens_verified_idx").on(table.verified),
    hiddenFromFeaturedIndex: index("tokens_hide_from_featured_idx").on(table.hide_from_featured),
    marketCapUSDIndex: index("tokens_market_cap_usd_idx").on(table.marketCapUSD),
    volume24hIndex: index("tokens_volume_24h_idx").on(table.volume24h),
    holderCountIndex: index("tokens_holder_count_idx").on(table.holderCount),
    curveProgressIndex: index("tokens_curve_progress_idx").on(table.curveProgress),
    nameIndex: index("tokens_name_idx").on(table.name),
  }));

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
  expiresAt: timestamp("expires_at").notNull(),
});

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
  tier: text("tier").notNull().default("1"),
  media: text("media"),
});

// User schema
export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name"),
  address: text("address").notNull().unique(),
  display_name: text("display_name"),
  profile_picture_url: text("profile_picture_url"),
  points: integer("points").notNull().default(0),
  rewardPoints: integer("reward_points").notNull().default(0),
  createdAt: timestamp("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  suspended: integer("suspended").notNull().default(0),
  isModerator: integer("is_moderator").notNull().default(0),
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
  createdAt: timestamp("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
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
export const accessTokens = pgTable(
  "access_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => ({
    userIdUnique: unique().on(table.userId),
  }),
);

// TokenAgents schema
export const tokenAgents = pgTable("token_agents", {
  id: text("id").primaryKey(),
  tokenMint: text("token_mint").notNull(),
  ownerAddress: text("owner_address").notNull(),
  twitterUserId: text("twitter_user_id").notNull(),
  twitterUserName: text("twitter_user_name").notNull(),
  twitterImageUrl: text("twitter_image_url").notNull(),
  twitterDescription: text("twitter_description"),
  official: integer("official").notNull().default(0),
  createdAt: timestamp("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const metadata = pgTable("metadata", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

let dbInstance: ReturnType<typeof drizzle> | null = null;

// Default local database connection string
const DEFAULT_DATABASE_URL = "postgresql://autofun_owner:npg_2PDZgJfEtrh6@localhost:5432/autofun";

export function getDB() {
  if (!dbInstance) {
    // Use DATABASE_URL from environment or the default local URL
    const connectionString = process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
    console.log(`[DB] Connecting to database: ${connectionString === DEFAULT_DATABASE_URL ? 'DEFAULT LOCAL DB' : 'ENV VAR DB'}`);
    const poolInstance = new Pool({ connectionString });
    dbInstance = drizzle(poolInstance, { schema });
  }
  return dbInstance;
}

// Type definitions for common query results
export type Token = typeof schema.tokens.$inferSelect;
export type TokenInsert = typeof schema.tokens.$inferInsert;

export type Fee = typeof schema.fees.$inferSelect;
export type FeeInsert = typeof schema.fees.$inferInsert;

export type Message = typeof schema.messages.$inferSelect;
export type MessageInsert = typeof schema.messages.$inferInsert;

export type User = typeof schema.users.$inferSelect;
export type UserInsert = typeof schema.users.$inferInsert;

export type PreGeneratedToken = typeof schema.preGeneratedTokens.$inferSelect;
export type PreGeneratedTokenInsert =
  typeof schema.preGeneratedTokens.$inferInsert;

export type TokenAgent = typeof tokenAgents.$inferSelect;
export type TokenAgentInsert = typeof tokenAgents.$inferInsert;

export type Metadata = typeof metadata.$inferSelect;
export type MetadataInsert = typeof metadata.$inferInsert;

// Schema for all tables
const schema = {
  tokens,
  fees,
  messages,
  users,
  metadata,
  mediaGenerations,
  cachePrices,
  preGeneratedTokens,
  oauthVerifiers,
  accessTokens,
  tokenAgents,
};

// Export schema for type inference
export { schema };
