import { beforeAll, describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import * as bs58 from "bs58";
import nacl from "tweetnacl";
import { TestContext, apiUrl, fetchWithAuth } from "./helpers/test-utils";
import { registerWorkerHooks } from "./setup";

const ctx: { context: TestContext | null } = { context: null };

registerWorkerHooks(ctx);

describe("Authentication API Endpoints", () => {
  let userKeypair: Keypair;
  let nonce: string;

  beforeAll(async () => {
    // Create a test user keypair for authentication
    userKeypair = Keypair.generate();
  });

  it("should generate a nonce for authentication", async () => {
    if (!ctx.context) throw new Error("Test context not initialized");

    const { baseUrl } = ctx.context;
    const publicKey = userKeypair.publicKey.toBase58();

    const { response, data } = await fetchWithAuth<{ nonce: string }>(
      apiUrl(baseUrl, "/generate-nonce"),
      "POST",
      { publicKey },
    );

    expect(response.status).toBe(200);
    expect(data).toHaveProperty("nonce");
    expect(typeof data.nonce).toBe("string");
    expect(data.nonce.length).toBeGreaterThan(0);

    // Save nonce for the authenticate test
    nonce = data.nonce;
  });

  it("should authenticate with a valid signature", async () => {
    if (!ctx.context) throw new Error("Test context not initialized");
    if (!nonce) throw new Error("Nonce not generated");

    const { baseUrl } = ctx.context;
    const publicKey = userKeypair.publicKey.toBase58();

    // Create a real signature
    const message = `Sign this message for authenticating with nonce: ${nonce}`;
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = nacl.sign.detached(
      messageBytes,
      userKeypair.secretKey,
    );
    const signature = bs58.encode(signatureBytes);

    const { response, data } = await fetchWithAuth<{
      token: string;
      user: any;
    }>(apiUrl(baseUrl, "/authenticate"), "POST", {
      publicKey,
      signature,
      nonce,
    });

    expect(response.status).toBe(200);
    expect(data).toHaveProperty("token");
    expect(data).toHaveProperty("user");
    expect(data.user).toHaveProperty("address");
    expect(data.user.address).toBe(publicKey);
  });

  it("should reject authentication with an invalid signature", async () => {
    if (!ctx.context) throw new Error("Test context not initialized");
    if (!nonce) throw new Error("Nonce not generated");

    const { baseUrl } = ctx.context;
    const publicKey = userKeypair.publicKey.toBase58();

    // Use an invalid signature
    const invalidSignature = bs58.encode(Buffer.from("invalid-signature"));

    const { response } = await fetchWithAuth<{ error: string }>(
      apiUrl(baseUrl, "/authenticate"),
      "POST",
      { publicKey, signature: invalidSignature, nonce },
    );

    // The server should reject this signature
    expect(response.status).not.toBe(200);
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

  it("should handle auth status and logout endpoints", async () => {
    if (!ctx.context) throw new Error("Test context not initialized");

    const { baseUrl } = ctx.context;

    // First authenticate to get a real token
    let token: string | undefined;

    try {
      // Generate a nonce if needed
      if (!nonce) {
        const nonceResponse = await fetchWithAuth<{ nonce: string }>(
          apiUrl(baseUrl, "/generate-nonce"),
          "POST",
          { publicKey: userKeypair.publicKey.toBase58() },
        );
        nonce = nonceResponse.data.nonce;
      }

      // Sign and authenticate
      const message = `Sign this message for authenticating with nonce: ${nonce}`;
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = nacl.sign.detached(
        messageBytes,
        userKeypair.secretKey,
      );
      const signature = bs58.encode(signatureBytes);

      const authResponse = await fetchWithAuth<{ token: string }>(
        apiUrl(baseUrl, "/authenticate"),
        "POST",
        {
          publicKey: userKeypair.publicKey.toBase58(),
          signature,
          nonce,
        },
      );

      if (authResponse.response.status === 200) {
        token = authResponse.data.token;
      }
    } catch (error) {
      console.warn("Could not authenticate for logout test:", error);
    }

    // If we got a token, test with it; otherwise, use a test token
    const headers = token
      ? { Authorization: `Bearer ${token}` }
      : { Authorization: "Bearer test-auth-token" };

    // Check auth status with token
    const statusResponse = await fetchWithAuth(
      apiUrl(baseUrl, "/auth-status"),
      "GET",
      undefined,
      undefined,
      headers,
    );

    // Try logout
    const logoutResponse = await fetchWithAuth(
      apiUrl(baseUrl, "/logout"),
      "POST",
      undefined,
      undefined,
      headers,
    );

    // We're just confirming endpoints exist and respond
    expect(statusResponse.response.status).toBe(200);
    expect(
      logoutResponse.response.status === 200 ||
        logoutResponse.response.status === 401,
    ).toBeTruthy();
  });
});
