import { useQuery, useQueryClient } from "@tanstack/react-query";
import { env } from "@/utils/env";
import { useEffect, useRef } from "react";
import { WebSocketEvent, useWebSocket } from "./use-websocket";

interface SolPriceResponse {
  price: number;
}

interface CoinGeckoResponse {
  solana: {
    usd: number;
  };
}

interface BinanceResponse {
  price: string;
}

// Global cache for SOL price to reduce redundant fetches
const GLOBAL_SOL_PRICE_STATE = {
  // Last WebSocket update timestamp
  lastWebSocketUpdate: 0,
  // Cooldown period (5 minutes) before allowing HTTP fallback when WS is connected
  WS_COOLDOWN_PERIOD: 5 * 60 * 1000,
  // Last fetched price
  cachedPrice: null as number | null,
  // Last fetch timestamp
  lastFetchTime: 0,
  // Cache validity period (2 minutes)
  CACHE_VALIDITY: 2 * 60 * 1000,
  // Flag to indicate if we're in the initial application load
  isInitialLoad: true,
  // Default fallback price if all else fails
  DEFAULT_PRICE: 135.0,
};

/**
 * Fetches the current SOL price in USD via HTTP
 * Only used as a fallback when WebSocket is not available
 */
const fetchSolPrice = async (): Promise<number> => {
  // Use cached price if it's still valid
  const now = Date.now();
  if (GLOBAL_SOL_PRICE_STATE.cachedPrice !== null && 
      now - GLOBAL_SOL_PRICE_STATE.lastFetchTime < GLOBAL_SOL_PRICE_STATE.CACHE_VALIDITY) {
    console.log("Using cached SOL price:", GLOBAL_SOL_PRICE_STATE.cachedPrice);
    return GLOBAL_SOL_PRICE_STATE.cachedPrice;
  }
  
  // If this is the initial load, use default price and wait for WebSocket
  if (GLOBAL_SOL_PRICE_STATE.isInitialLoad) {
    console.log("Initial app load - skipping HTTP fetch and using default price while WebSocket connects");
    return GLOBAL_SOL_PRICE_STATE.DEFAULT_PRICE;
  }
  
  console.log("Fetching fresh SOL price via HTTP...");
  try {
    // First try the backend API endpoint
    try {
      const response = await fetch(`${env.apiUrl}/api/sol-price`);
      if (response.ok) {
        const data = (await response.json()) as SolPriceResponse;
        if (data && data.price) {
          const price = Number(data.price);
          // Update global cache
          GLOBAL_SOL_PRICE_STATE.cachedPrice = price;
          GLOBAL_SOL_PRICE_STATE.lastFetchTime = now;
          return price;
        }
      }
    } catch (error) {
      console.error("Error fetching SOL price from API:", error);
    }

    // If API fails, try CoinGecko
    try {
      const response = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      );
      const data = (await response.json()) as CoinGeckoResponse;
      if (data && data.solana && data.solana.usd) {
        const price = Number(data.solana.usd);
        // Update global cache
        GLOBAL_SOL_PRICE_STATE.cachedPrice = price;
        GLOBAL_SOL_PRICE_STATE.lastFetchTime = now;
        return price;
      }
    } catch (error) {
      console.error("Error fetching SOL price from CoinGecko:", error);
    }

    // If CoinGecko fails, try Binance
    try {
      const response = await fetch(
        "https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT",
      );
      const data = (await response.json()) as BinanceResponse;
      if (data && data.price) {
        const price = Number(data.price);
        // Update global cache
        GLOBAL_SOL_PRICE_STATE.cachedPrice = price;
        GLOBAL_SOL_PRICE_STATE.lastFetchTime = now;
        return price;
      }
    } catch (error) {
      console.error("Error fetching SOL price from Binance:", error);
    }

    // Fallback to a default value if all else fails
    return GLOBAL_SOL_PRICE_STATE.DEFAULT_PRICE;
  } catch (error) {
    console.error("Error fetching SOL price:", error);
    return GLOBAL_SOL_PRICE_STATE.DEFAULT_PRICE; // Fallback price
  }
};

