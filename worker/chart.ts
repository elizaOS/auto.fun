import { and, eq, sql } from "drizzle-orm";
import {
  CodexBarResolution,
  fetchCodexBars,
  fetchCodexTokenEvents,
} from "./codex";
import { getDB, swaps, tokens } from "./db";
import { Env } from "./env";
import { logger } from "./logger";

// Define interface for the API response types
interface DexScreenerPair {
  pairAddress: string;
  priceUsd: string;
  liquidity?: {
    usd: string;
  };
}

interface DexScreenerResponse {
  pairs?: DexScreenerPair[];
}

interface PriceCandle {
  time: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

interface ChartResponse {
  priceCandles?: PriceCandle[];
}

// For devnet testing - placeholder token address for locked tokens since there are none in devnet
export const DEV_TEST_TOKEN_ADDRESS =
  "ANNTWQsQ9J3PeM6dXLjdzwYcSzr51RREWQnjuuCEpump";

export interface PriceFeedInfo {
  price: number;
  timestamp: Date;
  volume: number;
}

export type CandlePrice = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
};

export async function getLatestCandle(env: Env, tokenMint: string, swap: any) {
  // Get a time range that covers just this swap
  const swapTime = new Date(swap.timestamp).getTime() / 1000;
  const candlePeriod = 60; // 1 min default
  const candleStart = Math.floor(swapTime / candlePeriod) * candlePeriod;

  // Check if token is locked (should use Codex API)
  const db = getDB(env);
  const [tokenInfo] = await db
    .select()
    .from(tokens)
    .where(eq(tokens.mint, tokenMint))
    .limit(1);

  if (tokenInfo?.status === "locked") {
    try {
      // Use the test token address only in devnet since there are no locked pools in dev
      const tokenAddress =
        env.NETWORK === "devnet" ? DEV_TEST_TOKEN_ADDRESS : tokenMint;
      const candles = await fetchCodexBars(
        tokenAddress,
        candleStart,
        candleStart + candlePeriod,
        "1", // 1 minute candles
        undefined,
        undefined,
        env,
      );

      if (candles.length > 0) {
        return candles[0];
      }
    } catch (error) {
      logger.error("Error fetching latest candle from Codex:", error);
      // Fall through to default method
    }
  }

  // Fallback: Fetch all swaps in this candle period to properly calculate OHLCV
  const latestCandle = await fetchPriceChartData(
    env,
    candleStart * 1000, // start (ms)
    (candleStart + candlePeriod) * 1000, // end (ms)
    1, // 1 min range
    tokenMint,
  );

  return latestCandle && latestCandle.length > 0 ? latestCandle[0] : null; // Return the single candle
}

