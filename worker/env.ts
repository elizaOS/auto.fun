import {
  D1Database,
  DurableObjectNamespace,
  R2Bucket,
} from "@cloudflare/workers-types/experimental";

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
  API_KEY: string;
  USER_API_KEY: string;
  WALLET_PRIVATE_KEY?: string;
  ADMIN_KEY: string;
  ADMIN_API_KEY: string;
  FEE_PERCENTAGE?: string;
  PRIMARY_LOCK_PERCENTAGE?: string;
  SECONDARY_LOCK_PERCENTAGE?: string;
  CODEX_API_KEY?: string;
  // Cloudflare R2 storage
  R2?: R2Bucket;
  R2_PUBLIC_URL?: string;
  FAL_API_KEY: string;
  NODE_ENV: string;
  SWAP_FEE: string;
  // Solana connection
  RPC_URL?: string;
  PROGRAM_ID: string;
  // Test environment properties
  tokenPubkey?: string; // Used in tests to track the current test token
}
