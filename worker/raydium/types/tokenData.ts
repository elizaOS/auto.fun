export interface MigrationData {
  withdraw?: {
    status: string;
    txId: string;
    updatedAt: string;
  };
  createPool?: {
    status: string;
    txId: string;
    updatedAt: string;
  };
  lockLP?: {
    status: string;
    txId: string;
    updatedAt: string;
  };
  sendNft?: {
    status: string;
    txId: string;
    updatedAt: string;
  };
  depositNft?: {
    status: string;
    txId: string;
    updatedAt: string;
  };
  finalize?: {
    status: string;
    txId: string;
    updatedAt: string;
  };
}

export interface WithdrawnAmountsData {
  withdrawnSol: number;
  withdrawnTokens: number;
}

export interface PoolInfoData {
  id: string;
  lpMint: string;
  baseVault: string;
  quoteVault: string;
}

export interface TokenData {
  id: string;
  name: string;
  ticker: string;
  url: string;
  image: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  discord?: string;
  description?: string;
  mint: string;
  creator: string;
  nftMinted?: string;
  lockId?: string;
  lockedAmount?: string;
  lockedAt?: string;
  harvestedAt?: string;
  status: string;
  createdAt: string;
  lastUpdated: string;
  completedAt?: string;
  withdrawnAt?: string;
  migratedAt?: string;
  marketId?: string;
  baseVault?: string;
  quoteVault?: string;
  withdrawnAmount?: number;
  reserveAmount?: number;
  reserveLamport?: number;
  virtualReserves?: number;
  liquidity?: number;
  currentPrice?: number;
  marketCapUSD?: number;
  tokenPriceUSD?: number;
  solPriceUSD?: number;
  curveProgress?: number;
  curveLimit?: number;
  priceChange24h?: number;
  price24hAgo?: number;
  volume24h?: number;
  inferenceCount?: number;
  lastVolumeReset?: string;
  lastPriceUpdate?: string;
  holderCount?: number;
  txId?: string;
  migration?: MigrationData;
  withdrawnAmounts?: WithdrawnAmountsData;
  poolInfo?: PoolInfoData;
  lockLpTxId?: string;
}

export interface TokenDBData {
  id?: string;
  name?: string;
  ticker?: string;
  url?: string;
  image?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  discord?: string;
  description?: string;
  mint: string;
  creator?: string;
  nftMinted?: string;
  lockId?: string;
  lockedAmount?: string;
  lockedAt?: string;
  harvestedAt?: string;
  status?: string;
  createdAt?: string;
  lastUpdated: string;
  completedAt?: string;
  withdrawnAt?: string;
  migratedAt?: string;
  marketId?: string;
  baseVault?: string;
  quoteVault?: string;
  withdrawnAmount?: number;
  reserveAmount?: number;
  reserveLamport?: number;
  virtualReserves?: number;
  liquidity?: number;
  currentPrice?: number;
  marketCapUSD?: number;
  tokenPriceUSD?: number;
  solPriceUSD?: number;
  curveProgress?: number;
  curveLimit?: number;
  priceChange24h?: number;
  price24hAgo?: number;
  volume24h?: number;
  inferenceCount?: number;
  lastVolumeReset?: string;
  lastPriceUpdate?: string;
  holderCount?: number;
  txId?: string;
  // Database fields stored as JSON strings:
  migration?: string;
  withdrawnAmounts?: string;
  poolInfo?: string;
  lockLpTxId?: string;
}
