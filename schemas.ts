import mongoose from "mongoose";
import { z } from "zod";

///////////////////////////////////////
// Zod Validation Schemas
///////////////////////////////////////

// User Schema Validation
export const UserValidation = z.object({
  name: z.string().optional(),
  address: z.string().min(32).max(44), // Solana addresses are 32-44 chars
  avatar: z
    .string()
    .url()
    .default(
      "https://ipfs.io/ipfs/bafkreig4ob6pq5qy4v6j62krj4zkh2kc2pnv5egqy7f65djqhgqv3x56pq"
    ),
  createdAt: z.date().default(() => new Date()),
});

// Token Schema Validation
export const TokenValidation = z.object({
  name: z.string().min(1),
  ticker: z.string().min(1).max(10),
  url: z.string().url(),
  image: z.string().url(),
  xusername: z.string().optional(),
  xurl: z.string().url().optional(),
  xavatarurl: z.string().url().optional(),
  xname: z.string().optional(),
  xtext: z.string().optional(),
  twitter: z.string().url().optional(),
  telegram: z.string().url().optional(),
  website: z.string().url().optional(),
  description: z.string().optional(),
  mint: z.string().min(32).max(44), // Solana addresses
  creator: z.string().min(32).max(44),
  nftMinted: z.string().optional(),
  lockId: z.string().optional(),
  lockedAmount: z.string().optional(),
  lockedAt: z.date().optional(),
  harvestedAt: z.date().optional(),
  status: z
    .enum([
      "pending",
      "active",
      "withdrawn",
      "migrating",
      "migrated",
      "locked",
      "harvested",
      "migration_failed",
    ])
    .default("active"),
  createdAt: z.date().default(() => new Date()),
  lastUpdated: z.date().default(() => new Date()),
  completedAt: z.date().optional(),
  withdrawnAt: z.date().optional(),
  migratedAt: z.date().optional(),
  marketId: z.string().optional(),
  baseVault: z.string().optional(),
  quoteVault: z.string().optional(),
  withdrawnAmount: z.number().optional(),
  reserveAmount: z.number().optional(),
  reserveLamport: z.number().optional(),
  virtualReserves: z.number().optional(),
  liquidity: z.number().optional(),
  currentPrice: z.number().optional(),
  marketCapUSD: z.number().optional(),
  tokenPriceUSD: z.number().optional(),
  solPriceUSD: z.number().optional(),
  curveProgress: z.number().optional(),
  curveLimit: z.number().optional(),
  priceChange24h: z.number().optional(),
  price24hAgo: z.number().optional(),
  volume24h: z.number().optional(),
  inferenceCount: z.number().optional(),
  lastVolumeReset: z.date().optional(),
  lastPriceUpdate: z.date().optional(),
  holderCount: z.number().optional(),
  txId: z.string(),
});

// Swap Schema Validation
export const SwapValidation = z.object({
  tokenMint: z.string().min(32).max(44),
  user: z.string().min(32).max(44),
  type: z.string(),
  direction: z.number().min(0).max(1), // 0 = Buy (SOL->Token), 1 = Sell (Token->SOL)
  amountIn: z.number().positive(),
  amountOut: z.number().positive(),
  priceImpact: z.number().optional(),
  price: z.number().positive(),
  txId: z.string().min(32),
  timestamp: z.date().default(() => new Date()),
});

// Fee Schema Validation
export const FeeValidation = z.object({
  tokenMint: z.string(),
  user: z.string().optional(),
  direction: z.number().optional(),
  feeAmount: z.string().optional(),
  tokenAmount: z.string().optional(),
  solAmount: z.string().optional(),
  type: z.enum(["swap", "migration"]),
  txId: z.string().optional(),
  timestamp: z.date(),
});

// Message Schema Validation
export const MessageValidation = z.object({
  author: z.string().min(32).max(44),
  tokenMint: z.string().min(32).max(44),
  message: z.string().min(1).max(500),
  parentId: z.instanceof(mongoose.Types.ObjectId).optional(), // Reference to parent message for replies
  replyCount: z.number().default(0), // Track number of replies
  likes: z.number().default(0), // Track number of likes
  timestamp: z.date().default(() => new Date()),
});

export const NewMessageValidation = MessageValidation.pick({
  message: true,
}).extend({
  parentId: z.string().optional(),
});

export const MessageLikeValidation = z.object({
  messageId: z.instanceof(mongoose.Types.ObjectId),
  userAddress: z.string().min(32).max(44),
  timestamp: z.date().default(() => new Date()),
});

