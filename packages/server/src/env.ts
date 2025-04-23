/**
 * Environment interface for Cloudflare Workers
 */
export interface Env {
  NETWORK: string;
  DECIMALS: string;
  TOKEN_SUPPLY: string;
  VIRTUAL_RESERVES: string;
  CURVE_LIMIT: string;
  WALLET_PRIVATE_KEY: string;
  FEE_PERCENTAGE: string;
  CODEX_API_KEY: string;
  API_URL: string; // URL for self, for accessing cached assets
  FAL_API_KEY: string;
  LOCAL_DEV: string;
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
  REDIS_URL: string;
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
  FIXED_FEE: string;
  ACCOUNT_FEE_MULTISIG: string;
  DATABASE_URL: string;
  REDIS_HOST: string;
  REDIS_PORT: string;
  REDIS_PASSWORD: string;
  // CORS settings
  ALLOWED_ORIGINS?: string;
}
