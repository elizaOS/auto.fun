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
  status: string;
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
