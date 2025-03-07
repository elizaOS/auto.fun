import axios from 'axios';
import { logger } from '../../logger';

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
 * @param tokenAddress Token address to fetch events for (defaults to hardcoded value for development)
 * @param startTimestamp Start timestamp in seconds
 * @param endTimestamp End timestamp in seconds
 * @param networkId Network ID (default: 1399811149 for Solana)
 * @returns Array of token events
 */
export async function fetchCodexTokenEvents(
  tokenAddress: string = "ANNTWQsQ9J3PeM6dXLjdzwYcSzr51RREWQnjuuCEpump",
  startTimestamp: number,
  endTimestamp: number,
  networkId: number = 1399811149
): Promise<CodexTokenEvent[]> {
  const apiUrl = 'https://graph.codex.io/graphql';
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
    }`;

    try {
      const response = await axios.post(
        apiUrl,
        { query, variables: {} },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': process.env.CODEX_API_KEY || ''
          }
        }
      );

      const { items, cursor: newCursor } = response.data.data.getTokenEvents;
      allItems = allItems.concat(items);
      cursor = newCursor;
    } catch (error) {
      logger.error('Error fetching data from Codex API:', error);
      throw error;
    }
  } while (cursor);

  return allItems;
}

/**
 * Fetches current token price and market data from Codex API
 * @param tokenAddress Token address to fetch price for (defaults to hardcoded value for development)
 * @param networkId Network ID (default: 1399811149 for Solana)
 * @returns Object with current price and market data
 */
export async function fetchCodexTokenPrice(
  tokenAddress: string = "ANNTWQsQ9J3PeM6dXLjdzwYcSzr51RREWQnjuuCEpump", 
  networkId: number = 1399811149
): Promise<{
  currentPrice: number;
  priceUsd: number;
  volume24h: number;
  liquidity: number;
  marketCap: number;
}> {
  const apiUrl = 'https://graph.codex.io/graphql';
  
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
          'Content-Type': 'application/json',
          'Authorization': process.env.CODEX_API_KEY || ''
        }
      }
    );

    const token = response.data.data.getTokens.items[0];
    
    if (!token) {
      throw new Error(`Token ${tokenAddress} not found in Codex API`);
    }

    return {
      currentPrice: parseFloat(token.price || '0'),
      priceUsd: parseFloat(token.priceUsd || '0'),
      volume24h: parseFloat(token.volume24h || '0'),
      liquidity: parseFloat(token.liquidity || '0'),
      marketCap: parseFloat(token.totalMarketCap || '0')
    };
  } catch (error) {
    logger.error(`Error fetching token price from Codex API for ${tokenAddress}:`, error);
    throw error;
  }
}

/**
 * Converts Codex token events to price feed format
 * @param events Array of Codex token events
 * @returns Array of price feed objects
 */
export function convertCodexEventsToPriceFeed(events: CodexTokenEvent[]): Array<{
  price: number;
  timestamp: Date;
  volume: number;
}> {
  return events.map(item => ({
    price: parseFloat(item.token1PoolValueUsd),
    timestamp: new Date(item.timestamp * 1000),
    volume: parseFloat(item.data.amount0 || '0')
  }));
}

/**
 * Resolution type for Codex getBars API
 * Possible values: '1', '5', '15', '30', '60', '240', '720', '1D', '1W', '1M'
 */
export type CodexBarResolution = '1' | '5' | '15' | '30' | '60' | '240' | '720' | '1D' | '1W' | '1M';

/**
 * Response structure for Codex getBars API
 */
export interface CodexBarsResponse {
  o: number[];  // Open prices
  h: number[];  // High prices
  l: number[];  // Low prices
  c: number[];  // Close prices
  v: number[];  // Volume
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
 * @returns Processed candle data in our application's format
 */
export async function fetchCodexBars(
  tokenAddress: string = "ANNTWQsQ9J3PeM6dXLjdzwYcSzr51RREWQnjuuCEpump",
  startTimestamp: number,
  endTimestamp: number,
  resolution: CodexBarResolution = '1',
  networkId: number = 1399811149,
  quoteToken: string = 'token1'
): Promise<CandleData[]> {
  const apiUrl = 'https://graph.codex.io/graphql';
  
  // Symbol format: <tokenAddress>:<networkId>
  const symbol = `${tokenAddress}:${networkId}`;

  // Calculate time interval based on resolution
  let timeInterval: number;
  switch (resolution) {
    case '1D': timeInterval = 86400; break; // 1 day in seconds
    case '1W': timeInterval = 604800; break; // 1 week in seconds
    case '1M': timeInterval = 2592000; break; // 30 days in seconds (approximate)
    default: 
      // For minute-based resolutions, convert to seconds
      timeInterval = parseInt(resolution) * 60;
  }

  // Calculate max data points and chunk size to avoid API limits
  const MAX_DATA_POINTS = 1400; // Slightly under Codex limit of 1500
  const totalPoints = Math.ceil((endTimestamp - startTimestamp) / timeInterval);
  
  if (totalPoints <= MAX_DATA_POINTS) {
    // If under limit, fetch in a single request
    return fetchCodexBarsChunk(apiUrl, symbol, startTimestamp, endTimestamp, resolution, quoteToken, timeInterval);
  } else {
    // Split into multiple requests to stay within limits
    logger.log(`Splitting Codex request into chunks (${totalPoints} points requested, max ${MAX_DATA_POINTS} per request)`);
    
    const chunkSize = MAX_DATA_POINTS * timeInterval;
    const chunkPromises: Promise<CandleData[]>[] = [];
    
    // Create an array of chunk requests to run in parallel
    for (let chunkStart = startTimestamp; chunkStart < endTimestamp; chunkStart += chunkSize) {
      const chunkEnd = Math.min(chunkStart + chunkSize, endTimestamp);
      
      // Create a promise that handles its own errors
      const chunkPromise = fetchCodexBarsChunk(
        apiUrl, 
        symbol, 
        chunkStart, 
        chunkEnd, 
        resolution, 
        quoteToken, 
        timeInterval
      ).catch(error => {
        logger.error(`Error fetching chunk from ${new Date(chunkStart * 1000).toISOString()} to ${new Date(chunkEnd * 1000).toISOString()}:`, error);
        return [] as CandleData[]; // Return empty array for failed chunks
      });
      
      chunkPromises.push(chunkPromise);
    }
    
    // Run all chunk requests in parallel
    const chunksResults = await Promise.all(chunkPromises);
    
    // Flatten the results
    const allResults = chunksResults.flat();
    
    // Sort by time to ensure correct order
    allResults.sort((a, b) => a.time - b.time);
    
    return allResults;
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
  timeInterval: number
): Promise<CandleData[]> {
  const query = `query {
    getBars(
      symbol: "${symbol}"
      from: ${Math.floor(startTimestamp)}
      to: ${Math.floor(endTimestamp)}
      resolution: "${resolution}"
      quoteToken: ${quoteToken}
    ) {
      o
      h
      l
      c
      v
      volume
    }
  }`;

  try {
    const response = await axios.post(
      apiUrl,
      { query, variables: {} },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': process.env.CODEX_API_KEY || ''
        }
      }
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
        volume: parseFloat(barsData.volume[i] || '0'),
        time: currentTime
      });
      
      // Move to next candle timestamp
      currentTime += timeInterval;
    }
    
    return result;
  } catch (error) {
    // Check for specific error about too wide range
    if (error.response?.data?.errors?.[0]?.message?.includes('Too wide of range for given resolution')) {
      logger.error(`Range too wide for resolution: ${resolution}, from ${new Date(startTimestamp * 1000).toISOString()} to ${new Date(endTimestamp * 1000).toISOString()}`);
    }
    throw error;
  }
}
