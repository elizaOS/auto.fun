import { beforeAll, describe, expect, it } from "vitest";
import { TestContext, apiUrl, fetchWithAuth } from "../helpers/test-utils";
import { registerWorkerHooks } from "../setup";
import { config } from "dotenv";
import { AuthHelper } from "../helpers/auth-helper";

config({ path: ".env.test" });

const ctx: { context: TestContext | null } = { context: null };

registerWorkerHooks(ctx);

describe("Authentication API Endpoints", () => {
  let apiKey: string;
  let authHelper: AuthHelper;

  beforeAll(async () => {
    if (!ctx.context) throw new Error("Test context not initialized");
    authHelper = new AuthHelper(ctx.context.baseUrl);

    console.log("Test user pubkey:", authHelper.getPublicKey());
  });

  it("should generate a nonce for authentication", async () => {
    if (!ctx.context) throw new Error("Test context not initialized");

    const nonce = await authHelper.generateNonce();

    expect(typeof nonce).toBe("string");
    expect(nonce.length).toBeGreaterThan(0);
    console.log("Generated nonce:", nonce);
  });

  it("should authenticate with a valid signature", async () => {
    if (!ctx.context) throw new Error("Test context not initialized");

    const success = await authHelper.authenticate();
    expect(success).toBe(true);

    const authToken = authHelper.getAuthToken();
    expect(authToken).toBeDefined();

    console.log("Authentication completed, token available:", !!authToken);
  });

  it("should reject authentication with an invalid signature", async () => {
    if (!ctx.context) throw new Error("Test context not initialized");
    const { baseUrl } = ctx.context;

    // Use an invalid signature intentionally
    const { response } = await fetchWithAuth(
      apiUrl(baseUrl, "/authenticate"),
      "POST",
      {
        publicKey: authHelper.getPublicKey(),
        signature: "invalidSignature",
        nonce: "123456",
        message: "Sign this message for authenticating with nonce: 123456",
      },
    );

    // The server should reject this signature
    expect(response.status).not.toBe(200);
  });

  it("should show authenticated status with a valid token", async () => {
    if (!ctx.context) throw new Error("Test context not initialized");

    // Make sure we're authenticated first
    if (!authHelper.getAuthToken()) {
      await authHelper.authenticate();
    }

    const isAuthenticated = await authHelper.checkAuthStatus();

    expect(isAuthenticated).toBe(true);
  });

  it("should show unauthenticated status without a valid token", async () => {
    if (!ctx.context) throw new Error("Test context not initialized");

    const { baseUrl } = ctx.context;

    const { response, data } = await fetchWithAuth<{ authenticated: boolean }>(
      apiUrl(baseUrl, "/auth-status"),
      "GET",
    );

    expect(response.status).toBe(200);
    expect(data).toHaveProperty("authenticated");
    expect(data.authenticated).toBe(false);
  });

  it("should successfully logout and clear authentication", async () => {
    if (!ctx.context) throw new Error("Test context not initialized");

    // Make sure we're authenticated first
    if (!authHelper.getAuthToken()) {
      await authHelper.authenticate();
    }

    // Then logout
    const success = await authHelper.logout();
    expect(success).toBe(true);

    // Verify auth status after logout
    const isAuthenticated = await authHelper.checkAuthStatus();
    expect(isAuthenticated).toBe(false);
  });

  // Test the reuse of authentication across multiple requests
  it("should maintain authentication across multiple requests", async () => {
    if (!ctx.context) throw new Error("Test context not initialized");

    // Make sure we're authenticated
    if (!authHelper.getAuthToken()) {
      await authHelper.authenticate();
    }

    const { baseUrl } = ctx.context;
    const authHeaders = authHelper.getAuthHeaders();

    // Make multiple authenticated requests
    for (let i = 0; i < 3; i++) {
      const { response, data } = await fetchWithAuth<{
        authenticated: boolean;
      }>(apiUrl(baseUrl, "/auth-status"), "GET", undefined, authHeaders);

      expect(response.status).toBe(200);
      expect(data.authenticated).toBe(true);
    }
  });
});
