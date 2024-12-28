import { createQuery } from "react-query-kit";
import { womboApi } from "./fetch";
import { z } from "zod";
import { usePaginatedLiveData } from "./paginatedLiveData";
import { TokenSchema } from "./tokenSchema";

export type Token = z.infer<typeof TokenSchema>;

export const useTokens = () => {
  return usePaginatedLiveData({
    itemsPerPage: 30,
    maxPages: 4,
    endpoint: "/tokens",
    validationSchema: TokenSchema,
    getUniqueId: (token) => token.mint,
    socketConfig: {
      subscribeEvent: "subscribeGlobal",
      newDataEvent: "newToken",
    },
  });
};

export const useToken = createQuery({
  queryKey: ["tokens"],
  fetcher: async (mint: string) => {
    const token = await womboApi.get({
      endpoint: `/tokens/${mint}`,
      schema: TokenSchema,
    });

    return token;
  },
});
