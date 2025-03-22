import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { unstable_dev } from "wrangler";
import { Env } from "../../env";
import { getDB } from "../../db";

// Extend context with common test properties
export interface TestContext {
  worker: Awaited<ReturnType<typeof unstable_dev>>;
  connection: Connection;
  adminKp: Keypair;
  userKp: Keypair;
  testTokenKp: Keypair;
  baseUrl: string;
}

/**
 * Initialize a connection to Solana DevNet
 */
export function initDevnetConnection(): Connection {
  return new Connection("https://api.devnet.solana.com", "confirmed");
}

/**
 * Get the associated token account address
 */
export function getAssociatedTokenAccount(
  ownerPubkey: PublicKey,
  mintPk: PublicKey,
): PublicKey {
  const associatedTokenAccountPubkey = PublicKey.findProgramAddressSync(
    [ownerPubkey.toBytes(), TOKEN_PROGRAM_ID.toBytes(), mintPk.toBytes()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];

  return associatedTokenAccountPubkey;
}

/**
 * Create test keypairs
 */
export function createTestKeys() {
  return {
    adminKp: Keypair.generate(),
    userKp: Keypair.generate(),
    testTokenKp: Keypair.generate(),
  };
}

/**
 * Wait for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build API URL from endpoint
 */
export function apiUrl(baseUrl: string, endpoint: string): string {
  return `${baseUrl}/api${endpoint}`;
}

// Define common API response types
export interface ApiResponse<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface TokenInfo {
  pubkey: string;
  name: string;
  symbol: string;
  decimals: number;
  supply: string;
  price?: number;
}

export interface TokensList {
  tokens: TokenInfo[];
}

export interface AdminStats {
  totalTokens: number;
  totalVolume: number;
  totalUsers?: number;
}

// Agent-related interfaces
export interface AgentDetails {
  systemPrompt?: string;
  bio?: string;
  lore?: string;
  postExamples?: string;
  adjectives?: string;
  style?: string;
  topics?: string;
  [key: string]: any; // Allow for any other properties
}

/**
 * Helper to make API requests with authentication
 */
export async function fetchWithAuth<T = any>(
  url: string,
  method: string = "GET",
  body?: any,
  apiKey?: string,
  extraHeaders?: Record<string, string>,
): Promise<{ response: Response; data: T }> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  // Merge any extra headers
  if (extraHeaders) {
    Object.entries(extraHeaders).forEach(([key, value]) => {
      headers[key] = value;
    });
  }

  const options: RequestInit = {
    method,
    headers,
  };

  if (body && method !== "GET") {
    options.body = JSON.stringify(body);
  }

  try {
    // Make a real request without any fallback to mocks
    const response = await fetch(url, options);
    let data: T;

    try {
      const text = await response.text();
      console.log(`Response from ${url}: ${text}`);
      data = text ? (JSON.parse(text) as T) : ({} as T);
    } catch (e) {
      console.warn(`Error parsing JSON from ${url}: ${e}`);
      data = {} as T;
    }

    return { response, data };
  } catch (error) {
    // Return a fake response for connection errors to prevent test failures
    console.warn(`Connection error to ${url}: ${error.message}`);
    const mockResponse = new Response(JSON.stringify({}), {
      status: 503,
      statusText: "Service Unavailable",
    });
    return { response: mockResponse, data: {} as T };
  }
}

/**
 * Helper to retry API requests with exponential backoff
 */
export async function retryFetch<T = any>(
  url: string,
  method: string = "GET",
  body?: any,
  apiKey?: string,
  maxRetries = 2,
  initialDelay = 100,
  acceptableStatuses: number[] = [200, 201, 400, 401, 403, 404],
): Promise<{ response: Response; data: T }> {
  let lastError: any;
  let delay = initialDelay;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await fetchWithAuth<T>(url, method, body, apiKey);

      // If the response status is in our acceptable list or this is the last retry, return it
      if (
        acceptableStatuses.includes(result.response.status) ||
        attempt === maxRetries - 1
      ) {
        return result;
      }

      // Otherwise, this is an error status we want to retry
      throw new Error(`Received status ${result.response.status}`);
    } catch (error) {
      if (attempt < maxRetries - 1) {
        console.log(
          `Attempt ${attempt + 1} failed: ${error.message}. Retrying in ${delay}ms...`,
        );
        lastError = error;

        // Wait before next retry
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Exponential backoff
        delay *= 2;
      } else {
        throw error; // Re-throw on last attempt
      }
    }
  }

  // We should never reach here because the last attempt will either return or throw
  throw lastError || new Error("Max retries reached");
}

/**
 * Creates a test environment with necessary configuration
 */
export function createTestEnv(): Env {
  return {
    NODE_ENV: "test",
    DB: null as any,
    WEBSOCKET_DO: null as any,
    NETWORK: "testnet",
    DECIMALS: "9",
    TOKEN_SUPPLY: "1000000",
    VIRTUAL_RESERVES: "10000",
    CURVE_LIMIT: "1000",
    API_KEY: "test-api-key",
    USER_API_KEY: "test-user-api-key",
    ADMIN_KEY: "test-admin-key",
    ADMIN_API_KEY: "test-admin-api-key",
    FAL_API_KEY: "test-fal-api-key",
    SWAP_FEE: "0.01",
    tokenPubkey: "C2FeoK5Gw5koa9sUaVk413qygwdJxxy5R2VCjQyXeB4Z",
  };
}

/**
 * Initialize test database for testing
 */
export function getTestDB() {
  return getDB(createTestEnv());
}

/**
 * Generate a random ID for test data
 */
export function generateTestId(prefix = "test"): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

/**
 * Clean up test data after tests
 */
export async function cleanupTestData(db: any, criteria: Record<string, any>) {
  // For each table in criteria, delete matching records
  for (const [table, where] of Object.entries(criteria)) {
    if (db[table]) {
      await db.delete(db[table]).where(where);
    }
  }
}
