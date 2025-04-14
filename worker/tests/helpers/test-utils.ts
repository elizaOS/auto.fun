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

/**
 * Fetch with authentication and request body handling
 * Always uses real API calls
 */
export async function fetchWithAuth<T = any>(
  url: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  body?: any,
  headers: Record<string, string> = {},
): Promise<DirectApiResponse<T>> {
  // Standard fetch implementation
  const fetchOptions: RequestInit = {
    method,
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
  };

  if (body && method !== "GET") {
    fetchOptions.body = JSON.stringify(body);
  }

  // Debug logging
  console.log(`Fetching ${method} ${url}`);
  console.log("Request headers:", headers);
  if (body && method !== "GET") {
    // Don't log sensitive information like signatures
    const sanitizedBody = { ...body };
    if (sanitizedBody.signature) sanitizedBody.signature = "***";
    if (sanitizedBody.privateKey) sanitizedBody.privateKey = "***";
    console.log("Request body:", sanitizedBody);
  }

  // No retries - let errors propagate
  const response = await fetch(url, fetchOptions);

  let data;
  try {
    const responseText = await response.text();
    try {
      // Try to parse as JSON first
      data = JSON.parse(responseText);
      console.log(`Response status: ${response.status}`);
      // Only log data if not too large
      if (responseText.length < 500) {
        console.log("Response data:", data);
      } else {
        console.log("Response: [large data]");
      }
    } catch (e) {
      // For non-JSON responses, provide the text
      console.warn(`Non-JSON response from ${url}: ${responseText}`);
      data = { message: responseText };
    }
  } catch (e) {
    console.error(`Error reading response from ${url}:`, e);
    throw e; // Rethrow the error to ensure test failure
  }

  return {
    data,
    response: { status: response.status },
  };
}

/**
 * Helper for API requests - now simply passes through to fetchWithAuth
 * No retries are performed - errors will be exposed directly
 */
export async function retryFetch<T = any>(
  url: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body?: any,
  headers: Record<string, string> = {},
): Promise<DirectApiResponse<T>> {
  // Direct passthrough to fetchWithAuth - no retries
  return await fetchWithAuth<T>(url, method, body, headers);
}
