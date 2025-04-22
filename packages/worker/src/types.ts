/**
 * Media generation types
 */
export interface MediaGeneration {
  id: string;
  mint: string;
  type: string;
  prompt: string;
  mediaUrl: string;
  negativePrompt?: string;
  numInferenceSteps?: number;
  seed?: number;
  // Video specific metadata
  numFrames?: number;
  fps?: number;
  motionBucketId?: number;
  duration?: number;
  // Audio specific metadata
  durationSeconds?: number;
  bpm?: number;
  creator?: string;
  timestamp: string;
  dailyGenerationCount?: number;
  lastGenerationReset?: string;
}

export type TTokenStatus =
  | "pending"
  | "active"
  | "withdrawn"
  | "migrating"
  | "migrated"
  | "locked"
  | "harvested"
  | "migration_failed";

export interface IToken {
  id: string;
  name: string;
  ticker: string;
  mint: string;
  creator: string;
  status: TTokenStatus;
  createdAt: string;
  tokenPriceUSD: number;
  marketCapUSD: number;
  volume24h: number;
}

export interface ITokenHolder {
  id: string;
  mint: string;
  address: string;
  amount: number;
  percentage: number;
  lastUpdated: string;
}
