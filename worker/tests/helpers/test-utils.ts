import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { unstable_dev } from 'wrangler';

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
  mintPk: PublicKey
): PublicKey {
  const associatedTokenAccountPubkey = (PublicKey.findProgramAddressSync(
    [
      ownerPubkey.toBytes(),
      TOKEN_PROGRAM_ID.toBytes(),
      mintPk.toBytes(),
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID
  ))[0];

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
 * Helper to make API requests with authentication
 */
export async function fetchWithAuth<T = any>(
  url: string,
  method: string = 'GET',
  body?: any,
  apiKey?: string,
  extraHeaders?: Record<string, string>
): Promise<{ response: Response; data: T }> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['X-API-Key'] = apiKey;
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

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  // Make a real request without any fallback to mocks
  const response = await fetch(url, options);
  let data: T;
  
  try {
    data = await response.json() as T;
  } catch (e) {
    console.warn(`Error parsing JSON from ${url}: ${e}`);
    data = {} as T;
  }
  
  return { response, data };
} 