/**
 * React hook to get and cache the current SOL price in USD
 * Prioritizes WebSocket for real-time updates, with HTTP requests as fallback
 */
export function useSolPrice() {
  const queryClient = useQueryClient();
  const { 
    subscribeToGlobal, 
    addEventListener, 
    connected, 
    requestSolPrice,
    getLastSolPrice 
  } = useWebSocket();
  
  // Track if we've received a WebSocket update in this component instance
  const receivedWebSocketUpdate = useRef(false);
  
  // Reference to track periodic price requests
  const requestIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Clear any existing interval on unmount
  useEffect(() => {
    return () => {
      if (requestIntervalRef.current) {
        clearInterval(requestIntervalRef.current);
        requestIntervalRef.current = null;
      }
    };
  }, []);
  
  // Mark that we're no longer in initial load after first render
  useEffect(() => {
    // Short timeout to allow WebSocket to connect before marking init complete
    const timeoutId = setTimeout(() => {
      GLOBAL_SOL_PRICE_STATE.isInitialLoad = false;
    }, 1000);
    
    return () => clearTimeout(timeoutId);
  }, []);
  
  const query = useQuery({
    queryKey: ["solPrice"],
    queryFn: async () => {
      // First, try to get price from WebSocket if connected
      if (connected) {
        console.log("SOL Price: WebSocket connected, trying to get price via WebSocket");
        
        // Check for last known price from WebSocket
        const cachedWsPrice = getLastSolPrice();
        if (cachedWsPrice !== null) {
          console.log("SOL Price: Using last known WebSocket price:", cachedWsPrice);
          // Update our global cache
          GLOBAL_SOL_PRICE_STATE.cachedPrice = cachedWsPrice;
          GLOBAL_SOL_PRICE_STATE.lastFetchTime = Date.now();
          GLOBAL_SOL_PRICE_STATE.lastWebSocketUpdate = Date.now();
          return cachedWsPrice;
        }
        
        // Request a fresh price update via WebSocket
        console.log("SOL Price: Requesting fresh price via WebSocket");
        const wsPrice = requestSolPrice();
        
        // If we got a price immediately, use it
        if (wsPrice !== null) {
          console.log("SOL Price: Got immediate response from WebSocket:", wsPrice);
          // Update our global cache
          GLOBAL_SOL_PRICE_STATE.cachedPrice = wsPrice;
          GLOBAL_SOL_PRICE_STATE.lastFetchTime = Date.now();
          GLOBAL_SOL_PRICE_STATE.lastWebSocketUpdate = Date.now();
          return wsPrice;
        }
        
        // If WebSocket is connected but we don't have a price yet,
        // wait briefly for a response before falling back to HTTP
        const wsTimeout = 1000; // 1 second timeout
        console.log(`SOL Price: Waiting up to ${wsTimeout}ms for WebSocket response...`);
        
        try {
          const price = await new Promise<number>((resolve, reject) => {
            // Set timeout for fallback
            const timeoutId = setTimeout(() => {
              reject(new Error("WebSocket SOL price request timed out"));
            }, wsTimeout);
            
            // Set up one-time listener for SOL price update
            const unsubscribe = addEventListener<{price: number}>("solPriceUpdate", (data) => {
              if (data && data.price) {
                clearTimeout(timeoutId);
                unsubscribe();
                resolve(data.price);
              }
            });
          });
          
          console.log("SOL Price: Successfully received price via WebSocket:", price);
          // Update our global cache
          GLOBAL_SOL_PRICE_STATE.cachedPrice = price;
          GLOBAL_SOL_PRICE_STATE.lastFetchTime = Date.now();
          GLOBAL_SOL_PRICE_STATE.lastWebSocketUpdate = Date.now();
          receivedWebSocketUpdate.current = true;
          return price;
        } catch (error) {
          console.log("SOL Price: WebSocket request timed out, falling back to HTTP");
          // Continue to HTTP fallback
        }
      }
      
      // Early return with default price during initial load
      if (GLOBAL_SOL_PRICE_STATE.isInitialLoad) {
        console.log("Initial app load - returning default price while waiting for WebSocket");
        return GLOBAL_SOL_PRICE_STATE.DEFAULT_PRICE;
      }
      
      // If WebSocket isn't connected or timed out, use HTTP
      // Skip HTTP fetch if we have a recent WebSocket update
      const now = Date.now();
      if (connected && 
          now - GLOBAL_SOL_PRICE_STATE.lastWebSocketUpdate < GLOBAL_SOL_PRICE_STATE.WS_COOLDOWN_PERIOD) {
        console.log("SOL Price: Recent WebSocket update available, skipping HTTP fetch");
        
        // If we have a cached price, use it
        if (GLOBAL_SOL_PRICE_STATE.cachedPrice !== null) {
          return GLOBAL_SOL_PRICE_STATE.cachedPrice;
        }
      }
      
      // Finally, fall back to HTTP request
      return fetchSolPrice();
    },
    // Disable initial data fetch if we're still in the initial load phase
    enabled: !GLOBAL_SOL_PRICE_STATE.isInitialLoad || connected,
    // Much longer stale time with WebSocket updates
    staleTime: Infinity, // Never consider stale with WebSocket updates
    // Only poll when definitely not using WebSocket
    refetchInterval: connected ? false : 3 * 60 * 1000, // 3 minutes if no WebSocket
    // Disable automatic refetch triggers to rely primarily on WebSocket
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
  
  useEffect(() => {
    console.log("SOL Price: Setting up WebSocket listeners, connected:", connected);
    
    // Subscribe to global events which include SOL price updates
    subscribeToGlobal();
    
    // Set up event listener for SOL price updates
    const unsubscribe = addEventListener<{ price: number }>("solPriceUpdate", (data) => {
      if (data && data.price) {
        const price = Number(data.price);
        console.log("SOL Price: Received SOL price update via WebSocket:", price);
        
        // Update the React Query cache
        queryClient.setQueryData(["solPrice"], price);
        
        // Update the global state
        GLOBAL_SOL_PRICE_STATE.cachedPrice = price;
        GLOBAL_SOL_PRICE_STATE.lastFetchTime = Date.now();
        GLOBAL_SOL_PRICE_STATE.lastWebSocketUpdate = Date.now();
        
        // Mark that we've received a WebSocket update
        receivedWebSocketUpdate.current = true;
      }
    });
    
    return () => {
      console.log("SOL Price: Cleaning up WebSocket listeners");
      unsubscribe();
    };
  }, [addEventListener, queryClient, subscribeToGlobal, connected]);
  
  // Set up periodic price requests via WebSocket when connected
  useEffect(() => {
    if (connected) {
      console.log("SOL Price: WebSocket connected, setting up periodic price requests");
      
      // Request initial price immediately
      requestSolPrice();
      console.log("SOL Price: Initial price request sent");
      
      // Set up periodic requests at shorter interval
      // This ensures we always have fresh data even if server broadcasts are missed
      if (requestIntervalRef.current) {
        // Clear any existing interval to avoid duplicates
        clearInterval(requestIntervalRef.current);
        requestIntervalRef.current = null;
      }
      
      // Create new interval with shorter time
      requestIntervalRef.current = setInterval(() => {
        console.log("SOL Price: Periodic WebSocket price request");
        const requested = requestSolPrice();
        console.log(`SOL Price: Request sent successfully: ${requested}`);
      }, 30 * 1000); // 30 seconds instead of 2 minutes
      
      // Also request a price update whenever the component rerenders while connected
      const timeoutId = setTimeout(() => {
        requestSolPrice();
        console.log("SOL Price: Delayed followup request sent");
      }, 5000); // Request again after 5 seconds to ensure we get a response
      
      return () => {
        // Clean up interval and timeout when disconnected or unmounted
        if (requestIntervalRef.current) {
          clearInterval(requestIntervalRef.current);
          requestIntervalRef.current = null;
        }
        clearTimeout(timeoutId);
      };
    } else {
      console.log("SOL Price: WebSocket disconnected, relying on HTTP fallback");
      // Clean up any existing interval
      if (requestIntervalRef.current) {
        clearInterval(requestIntervalRef.current);
        requestIntervalRef.current = null;
      }
    }
  }, [connected, requestSolPrice]);
  
  return query;
}
