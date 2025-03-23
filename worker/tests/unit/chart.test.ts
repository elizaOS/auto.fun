import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getCandleData,
  CandlePrice,
  PriceFeedInfo,
  fetchPriceChartData,
  groupCandlesByRange,
} from "../../chart";
import { Env } from "../../env";

// Create a minimal test environment
const createTestEnv = (): Env => {
  return {
    NODE_ENV: "test",
    NETWORK: "devnet",
    DECIMALS: "9",
    TOKEN_SUPPLY: "1000000000000000000",
    VIRTUAL_RESERVES: "1000000000",
    CURVE_LIMIT: "1000000000000",
    API_KEY: "test-api-key",
    USER_API_KEY: "test-user-api-key",
    ADMIN_KEY: "test-admin-key",
    ADMIN_API_KEY: "test-admin-api-key",
    FAL_API_KEY: "test-fal-api-key",
    SWAP_FEE: "1.5",
    DB: {} as any,
    WEBSOCKET_DO: {} as any,
  };
};

describe("Chart Module", () => {
  let testEnv: Env;

  beforeEach(async () => {
    // Set up a test environment with actual values
    testEnv = createTestEnv();
  });

  describe("getCandleData", () => {
    it("should generate 1-minute candles from price feed data", () => {
      // Arrange: Create sample price feed data
      const baseTime = 1625097600; // 2021-07-01T00:00:00Z
      const priceFeeds: PriceFeedInfo[] = [
        { price: 100, timestamp: new Date((baseTime + 10) * 1000), volume: 5 },
        { price: 101, timestamp: new Date((baseTime + 20) * 1000), volume: 2 },
        { price: 102, timestamp: new Date((baseTime + 30) * 1000), volume: 3 },
        { price: 99, timestamp: new Date((baseTime + 40) * 1000), volume: 4 },
        { price: 98, timestamp: new Date((baseTime + 50) * 1000), volume: 6 },
        { price: 105, timestamp: new Date((baseTime + 70) * 1000), volume: 3 }, // Next minute
        { price: 108, timestamp: new Date((baseTime + 80) * 1000), volume: 2 },
      ];

      // Act: Generate candle data with 1-minute intervals
      const candles = getCandleData(priceFeeds, 1);

      // Assert: Verify candle data
      expect(candles.length).toBe(2); // Two 1-minute candles

      // First candle (0:00-0:59)
      expect(candles[0].open).toBe(100); // First price in the minute
      expect(candles[0].high).toBe(105); // Highest price in the minute
      expect(candles[0].low).toBe(98); // Lowest price in the minute
      expect(candles[0].close).toBe(105); // Last price in the minute
      expect(candles[0].time).toBe(baseTime); // Time should be the start of the minute

      // Second candle (1:00-1:59)
      expect(candles[1].open).toBe(105);
      expect(candles[1].high).toBe(108);
      expect(candles[1].low).toBe(105);
      expect(candles[1].close).toBe(108);
      expect(candles[1].time).toBe(baseTime + 60);
    });

    it("should generate 5-minute candles from price feed data", () => {
      // Arrange: Create sample price feed data across multiple 5-minute periods
      const baseTime = 1625097600; // 2021-07-01T00:00:00Z
      const priceFeeds: PriceFeedInfo[] = [
        { price: 100, timestamp: new Date((baseTime + 10) * 1000), volume: 5 },
        { price: 101, timestamp: new Date((baseTime + 100) * 1000), volume: 2 },
        { price: 102, timestamp: new Date((baseTime + 200) * 1000), volume: 3 },
        { price: 99, timestamp: new Date((baseTime + 290) * 1000), volume: 4 },
        { price: 98, timestamp: new Date((baseTime + 299) * 1000), volume: 6 },
        { price: 105, timestamp: new Date((baseTime + 301) * 1000), volume: 3 }, // Next 5-min period
        { price: 108, timestamp: new Date((baseTime + 500) * 1000), volume: 2 },
      ];

      // Act: Generate candle data with 5-minute intervals (300 seconds)
      const candles = getCandleData(priceFeeds, 5);

      // Assert: Verify candle data
      expect(candles.length).toBe(2); // Two 5-minute candles

      // First candle (0:00-4:59)
      expect(candles[0].open).toBe(100);
      expect(candles[0].high).toBe(105); // Highest price in the 5-min period
      expect(candles[0].low).toBe(98);
      expect(candles[0].close).toBe(105); // Last price in the 5-min period
      expect(candles[0].time).toBe(baseTime);

      // Second candle (5:00-9:59)
      expect(candles[1].open).toBe(105);
      expect(candles[1].high).toBe(108);
      expect(candles[1].low).toBe(105);
      expect(candles[1].close).toBe(108);
      expect(candles[1].time).toBe(baseTime + 300);
    });

    it("should handle empty price feed data", () => {
      // Arrange: Empty price feed
      const priceFeeds: PriceFeedInfo[] = [];

      // Act: Generate candle data
      const candles = getCandleData(priceFeeds, 1);

      // Assert: Should return empty array
      expect(candles).toEqual([]);
    });
  });

  describe("groupCandlesByRange", () => {
    it("should group candles by the specified time range", () => {
      // Arrange: Create some sample candles
      const baseTime = 1625097600; // 2021-07-01T00:00:00Z
      const sampleCandles = [
        {
          open: 100,
          high: 102,
          low: 98,
          close: 101,
          volume: 10,
          time: baseTime,
        },
        {
          open: 101,
          high: 103,
          low: 99,
          close: 102,
          volume: 12,
          time: baseTime + 60,
        }, // 1 minute later
        {
          open: 102,
          high: 105,
          low: 100,
          close: 104,
          volume: 15,
          time: baseTime + 120,
        }, // 2 minutes later
        {
          open: 104,
          high: 107,
          low: 103,
          close: 106,
          volume: 8,
          time: baseTime + 180,
        }, // 3 minutes later
      ];

      // Act: Group into 2-minute candles
      const groupedCandles = groupCandlesByRange(sampleCandles, 2);

      // Assert: Should have 2 candles (0-2min, 2-4min)
      expect(groupedCandles.length).toBe(2);

      // First grouped candle (0-2min)
      expect(groupedCandles[0].open).toBe(100); // Open of first candle
      expect(groupedCandles[0].high).toBe(103); // Highest of first two candles
      expect(groupedCandles[0].low).toBe(98); // Lowest of first two candles
      expect(groupedCandles[0].close).toBe(102); // Close of second candle
      expect(groupedCandles[0].volume).toBe(22); // Sum of volumes
      expect(groupedCandles[0].time).toBe(baseTime); // Start time

      // Second grouped candle (2-4min)
      expect(groupedCandles[1].open).toBe(102); // Open of third candle
      expect(groupedCandles[1].high).toBe(107); // Highest of last two candles
      expect(groupedCandles[1].low).toBe(100); // Lowest of last two candles
      expect(groupedCandles[1].close).toBe(106); // Close of fourth candle
      expect(groupedCandles[1].volume).toBe(23); // Sum of volumes
      expect(groupedCandles[1].time).toBe(baseTime + 120); // Start time
    });

    it("should handle empty candle array", () => {
      // Arrange: Empty candle array
      const emptyCandles: any[] = [];

      // Act: Group candles
      const result = groupCandlesByRange(emptyCandles, 5);

      // Assert: Should return empty array
      expect(result).toEqual([]);
    });
  });
});