// Vanity Keypair Schema Validation
export const VanityKeypairValidation = z.object({
  address: z.string().min(32).max(44),
  secretKey: z.string(),
  createdAt: z.date().default(() => new Date()),
  used: z.boolean().default(false),
});

export const VanityKeypairRequestValidation = z.object({
  address: z.string().min(32).max(44),
});

// Token Holder Schema Validation
export const TokenHolderValidation = z.object({
  mint: z.string().min(32).max(44),
  address: z.string().min(32).max(44),
  amount: z.number().positive(),
  percentage: z.number().positive(),
  lastUpdated: z.date().default(() => new Date()),
});

export const PersonalityValidation = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().optional(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
  deletedAt: z.date().optional(),
});

export const AgentValidation = z.object({
  id: z.string().optional(), // MongoDB will handle _id
  ownerAddress: z.string(),
  contractAddress: z.string(),
  txId: z.string(),
  symbol: z.string(),
  name: z.string(),
  description: z.string().optional(),
  systemPrompt: z.string(),
  modelProvider: z.string().default("llama_cloud"),

  // Arrays
  bio: z.array(z.string()),
  lore: z.array(z.string()),
  postExamples: z.array(z.string()),
  adjectives: z.array(z.string()),
  people: z.array(z.string()),
  topics: z.array(z.string()),
  styleAll: z.array(z.string()),
  styleChat: z.array(z.string()),
  stylePost: z.array(z.string()),

  // JSON fields
  messageExamples: z.any().optional(),
  twitterCookie: z.any().optional(),

  // Twitter fields
  twitterUsername: z.string(),
  twitterPassword: z.string(),
  twitterEmail: z.string(),
  postFreqMin: z.number().default(90),
  postFreqMax: z.number().default(180),
  pollIntervalSec: z.number().default(120),

  // Task management
  ecsTaskId: z.string().optional(),

  // Timestamps
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
  deletedAt: z.date().optional(),
});

// Update the MediaGenerationValidation schema
export const MediaGenerationValidation = z.object({
  mint: z.string().min(32).max(44),
  type: z.enum(["image", "video", "audio"]),
  prompt: z.string().min(1).max(500),
  mediaUrl: z.string().url(),
  negative_prompt: z.string().optional(),
  num_inference_steps: z.number().optional(),
  seed: z.number().optional(),
  // Video specific fields
  num_frames: z.number().optional(),
  fps: z.number().optional(),
  motion_bucket_id: z.number().optional(),
  duration: z.number().optional(),
  // Audio specific fields
  duration_seconds: z.number().optional(),
  bpm: z.number().optional(),
  creator: z.string().nullable(),
  timestamp: z.date().default(() => new Date()),
  dailyGenerationCount: z.number().optional(),
  lastGenerationReset: z.date().optional(),
});

///////////////////////////////////////
// MongoDB Schemas
///////////////////////////////////////

// User Schema
const UserSchema = new mongoose.Schema({
  name: String,
  address: String,
  avatar: {
    type: String,
    default:
      "https://ipfs.io/ipfs/bafkreig4ob6pq5qy4v6j62krj4zkh2kc2pnv5egqy7f65djqhgqv3x56pq",
  },
  createdAt: { type: Date, default: Date.now },
});

// Interfaces
export interface TokenMetadataJson {
  name: string;
  symbol: string;
  description: string;
  image: string;
  showName?: boolean;
  createdOn?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
}

// Create Token Schema
export const createTokenSchema = z.object({
  name: z.string(),
  symbol: z.string(),
  description: z.string(),
  image: z.string(), // base64 image string
  twitter: z.string().url().optional(),
  telegram: z.string().url().optional(),
  website: z.string().url().optional(),
  xusername: z.string().optional(),
  xurl: z.string().url().optional(),
  xavatarurl: z.string().url().optional(),
  xname: z.string().optional(),
  xtext: z.string().optional(),
});

export const ChartParamsSchema = z.object({
  pairIndex: z.string().transform((val) => parseInt(val)),
  start: z.string().transform((val) => parseInt(val)),
  end: z.string().transform((val) => parseInt(val)),
  range: z.string().transform((val) => parseInt(val)),
  token: z.string().min(32).max(44),
});

