import { IToken, TSortBy, TSortOrder } from "@/types";
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient();

// Determine the API URL with proper fallbacks
const hostname = window.location.hostname;

// Set API URL based on the current hostname
let apiUrl = import.meta.env.VITE_API_URL;

// If no environment variable is set, infer from the current hostname
if (!apiUrl) {
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    // Local development
    apiUrl = "http://localhost:8787";
  } else if (hostname === "autofun.pages.dev" || hostname.includes("autofun")) {
    // Production
    apiUrl = "https://api.autofun.pages.dev";
  } else if (
    hostname === "autofun-dev.pages.dev" ||
    hostname.includes("autofun-dev")
  ) {
    // Development/staging
    apiUrl = "https://api-dev.autofun.pages.dev";
  } else {
    // Default fallback - production
    apiUrl = "https://api.autofun.pages.dev";
  }
}
const BASE_URL = apiUrl;

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
