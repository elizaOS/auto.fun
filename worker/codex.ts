import axios from "axios";
import { logger } from "./logger";

export interface CodexTokenEvent {
  eventDisplayType: string;
  token1SwapValueUsd: string;
  token1PoolValueUsd: string;
  timestamp: number;
  data: {
    amount0?: string;
    amount1?: string;
    [key: string]: any;
  };
}

export interface CodexTokenEventsResponse {
  cursor: string | null;
  items: CodexTokenEvent[];
}

/**
 * Fetches token events from the Codex API
 * @param tokenAddress Token address to fetch events for
 * @param startTimestamp Start timestamp in seconds
 * @param endTimestamp End timestamp in seconds
 * @param networkId Network ID (default: 1399811149 for Solana)
 * @param env Environment variables containing CODEX_API_KEY
 * @returns Array of token events
 */
export async function fetchCodexTokenEvents(
  tokenAddress: string,
  startTimestamp: number,
  endTimestamp: number,
  networkId: number = 1399811149,
  env?: any,
): Promise<CodexTokenEvent[]> {
  const apiUrl = "https://graph.codex.io/graphql";
  let allItems: CodexTokenEvent[] = [];
  let cursor: string | null = null;

  do {
    const query = `query {
      getTokenEvents(
        query: {
          address: "${tokenAddress}", 
          networkId: ${networkId}, 
          timestamp: {
            from: ${Math.floor(startTimestamp)},
            to: ${Math.floor(endTimestamp)}
          }
        },
        limit: 200,
        cursor: ${cursor ? `"${cursor}"` : null}
      ) {
        cursor
        items {
          eventDisplayType
          token1SwapValueUsd
          token1PoolValueUsd
          timestamp
          data {
            ... on SwapEventData {
              amount0,
              amount1,
            }
          }
        }
      }
    }` as string;

    try {
      const response = await axios.post(
        apiUrl,
        { query, variables: {} },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: env?.CODEX_API_KEY || "",
          },
        },
      );

      const { items, cursor: newCursor } = response.data.data.getTokenEvents;
      allItems = allItems.concat(items);
      cursor = newCursor;
    } catch (error) {
      logger.error("Error fetching data from Codex API:", error);
      throw error;
    }
  } while (cursor);

  return allItems;
}

/**
 * Fetches current token price and market data from Codex API
 * @param tokenAddress Token address to fetch price for
 * @param networkId Network ID (default: 1399811149 for Solana)
 * @param env Environment variables containing CODEX_API_KEY
 * @returns Object with current price and market data
 */
export async function fetchCodexTokenPrice(
  tokenAddress: string,
  networkId: number = 1399811149,
  env?: any,
): Promise<{
  currentPrice: number;
  priceUsd: number;
  volume24h: number;
  liquidity: number;
  marketCap: number;
}> {
  const apiUrl = "https://graph.codex.io/graphql";

  const query = `query {
    getTokens(
      query: {
        address: "${tokenAddress}",
        networkId: ${networkId}
      }
    ) {
      items {
        liquidity
        volume24h
        price
        priceUsd
        totalMarketCap
      }
    }
  }`;

  try {
    const response = await axios.post(
      apiUrl,
      { query, variables: {} },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: env?.CODEX_API_KEY || "",
        },
      },
    );

    const token = response.data.data.getTokens.items[0];

    if (!token) {
      throw new Error(`Token ${tokenAddress} not found in Codex API`);
    }

    return {
      currentPrice: parseFloat(token.price || "0"),
      priceUsd: parseFloat(token.priceUsd || "0"),
      volume24h: parseFloat(token.volume24h || "0"),
      liquidity: parseFloat(token.liquidity || "0"),
      marketCap: parseFloat(token.totalMarketCap || "0"),
    };
  } catch (error) {
    logger.error(
      `Error fetching token price from Codex API for ${tokenAddress}:`,
      error,
    );
    throw error;
  }
}

/**
 * Converts Codex token events to price feed format
 * @param events Array of Codex token events
 * @returns Array of price feed objects
 */
export function convertCodexEventsToPriceFeed(
  events: CodexTokenEvent[],
): Array<{
  price: number;
  timestamp: Date;
  volume: number;
}> {
  return events.map((item) => ({
    price: parseFloat(item.token1PoolValueUsd),
    timestamp: new Date(item.timestamp * 1000),
    volume: parseFloat(item.data.amount0 || "0"),
  }));
}

/**
 * Resolution type for Codex getBars API
 * Possible values: '1', '5', '15', '30', '60', '240', '720', '1D', '1W', '1M'
 */
export type CodexBarResolution =
  | "1"
  | "5"
  | "15"
  | "30"
  | "60"
  | "240"
  | "720"
  | "1D"
  | "1W"
  | "1M";

/**
 * Response structure for Codex getBars API
 */
