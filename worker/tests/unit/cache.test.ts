import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CacheService } from "../../cache";
import { Env } from "../../env";
import { createTestEnv, cleanupCacheTable } from "../helpers/test-db";

describe("CacheService", () => {
  let cacheService: CacheService;
  let testEnv: Env;

  beforeEach(async () => {
    // Set up a test environment with a local SQLite database
    testEnv = await createTestEnv();

    // Create a real instance of CacheService with our test DB
    cacheService = new CacheService(testEnv);

    // Clean up any existing cache entries from previous tests
    await cleanupCacheTable(testEnv);
  });

  afterEach(async () => {
    // Clean up after tests
    await cleanupCacheTable(testEnv);
  });

  describe("getSolPrice", () => {
    it("should return SOL price from cache when available", async () => {
      // First set a price
      await cacheService.setSolPrice(25.5);

      // Then retrieve it
      const result = await cacheService.getSolPrice();

      expect(result).toBe(25.5);
    });

    it("should return null when no price is found in cache", async () => {
      // Don't set any price
      const result = await cacheService.getSolPrice();

      expect(result).toBeNull();
    });

    it("should handle database errors gracefully", async () => {
      // First set a valid price
      await cacheService.setSolPrice(25.5);

      // Force an error by replacing the db with one that throws
      const originalDb = (cacheService as any).db;
      (cacheService as any).db = {
        select: () => {
          throw new Error("Database error");
        },
      };

      // The method should handle the error and return null
      const result = await cacheService.getSolPrice();
      expect(result).toBeNull();

      // Restore the original db
      (cacheService as any).db = originalDb;

      // Verify it works again
      const validResult = await cacheService.getSolPrice();
      expect(validResult).toBe(25.5);
    });
  });

  describe("setSolPrice", () => {
    it("should store SOL price in cache with default TTL", async () => {
      const price = 26.75;

      await cacheService.setSolPrice(price);

      // Verify we can retrieve the stored price
      const result = await cacheService.getSolPrice();
      expect(result).toBe(26.75);
    });

    it("should use custom TTL when provided", async () => {
      const price = 30.25;
      const customTTL = 1; // 1 second TTL for quick testing

      await cacheService.setSolPrice(price, customTTL);

      // Verify we can retrieve the stored price
      const result = await cacheService.getSolPrice();
      expect(result).toBe(30.25);

      // Wait for the TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Price should now be null as TTL has expired
      const expiredResult = await cacheService.getSolPrice();
      expect(expiredResult).toBeNull();
    });
  });

  describe("getTokenPrice", () => {
    it("should return token price from cache when available", async () => {
      const tokenMint = "ABC123XYZ";

      // Pre-populate the cache
      await cacheService.setTokenPrice(tokenMint, 0.5);

      const result = await cacheService.getTokenPrice(tokenMint);

      expect(result).toBe(0.5);
    });

    it("should return null when token price is not in cache", async () => {
      const result = await cacheService.getTokenPrice("NonExistentToken");

      expect(result).toBeNull();
    });
  });

  describe("setTokenPrice", () => {
    it("should store token price in cache", async () => {
      const tokenMint = "TOKEN123";
      const price = 0.75;

      await cacheService.setTokenPrice(tokenMint, price);

      // Verify we can retrieve the stored price
      const result = await cacheService.getTokenPrice(tokenMint);
      expect(result).toBe(0.75);
    });
  });

  describe("getMetadata", () => {
    it("should retrieve metadata from cache", async () => {
      const metadataObj = { name: "Test Object", values: [1, 2, 3] };
      const key = "test-key";

      // Pre-populate the cache
      await cacheService.setMetadata(key, metadataObj);

      const result = await cacheService.getMetadata(key);

      expect(result).toEqual(metadataObj);
    });

    it("should handle JSON parsing errors", async () => {
      // Set up a test with corrupt JSON
      // First, modify the db property temporarily to force a JSON parsing error
      const originalDb = (cacheService as any).db;
      (cacheService as any).db = {
        select: () => {
          return {
            from: () => ({
              where: () => ({
                orderBy: () => ({
                  limit: () => [{ price: "{invalid:json}" }],
                }),
              }),
            }),
          };
        },
      };

      // This should return null on JSON parse error
      const result = await cacheService.getMetadata("test-key");
      expect(result).toBeNull();

      // Restore the original db
      (cacheService as any).db = originalDb;
    });
  });

  describe("setMetadata", () => {
    it("should store metadata in cache", async () => {
      const key = "metadata-key";
      const metadata = { name: "Test", values: [1, 2, 3] };

      await cacheService.setMetadata(key, metadata);

      // Verify we can retrieve the stored metadata
      const result = await cacheService.getMetadata(key);
      expect(result).toEqual(metadata);
    });
  });

  describe("cleanupOldCacheEntries", () => {
    it("should remove expired cache entries", async () => {
      // Set a price with a very short TTL
      await cacheService.setSolPrice(25.0, 1); // 1 second TTL

      // Verify it's there initially
      const result = await cacheService.getSolPrice();
      expect(result).toBe(25.0);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Price should be gone now
      const expiredResult = await cacheService.getSolPrice();
      expect(expiredResult).toBeNull();
    });
  });
});
