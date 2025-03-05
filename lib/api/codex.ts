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