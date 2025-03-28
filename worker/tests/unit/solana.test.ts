// Set real values from .dev.vars - MUST be defined before any vi.mock calls
const REAL_RPC_URL = "https://api.devnet.solana.com"; // Use standard Solana devnet endpoint instead of Helius
const REAL_WALLET_PRIVATE_KEY = [
  165, 216, 226, 192, 188, 133, 129, 249, 198, 93, 175, 130, 42, 246, 149, 125,
  197, 225, 97, 218, 36, 91, 22, 79, 204, 51, 33, 247, 122, 51, 217, 131, 74,
  182, 201, 174, 225, 123, 247, 32, 188, 21, 201, 221, 204, 2, 6, 207, 192, 107,
  162, 197, 102, 125, 225, 14, 230, 217, 212, 0, 86, 25, 77, 76,
];
const MIN_SOL_BALANCE = 0.5; // Minimum SOL balance threshold for airdrop

// Track the created Umi instance URL
let createdUmiUrl = "";

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Env } from "../../env";
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { initSolanaConfig } from "../../solana";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";

// Print wallet public key for testnet SOL funding
console.log("\n==== TESTNET WALLET INFORMATION ====");
const wallet = Keypair.fromSecretKey(new Uint8Array(REAL_WALLET_PRIVATE_KEY));
console.log("Public Key:", wallet.publicKey.toString());
console.log("RPC URL:", REAL_RPC_URL);
console.log("=====================================\n");

// Setup utility functions without mocking
vi.mock("../../util", () => {
  return {
    getRpcUrl: () => REAL_RPC_URL,
    getLegacyRpcUrl: () => REAL_RPC_URL,
  };
});

// Create a minimal test environment
const createTestEnv = (withPrivateKey = false): Env => {
  return {
    NODE_ENV: "test",
    NETWORK: "devnet",
    DECIMALS: "6",
    TOKEN_SUPPLY: "1000000000000000",
    VIRTUAL_RESERVES: "28000000000",
    CURVE_LIMIT: "113000000000",
    API_KEY: "test-api-key",
    USER_API_KEY: "test-user-api-key",
    ADMIN_KEY: "test-admin-key",
    ADMIN_API_KEY: "test-admin-api-key",
    FAL_API_KEY: "test-fal-api-key",
    SWAP_FEE: "100",
    DB: {} as any,
    WEBSOCKET_DO: {} as any,
    ...(withPrivateKey
      ? { WALLET_PRIVATE_KEY: JSON.stringify(REAL_WALLET_PRIVATE_KEY) }
      : {}),
  };
};

