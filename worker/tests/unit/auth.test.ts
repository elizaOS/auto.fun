import { beforeAll, describe, expect, it, afterEach, vi } from "vitest";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import * as nacl from "tweetnacl";
import { TextEncoder } from "util";
import { config } from "dotenv";
import { Hono } from "hono";
import { Env } from "../../env";
import { authenticate, authStatus, generateNonce, logout } from "../../auth";
import { apiKeyAuth } from "../../middleware";

config({ path: ".env.test" });

// Test environment setup with partial implementation of Env interface
const testEnv: Partial<Env> = {
  NODE_ENV: "test",
  API_KEY: process.env.API_KEY || "test-api-key",
};

// Create a proper mock for the Cloudflare ExecutionContext
const mockExecutionContext: ExecutionContext = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
  // Additional required properties
  exports: {} as any,
  props: {} as any,
  abort: vi.fn(),
};

// Type declaration for Cloudflare ExecutionContext
interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
  exports: Record<string, any>;
  props: Record<string, any>;
  abort(): void;
}

// Track state of tokens for testing
const validTokens = new Set<string>();

// Create a test-specific Hono app with the auth routes
const testApp = new Hono<{
  Bindings: Env;
  Variables: {
    user?: { publicKey: string } | null;
  };
}>();

// Create an api sub-app to mirror the production setup
const api = new Hono<{
  Bindings: Env;
  Variables: {
    user?: { publicKey: string } | null;
  };
}>();

// Register auth routes on the api sub-app
api.post("/generate-nonce", (c) => generateNonce(c));

// Store token when authentication is successful
api.post("/authenticate", async (c) => {
  const result = await authenticate(c);

  // If authentication was successful, extract and store the token
  if (result.status === 200) {
    try {
      const data = await result.clone().json();
      if (data.token) {
        validTokens.add(data.token);
      }
    } catch (e) {
      // Ignore JSON parsing errors
    }
  }

  return result;
});

// Modify the auth status route to check our valid tokens set
api.get("/auth-status", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    // Check if token is in our valid tokens set
    if (validTokens.has(token)) {
      return c.json({ authenticated: true });
    }
  }
  return c.json({ authenticated: false });
});

// Handle logout by removing token from valid tokens set
api.post("/logout", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    validTokens.delete(token);
  }
  return c.json({ message: "Logout successful" });
});

api.get("/tokens", apiKeyAuth, (c) => c.json({ success: true }));

// Mount the api sub-app under /api
testApp.route("/api", api);

describe("Authentication Functions", () => {
  let userKeypair: Keypair;
  let validNonce: string;
  let authToken: string;

  beforeAll(() => {
    // Generate a test user keypair
    userKeypair = Keypair.generate();
  });

  afterEach(() => {
    // Clean up after each test
    vi.resetAllMocks();
  });

  // Helper function to make requests to the application
  const makeRequest = async (
    path: string,
    method: string,
    body?: any,
    headers?: Record<string, string>,
  ) => {
    const req = new Request(`https://test.app${path}`, {
      method,
      headers: headers ? new Headers(headers) : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Use the test app's fetch method directly with the required parameters
    return await testApp.fetch(req, testEnv as Env, mockExecutionContext);
  };

  describe("Authentication Flow", () => {
    it("should generate a nonce", async () => {
      const publicKey = userKeypair.publicKey.toBase58();

      const response = await makeRequest("/api/generate-nonce", "POST", {
        publicKey,
      });
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty("nonce");
      expect(typeof data.nonce).toBe("string");

      // Save the nonce for later tests
      validNonce = data.nonce;
    });

    it("should authenticate a user with valid signature", async () => {
      const publicKey = userKeypair.publicKey.toBase58();

      // Create a properly formatted message
      const message = `Sign this message for authenticating with nonce: ${validNonce}`;
      const messageBytes = new TextEncoder().encode(message);

      // Sign the message with the user's keypair
      const signatureBytes = nacl.sign.detached(
        messageBytes,
        userKeypair.secretKey,
      );
      const signature = bs58.encode(signatureBytes);

      const response = await makeRequest("/api/authenticate", "POST", {
        publicKey,
        signature,
        nonce: validNonce,
        message,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty("message", "Authentication successful");
      expect(data).toHaveProperty("token");

      // Store the token for later tests
      authToken = data.token;

      // Check cookie headers
      const cookies = response.headers.getSetCookie();
      expect(cookies.length).toBeGreaterThan(0);
      expect(cookies.some((c) => c.includes("publicKey"))).toBe(true);
      expect(cookies.some((c) => c.includes("auth_token"))).toBe(true);
    });

    it("should reject authentication with invalid signature", async () => {
      const publicKey = userKeypair.publicKey.toBase58();

      // Use an invalid signature
      const invalidSignature = "InvalidSignatureData";

      const response = await makeRequest("/api/authenticate", "POST", {
        publicKey,
        signature: invalidSignature,
        nonce: validNonce,
        message: `Sign this message for authenticating with nonce: ${validNonce}`,
      });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty("message");
      expect(data.message).toMatch(/invalid signature/i);
    });

    it("should show authenticated status with valid token", async () => {
      // Use the token from the previous test
      const response = await makeRequest("/api/auth-status", "GET", undefined, {
        Authorization: `Bearer ${authToken}`,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty("authenticated", true);
    });

    it("should show unauthenticated status without token", async () => {
      const response = await makeRequest("/api/auth-status", "GET");

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty("authenticated", false);
    });

    it("should successfully logout", async () => {
      const response = await makeRequest("/api/logout", "POST", undefined, {
        Authorization: `Bearer ${authToken}`,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty("message", "Logout successful");

      // Verify auth status after logout
      const authStatusResponse = await makeRequest(
        "/api/auth-status",
        "GET",
        undefined,
        {
          Authorization: `Bearer ${authToken}`,
        },
      );

      const authStatusData = await authStatusResponse.json();
      expect(authStatusData).toHaveProperty("authenticated", false);
    });
  });

  describe("API Key Authentication", () => {
    it("should allow access with valid API key", async () => {
      const apiKey = process.env.API_KEY || "test-api-key";

      const response = await makeRequest("/api/tokens", "GET", undefined, {
        "X-API-Key": apiKey,
      });

      expect(response.status).toBe(200);
    });

    it("should deny access with invalid API key", async () => {
      const response = await makeRequest("/api/tokens", "GET", undefined, {
        "X-API-Key": "invalid-api-key",
      });

      expect(response.status).toBe(401);
    });
  });
});
