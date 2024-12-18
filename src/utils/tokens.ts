import { createQuery } from "react-query-kit";
import { womboApi } from "./fetch";
import { z } from "zod";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { CONTRACT_API_URL } from "./env";
import { useQueryClient } from "@tanstack/react-query";

const TokenSchema = z.object({
  name: z.string(),
  url: z.string(),
  ticker: z.string(),
  createdAt: z.string().datetime(),
  mint: z.string(),
  image: z.string().optional(),
  website: z.string().optional(),
});

const ValidTokenSchema = TokenSchema.extend({
  image: z.string(),
  website: z.string(),
});

const useTokensQuery = createQuery({
  queryKey: ["tokens", "cursor"],
  fetcher: async ({
    cursor,
    limit = 30,
  }: {
    cursor: string | null;
    limit: number;
  }) => {
    const endpoint = cursor
      ? `/tokens?limit=${limit}&cursor=${cursor}`
      : `/tokens?limit=${limit}`;

    const response = await womboApi.contract.get({
      endpoint,
      schema: z.object({
        tokens: TokenSchema.array(),
        nextCursor: z.string().nullable(),
      }),
    });

    return {
      tokens: response.tokens.filter(
        (token): token is z.infer<typeof ValidTokenSchema> =>
          ValidTokenSchema.safeParse(token).success,
      ),
      nextCursor: response.nextCursor,
    };
  },
});

const MAX_PAGES = 4;
const ITEMS_PER_PAGE = 30;
const MAX_ITEMS = MAX_PAGES * ITEMS_PER_PAGE;

// TODO: potential race condition here. if we make fetch call, then new token is added
// right before we subscribe to the websocket, we might miss the new token.
export const useTokens = () => {
  const queryClient = useQueryClient();
  const [cursorMap, setCursorMap] = useState<Record<number, string | null>>({
    1: null,
  });
  const [page, setPage] = useState(1);

  // Track total items to help manage pagination
  const [totalItems, setTotalItems] = useState(0);

  useEffect(() => {
    const socket = io(CONTRACT_API_URL);
    socket.emit("subscribeGlobal");

    console.log("subscribed to global");

    socket.on("newToken", (updatedToken: unknown) => {
      console.log("newToken", updatedToken);

      const validatedToken = ValidTokenSchema.safeParse(updatedToken);
      if (!validatedToken.success) {
        console.log("invalid token");
        return;
      }

      queryClient.setQueryData(
        useTokensQuery.getKey({
          cursor: cursorMap[page],
          limit: ITEMS_PER_PAGE,
        }),
        (oldData) => {
          if (!oldData?.tokens) {
            console.log("no tokens", oldData);
            console.log(useTokensQuery.getKey());
            return oldData;
          }

          const existingIndex = oldData.tokens.findIndex(
            (t) => t.mint === validatedToken.data.mint,
          );

          let updatedTokens;
          if (existingIndex !== -1) {
            console.log("updating existing token");
            updatedTokens = [...oldData.tokens];
            updatedTokens[existingIndex] = validatedToken.data;
          } else {
            console.log("adding new token");
            updatedTokens = [validatedToken.data, ...oldData.tokens].slice(
              0,
              ITEMS_PER_PAGE,
            );
          }

          return {
            ...oldData,
            tokens: updatedTokens,
            // Keep the original nextCursor from the API
            nextCursor: oldData.nextCursor,
          };
        },
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [queryClient, page, cursorMap]);

  // Fetch next page data when cursor changes
  const { data, isLoading } = useTokensQuery({
    variables: {
      cursor: cursorMap[page],
      limit: ITEMS_PER_PAGE,
    },
  });

  // Update cursors when new data is fetched
  useEffect(() => {
    if (data?.tokens.length && data?.nextCursor) {
      setCursorMap((prev) => ({
        ...prev,
        [page + 1]: data.nextCursor,
      }));
      setTotalItems(
        Math.min(page * ITEMS_PER_PAGE + data.tokens.length, MAX_ITEMS),
      );
    }
  }, [data, page]);

  const nextPage = () => {
    if (page < MAX_PAGES && data?.nextCursor) {
      setPage(page + 1);
    }
  };

  const previousPage = () => {
    if (page > 1) {
      setPage(page - 1);
    }
  };

  return {
    tokens: data?.tokens ?? [],
    isLoading,
    hasNextPage: page < MAX_PAGES,
    hasPreviousPage: page > 1,
    currentPage: page,
    totalPages: Math.min(Math.ceil(totalItems / ITEMS_PER_PAGE), MAX_PAGES),
    nextPage,
    previousPage,
  };
};

const useTokenQuery = createQuery({
  queryKey: ["tokens"],
  fetcher: async (mint: string) => {
    const token = await womboApi.contract.get({
      endpoint: `/tokens/${mint}`,
      schema: ValidTokenSchema,
    });

    return token;
  },
});

export const useToken = (mint: string) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = io(CONTRACT_API_URL);
    socket.emit("subscribeToken", mint);

    socket.on("newCandle", (candle: unknown) => {
      queryClient.setQueryData(useTokenQuery.getKey(), (oldData) => {
        // TODO: update the token with the new candle data
        return oldData;
      });
    });
  }, [mint, queryClient]);

  return useTokenQuery({ variables: mint });
};
