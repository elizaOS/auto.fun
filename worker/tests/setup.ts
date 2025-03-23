import { unstable_dev } from "wrangler";
import { afterAll, beforeAll } from "vitest";
import {
  TestContext,
  createTestKeys,
  initDevnetConnection,
} from "./helpers/test-utils";

export async function setupWorkerTest(): Promise<TestContext> {
  console.log("Setting up worker test with real API calls");
  
  // Create test key pairs first, so we can include the token pubkey in environment
  const { adminKp, userKp, testTokenKp } = createTestKeys();
  const testTokenPubkey = testTokenKp.publicKey.toBase58();

  // Check for required environment variables
  const requiredEnvVars = ["API_KEY", "JWT_SECRET"];
  
  for (const name of requiredEnvVars) {
    if (!process.env[name]) {
      throw new Error(`ERROR: ${name} environment variable is required. Please set it before running tests.`);
    }
  }

  // Create a worker instance with real configuration
  const worker = await unstable_dev("worker/index.ts", {
    experimental: { disableExperimentalWarning: true },
    vars: {
      NETWORK: process.env.NETWORK || "devnet",
      DECIMALS: process.env.DECIMALS || "9",
      TOKEN_SUPPLY: process.env.TOKEN_SUPPLY || "1000000000000000000",
      VIRTUAL_RESERVES: process.env.VIRTUAL_RESERVES || "1000000000",
      CURVE_LIMIT: process.env.CURVE_LIMIT || "1000000000000",
      PORT: process.env.PORT || "8787",
      API_URL: process.env.API_URL || "http://localhost:8787",
      NODE_ENV: "test",
      DEVNET_SOLANA_RPC_URL: process.env.DEVNET_SOLANA_RPC_URL || "https://api.devnet.solana.com",
      PROGRAM_ID: process.env.PROGRAM_ID || "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      MIN_BUFFER: process.env.MIN_BUFFER || "100000000",
      TARGET_BUFFER: process.env.TARGET_BUFFER || "500000000",
      NUM_WORKERS: process.env.NUM_WORKERS || "2",
      INIT_BONDING_CURVE: process.env.INIT_BONDING_CURVE || "true",
      FEE_PERCENTAGE: process.env.FEE_PERCENTAGE || "1",
      SWAP_FEE: process.env.SWAP_FEE || "1.5",
      TEST_CREATOR_ADDRESS: process.env.TEST_CREATOR_ADDRESS || adminKp.publicKey.toBase58(),
      // Use real API keys from environment
      ADMIN_API_KEY: process.env.ADMIN_API_KEY || process.env.API_KEY,
      API_KEY: process.env.API_KEY,
      USER_API_KEY: process.env.USER_API_KEY || process.env.API_KEY,
      // Use real JWT secret
      JWT_SECRET: process.env.JWT_SECRET,
      // Use real wallet private key if available
      WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY,
      // Use real FAL.AI key for media generation tests
      FAL_API_KEY: process.env.FAL_API_KEY,
      // Use real token pubkey if available, otherwise use generated test token
      tokenPubkey: process.env.TEST_TOKEN_PUBKEY || testTokenPubkey,
      // Enable test mode for auth
      ENABLE_TEST_MODE: "true",
    },
    // Use type assertion for test bindings that aren't properly typed
  } as any);

  // Initialize DevNet connection
  const connection = initDevnetConnection();

  console.log("Test keypairs created:");
  console.log("Admin pubkey:", adminKp.publicKey.toBase58());
  console.log("User pubkey:", userKp.publicKey.toBase58());
  console.log("Token pubkey:", testTokenKp.publicKey.toBase58());

  // Get base URL for API requests - accessing as any due to type inconsistencies in wrangler
  const baseUrl = (worker as any).url || `http://localhost:8787`;

  console.log(`Using API base URL: ${baseUrl}`);

  return {
    worker,
    connection,
    adminKp,
    userKp,
    testTokenKp,
    baseUrl,
  };
}

// Store shared test data between tests
export interface SharedTestState {
  tokenPubkey?: string;
}

// Create a shared state storage
export const testState: SharedTestState = {};

export function registerWorkerHooks(ctx: { context: TestContext | null }) {
  beforeAll(async () => {
    ctx.context = await setupWorkerTest();

    // Store the test token pubkey in shared state
    if (ctx.context?.testTokenKp) {
      testState.tokenPubkey = ctx.context.testTokenKp.publicKey.toBase58();
    }
  });

  afterAll(async () => {
    if (ctx.context?.worker) {
      await ctx.context.worker.stop();
    }
  });
}
