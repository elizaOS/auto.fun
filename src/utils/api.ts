import { IToken, TSortBy, TSortOrder } from "@/types";
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient();

const BASE_URL = "https://dev-api.auto.fun";
export const HELIUS_RPC_URL = import.meta.env.VITE_RPC_URL;

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
    `/tokens?limit=${limit || 12}&page=${
      page || 1
    }&sortBy=${sortBy}&sortOrder=${sortOrder}`,
    "GET"
  );

  if (data?.tokens?.length > 0) {
    data?.tokens?.forEach((token: IToken) => {
      queryClient.setQueryData(["token", token.mint], token);
    });
  }

  return data;
};

export const getToken = async ({ address }: { address: string }) => {
  const data = await fetcher(`/tokens/${address}`, "GET");

  return data;
};

export const optimizePinataImage = (
  image: string,
  height: number,
  width: number
) => {
  if (!image?.includes("pinata")) return image;

  const url = new URL(
    image?.replace("gateway.pinata.cloud", "ser.mypinata.cloud")
  );

  url.searchParams.set("img-width", String(height));
  url.searchParams.set("img-height", String(width));
  url.searchParams.set("img-format", "webp");
  url.searchParams.set("img-quality", "90");

  return String(url);
};
