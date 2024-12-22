import { createQuery } from "react-query-kit";
import { womboApi } from "./fetch";
import { z } from "zod";
import { usePaginatedLiveData } from "./paginatedLiveData";

const TokenSchema = z.object({
  name: z.string(),
  url: z.string(),
  ticker: z.string(),
  createdAt: z.string().datetime(),
  mint: z.string(),
  image: z.string(),
  xurl: z.string(),
  xname: z.string(),
  xtext: z.string(),
  xusername: z.string(),
  marketCapUSD: z.number(),
  currentPrice: z.number(),
  curveProgress: z.number(),
  status: z.enum([
    "active",
    "withdrawn",
    "migrating",
    "migrated",
    "locked",
    "migration_failed",
  ]),
  liquidity: z.number(),
  curveLimit: z.number(),
  reserveLamport: z.number(),
  virtualReserves: z.number(),
  solPriceUSD: z.number(),
});

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
