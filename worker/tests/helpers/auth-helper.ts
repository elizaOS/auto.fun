import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { fetchWithAuth } from "./test-utils";

/**
 * Helper class for managing authentication in tests
 */
export class AuthHelper {
  private keypair: Keypair;
  private baseUrl: string;
  private nonce?: string;
  private authToken?: string;

  constructor(baseUrl: string) {
    this.keypair = Keypair.generate();
    this.baseUrl = baseUrl;
  }

  /**
   * Get the public key of the test user
   */
  getPublicKey(): string {
    return this.keypair.publicKey.toBase58();
  }

  /**
   * Get the auth token (if authenticated)
   */
  getAuthToken(): string | undefined {
    return this.authToken;
  }

  /**
   * Generate a nonce for authentication
   */
  async generateNonce(): Promise<string> {
    const { data } = await fetchWithAuth<{ nonce: string }>(
      `${this.baseUrl}/generate-nonce`,
      "POST",
      { publicKey: this.getPublicKey() },
    );

    this.nonce = data.nonce;
    return data.nonce;
  }

  /**
   * Authenticate with the server
   */
  async authenticate(): Promise<boolean> {
    if (!this.nonce) {
      await this.generateNonce();
    }

    // Create and sign the message
    const messageText = `Sign this message for authenticating with nonce: ${this.nonce}`;
    const message = new TextEncoder().encode(messageText);
    const signatureBytes = nacl.sign.detached(message, this.keypair.secretKey);
    const signature = bs58.encode(signatureBytes);

    // Send authentication request
    const { response, data } = await fetchWithAuth<{
      token: string;
      user: { address: string };
    }>(`${this.baseUrl}/authenticate`, "POST", {
      publicKey: this.getPublicKey(),
      signature,
      nonce: this.nonce,
      message: messageText,
    });

    // Store auth token if authentication succeeded
    if (response.status === 200 && data.token) {
      this.authToken = data.token;
      return true;
    }

    return false;
  }

  /**
   * Get authentication headers for requests
   */
  getAuthHeaders(): Record<string, string> {
    if (!this.authToken) {
      return {};
    }

    return {
      Authorization: `Bearer ${this.authToken}`,
    };
  }

  /**
   * Logout from the server
   */
  async logout(): Promise<boolean> {
    if (!this.authToken) {
      return true; // Already logged out
    }

    const { response } = await fetchWithAuth(
      `${this.baseUrl}/logout`,
      "POST",
      undefined,
      this.getAuthHeaders(),
    );

    if (response.status === 200) {
      this.authToken = undefined;
      return true;
    }

    return false;
  }

  /**
   * Check authentication status
   */
  async checkAuthStatus(): Promise<boolean> {
    const { data } = await fetchWithAuth<{ authenticated: boolean }>(
      `${this.baseUrl}/auth-status`,
      "GET",
      undefined,
      this.getAuthHeaders(),
    );

    return data.authenticated;
  }
}