// Token Schema
const TokenSchema = new mongoose.Schema({
  name: String,
  ticker: String,
  url: String,
  image: String,
  xusername: String,
  xurl: String,
  xavatarurl: String,
  xname: String,
  xtext: String,
  twitter: String,
  telegram: String,
  website: String,
  description: String,
  mint: String,
  creator: String,
  nftMinted: String,
  lockId: String,
  lockedAmount: String,
  lockedAt: Date,
  harvestedAt: Date,
  status: {
    type: String,
    enum: [
      "pending",
      "active",
      "withdrawn",
      "migrating",
      "migrated",
      "locked",
      "harvested",
      "migration_failed",
    ],
    default: "active",
  },
  createdAt: { type: Date, default: Date.now },
  lastUpdated: { type: Date, default: Date.now },
  completedAt: Date,
  withdrawnAt: Date,
  migratedAt: Date,
  marketId: String,
  baseVault: String,
  quoteVault: String,
  withdrawnAmount: Number,
  reserveAmount: Number,
  reserveLamport: Number,
  virtualReserves: Number,
  liquidity: Number,
  currentPrice: Number,
  marketCapUSD: Number,
  tokenPriceUSD: Number,
  solPriceUSD: Number,
  curveProgress: Number,
  curveLimit: Number,
  priceChange24h: Number,
  price24hAgo: Number,
  volume24h: Number,
  inferenceCount: Number,
  lastVolumeReset: Date,
  lastPriceUpdate: Date,
  holderCount: Number,
  txId: String,
  migration: {
    withdraw: {
      status: String,
      txId: String,
      updatedAt: Date,
    },
    createPool: {
      status: String,
      txId: String,
      updatedAt: Date,
    },
    lockLP: {
      status: String,
      txId: String,
      updatedAt: Date,
    },
    finalize: {
      status: String,
      txId: String,
      updatedAt: Date,
    },
  },
  withdrawnAmounts: {
    withdrawnSol: Number,
    withdrawnTokens: Number,
  },
  poolInfo: {
    id: String,
    lpMint: String,
    baseVault: String,
    quoteVault: String,
  },
  lockLpTxId: String,
});

// Swap Schema
const SwapSchema = new mongoose.Schema({
  tokenMint: String,
  user: String,
  type: String,
  direction: Number,
  amountIn: Number,
  amountOut: Number,
  priceImpact: Number,
  price: Number,
  txId: String,
  timestamp: { type: Date, default: Date.now },
});

// Fee Schema
const FeeSchema = new mongoose.Schema({
  tokenMint: String,
  user: String,
  direction: Number,
  feeAmount: String,
  tokenAmount: String,
  solAmount: String,
  type: {
    type: String,
    enum: ["swap", "migration"],
    required: true,
  },
  txId: String,
  timestamp: { type: Date, default: Date.now },
});

// Message Schema
const MessageSchema = new mongoose.Schema({
  author: String,
  tokenMint: String,
  message: String,
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: "Message" }, // Reference to parent message
  replyCount: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  timestamp: { type: Date, default: Date.now },
});

