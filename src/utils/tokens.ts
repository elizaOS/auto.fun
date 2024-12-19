import { createQuery } from "react-query-kit";
import { womboApi } from "./fetch";
import { z } from "zod";
import { useEffect } from "react";
import { io, Socket } from "socket.io-client";
import { CONTRACT_API_URL } from "./env";
import { useQueryClient } from "@tanstack/react-query";
import { usePaginatedLiveData } from "./paginatedLiveData";

const TokenSchema = z.object({
  name: z.string(),
  url: z.string(),
  ticker: z.string(),
  createdAt: z.string().datetime(),
  mint: z.string(),
  image: z.string().optional(),
  website: z.string().optional(),
});

export const useTokens = (socket: Socket) => {
  return usePaginatedLiveData({
    itemsPerPage: 30,
    maxPages: 4,
    endpoint: "/tokens",
    socket,
    validationSchema: TokenSchema,
    getUniqueId: (token) => token.mint,
    socketConfig: {
      subscribeEvent: "subscribeGlobal",
      newDataEvent: "newToken",
    },
  });
};

const useTokenQuery = createQuery({
  queryKey: ["tokens"],
  fetcher: async (mint: string) => {
    const token = await womboApi.contract.get({
      endpoint: `/tokens/${mint}`,
      schema: TokenSchema,
    });

    return token;
  },
});

export const useToken = (mint: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = io(CONTRACT_API_URL);
    socket.emit("subscribeToken", mint);

    socket.on("newCandle", () => {
      queryClient.setQueryData(useTokenQuery.getKey(), (oldData) => {
        // TODO: update the token with the new candle data
        return oldData;
      });
    });
  }, [mint, queryClient]);

  return useTokenQuery({ variables: mint });
};