export async function fetchPriceChartData(
  env: Env,
  start: number,
  end: number,
  range: number,
  tokenMint: string,
) {
  const db = getDB(env);
  const [tokenInfo] = await db
    .select()
    .from(tokens)
    .where(eq(tokens.mint, tokenMint))
    .limit(1);

  if (!tokenInfo) {
    logger.error(`Token ${tokenMint} not found`);
    return [];
  }

  if (tokenInfo.status !== "locked") {
    // Load price histories from DB
    const swapRecords = await db
      .select({
        price: swaps.price,
        amountIn: swaps.amountIn,
        amountOut: swaps.amountOut,
        direction: swaps.direction,
        timestamp: swaps.timestamp,
      })
      .from(swaps)
      .where(
        and(
          eq(swaps.tokenMint, tokenMint),
          sql`${swaps.timestamp} >= ${new Date(start).toISOString()}`,
          sql`${swaps.timestamp} <= ${new Date(end).toISOString()}`,
        ),
      )
      .orderBy(swaps.timestamp);

    // Convert to PriceFeedInfo array - ensure timestamp is not null
    const priceFeeds: PriceFeedInfo[] = swapRecords
      .filter(
        (swap: {
          price: number;
          timestamp: string;
          direction: number;
          amountIn: number | null;
          amountOut: number | null;
        }) => swap.price != null && swap.timestamp != null,
      ) // Type guard to ensure price and timestamp are not null
      .map(
        (swap: {
          price: number;
          timestamp: string;
          direction: number;
          amountIn: number | null;
          amountOut: number | null;
        }) => ({
          price: swap.price,
          timestamp: new Date(swap.timestamp), // Create a new Date object from the string
          // If direction is 0 (buy), amountIn is SOL
          // If direction is 1 (sell), amountOut is SOL
          volume:
            swap.direction === 0
              ? (swap.amountIn || 0) / 1e9 // Convert from lamports to SOL
              : (swap.amountOut || 0) / 1e9,
        }),
      );

    if (!priceFeeds.length) return [];

    const cdFeeds = getCandleData(priceFeeds, range);

    return cdFeeds;
  } else if (tokenInfo.status === "locked") {
    try {
      // Use the test token address only in devnet since there are no locked pools in dev
      const tokenAddress =
        env.NETWORK === "devnet" ? DEV_TEST_TOKEN_ADDRESS : tokenMint;

      // Convert range to Codex resolution format
      let resolution: CodexBarResolution = "1";
      switch (range) {
        case 1:
          resolution = "1";
          break;
        case 5:
          resolution = "5";
          break;
        case 15:
          resolution = "15";
          break;
        case 60:
          resolution = "60";
          break;
        case 120:
          resolution = "60";
          break; // Use 60m and group if needed
        default:
          resolution = "1";
      }

      // Use the new getBars API directly
      const candles = await fetchCodexBars(
        tokenAddress,
        Math.floor(start / 1000),
        Math.floor(end / 1000),
        resolution,
        undefined,
        undefined,
        env,
      );

      // For 120 minute resolution, we need to combine 2 x 60m candles
      if (range === 120 && candles.length > 1) {
        const combined: any[] = [];
        for (let i = 0; i < candles.length; i += 2) {
          // If we have a pair, combine them
          if (i + 1 < candles.length) {
            const out = {
              open: candles[i].open,
              high: Math.max(candles[i].high, candles[i + 1].high),
              low: Math.min(candles[i].low, candles[i + 1].low),
              close: candles[i + 1].close,
              volume: candles[i].volume + candles[i + 1].volume,
              time: candles[i].time,
              price: candles[i].close,
              timestamp: new Date(candles[i].time * 1000),
            };
            combined.push(out);
          } else {
            // Add the last odd candle if there is one
            const lastCandle = {
              ...candles[i],
              price: candles[i].close,
              timestamp: new Date(candles[i].time * 1000),
            };
            combined.push(lastCandle);
          }
        }
        return combined;
      }

      return candles;
    } catch (error) {
      logger.error("Error fetching data with getBars API:", error);

      // Fallback to the old method if getBars fails
      try {
        logger.log("Falling back to getTokenEvents API");
        // Use the test token address only in devnet
        const tokenAddress =
          env.NETWORK === "devnet" ? DEV_TEST_TOKEN_ADDRESS : tokenMint;

        // Fetch price history from Codex API using our utility function
        const tokenEvents = await fetchCodexTokenEvents(
          tokenAddress,
          Math.floor(start / 1000),
          Math.floor(end / 1000),
          1399811149,
          env,
        );

        // Convert to price feed format - ensure timestamps are never null
        const priceFeeds: PriceFeedInfo[] = tokenEvents
          .filter((item) => item.timestamp != null) // Filter out items with null timestamps
          .map((item) => ({
            price: parseFloat(item.token1PoolValueUsd || "0"),
            timestamp: new Date(item.timestamp * 1000), // Now safe since we filtered
            volume: parseFloat(item.data?.amount0 || "0"),
          }));

        if (!priceFeeds.length) return [];

        const cdFeeds = getCandleData(priceFeeds, range);
        return cdFeeds;
      } catch (fallbackError) {
        logger.error("Fallback method also failed:", fallbackError);
        return [];
      }
    }
  }
}

