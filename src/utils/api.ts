import { ChartTable, IToken, TSortBy, TSortOrder } from "@/types";
import { QueryClient } from "@tanstack/react-query";
import { env } from "./env";
import { fetchWithAuth, GLOBAL_AUTH_STATE } from "@/hooks/use-authentication";

// Configure QueryClient with optimized defaults to prevent unnecessary fetches
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Disable automatic refetching to prefer WebSocket updates
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      // Only allow explicit calls to trigger fetches
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

const fetcher = async (
  endpoint: string,
  method: "GET" | "POST",
  body?: object,
) => {
  try {
    const response = await fetchWithAuth(`${env.apiUrl}${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    console.log(`API Request: ${method} ${env.apiUrl}${endpoint}`);

    if (!response.ok) {
      if (response.status === 401) {
        console.warn(`Authentication required for ${endpoint}`);
        throw new Error(
          "Authentication required. Please sign in to access this data.",
        );
      }

      const errorText = await response.text();
      console.error(`API Error (${response.status}): ${errorText}`);
      throw new Error(`${response.statusText}: ${errorText}`);
    }

    const result = await response.json();
    console.log(`API Response: ${endpoint} - Status: ${response.status}`);
    return result;
  } catch (error) {
    console.error(`API Request Failed: ${endpoint}`, error);
    throw error;
  }
};

export const getTokens = async ({
  page,
  limit,
  sortBy,
  sortOrder,
}: {
  page: number;
  limit: number;
  sortBy: TSortBy;
  sortOrder: TSortOrder;
}) => {
  console.log(`🔍 HTTP getTokens called with: page=${page}, limit=${limit}, sortBy=${sortBy}, sortOrder=${sortOrder}`);
  console.log(`⚠️ This should be handled by WebSocket when connected!`);
  
  // Print stack trace for debugging
  const stack = new Error().stack;
  if (stack) {
    const stackLines = stack.split('\n').slice(1, 5);
    console.log('📋 getTokens call stack:');
    stackLines.forEach(line => console.log(`   ${line.trim()}`));
  }
  
  // AGGRESSIVE BLOCKING: Check for WebSocket activity or connection
  // We need to determine if we should block this HTTP request
  const now = Date.now();
  const recentWebSocketActivity = GLOBAL_AUTH_STATE && 
                                 GLOBAL_AUTH_STATE.lastWebSocketActivity && 
                                 (now - GLOBAL_AUTH_STATE.lastWebSocketActivity < 30000); // 30 seconds

  const tokensReceivedViaWebSocket = GLOBAL_AUTH_STATE && GLOBAL_AUTH_STATE.tokensReceivedViaWebSocket;
  
  const inInitialPhase = GLOBAL_AUTH_STATE && 
                        (GLOBAL_AUTH_STATE.initialConnectionPhase || GLOBAL_AUTH_STATE.extendedInitialPhase);
  
  // Block if any of these conditions are true:
  // 1. We're in the initial/extended phase, or
  // 2. We've received tokens via WebSocket at any point, or
  // 3. There has been recent WebSocket activity
  if (recentWebSocketActivity || tokensReceivedViaWebSocket || inInitialPhase) {
    console.log(`🚫 Blocking HTTP getTokens request - WebSocket should handle this request`);
    
    // If tokens received via WebSocket, use that as a reason
    if (tokensReceivedViaWebSocket) {
      console.log(`  → Reason: Tokens already received via WebSocket`);
    }
    
    // If in initial phase, use that as a reason
    if (inInitialPhase) {
      console.log(`  → Reason: In initial/extended WebSocket connection phase`);
    }
    
    // If recent WebSocket activity, use that as a reason
    if (recentWebSocketActivity) {
      console.log(`  → Reason: Recent WebSocket activity (${Math.round((now - (GLOBAL_AUTH_STATE?.lastWebSocketActivity || 0))/1000)}s ago)`);
    }
    
    // Return empty placeholder data
    return {
      tokens: [],
      page: page,
      totalPages: 1,
      total: 0,
      hasMore: false,
      _loading: true,
      _isPlaceholder: true
    };
  }
  
  // If we get here, there's no WebSocket activity, so we'll allow the HTTP request
  console.log(`⚠️ Allowing HTTP getTokens request - NO RECENT WEBSOCKET ACTIVITY`);
  
  const data = (await fetcher(
    `/api/tokens?limit=${limit || 12}&page=${
      page || 1
    }&sortBy=${sortBy}&sortOrder=${sortOrder}`,
    "GET",
  )) as { tokens: IToken[] };

  console.log(`✅ getTokens HTTP request complete, received ${data?.tokens?.length || 0} tokens`);

  if (data?.tokens?.length > 0) {
    data?.tokens?.forEach((token: IToken) => {
      queryClient.setQueryData(["token", token.mint], token);
    });
  }

  return data;
};

export const getToken = async ({
  address,
  bypassCache = false,
}: {
  address: string;
  bypassCache?: boolean;
}) => {
  const endpoint = `/api/token/${address}`;

  try {
    console.log(
      `Fetching token data for ${address} (bypass_cache: ${bypassCache})`,
    );
    const rawData = await fetcher(endpoint, "GET");
    const data = rawData as Record<string, any>;

    const transformedData: IToken = {
      mint: data.mint,
      createdAt: data.createdAt,
      creator: data.creator,
      currentPrice: data.currentPrice != null ? Number(data.currentPrice) : 0,
      curveLimit: data.curveLimit != null ? Number(data.curveLimit) : 0,
      curveProgress:
        data.curveProgress != null ? Number(data.curveProgress) : 0,
      description: data.description || "",
      image: data.image || "",
      inferenceCount:
        data.inferenceCount != null ? Number(data.inferenceCount) : 0,
      lastUpdated: data.lastUpdated,
      liquidity: data.liquidity != null ? Number(data.liquidity) : 0,
      marketCapUSD: data.marketCapUSD != null ? Number(data.marketCapUSD) : 0,
      name: data.name,
      price24hAgo: data.price24hAgo != null ? Number(data.price24hAgo) : 0,
      priceChange24h:
        data.priceChange24h != null ? Number(data.priceChange24h) : 0,
      reserveAmount:
        data.reserveAmount != null ? Number(data.reserveAmount) : 0,
      reserveLamport:
        data.reserveLamport != null ? Number(data.reserveLamport) : 0,
      solPriceUSD: data.solPriceUSD != null ? Number(data.solPriceUSD) : 0,
      status: data.status || "active",
      telegram: data.telegram || "",
      ticker: data.ticker,
      tokenPriceUSD:
        data.tokenPriceUSD != null ? Number(data.tokenPriceUSD) : 0,
      twitter: data.twitter || "",
      txId: data.txId || "",
      url: data.url || "",
      discord: data?.discord,
      virtualReserves:
        data.virtualReserves != null ? Number(data.virtualReserves) : 0,
      volume24h: data.volume24h != null ? Number(data.volume24h) : 0,
      website: data.website || "",
      holderCount: data.holderCount != null ? Number(data.holderCount) : 0,
      lastPriceUpdate: data.lastPriceUpdate || data.lastUpdated,
      lastVolumeReset: data.lastVolumeReset || data.lastUpdated,
      hasAgent: Boolean(data.agentLink),
    };

    return transformedData;
  } catch (error) {
    console.error(`Error fetching token data: ${error}`);
    throw error;
  }
};

export const getTokenHolders = async ({
  address,
  bypassCache = false,
}: {
  address: string;
  bypassCache?: boolean;
}) => {
  try {
    const endpoint = `/api/token/${address}/holders`;
    console.log(
      `Fetching holders for ${address} (bypass_cache: ${bypassCache})`,
    );
    const data = await fetcher(endpoint, "GET");
    return data;
  } catch (error) {
    console.error(`Error fetching holders: ${error}`);
    return { holders: [], page: 1, totalPages: 0, total: 0 };
  }
};

export const refreshTokenHolders = async ({ address }: { address: string }) => {
  try {
    const data = await fetcher(`/api/token/${address}/refresh-holders`, "GET");
    return data;
  } catch (error) {
    console.error(`Error refreshing token holders: ${error}`);
    throw error;
  }
};

export const getTokenSwapHistory = async ({
  address,
  bypassCache = false,
}: {
  address: string;
  bypassCache?: boolean;
}) => {
  try {
    const endpoint = `/api/swaps/${address}`;
    console.log(`Fetching swaps for ${address} (bypass_cache: ${bypassCache})`);
    const data = await fetcher(endpoint, "GET");
    return data;
  } catch (error) {
    console.error(`Error fetching swaps: ${error}`);
    return { swaps: [], page: 1, totalPages: 0, total: 0 };
  }
};

export const getSearchTokens = async ({ search }: { search: string }) => {
  const data = await fetcher(`/api/tokens?search=${search}`, "GET");
  return data;
};

export const getChartTable = async ({
  pairIndex,
  from,
  to,
  range,
  token,
}: {
  pairIndex: number;
  from: number;
  to: number;
  range: number;
  token: string;
}): Promise<ChartTable | undefined> => {
  try {
    const res = await fetcher(
      `/api/chart/${pairIndex}/${from}/${to}/${range}/${token}`,
      "GET",
    );

    return res as ChartTable;
  } catch (err) {
    console.error(err);
    return undefined;
  }
};
