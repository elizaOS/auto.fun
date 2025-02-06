import { createMutation, createQuery } from "react-query-kit";
import { womboApi } from "./fetch";
import { z } from "zod";
import { usePaginatedLiveData } from "./paginatedLiveData";
import { TokenSchema } from "./tokenSchema";

export type Token = z.infer<typeof TokenSchema>;
const HomepageTokenSchema = TokenSchema.and(
  z.object({ numComments: z.number() }),
);

export const useTokens = () => {
  return usePaginatedLiveData({
    itemsPerPage: 10,
    endpoint: "/tokens",
    validationSchema: HomepageTokenSchema,
    getUniqueId: (token) => token.mint,
    socketConfig: {
      subscribeEvent: "subscribeGlobal",
      newDataEvent: "newToken",
    },
  });
};

export const useSearchTokens = createMutation({
  mutationKey: ["search-tokens"],
  mutationFn: async (search: string) => {
    const tokens = await womboApi.get({
      endpoint: `/tokens?search=${search}`,
      schema: z.object({ tokens: TokenSchema.array() }),
    });

    return tokens;
  },
});

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
