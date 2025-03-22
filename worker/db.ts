import { drizzle } from 'drizzle-orm/d1';
import { Env } from './env';
import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, real } from 'drizzle-orm/sqlite-core';

// Token schema
export const tokens = sqliteTable('tokens', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ticker: text('ticker').notNull(),
  url: text('url').notNull(),
  image: text('image').notNull(),
  twitter: text('twitter'),
  telegram: text('telegram'),
  website: text('website'),
  description: text('description'),
  mint: text('mint').notNull().unique(),
  creator: text('creator').notNull(),
  nftMinted: text('nftMinted'),
  lockId: text('lockId'),
  lockedAmount: text('lockedAmount'),
  lockedAt: text('lockedAt'),
  harvestedAt: text('harvestedAt'),
  status: text('status').notNull().default('active'),
  createdAt: text('createdAt').notNull(),
  lastUpdated: text('lastUpdated').notNull(),
  completedAt: text('completedAt'),
  withdrawnAt: text('withdrawnAt'),
  migratedAt: text('migratedAt'),
  marketId: text('marketId'),
  baseVault: text('baseVault'),
  quoteVault: text('quoteVault'),
  withdrawnAmount: real('withdrawnAmount'),
  reserveAmount: real('reserveAmount'),
  reserveLamport: real('reserveLamport'),
  virtualReserves: real('virtualReserves'),
  liquidity: real('liquidity'),
  currentPrice: real('currentPrice'),
  marketCapUSD: real('marketCapUSD'),
  tokenPriceUSD: real('tokenPriceUSD'),
  solPriceUSD: real('solPriceUSD'),
  curveProgress: real('curveProgress'),
  curveLimit: real('curveLimit'),
  priceChange24h: real('priceChange24h'),
  price24hAgo: real('price24hAgo'),
  volume24h: real('volume24h'),
  inferenceCount: integer('inferenceCount'),
  lastVolumeReset: text('lastVolumeReset'),
  lastPriceUpdate: text('lastPriceUpdate'),
  holderCount: integer('holderCount'),
  txId: text('txId'),
});

// Swap schema
export const swaps = sqliteTable('swaps', {
  id: text('id').primaryKey(),
  tokenMint: text('tokenMint').notNull(),
  user: text('user').notNull(),
  type: text('type').notNull(),
  direction: integer('direction').notNull(), // 0 = Buy (SOL->Token), 1 = Sell (Token->SOL)
  amountIn: real('amountIn').notNull(),
  amountOut: real('amountOut').notNull(),
  priceImpact: real('priceImpact'),
  price: real('price').notNull(),
  txId: text('txId').notNull().unique(),
  timestamp: text('timestamp').notNull(),
});

// Fees schema
export const fees = sqliteTable('fees', {
  id: text('id').primaryKey(),
  tokenMint: text('tokenMint').notNull(),
  user: text('user'),
  direction: integer('direction'),
  feeAmount: text('feeAmount'),
  tokenAmount: text('tokenAmount'),
  solAmount: text('solAmount'),
  type: text('type').notNull(), // swap, migration
  txId: text('txId'),
  timestamp: text('timestamp').notNull(),
});

// TokenHolder schema
export const tokenHolders = sqliteTable('tokenHolders', {
  id: text('id').primaryKey(),
  mint: text('mint').notNull(),
  address: text('address').notNull(),
  amount: real('amount').notNull(),
  percentage: real('percentage').notNull(),
  lastUpdated: text('lastUpdated').notNull(),
});

// Agent schema
export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  ownerAddress: text('ownerAddress').notNull(),
  contractAddress: text('contractAddress').notNull().references(() => tokens.mint),
  txId: text('txId').notNull(),
  symbol: text('symbol').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  systemPrompt: text('systemPrompt'),
  bio: text('bio'),
  lore: text('lore'),
  messageExamples: text('messageExamples'),
  postExamples: text('postExamples'),
  adjectives: text('adjectives'),
  people: text('people'),
  topics: text('topics'),
  modelProvider: text('modelProvider').default('claude'),
  styleAll: text('styleAll'),
  styleChat: text('styleChat'),
  stylePost: text('stylePost'),
  twitterUsername: text('twitterUsername'),
  twitterPassword: text('twitterPassword'),
  twitterEmail: text('twitterEmail'),
  twitterCookie: text('twitterCookie'),
  personalities: text('personalities'),
  ecsTaskId: text('ecsTaskId'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  deletedAt: integer('deletedAt', { mode: 'timestamp' }),
});