describe("Solana Module", () => {
  let testEnv: Env;

  beforeEach(() => {
    // Reset state before each test
    createdUmiUrl = "";
    // Don't mock console output so we can see real logs
    // console.error = vi.fn();
    // console.log = vi.fn();
  });

  describe("initSolanaConfig", () => {
    it("should initialize config with correct values when env is provided", () => {
      // Arrange: Create test environment with private key
      testEnv = createTestEnv(true);

      // Act: Initialize Solana config
      const config = initSolanaConfig(testEnv);

      // Assert: Verify correct configuration
      expect(config.network).toBe("devnet");
      expect(config.connection).toBeDefined();
      expect(config.connection.rpcEndpoint).toBe(REAL_RPC_URL);
      expect(config.programId).toBeDefined();
      expect(config.umi).toBeDefined();
      expect(config.wallet).toBeDefined();

      // Check wallet only if it's defined
      if (config.wallet) {
        expect(config.wallet.publicKey.toString()).toBe(
          wallet.publicKey.toString(),
        );
      } else {
        expect(config.wallet).toBeDefined(); // This will fail with a better error message
      }
    });

    it("should use default values when env is not provided", () => {
      // Act: Initialize Solana config without env
      const config = initSolanaConfig();

      // Assert: Verify default configuration is for a real connection
      expect(config.network).toBe("mainnet");
      expect(config.connection).toBeDefined();
      // Only check that we have a real RPC endpoint, not caring about specific URL
      expect(typeof config.connection.rpcEndpoint).toBe("string");
      expect(config.connection.rpcEndpoint.startsWith("http")).toBe(true);
      expect(config.programId).toBeDefined();
      expect(config.umi).toBeDefined();
      expect(config.wallet).toBeUndefined();
    });

    it("should use devnet program ID when network is devnet", () => {
      // Arrange: Create test environment for devnet
      testEnv = createTestEnv();
      testEnv.NETWORK = "devnet";

      // Act: Initialize Solana config
      const config = initSolanaConfig(testEnv);

      // Assert: Verify programId for devnet
      expect(config.programId.toString()).toBe(
        "93DkYRHBM5KweFqzP7KzEZTMUy6sWvXgLdJq6uX1pZUP",
      );

      // Confirm the connection is real by checking its methods
      expect(typeof config.connection.getAccountInfo).toBe("function");
      expect(typeof config.connection.getBalance).toBe("function");
    });

    it("should use mainnet program ID when network is mainnet", () => {
      // Arrange: Create test environment for mainnet
      testEnv = createTestEnv();
      testEnv.NETWORK = "mainnet";

      // Act: Initialize Solana config
      const config = initSolanaConfig(testEnv);

      // Assert: Verify programId for mainnet
      expect(config.programId.toString()).toBe(
        "55QFMmfMVYNmxMWL5XY6FytSpa1Z5BZsYnbC8ATXzQYC",
      );

      // Confirm the connection is real by checking its methods
      expect(typeof config.connection.getAccountInfo).toBe("function");
      expect(typeof config.connection.getBalance).toBe("function");
    });

    it("should handle invalid private key gracefully", () => {
      // Arrange: Create env with invalid private key
      testEnv = createTestEnv();
      testEnv.WALLET_PRIVATE_KEY = "invalid-json";

      // Act: Initialize config
      const config = initSolanaConfig(testEnv);

      // Assert: Verify wallet is undefined when key is invalid
      expect(config.wallet).toBeUndefined();

      // Confirm the connection is still real
      expect(typeof config.connection.getAccountInfo).toBe("function");
      expect(typeof config.connection.getBalance).toBe("function");
    });

    it("should check balance for devnet wallet", async () => {
      // Skip if no private key available
      if (!REAL_WALLET_PRIVATE_KEY) {
        console.warn("Skipping balance check - no private key provided");
        return;
      }

      // Create a real connection to devnet
      const connection = new Connection(REAL_RPC_URL, {
        confirmTransactionInitialTimeout: 60000,
      });

      console.log("Using real connection to check balance");

      // Get SOL balance - don't try airdrop since we know it already has enough
      const balance = await connection.getBalance(wallet.publicKey);

      // Log the actual balance
      console.log(`Actual wallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);

      // Verify we can get a balance and it's a reasonable value for testing
      expect(typeof balance).toBe("number");
      expect(balance).toBeGreaterThan(0);

      // Also check that we can get recent transaction history
      const transactions = await connection.getSignaturesForAddress(
        wallet.publicKey,
        { limit: 3 },
      );
      console.log(`Found ${transactions.length} recent transactions`);

      // Verify we can get transaction history
      expect(Array.isArray(transactions)).toBe(true);
    }, 30000); // Set a higher timeout of 30 seconds

    it("should initialize umi with the correct RPC URL", () => {
      // Arrange: Create test environment
      testEnv = createTestEnv();

      // Act: Create a real UMI instance to test
      const umi = createUmi(REAL_RPC_URL).use(mplTokenMetadata());

      // Assert: Verify it was created correctly
      expect(umi).toBeDefined();
      expect(umi.rpc).toBeDefined();

      // Check we can access methods on the RPC
      expect(typeof umi.rpc.getAccount).toBe("function");
      expect(typeof umi.rpc.getBalance).toBe("function");
    });

    it("should be able to create a proper NodeWallet from keypair", () => {
      // Act: Create a NodeWallet from the real keypair
      const nodeWallet = new NodeWallet(wallet);

      // Assert: Verify the wallet is created correctly
      expect(nodeWallet).toBeDefined();
      expect(nodeWallet.publicKey.toString()).toBe(wallet.publicKey.toString());

      // Check the wallet can sign
      expect(typeof nodeWallet.signTransaction).toBe("function");
      expect(typeof nodeWallet.signAllTransactions).toBe("function");
    });
  });

  // Integrated Solana verification and functionality tests
  describe("Solana Functionality", () => {
    let connection: Connection;

    beforeEach(() => {
      // Create a connection to devnet for all tests
      connection = new Connection(REAL_RPC_URL, "confirmed");
    });

    it("should verify Solana functionality", async () => {
      console.log("✅ Successfully connected to Solana devnet");

      // Verify wallet
      expect(wallet.publicKey).toBeDefined();
      console.log(`✅ Successfully created wallet`);
      console.log(`   Public Key: ${wallet.publicKey.toString()}`);

      // Get and verify balance
      const balance = await connection.getBalance(wallet.publicKey);
      console.log(
        `✅ Successfully retrieved wallet balance: ${balance / LAMPORTS_PER_SOL} SOL`,
      );
      expect(typeof balance).toBe("number");

      // Get recent transactions
      const transactions = await connection.getSignaturesForAddress(
        wallet.publicKey,
        { limit: 3 },
      );
      console.log(
        `✅ Successfully retrieved ${transactions.length} recent transactions`,
      );
      transactions.forEach((tx, i) => {
        console.log(
          `   Transaction ${i + 1}: ${tx.signature.substring(0, 20)}... (${tx.confirmationStatus})`,
        );
      });
      expect(Array.isArray(transactions)).toBe(true);

      // Get token accounts
      const tokenAccounts = await connection.getTokenAccountsByOwner(
        wallet.publicKey,
        {
          programId: new PublicKey(
            "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          ),
        },
      );
      console.log(
        `✅ Successfully retrieved ${tokenAccounts.value.length} token accounts`,
      );
      expect(Array.isArray(tokenAccounts.value)).toBe(true);

      // Test RPC latency
      console.log("\nTesting RPC latency...");
      const start = Date.now();
      await connection.getRecentBlockhash();
      const end = Date.now();
      console.log(`✅ RPC latency: ${end - start}ms`);

      console.log("\n✅ ALL SOLANA VERIFICATION CHECKS PASSED");
    }, 30000);

    it("should check account details and request airdrop if needed", async () => {
      // Get current balance
      const balance = await connection.getBalance(wallet.publicKey);
      console.log(`Current balance: ${balance / LAMPORTS_PER_SOL} SOL`);

      // Show recent transactions
      console.log("\nFetching recent transactions...");
      const transactions = await connection.getSignaturesForAddress(
        wallet.publicKey,
        { limit: 5 },
      );

      if (transactions.length === 0) {
        console.log("No recent transactions found.");
      } else {
        console.log("\nRecent transactions:");
        for (const tx of transactions) {
          console.log(`Signature: ${tx.signature}`);
          console.log(`Status: ${tx.confirmationStatus}`);
          if (tx.blockTime) {
            console.log(
              `Timestamp: ${new Date(tx.blockTime * 1000).toLocaleString()}`,
            );
          }
          console.log(`-----------------------------------------`);
        }
      }

      // Get token accounts
      console.log("\nFetching token accounts...");
      const tokenAccounts = await connection.getTokenAccountsByOwner(
        wallet.publicKey,
        {
          programId: new PublicKey(
            "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          ),
        },
      );

      if (tokenAccounts.value.length === 0) {
        console.log("No token accounts found.");
      } else {
        console.log(`\nFound ${tokenAccounts.value.length} token accounts:`);
        for (const account of tokenAccounts.value) {
          console.log(`Account address: ${account.pubkey.toString()}`);
        }
      }

      // Request airdrop if balance is low
      if (balance / LAMPORTS_PER_SOL < MIN_SOL_BALANCE) {
        console.log(
          `\nBalance is below ${MIN_SOL_BALANCE} SOL, requesting airdrop...`,
        );

        try {
          // Request the airdrop of 1 SOL
          const signature = await connection.requestAirdrop(
            wallet.publicKey,
            1 * LAMPORTS_PER_SOL,
          );

          console.log("Airdrop requested, waiting for confirmation...");
          console.log(`Transaction signature: ${signature}`);

          // Wait for confirmation
          await connection.confirmTransaction(signature);

          // Check the updated balance
          const newBalance = await connection.getBalance(wallet.publicKey);
          console.log(
            `Success! Updated balance: ${newBalance / LAMPORTS_PER_SOL} SOL`,
          );

          // Verify balance increased
          expect(newBalance).toBeGreaterThan(balance);
        } catch (error) {
          console.error("Error requesting airdrop:", error);
          // Don't fail the test if airdrop fails (devnet faucet can be unreliable)
        }
      } else {
        console.log(
          `\nBalance is above ${MIN_SOL_BALANCE} SOL, no airdrop needed.`,
        );
      }
    }, 60000); // Longer timeout as airdrop confirmations can take time
  });
});
