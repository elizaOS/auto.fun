import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { unstable_dev } from "wrangler";
import { generateNonce, authenticate, logout, authStatus } from "../../auth";
import { Env } from "../../env";
import { Context } from "hono";
import { vi } from "vitest";

// Define AppContext for testing
type AppContext = Context<{
  Bindings: Env;
  Variables: {
    user?: { publicKey: string } | null;
  };
}>;

// Add direct function testing support
export interface DirectApiResponse<T = any> {
  data: T;
  response: { status: number };
}

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
  postExamples?: string;
  adjectives?: string;
  style?: string;
  topics?: string;
  [key: string]: any; // Allow for any other properties
}

/**
 * Fetch with authentication and request body handling
 * Enhanced to directly call API handlers when in unit test mode
 */
export async function fetchWithAuth<T = any>(
  url: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  body?: any,
  headers: Record<string, string> = {},
): Promise<DirectApiResponse<T>> {
  // Support direct testing of API functions
  if (process.env.NODE_ENV === "test" && url.includes("localhost")) {
    // Extract endpoint path from url
    const endpoint = url.split("/api")[1];
    if (!endpoint) {
      throw new Error(`Invalid API URL: ${url}`);
    }

    // Create a more complete mock context with all required Hono properties
    const mockContext = {
      req: {
        json: () => Promise.resolve(body || {}),
        header: (name: string) => headers[name] || null,
        raw: {
          headers: {
            get: (name: string) => headers[name] || "127.0.0.1",
          },
        },
      },
      env: {
        NODE_ENV: "test",
        API_KEY: "test-api-key",
      },
      set: vi.fn(),
      get: vi.fn((key) =>
        key === "user" ? { publicKey: body?.publicKey } : null,
      ),
      json: (data: any, status = 200) => ({ data, status }),
      setCookie: vi.fn(),
      getCookie: vi.fn((name) =>
        name === "publicKey" ? body?.publicKey : null,
      ),
      header: vi.fn((name) => headers[name] || null),
    } as unknown as AppContext;

    let response;

    // Call the appropriate handler directly based on the endpoint
    switch (endpoint) {
      case "/generate-nonce": {
        response = await generateNonce(mockContext);
        break;
      }
      case "/authenticate": {
        response = await authenticate(mockContext);
        break;
      }
      case "/logout": {
        response = await logout(mockContext);
        break;
      }
      case "/auth-status": {
        response = await authStatus(mockContext);
        break;
      }
      default:
        throw new Error(
          `Endpoint not implemented for direct testing: ${endpoint}`,
        );
    }

    return {
      data: response.data,
      response: { status: response.status },
    };
  }

  // Standard fetch implementation for non-test environments
  const fetchOptions: RequestInit = {
    method,
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: body && method !== "GET" ? JSON.stringify(body) : undefined,
  };

  const response = await fetch(url, fetchOptions);
  let data;

  try {
    data = await response.json();
  } catch (e) {
    console.error(`Error parsing JSON from ${url}:`, e);
    data = {};
  }

  return {
    data,
    response,
  };
}
