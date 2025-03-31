import { ChartTable, IToken, TSortBy, TSortOrder } from "@/types";
import { QueryClient } from "@tanstack/react-query";
import { env } from "./env";

export const queryClient = new QueryClient();

const fetcher = async (
  endpoint: string,
  method: "GET" | "POST",
  body?: object,
) => {
  try {
    const query: {
      method: string;
      body?: string;
      headers: object;
      credentials: RequestCredentials;
    } = {
      method,
      headers: {
        accept: "application/json",
      },
      credentials: "include",
    };

    if (body) {
      query.body = JSON.stringify(body);
    }

    console.log(`API Request: ${method} ${env.apiUrl}${endpoint}`);
    const response = await fetch(`${env.apiUrl}${endpoint}`, query as object);

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

export const runCron = () => {
  if (!import.meta.env.DEV) throw new Error('Cannot manually trigger crons in production')

  return fetcher('/api/dev/run-cron', 'GET')
}

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
  const data = (await fetcher(
    `/api/tokens?limit=${limit || 12}&page=${
      page || 1
    }&sortBy=${sortBy}&sortOrder=${sortOrder}`,
    "GET",
  )) as { tokens: IToken[] };

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