// Create messages table without self-referencing first
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  author: text('author').notNull(),
  tokenMint: text('tokenMint').notNull(),
  message: text('message').notNull(),
  parentId: text('parentId'),
  replyCount: integer('replyCount').notNull().default(0),
  likes: integer('likes').notNull().default(0),
  timestamp: text('timestamp').notNull(),
});

// MessageLike schema
export const messageLikes = sqliteTable('messageLikes', {
  id: text('id').primaryKey(),
  messageId: text('messageId').notNull(),
  userAddress: text('userAddress').notNull(),
  timestamp: text('timestamp').notNull(),
});

// Personality schema
export const personalities = sqliteTable('personalities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  deletedAt: integer('deletedAt', { mode: 'timestamp' }),
});

// User schema
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name'),
  address: text('address').notNull().unique(),
  avatar: text('avatar').notNull().default('https://ipfs.io/ipfs/bafkreig4ob6pq5qy4v6j62krj4zkh2kc2pnv5egqy7f65djqhgqv3x56pq'),
  createdAt: text('createdAt').notNull(),
});

// VanityKeypair schema
export const vanityKeypairs = sqliteTable('vanityKeypairs', {
  id: text('id').primaryKey(),
  address: text('address').notNull().unique(),
  secretKey: text('secretKey').notNull(),
  createdAt: text('createdAt').notNull(),
  used: integer('used').notNull().default(0),
});

// Media Generation table
export const mediaGenerations = sqliteTable("media_generations", {
  id: text("id").primaryKey(),
  mint: text("mint").notNull(),
  type: text("type").notNull(), // "image", "video", "audio"
  prompt: text("prompt").notNull(),
  mediaUrl: text("media_url").notNull(),
  negativePrompt: text("negative_prompt"),
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
});

// Cache table for prices
export const cachePrices = sqliteTable("cache_prices", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // "sol", "token", etc.
  symbol: text("symbol").notNull(),
  price: text("price").notNull(), // Store as string to preserve precision
  timestamp: text("timestamp").notNull(),
  expiresAt: text("expires_at").notNull(), // When this cache entry should expire
});

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
}

export function getDB(env: Env) {
  try {
    // In development, handle cases where DB isn't properly configured
    if (env.NODE_ENV === 'development' || !env.DB) {
      // Create a chainable proxy that always returns itself
      const createChainableProxy = (): Record<string, any> => {
        return new Proxy({} as any, {
          get: (_target, prop) => {
            // Return a function that returns the proxy for method chaining
            if (typeof prop === 'string') {
              // @ts-ignore
              return (...args: any[]) => {
                if (prop === 'then') {
                  // Special handling for Promise then/catch/finally
                  return Promise.resolve([]);
                }
                return createChainableProxy();
              };
            }
            return createChainableProxy();
          },
          apply: () => {
            // Handle function calls by returning the chainable proxy
            return createChainableProxy();
          }
        });
      };
      
      return createChainableProxy();
    }
    
    return drizzle(env.DATABASE as any, { schema });
  } catch (error) {
    console.warn('Database connection failed, using fallback:', error);
    // Create the same chainable proxy for error cases
    const createChainableProxy = (): Record<string, any> => {
      return new Proxy({} as any, {
        get: (_, prop) => {
          if (typeof prop === 'string') {
            // @ts-ignore
            return (...args: any[]) => {
              if (prop === 'then') {
                return Promise.resolve([]);
              }
              return createChainableProxy();
            };
          }
          return createChainableProxy();
        },
        apply: () => createChainableProxy()
      });
    };
    
    return createChainableProxy();
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