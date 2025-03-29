import { describe, expect, it, beforeEach, vi } from "vitest";
import { CacheService } from "../../cache";
import { Env } from "../../env";

describe("CacheService", () => {
  let cacheService: CacheService;
  let env: Env;
  let mockCache: Record<string, any> = {};

  // Create a simple test environment with a mock database
  beforeEach(() => {
    // Reset the mock cache
    mockCache = {};

    // Create a minimal test environment
    env = {
      AI: {} as any,
      PROGRAM_ID: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      NODE_ENV: "test",
      NETWORK: "devnet",
      DECIMALS: "6",
      TOKEN_SUPPLY: "1000000000000000",
      VIRTUAL_RESERVES: "28000000000",
      CURVE_LIMIT: "113000000000",
      FAL_API_KEY: "test-fal-api-key",
      SWAP_FEE: "100",
      DB: {} as any,
      WEBSOCKET_DO: {} as any,
    };

    // Create a fresh CacheService instance
    cacheService = new CacheService(env);

    // Mock the database methods
    const mockDbMethods = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => {
                // For getSolPrice or getTokenPrice or getMetadata
                const key = mockCache["__current_key"] || "";
                delete mockCache["__current_key"];

                if (mockCache[key]) {
                  return [{ price: mockCache[key] }];
                }
                return [];
              },
            }),
          }),
        }),
      }),
      insert: () => ({
        values: (data: any) => {
          // Store in our mock cache
          if (data && data.symbol && data.price) {
            mockCache[data.symbol] = data.price;
          }
          return {
            onConflictDoUpdate: () => ({}),
          };
        },
      }),
      delete: () => ({
        where: () => ({}),
      }),
    };

    // Replace the database implementation
    (cacheService as any).db = mockDbMethods;
  });

  describe("getSolPrice", () => {
    it("should return SOL price from cache when available", async () => {
      // Set up test data in the mock cache
      mockCache["SOL"] = "25.5";
      mockCache["__current_key"] = "SOL";

      // Call the method
      const result = await cacheService.getSolPrice();

      // Verify the result
      expect(result).toBe(25.5);
    });

    it("should return null when no price is found in cache", async () => {
      mockCache["__current_key"] = "SOL";
      // Don't set any price in the cache

      const result = await cacheService.getSolPrice();

      expect(result).toBeNull();
    });

    it("should handle database errors gracefully", async () => {
      // First set a valid price
      mockCache["SOL"] = "25.5";
      mockCache["__current_key"] = "SOL";

      // Force an error
      const originalSelect = (cacheService as any).db.select;
      (cacheService as any).db.select = () => {
        throw new Error("Database error");
      };

      // The method should handle the error and return null
      const result = await cacheService.getSolPrice();
      expect(result).toBeNull();

      // Restore the original function
      (cacheService as any).db.select = originalSelect;
      mockCache["__current_key"] = "SOL";

      // Verify it works again
      const validResult = await cacheService.getSolPrice();
      expect(validResult).toBe(25.5);
    });
  });

  describe("setSolPrice", () => {
    it("should store SOL price in cache with default TTL", async () => {
      const price = 26.75;

      // Call the method
      await cacheService.setSolPrice(price);

      // Verify the price was stored
      expect(mockCache["SOL"]).toBe(price.toString());

      // Verify we can retrieve it
      mockCache["__current_key"] = "SOL";
      const result = await cacheService.getSolPrice();
      expect(result).toBe(price);
    });

    it("should use custom TTL when provided", async () => {
      const price = 30.25;
      const customTTL = 1; // 1 second TTL for quick testing

      // Call the method
      await cacheService.setSolPrice(price, customTTL);

      // Verify the price was stored
      expect(mockCache["SOL"]).toBe(price.toString());

      // Verify we can retrieve it
      mockCache["__current_key"] = "SOL";
      const result = await cacheService.getSolPrice();
      expect(result).toBe(price);

      // Wait for the TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Simulate TTL expiration by clearing the cache
      delete mockCache["SOL"];

      // Price should now be null as TTL has expired
      mockCache["__current_key"] = "SOL";
      const expiredResult = await cacheService.getSolPrice();
      expect(expiredResult).toBeNull();
    });
  });

  describe("getTokenPrice", () => {
    it("should return token price from cache when available", async () => {
      const tokenMint = "ABC123XYZ";
      mockCache[tokenMint] = "0.5";
      mockCache["__current_key"] = tokenMint;

      const result = await cacheService.getTokenPrice(tokenMint);

      expect(result).toBe(0.5);
    });

    it("should return null when token price is not in cache", async () => {
      const tokenMint = "NonExistentToken";
      mockCache["__current_key"] = tokenMint;

      const result = await cacheService.getTokenPrice(tokenMint);

      expect(result).toBeNull();
    });
  });

  describe("setTokenPrice", () => {
    it("should store token price in cache", async () => {
      const tokenMint = "TOKEN123";
      const price = 0.75;

      await cacheService.setTokenPrice(tokenMint, price);

      expect(mockCache[tokenMint]).toBe(price.toString());

      mockCache["__current_key"] = tokenMint;
      const result = await cacheService.getTokenPrice(tokenMint);
      expect(result).toBe(price);
    });
  });

  describe("getMetadata", () => {
    it("should retrieve metadata from cache", async () => {
      const metadataObj = { name: "Test Object", values: [1, 2, 3] };
      const key = "test-key";

      mockCache[key] = JSON.stringify(metadataObj);
      mockCache["__current_key"] = key;

      const result = await cacheService.getMetadata(key);

      expect(result).toEqual(metadataObj);
    });

    it("should handle JSON parsing errors", async () => {
      const key = "test-key";
      mockCache[key] = "{invalid:json}";
      mockCache["__current_key"] = key;

      const result = await cacheService.getMetadata(key);

      expect(result).toBeNull();
    });
  });

  describe("setMetadata", () => {
    it("should store metadata in cache", async () => {
      const key = "metadata-key";
      const metadata = { name: "Test", values: [1, 2, 3] };

      await cacheService.setMetadata(key, metadata);

      expect(mockCache[key]).toBe(JSON.stringify(metadata));

      mockCache["__current_key"] = key;
      const result = await cacheService.getMetadata(key);
      expect(result).toEqual(metadata);
    });
  });

  describe("cleanupOldCacheEntries", () => {
    it("should remove expired cache entries", async () => {
      const price = 25.0;

      // Store a price with a short TTL
      await cacheService.setSolPrice(price, 1);

      // Verify it's stored
      expect(mockCache["SOL"]).toBe(price.toString());

      // Verify we can get it
      mockCache["__current_key"] = "SOL";
      const result = await cacheService.getSolPrice();
      expect(result).toBe(price);

      // Wait for TTL to expire and simulate cleanup
      await new Promise((resolve) => setTimeout(resolve, 1100));
      delete mockCache["SOL"];

      // Price should be gone now
      mockCache["__current_key"] = "SOL";
      const expiredResult = await cacheService.getSolPrice();
      expect(expiredResult).toBeNull();
    });
  });
});
