import { ChartTable, IToken, TSortBy, TSortOrder } from "@/types";
import { QueryClient } from "@tanstack/react-query";
import { env } from "./env";

export const queryClient = new QueryClient();

const fetcher = async (
  endpoint: string,
  method: "GET" | "POST",
  body?: object,
) => {
  const query: { method: string; body?: string; headers: object; credentials: RequestCredentials } = {
    method,
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
    },
    credentials: 'include', // Include credentials (cookies) with every request
  };

  if (body) {
    query.body = JSON.stringify(body);
  }

  const response = await fetch(`${env.apiUrl}${endpoint}`, query as object);

  if (!response.ok) {
    throw new Error(response.statusText);
  }

  return await response.json();
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

export const getToken = async ({ address }: { address: string }) => {
  const rawData = await fetcher(`/api/tokens/${address}`, "GET");
  const data = rawData as Record<string, any>;

  // Transform empty strings to null for optional fields
  const transformedData: IToken = {
    mint: data.mint,
    createdAt: data.createdAt,
    creator: data.creator,
    currentPrice: data.currentPrice != null ? Number(data.currentPrice) : 0,
    curveLimit: data.curveLimit != null ? Number(data.curveLimit) : 0,
    curveProgress: data.curveProgress != null ? Number(data.curveProgress) : 0,
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
    reserveAmount: data.reserveAmount != null ? Number(data.reserveAmount) : 0,
    reserveLamport:
      data.reserveLamport != null ? Number(data.reserveLamport) : 0,
    solPriceUSD: data.solPriceUSD != null ? Number(data.solPriceUSD) : 0,
    status: data.status || "active",
    telegram: data.telegram || "",
    ticker: data.ticker,
    tokenPriceUSD: data.tokenPriceUSD != null ? Number(data.tokenPriceUSD) : 0,
    twitter: data.twitter || "",
    txId: data.txId || "",
    url: data.url || "",
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
};

export const getTokenHolders = async ({ address }: { address: string }) => {
  const data = await fetcher(`/api/tokens/${address}/holders`, "GET");
  return data;
};
export const getTokenSwapHistory = async ({ address }: { address: string }) => {
  const data = await fetcher(`/api/swaps/${address}`, "GET");
  return data;
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
    // console.log("GET bars", token, from, to, range, pairIndex)
    const res = await fetcher(
      `/api/chart/${pairIndex}/${from}/${to}/${range}/${token}`,
      "GET",
    );

    return res as ChartTable;
  } catch (err) {
    console.log("tradingchart === getch data error", err);
    return undefined;
  }
};

export const removeTokenFromWallet = async (mintAddress: string) => {
  try {
    const response = await fetch(`${env.apiUrl}/api/tokens/${mintAddress}/remove-from-wallet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include' // Important for auth cookies
    });

    if (!response.ok) {
      throw new Error(`Failed to remove token from wallet: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error removing token from wallet:', error);
    throw error;
  }
};
