import { z } from "zod";

export type TSortBy =
  | "featured"
  | "name"
  | "marketCapUSD"
  | "volume24h"
  | "holderCount"
  | "curveProgress"
  | "createdAt";
export type TSortOrder = "asc" | "desc";

export interface IToken {
  mint: string;
  createdAt: string;
  creator: string;
  currentPrice: number;
  curveLimit: number;
  curveProgress: number;
  description: string;
  image: string;
  inferenceCount: number;
  lastUpdated: string;
  liquidity: number;
  marketCapUSD: number;
  name: string;
  price24hAgo: number;
  priceChange24h: number;
  reserveAmount: number;
  reserveLamport: number;
  solPriceUSD: number;
  status:
    | "pending"
    | "active"
    | "withdrawn"
    | "migrating"
    | "migrated"
    | "locked"
    | "harvested"
    | "migration_failed";
  telegram: string;
  ticker: string;
  tokenPriceUSD: number;
  twitter: string;
  txId: string;
  url: string;
  virtualReserves: number;
  volume24h: number;
  website: string;
  holderCount: number;
  lastPriceUpdate: string;
  lastVolumeReset: string;
  hasAgent: boolean;
}

export interface IPagination {
  page: number;
  totalPages: number;
  total: number;
  hasMore: boolean;
}

export interface ISwap {
  amountIn: number;
  amountOut: number;
  direction: 0 | 1;
  id: string;
  price: number;
  timestamp: string | Date;
  tokenMint: string;
  txId: string;
  type: string;
  user: string;
}

export interface ITokenHolder {
  id: string;
  mint: string;
  address: string;
  amount: number;
  percentage: number;
  lastUpdated: string | Date;
}

export const TokenSchema = z.object({
  name: z.string(),
  url: z.string().optional(),
  ticker: z.string(),
  createdAt: z.string().datetime(),
  mint: z.string(),
  image: z.string().optional(),
  marketCapUSD: z.number().nullable(),
  currentPrice: z.number().nullable(),
  curveProgress: z.number().nullable(),
  status: z.enum([
    "pending",
    "active",
    "withdrawn",
    "migrating",
    "migrated",
    "locked",
    "harvested",
    "migration_failed",
    "partner_import",
  ]),
  liquidity: z.number().nullable(),
  curveLimit: z.number().nullable(),
  reserveLamport: z.number().nullable(),
  virtualReserves: z.number().nullable(),
  solPriceUSD: z.number().nullable(),
  holderCount: z.number().nullable().default(0),
  description: z.string(),
  discord: z.string().optional(),
  twitter: z.string().optional(),
  telegram: z.string().optional(),
  agentLink: z.string().optional(),
  creator: z.string(),
  volume24h: z.number().nullable(),
  website: z.string().optional(),
  tokenPriceUSD: z.number().nullable(),
  nftMinted: z.string().nullable(),
  lockId: z.string().nullable(),
  lockedAmount: z.string().nullable(),
  lockedAt: z.string().datetime().nullable(),
  harvestedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  withdrawnAt: z.string().datetime().nullable(),
  migratedAt: z.string().datetime().nullable(),
  marketId: z.string().nullable(),
  baseVault: z.string().nullable(),
  quoteVault: z.string().nullable(),
  withdrawnAmount: z.number().nullable(),
  reserveAmount: z.number().nullable(),
  priceChange24h: z.number().nullable(),
  price24hAgo: z.number().nullable(),
  inferenceCount: z.number().nullable(),
  lastVolumeReset: z.string().datetime().nullable(),
  lastPriceUpdate: z.string().datetime().nullable(),
  txId: z.string(),
  lastUpdated: z.string().datetime(),
});

export type Token = z.infer<typeof TokenSchema>;

// Type definitions for global objects

declare global {
  interface Window {
    solana?: {
      isPhantom?: boolean;
      signMessage?: (message: Uint8Array, encoding: string) => Promise<Uint8Array>;
      connect: () => Promise<{ publicKey: string }>;
      disconnect?: () => Promise<void>;
      publicKey?: { toBase58: () => string };
      on?: (event: string, callback: () => void) => void;
      off?: (event: string, callback: () => void) => void;
    };
  }
}

export {};
