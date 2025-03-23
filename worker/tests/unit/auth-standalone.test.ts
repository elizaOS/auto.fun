import { describe, it, expect, vi, beforeEach } from "vitest";
import { authStatus } from "../../auth";

// Mock the getCookie function from Hono
vi.mock("hono/cookie", () => ({
  getCookie: (c: any, key: string) => {
    // Use our own implementation that doesn't rely on c.req.headers
    if (typeof c.getCookie === "function") {
      return c.getCookie(key);
    }
    return null;
  },
}));

describe("Authentication Functions", () => {
  describe("authStatus function", () => {
    it("should return authenticated=true when in test mode with valid token", async () => {
      // Mock the context object with a test environment
      const mockContext = {
        env: { NODE_ENV: "test" },
        req: {
          header: (name: string) =>
            name === "Authorization" ? "Bearer valid-token" : null,
          headers: new Headers(), // Add headers for Hono's getCookie function
        },
        json: vi.fn().mockImplementation((data) => data),
        getCookie: () => null, // No cookies
      };

      // Call authStatus directly
      const result = await authStatus(mockContext as any);

      // Check the result
      expect(result).toHaveProperty("authenticated", true);
    });

    it("should return authenticated=false without proper authorization", async () => {
      // Mock context without authorization
      const mockContext = {
        env: { NODE_ENV: "test" },
        req: {
          header: () => null,
          headers: new Headers(),
        },
        json: vi.fn().mockImplementation((data) => data),
        getCookie: () => null, // No cookies
      };

      const result = await authStatus(mockContext as any);
      expect(result).toHaveProperty("authenticated", false);
    });

    it("should return authenticated=true with valid cookies", async () => {
      // Mock context with valid cookies
      const mockContext = {
        env: { NODE_ENV: "test" },
        req: {
          header: () => null,
          headers: new Headers(),
        },
        json: vi.fn().mockImplementation((data) => data),
        getCookie: (name: string) =>
          name === "publicKey"
            ? "test-pubkey"
            : name === "auth_token"
              ? "valid-token"
              : null,
      };

      const result = await authStatus(mockContext as any);
      expect(result).toHaveProperty("authenticated", true);
    });
  });
});
