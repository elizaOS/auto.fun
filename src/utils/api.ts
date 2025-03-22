import { IToken, TSortBy, TSortOrder } from "@/types";
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient();

// Log the environment variables to help with debugging
console.log("VITE_API_URL:", import.meta.env.VITE_API_URL);
console.log("MODE:", import.meta.env.MODE);
console.log("DEV:", import.meta.env.DEV);
console.log("PROD:", import.meta.env.PROD);

// Determine the API URL with proper fallbacks
let apiUrl = import.meta.env.VITE_API_URL;

// If no API URL is provided, use environment-specific defaults
if (!apiUrl) {
  if (import.meta.env.PROD) {
    apiUrl = "https://api.autofun.pages.dev";
  } else {
    apiUrl = "https://api-dev.autofun.pages.dev";
  }
}

// For local development, uncomment to override:
// apiUrl = "http://localhost:8787";

const BASE_URL = apiUrl;
export const HELIUS_RPC_URL = import.meta.env.VITE_RPC_URL;

const fetcher = async (
  endpoint: string,
  method: "GET" | "POST",
  body?: object,
) => {
  const query: { method: string; body?: string; headers: object } = {
    method,
    headers: {
      accept: "application/json",
    },
  };

  if (body) {
    query.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, query as object);

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
  const data = await fetcher(`/api/tokens/${address}`, "GET");

  return data;
};