const MessageLikeSchema = new mongoose.Schema({
  messageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Message",
    required: true,
  },
  userAddress: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

// Vanity Keypair Schema
const VanityKeypairSchema = new mongoose.Schema({
  address: String,
  secretKey: String,
  createdAt: { type: Date, default: Date.now },
  used: { type: Boolean, default: false },
});

const TokenHolderSchema = new mongoose.Schema(
  {
    mint: { type: String, required: true },
    address: { type: String, required: true },
    amount: { type: Number, required: true },
    percentage: { type: Number, required: true },
    lastUpdated: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

const PersonalitySchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    description: String,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    deletedAt: Date,
  },
  {
    timestamps: true,
  }
);

const AgentSchema = new mongoose.Schema(
  {
    ownerAddress: { type: String, required: true },
    contractAddress: { type: String, required: true },
    txId: { type: String, required: true },
    symbol: { type: String, required: true },
    name: { type: String, required: true },
    description: String,
    systemPrompt: { type: String, required: true },
    modelProvider: { type: String, default: "llama_cloud" },

    // Arrays
    bio: [String],
    lore: [String],
    postExamples: [String],
    adjectives: [String],
    people: [String],
    topics: [String],
    styleAll: [String],
    styleChat: [String],
    stylePost: [String],

    // JSON fields
    messageExamples: mongoose.Schema.Types.Mixed,
    twitterCookie: mongoose.Schema.Types.Mixed,

    // Twitter fields
    twitterUsername: { type: String, required: true },
    twitterPassword: { type: String, required: true },
    twitterEmail: { type: String, required: true },
    postFreqMin: { type: Number, default: 90 },
    postFreqMax: { type: Number, default: 180 },
    pollIntervalSec: { type: Number, default: 120 },

    // Task management
    ecsTaskId: String,

    // Timestamps
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    deletedAt: Date,
  },
  {
    timestamps: true, // Handles updatedAt automatically
  }
);

// Update the MongoDB schema
const MediaGenerationSchema = new mongoose.Schema({
  mint: { type: String, required: true },
  type: { type: String, enum: ["image", "video", "audio"], required: true },
  prompt: { type: String, required: true },
  mediaUrl: { type: String, required: true },
  negative_prompt: String,
  num_inference_steps: Number,
  seed: Number,
  // Video specific fields
  num_frames: Number,
  fps: Number,
  motion_bucket_id: Number,
  duration: Number,
  // Audio specific fields
  duration_seconds: Number,
  bpm: Number,
  creator: { type: String, default: null, required: false },
  timestamp: { type: Date, default: Date.now },
  dailyGenerationCount: { type: Number, default: 0 },
  lastGenerationReset: { type: Date },
});

// Add indexes for efficient querying
MediaGenerationSchema.index({ mint: 1, type: 1, timestamp: -1 });
MediaGenerationSchema.index({ creator: 1 });

// Add validation middleware
MediaGenerationSchema.pre("save", async function (next) {
  try {
    MediaGenerationValidation.parse(this.toObject());
    next();
  } catch (error) {
    next(error);
  }
});

///////////////////////////////////////
// MongoDB Indexes
///////////////////////////////////////

// Token Indexes
TokenSchema.index({ mint: 1 }, { unique: true });
TokenSchema.index({ createdAt: -1 });
TokenSchema.index({ status: 1, createdAt: -1 });
TokenSchema.index({ creator: 1 });
TokenSchema.index({ xusername: 1 });
TokenSchema.index({ marketCapUSD: -1 });

// Swap Indexes
SwapSchema.index({ tokenMint: 1, timestamp: -1 });
SwapSchema.index({ timestamp: 1 }); // For time-based queries
SwapSchema.index({ user: 1 }); // For user-specific queries
SwapSchema.index({
  tokenMint: 1,
  timestamp: 1,
  price: 1,
}); // For chart data queries

// Fee Indexes
FeeSchema.index({ tokenMint: 1, timestamp: -1 });
FeeSchema.index({ collector: 1 });

// VanityKeypair Indexes
VanityKeypairSchema.index({ used: 1 });
VanityKeypairSchema.index({ address: 1 }, { unique: true });

// User Indexes
UserSchema.index({ address: 1 }, { unique: true });
UserSchema.index({ createdAt: -1 });

// Message Indexes
MessageSchema.index({ tokenMint: 1, parentId: 1 });
MessageSchema.index({ parentId: 1 });
MessageSchema.index({ author: 1 });

MessageLikeSchema.index({ messageId: 1, userAddress: 1 }, { unique: true });

// Token Holder Indexes
TokenHolderSchema.index({ mint: 1, amount: -1 });

// Add indexes to match Prisma schema
AgentSchema.index({ ownerAddress: 1 });
AgentSchema.index({ ecsTaskId: 1 });
AgentSchema.index({ updatedAt: 1 });
AgentSchema.index({ txId: 1 }, { unique: true });

PersonalitySchema.index({ id: 1 }, { unique: true });

///////////////////////////////////////
// MongoDB Model Exports
///////////////////////////////////////

// Export models and z validation schemas
export const User = mongoose.model("User", UserSchema);
export const Token = mongoose.model("Token", TokenSchema);
export const Swap = mongoose.model("Swap", SwapSchema);
export const Fee = mongoose.model("Fee", FeeSchema);
export const Message = mongoose.model("Message", MessageSchema);
export const MessageLike = mongoose.model("MessageLike", MessageLikeSchema);
export const VanityKeypair = mongoose.model(
  "VanityKeypair",
  VanityKeypairSchema
);
export const TokenHolder = mongoose.model("TokenHolder", TokenHolderSchema);
export const Agent = mongoose.model("Agent", AgentSchema);
export const Personality = mongoose.model("Personality", PersonalitySchema);
export const MediaGeneration = mongoose.model(
  "MediaGeneration",
  MediaGenerationSchema
);

// Export z types
export type UserType = z.infer<typeof UserValidation>;
export type TokenType = z.infer<typeof TokenValidation>;
export type SwapType = z.infer<typeof SwapValidation>;
export type FeeType = z.infer<typeof FeeValidation>;
export type MessageType = z.infer<typeof MessageValidation>;
export type MessageLikeType = z.infer<typeof MessageLikeValidation>;
export type TokenHolderType = z.infer<typeof TokenHolderValidation>;
export type AgentType = z.infer<typeof AgentValidation>;
export type PersonalityType = z.infer<typeof PersonalityValidation>;
export type MediaGenerationType = z.infer<typeof MediaGenerationValidation>;
