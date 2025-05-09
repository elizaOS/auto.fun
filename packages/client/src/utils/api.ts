import { fetchWithAuth } from "@/hooks/use-authentication";
import { ChartTable } from "@/types";
import { QueryClient } from "@tanstack/react-query";
import { env } from "./env";

export const queryClient = new QueryClient();

export const fetcher = async (
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
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
    return result;
  } catch (error) {
    console.error(`API Request Failed: ${endpoint}`, error);
    throw error;
  }
};

export const getToken = async ({
  address,
  signature,
}: {
  address: string;
  signature?: string;
}) => {
  const endpoint = `/api/token/${address}${signature ? `?signature=${signature}` : ""}`;

  try {
    const rawData = await fetcher(endpoint, "GET");
    // TODO - Figure out why this broke
    // const data = rawData as Record<string, any>;
    // const transformedData = HomepageTokenSchema.parse(data);
    return rawData;
  } catch (error) {
    console.error(`Error fetching token data: ${error}`);
    throw error;
  }
};

export const getSearchTokens = async ({ search }: { search: string }) => {
  // Normalize search term to ensure consistent caching
  const normalizedSearch = search.trim().toLowerCase();
  const data = await fetcher(`/api/tokens?search=${normalizedSearch}`, "GET");
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
    const res = (await fetcher(
      `/api/chart/${pairIndex}/${from}/${to}/${range}/${token}`,
      "GET",
    )) as ChartTable;

    const tableData = res.table.filter(
      (a) =>
        a.close !== null &&
        a.high !== null &&
        a.low !== null &&
        a.open !== null,
    );

    return { table: tableData } as ChartTable;
  } catch (err) {
    console.error(err);
    return undefined;
  }
};

export const getSwaps = async ({ address }: { address: string }) => {
  const endpoint = `/api/swaps/${address}`;
  return await fetcher(endpoint, "GET");
};

export const getHolders = async ({ address }: { address: string }) => {
  const endpoint = `/api/token/${address}/holders`;
  return await fetcher(endpoint, "GET");
};
