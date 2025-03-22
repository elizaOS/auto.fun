import { unstable_dev } from "wrangler";
import { afterAll, beforeAll } from "vitest";
import {
  TestContext,
  createTestKeys,
  initDevnetConnection,
} from "./helpers/test-utils";

export async function setupWorkerTest(): Promise<TestContext> {
  // Create a worker instance with more complete configuration
  const worker = await unstable_dev("worker/index.ts", {
    experimental: { disableExperimentalWarning: true },
    vars: {
      NETWORK: "devnet",
      DECIMALS: "9",
      TOKEN_SUPPLY: "1000000000000000000",
      VIRTUAL_RESERVES: "1000000000",
      CURVE_LIMIT: "1000000000000",
      PORT: "8787",
      API_URL: "http://localhost:8787",
      NODE_ENV: "test",
      DEVNET_SOLANA_RPC_URL: "https://api.devnet.solana.com",
      PROGRAM_ID: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      MIN_BUFFER: "100000000",
      TARGET_BUFFER: "500000000",
      NUM_WORKERS: "2",
      INIT_BONDING_CURVE: "true",
      FEE_PERCENTAGE: "1",
      SWAP_FEE: "1.5",
      TEST_CREATOR_ADDRESS: "4FRxv5k1iCrE4kdjtywUzAakCaxfDQmpdVLx48kUXQQC",
      // Add necessary environment variables for authentication
      ADMIN_API_KEY: "admin-test-key",
      API_KEY: "test-api-key",
      USER_API_KEY: "test-api-key",
      // Add real keys for proper authentication if needed
      JWT_SECRET: "test-jwt-secret",
      // Add wallet private key (test key)
      WALLET_PRIVATE_KEY: JSON.stringify([...Array(32)].map(() => Math.floor(Math.random() * 256))),
    },
    // Use type assertion for test bindings that aren't properly typed
  } as any);

  // Initialize DevNet connection
  const connection = initDevnetConnection();

  // Create test key pairs
  const { adminKp, userKp, testTokenKp } = createTestKeys();

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
  });

  afterAll(async () => {
    if (ctx.context?.worker) {
      await ctx.context.worker.stop();
    }
  });
}
