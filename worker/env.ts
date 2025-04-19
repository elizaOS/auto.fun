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
  API_URL: string; // URL for self, for accessing cached assets
  FAL_API_KEY: string;
  LOCAL_DEV: string;
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
  DEVNET_PROGRAM_ID: string;
  PROGRAM_ID: string;
  // Test environment properties
  tokenPubkey: string; // Used in tests to track the current test token
  // Redis
  REDIS: KVNamespace;
  // KV namespace for auth tokens
  AUTH_TOKENS: KVNamespace;
  CACHE: KVNamespace;
  // Auth token salt for hashing
  AUTH_TOKEN_SALT: string;
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
  NEWS_API_KEY?: string;
  PREGENERATED_TOKENS_COUNT?: string;
  HELIUS_WEBHOOK_AUTH_TOKEN: string;
  CODEX_WEBHOOK_AUTH_TOKEN: string;
  // Add ADMIN_ADDRESSES to the Env interface
  ADMIN_ADDRESSES?: string;
  MANAGER_MULTISIG_ADDRESS: string;
  MONITOR_KV: KVNamespace;
  FIXED_FEE: string;
  ACCOUNT_FEE_MULTISIG: string;
}