export interface CodexBarsResponse {
  o: number[]; // Open prices
  h: number[]; // High prices
  l: number[]; // Low prices
  c: number[]; // Close prices
  v: number[]; // Volume
  volume: string[]; // Volume as string
}

/**
 * Standardized candle format used in our application
 */
export interface CandleData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

/**
 * Fetch candlestick/OHLC data from Codex API's getBars endpoint
 * @param tokenAddress Token address to fetch candles for (defaults to hardcoded value)
 * @param startTimestamp Start timestamp in seconds
 * @param endTimestamp End timestamp in seconds
 * @param resolution Candle resolution (1min, 5min, 15min, etc.)
 * @param networkId Network ID (default: 1399811149 for Solana)
 * @param quoteToken Quote token to use for price calculation (default: token1)
 * @param env Environment variables containing CODEX_API_KEY
 * @returns Processed candle data in our application's format
 */
export async function fetchCodexBars(
  tokenAddress: string,
  startTimestamp: number,
  endTimestamp: number,
  resolution: CodexBarResolution = "1",
  networkId: number = 1399811149,
  quoteToken: string = "token1",
  env?: any,
): Promise<CandleData[]> {
  const apiUrl = "https://graph.codex.io/graphql";

  // Symbol format: <tokenAddress>:<networkId>
  const symbol = `${tokenAddress}:${networkId}`;

  // Calculate time interval based on resolution
  let timeInterval: number;
  switch (resolution) {
    case "1D":
      timeInterval = 86400;
      break; // 1 day in seconds
    case "1W":
      timeInterval = 604800;
      break; // 1 week in seconds
    case "1M":
      timeInterval = 2592000;
      break; // 30 days in seconds (approximate)
    default:
      // For minute-based resolutions, convert to seconds
      timeInterval = parseInt(resolution) * 60;
  }

  // If the time range is less than 1000 intervals, fetch all in one request
  if (Math.floor((endTimestamp - startTimestamp) / timeInterval) <= 1000) {
    return fetchCodexBarsChunk(
      apiUrl,
      symbol,
      startTimestamp,
      endTimestamp,
      resolution,
      quoteToken,
      timeInterval,
      env,
    );
  } else {
    // Otherwise, fetch in chunks of 1000 intervals each
    const maxChunkSize = 1000 * timeInterval;
    let chunks: CandleData[] = [];
    let currentStart = startTimestamp;

    // Process each time chunk sequentially
    while (currentStart < endTimestamp) {
      const chunkEnd = Math.min(currentStart + maxChunkSize, endTimestamp);
      const barsChunk = await fetchCodexBarsChunk(
        apiUrl,
        symbol,
        currentStart,
        chunkEnd,
        resolution,
        quoteToken,
        timeInterval,
        env,
      ).catch((error) => {
        logger.error(
          `Error fetching chunk from ${new Date(currentStart * 1000).toISOString()} to ${new Date(chunkEnd * 1000).toISOString()}:`,
          error,
        );
        return [] as CandleData[]; // Return empty array for failed chunks
      });

      chunks = chunks.concat(barsChunk);
      currentStart = chunkEnd;
    }

    // Sort by time to ensure correct order
    chunks.sort((a, b) => a.time - b.time);

    return chunks;
  }
}

/**
 * Helper function to fetch a single chunk of bars data
 * @private
 */
async function fetchCodexBarsChunk(
  apiUrl: string,
  symbol: string,
  startTimestamp: number,
  endTimestamp: number,
  resolution: CodexBarResolution,
  quoteToken: string,
  timeInterval: number,
  env?: any,
): Promise<CandleData[]> {
  try {
    const query = `query {
      getBars(
        query: {
          symbol: "${symbol}",
          from: ${startTimestamp},
          to: ${endTimestamp},
          resolution: ${resolution}
        },
        quoteToken: "${quoteToken}"
      ) {
        o
        h
        l
        c
        v
        volume
      }
    }`;

    const response = await axios.post(
      apiUrl,
      { query, variables: {} },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: env?.CODEX_API_KEY || "",
        },
      },
    );

    const barsData = response.data.data.getBars as CodexBarsResponse;

    if (!barsData || !barsData.o || barsData.o.length === 0) {
      return [];
    }

    // Convert response arrays to our candle format
    const candleCount = barsData.o.length;
    const result: CandleData[] = [];

    // Create candles starting from the start timestamp
    let currentTime = startTimestamp;

    for (let i = 0; i < candleCount; i++) {
      result.push({
        open: barsData.o[i],
        high: barsData.h[i],
        low: barsData.l[i],
        close: barsData.c[i],
        volume: parseFloat(barsData.volume[i] || "0"),
        time: currentTime,
      });

      // Move to next candle timestamp
      currentTime += timeInterval;
    }

    return result;
  } catch (error) {
    logger.error(
      `Range too wide for resolution: ${resolution}, from ${new Date(startTimestamp * 1000).toISOString()} to ${new Date(endTimestamp * 1000).toISOString()}`,
    );
    throw error;
  }
}
