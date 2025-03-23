import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Env } from "../../env";
import {
  getSOLPrice,
  calculateTokenMarketData,
  getMarketDataMetrics,
} from "../../mcap";
import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { initSolanaConfig } from "../../solana";

// Real wallet key from solana tests
const REAL_WALLET_PRIVATE_KEY = [
  165, 216, 226, 192, 188, 133, 129, 249, 198, 93, 175, 130, 42, 246, 149, 125,
  197, 225, 97, 218, 36, 91, 22, 79, 204, 51, 33, 247, 122, 51, 217, 131, 74,
  182, 201, 174, 225, 123, 247, 32, 188, 21, 201, 221, 204, 2, 6, 207, 192, 107,
  162, 197, 102, 125, 225, 14, 230, 217, 212, 0, 86, 25, 77, 76,
];
const REAL_RPC_URL = "https://api.devnet.solana.com";

// Create a wallet from the private key
const wallet = Keypair.fromSecretKey(new Uint8Array(REAL_WALLET_PRIVATE_KEY));

// Create a minimal test environment
const createTestEnv = (withPrivateKey = false): Env => {
  return {
    NODE_ENV: "test",
    NETWORK: "devnet",
    DECIMALS: "9",
    TOKEN_SUPPLY: "1000000000000000000",
    VIRTUAL_RESERVES: "1000000000",
    CURVE_LIMIT: "1000000000000",
    API_KEY: "test-api-key",
    USER_API_KEY: "test-user-api-key",
    ADMIN_KEY: "test-admin-key",
    ADMIN_API_KEY: "test-admin-api-key",
    FAL_API_KEY: "test-fal-api-key",
    SWAP_FEE: "1.5",
    DB: {} as any,
    WEBSOCKET_DO: {} as any,
    ...(withPrivateKey
      ? { WALLET_PRIVATE_KEY: JSON.stringify(REAL_WALLET_PRIVATE_KEY) }
      : {}),
  };
};

// Create a connection to Solana
const createSolanaConnection = () => {
  return new Connection(REAL_RPC_URL, "confirmed");
};

describe("Market Cap Module with Real Data", () => {
  let testEnv: Env;
  let connection: Connection;

  beforeEach(() => {
    // Set up a fresh test environment with the real wallet key
    testEnv = createTestEnv(true);
    // Create a real connection to Solana
    connection = createSolanaConnection();
  });

  describe("getSOLPrice", () => {
    it("should return a valid SOL price from real API", async () => {
      // Call the real function with the environment
      const result = await getSOLPrice(testEnv);

      // Log the current SOL price
      console.log(`Current SOL price: $${result}`);

      // Assert the result is a number and is reasonable (greater than 0)
      expect(typeof result).toBe("number");
      expect(result).toBeGreaterThan(0);

      // Check the price is within a reasonable range (1-1000 USD)
      expect(result).toBeGreaterThan(1);
      expect(result).toBeLessThan(1000);
    }, 15000); // Increased timeout for API call
  });

  describe("calculateTokenMarketData with real token", () => {
    it("should calculate market data for a real token using real SOL price", async () => {
      // Get the real SOL price first
      const solPrice = await getSOLPrice(testEnv);
      console.log(`Using real SOL price: $${solPrice}`);

      // Get a list of token accounts for our wallet to find a real token
      console.log(
        `Retrieving token accounts for wallet: ${wallet.publicKey.toString()}`,
      );
      const tokenAccounts = await connection.getTokenAccountsByOwner(
        wallet.publicKey,
        {
          programId: new PublicKey(
            "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          ),
        },
      );

      // Set a default token to use if we don't find any real tokens
      let token = {
        mint: "default-mint", // Default mint
        currentPrice: 0.01, // Default price in SOL
        reserveAmount: 100000, // Default token amount
      };

      // Check if we have any real tokens
      if (tokenAccounts.value.length > 0) {
        console.log(`Found ${tokenAccounts.value.length} token accounts`);

        // Get the first token account
        const firstTokenAccount = tokenAccounts.value[0];
        console.log(
          `Using token account: ${firstTokenAccount.pubkey.toString()}`,
        );

        // Create a real token object based on the first token account
        // Note: In a real environment you would fetch actual price and reserve data
        token = {
          mint: firstTokenAccount.pubkey.toString(),
          // Use a small sample price that would be realistic
          currentPrice: 0.005, // Small price in SOL
          reserveAmount: 10000000, // Amount of tokens
        };

        console.log(`Using real token with mint: ${token.mint}`);
      } else {
        console.log("No real tokens found, using default test token");
      }

      // Calculate market data using the real SOL price
      const result = await calculateTokenMarketData(token, solPrice);

      // Log the results
      console.log("Token Market Data Results:");
      console.log(`- Token Price (SOL): ${token.currentPrice} SOL`);
      console.log(`- Token Price (USD): $${result.tokenPriceUSD}`);
      console.log(`- Token Reserve Amount: ${token.reserveAmount}`);
      console.log(`- Market Cap (USD): $${result.marketCapUSD}`);
      console.log(`- SOL Price (USD): $${result.solPriceUSD}`);

      // Assert calculations are correct
      expect(result.tokenPriceUSD).toBe(token.currentPrice * solPrice);
      expect(result.marketCapUSD).toBe(
        token.reserveAmount * result.tokenPriceUSD,
      );
      expect(result.solPriceUSD).toBe(solPrice);
    }, 30000); // Increased timeout for API and blockchain calls

    it("should handle non-existent token gracefully", async () => {
      // Get the real SOL price
      const solPrice = await getSOLPrice(testEnv);

      // Create a token with missing data
      const token = {
        mint: "nonexistent-token-mint",
        // No currentPrice or reserveAmount
      };

      // Calculate market data
      const result = await calculateTokenMarketData(token, solPrice);

      // Assert it doesn't crash and returns token with SOL price added
      expect(result.solPriceUSD).toBe(solPrice);
      expect(result).toEqual({ ...token, solPriceUSD: solPrice });
    }, 15000);
  });

  describe("getMarketDataMetrics", () => {
    it("should return current metrics with proper structure", () => {
      // Get metrics
      const metrics = getMarketDataMetrics();

      console.log("Market Data Metrics:");
      console.log(
        `- Total Updates Processed: ${metrics.totalUpdatesProcessed}`,
      );
      console.log(`- Failed Updates: ${metrics.failedUpdates}`);
      console.log(`- Last Update Time: ${metrics.lastUpdateTime}`);

      // Verify structure
      expect(metrics).toHaveProperty("totalUpdatesProcessed");
      expect(metrics).toHaveProperty("failedUpdates");
      expect(metrics).toHaveProperty("lastUpdateTime");

      // Verify types
      expect(typeof metrics.totalUpdatesProcessed).toBe("number");
      expect(typeof metrics.failedUpdates).toBe("number");
      expect(
        metrics.lastUpdateTime === null ||
          metrics.lastUpdateTime instanceof Date,
      ).toBe(true);
    });
  });
});