export function getCandleData(priceFeeds: PriceFeedInfo[], range: number) {
  const priceHistory = priceFeeds
    .map((feed) => ({
      price: feed.price,
      ts: feed.timestamp.getTime() / 1000,
    }))
    .sort((price1, price2) => price1.ts - price2.ts);

  if (!priceHistory.length) return [];

  let candlePeriod = 60; // 1 min default
  switch (range) {
    case 1:
      // default candle period
      break;
    case 5:
      candlePeriod = 300; // 5 mins
      break;
    case 15:
      candlePeriod = 900; // 15 mins
      break;
    case 60:
      candlePeriod = 3_600; // 1 hr
      break;
    case 120:
      candlePeriod = 7_200; // 2 hrs
      break;
  }

  // Convert price feed to candle price data
  const cdStart = Math.floor(priceHistory[0].ts / candlePeriod) * candlePeriod;
  const cdEnd =
    Math.floor(priceHistory[priceHistory.length - 1].ts / candlePeriod) *
    candlePeriod;

  const cdFeeds: CandlePrice[] = [];
  let pIndex = 0;
  for (
    let curCdStart = cdStart;
    curCdStart <= cdEnd;
    curCdStart += candlePeriod
  ) {
    const st = priceHistory[pIndex].price;
    let hi = priceHistory[pIndex].price;
    let lo = priceHistory[pIndex].price;
    let en = priceHistory[pIndex].price;
    let vol = 0;
    const prevIndex = pIndex;
    for (; pIndex < priceHistory.length; ) {
      if (hi < priceHistory[pIndex].price) hi = priceHistory[pIndex].price;
      if (lo > priceHistory[pIndex].price) lo = priceHistory[pIndex].price;
      en = priceHistory[pIndex].price;
      vol += priceFeeds[pIndex].volume;

      // Break new candle data starts
      if (priceHistory[pIndex].ts >= curCdStart + candlePeriod) break;
      pIndex++;
    }
    if (prevIndex !== pIndex)
      cdFeeds.push({
        open: st,
        high: hi,
        low: lo,
        close: en,
        volume: vol,
        time: curCdStart,
      });
  }

  return cdFeeds;
}

/**
 * Fetch price chart data for locked tokens using Codex API
 * @param token The token mint address
 * @param start Start time in milliseconds
 * @param end End time in milliseconds
 * @param range Time range in minutes for each candle
 * @param env Cloudflare worker environment
 * @returns Array of OHLC candle data
 */
