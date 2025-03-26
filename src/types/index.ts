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

export type ChartTable = {
  table: {
    open: number;
    high: number;
    low: number;
    close: number;
    time: number;
  }[];
};
