import {
  D1Database,
  DurableObjectNamespace,
  R2Bucket,
} from "@cloudflare/workers-types/experimental";
import { KVNamespace } from "@cloudflare/workers-types";

// Define AI interface for Cloudflare AI
interface Ai {
  run: (model: string, inputs: any) => Promise<any>;
}

/**
 * Environment interface for Cloudflare Workers
 */
export interface Env {
  WEBSOCKET_DO: DurableObjectNamespace;
  DB: D1Database;
  NETWORK: string;
  DECIMALS: string;
  TOKEN_SUPPLY: string;
  VIRTUAL_RESERVES: string;
  CURVE_LIMIT: string;
  WALLET_PRIVATE_KEY: string;
  FEE_PERCENTAGE: string;
  CODEX_API_KEY: string;
  // Cloudflare R2 storage
  R2: R2Bucket;
  R2_PUBLIC_URL: string;
  ASSET_URL: string; // URL for accessing cached assets
  VITE_API_URL: string; // API URL fallback for assets
  FAL_API_KEY: string;
  // Cloudflare AI binding
  AI: Ai;
  // Cloudflare AI credentials (only needed for external API calls, not when using binding)
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_API_TOKEN: string;
  NODE_ENV: string;
  SWAP_FEE: string;
  // Authentication
  JWT_SECRET: string;
  // Solana connection
  RPC_URL: string;
  MAINNET_SOLANA_RPC_URL: string;
  DEVNET_SOLANA_RPC_URL: string;
  PROGRAM_ID: string;
  // Test environment properties
  tokenPubkey: string; // Used in tests to track the current test token
  // Redis
  REDIS: KVNamespace;
  // Frontend URL
  DEVNET_FRONTEND_URL: string;
  MAINNET_FRONTEND_URL: string;
  // Twitter API
  TWITTER_BEARER_TOKEN: string;
  TWITTER_CLIENT_ID: string;
  TWITTER_API_KEY: string;
  TWITTER_API_SECRET: string;
  TWITTER_ACCESS_TOKEN_SECRET: string;
  TWITTER_ACCESS_TOKEN: string;
}
