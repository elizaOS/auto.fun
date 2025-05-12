import { Keypair } from "@solana/web3.js";

export enum FormTab {
  AUTO = "auto",
  MANUAL = "manual",
  IMPORT = "import",
}

export interface FormState {
  name: string;
  symbol: string;
  description: string;
  prompt: string;
  initialSol: string;
  links: {
    twitter: string;
    telegram: string;
    website: string;
    discord: string;
    farcaster: string;
  };
  importAddress: string;
  coinDropImageUrl?: string;
}

export interface FormErrors {
  name: string;
  symbol: string;
  description: string;
  prompt: string;
  initialSol: string;
  userPrompt: string;
  importAddress: string;
  percentage: string;
}

export interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  initialSol: number;
  links: {
    twitter: string;
    telegram: string;
    farcaster: string;
    website: string;
    discord: string;
  };
  imageBase64: string | null;
  tokenMint: string;
  decimals: number;
  supply: number;
  freezeAuthority: string;
  mintAuthority: string;
}

export interface TokenCreationStage {
  step: number;
  stage: "uploading" | "creating" | "finalizing" | "complete";
  message: string;
}

export interface TokenCreationError {
  message: string;
  code?: string;
  retryable?: boolean;
}

export interface TokenCreationResult {
  mintAddress: string;
  metadataUrl: string;
  tokenMetadata: TokenMetadata;
}

export interface UploadResponse {
  success: boolean;
  imageUrl: string;
  metadataUrl: string;
}

export interface GenerateImageResponse {
  success: boolean;
  mediaUrl: string;
  remainingGenerations: number;
  resetTime: string;
}

export interface PreGeneratedTokenResponse {
  success: boolean;
  token: {
    id: string;
    name: string;
    ticker: string;
    description: string;
    prompt: string;
    image?: string;
    createdAt: string;
    used: number;
  };
}

export interface GenerateMetadataResponse {
  success: boolean;
  metadata: {
    name: string;
    symbol: string;
    description: string;
    prompt: string;
  };
}

export interface UploadImportImageResponse {
  success: boolean;
  imageUrl: string;
}

export interface TokenSearchData {
  name?: string;
  symbol?: string;
  description?: string;
  creator?: string;
  creators?: string[];
  image?: string;
  mint: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  discord?: string;
  metadataUri?: string;
  isCreator?: boolean;
  updateAuthority?: string;
}

export type VanityResult = {
  publicKey: string;
  secretKey: Keypair;
};

export type WorkerMessage =
  | {
      type: "found";
      workerId: number;
      publicKey: string;
      secretKey: number[];
      validated: boolean;
    }
  | { type: "progress"; workerId: number; count: number }
  | { type: "error"; workerId: number; error: string };
