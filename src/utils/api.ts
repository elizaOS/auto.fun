import { IToken, TSortBy, TSortOrder } from "@/types";
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient();

const BASE_URL = import.meta.env.API_URL;

const fetcher = async (
  endpoint: string,
  method: "GET" | "POST",
  body?: object
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
  const data = await fetcher(
    `/api/tokens?limit=${limit || 12}&page=${
      page || 1
    }&sortBy=${sortBy}&sortOrder=${sortOrder}`,
    "GET"
  ) as { tokens: IToken[] };

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