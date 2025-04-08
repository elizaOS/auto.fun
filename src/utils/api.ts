import { ChartTable } from "@/types";
import { QueryClient } from "@tanstack/react-query";
import { env } from "./env";
import { fetchWithAuth } from "@/hooks/use-authentication";
import { HomepageTokenSchema } from "@/hooks/use-tokens";

export const queryClient = new QueryClient();

export const fetcher = async (
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
    const transformedData = HomepageTokenSchema.parse(data);

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

export const getTokenSwapHistory = async ({ address }: { address: string }) => {
  try {
    const endpoint = `/api/swaps/${address}`;
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

export const getMaintenanceMode = async () => {
  return await fetcher("/maintenance-mode", "GET");
};
