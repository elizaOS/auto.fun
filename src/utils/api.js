import { QueryClient } from "@tanstack/react-query";
export const queryClient = new QueryClient();
const BASE_URL = import.meta.env.VITE_API_URL || "https://dev-api.auto.fun";
export const HELIUS_RPC_URL = import.meta.env.VITE_RPC_URL;
const fetcher = async (endpoint, method, body) => {
    const query = {
        method,
        headers: {
            accept: "application/json",
        },
    };
    if (body) {
        query.body = JSON.stringify(body);
    }
    const response = await fetch(`${BASE_URL}${endpoint}`, query);
    if (!response.ok) {
        throw new Error(response.statusText);
    }
    return await response.json();
};
export const getTokens = async ({ page, limit, sortBy, sortOrder, }) => {
    const data = await fetcher(`/api/tokens?limit=${limit || 12}&page=${page || 1}&sortBy=${sortBy}&sortOrder=${sortOrder}`, "GET");
    if (data?.tokens?.length > 0) {
        data?.tokens?.forEach((token) => {
            queryClient.setQueryData(["token", token.mint], token);
        });
    }
    return data;
};
export const getToken = async ({ address }) => {
    const data = await fetcher(`/api/tokens/${address}`, "GET");
    return data;
};