export async function fetchLockedTokenChartData(
  token: string,
  start: number,
  end: number,
  range: number,
  _env: Env,
): Promise<any[]> {
  try {
    // Construct Codex API URL for the token chart data
    const codexApiUrl = `https://api.dexscreener.com/latest/dex/tokens/${token}`;

    // Fetch data from Codex API
    const response = await fetch(codexApiUrl);

    if (!response.ok) {
      throw new Error(
        `Codex API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as DexScreenerResponse;

    // Check if we have valid data
    if (!data || !data.pairs || data.pairs.length === 0) {
      logger.error(`No pairs found for token ${token}`);
      return [];
    }

    // Find the most relevant pair (usually the one with highest liquidity)
    // Sort by liquidity in descending order
    const pairs = data.pairs.sort(
      (a, b) =>
        parseFloat(b.liquidity?.usd || "0") -
        parseFloat(a.liquidity?.usd || "0"),
    );

    const mainPair = pairs[0];

    if (!mainPair || !mainPair.priceUsd) {
      logger.error(`No price data found for token ${token}`);
      return [];
    }

    // For Codex API, we need to make a separate call to get the chart data
    const chartApiUrl = `https://api.dexscreener.com/latest/dex/charts/solana/${mainPair.pairAddress}`;
    const chartResponse = await fetch(chartApiUrl);

    if (!chartResponse.ok) {
      throw new Error(
        `Chart API error: ${chartResponse.status} ${chartResponse.statusText}`,
      );
    }

    const chartData = (await chartResponse.json()) as ChartResponse;

    if (
      !chartData ||
      !chartData.priceCandles ||
      chartData.priceCandles.length === 0
    ) {
      logger.error(`No candle data found for pair ${mainPair.pairAddress}`);
      return [];
    }

    // Convert the candles to our expected format
    // Filter by time range
    const candles = chartData.priceCandles
      .filter((candle) => {
        const candleTime = candle.time * 1000; // Convert to ms
        return candleTime >= start && candleTime <= end;
      })
      .map((candle) => ({
        open: parseFloat(candle.open),
        high: parseFloat(candle.high),
        low: parseFloat(candle.low),
        close: parseFloat(candle.close),
        volume: parseFloat(candle.volume),
        time: candle.time,
      }));

    // Handle the case where we have different time intervals
    // Group candles based on the requested range
    if (range > 0) {
      return groupCandlesByRange(candles, range);
    }

    return candles;
  } catch (error) {
    logger.error(`Error fetching locked token chart data: ${error}`);
    return [];
  }
}

// Define interface for candle data
interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

/**
 * Group candles by the specified time range
 * @param candles Original candle data
 * @param rangeMinutes Time range in minutes
 * @returns Grouped candle data
 */
export function groupCandlesByRange(
  candles: Candle[],
  rangeMinutes: number,
): Candle[] {
  if (candles.length === 0) return [];

  const rangeMs = rangeMinutes * 60 * 1000; // Convert minutes to milliseconds
  const groupedCandles: Candle[] = [];

  // Sort candles by time
  const sortedCandles = [...candles].sort((a, b) => a.time - b.time);

  let currentGroup: Candle[] = [];
  let currentRangeStart =
    (Math.floor((sortedCandles[0].time * 1000) / rangeMs) * rangeMs) / 1000;

  // Process each candle
  for (const candle of sortedCandles) {
    const candleRangeStart =
      (Math.floor((candle.time * 1000) / rangeMs) * rangeMs) / 1000;

    if (candleRangeStart === currentRangeStart) {
      // Add to current group
      currentGroup.push(candle);
    } else {
      // Process current group and start a new one
      if (currentGroup.length > 0) {
        groupedCandles.push(
          createCandleFromGroup(currentGroup, currentRangeStart),
        );
      }

      // Handle potential gaps in data
      while (candleRangeStart > currentRangeStart + rangeMs / 1000) {
        currentRangeStart += rangeMs / 1000;
        const previousCandle = groupedCandles[groupedCandles.length - 1];
        groupedCandles.push({
          open: previousCandle.close,
          high: previousCandle.close,
          low: previousCandle.close,
          close: previousCandle.close,
          volume: 0,
          time: currentRangeStart,
        });
      }

      currentRangeStart = candleRangeStart;
      currentGroup = [candle];
    }
  }

  // Process the last group
  if (currentGroup.length > 0) {
    groupedCandles.push(createCandleFromGroup(currentGroup, currentRangeStart));
  }

  return groupedCandles;
}

/**
 * Create a single candle from a group of candles
 * @param group Group of candles
 * @param rangeStart Start time for the group
 * @returns Consolidated candle
 */
function createCandleFromGroup(group: Candle[], rangeStart: number): Candle {
  const open = group[0].open;
  const close = group[group.length - 1].close;
  const high = Math.max(...group.map((c) => c.high));
  const low = Math.min(...group.map((c) => c.low));
  const volume = group.reduce((sum, c) => sum + c.volume, 0);

  return {
    open,
    high,
    low,
    close,
    volume,
    time: rangeStart,
  };
}
