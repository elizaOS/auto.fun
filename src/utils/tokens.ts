import { createQuery } from "react-query-kit";
import { womboApi } from "./fetch";
import { z } from "zod";
import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useReducer,
  useRef,
} from "react";
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
  const [page, setPage] = useState(1);

  const { data: fetchedData, isLoading } = useTokensQuery({
    variables: {
      cursor: null,
      limit: MAX_ITEMS,
    },
  });

  const [liveTokens, dispatch] = useReducer(
    (
      state: z.infer<typeof ValidTokenSchema>[],
      action: {
        type: "ADD_TOKEN";
        token: z.infer<typeof ValidTokenSchema>;
      },
    ) => {
      const exists = state.some((t) => t.mint === action.token.mint);
      if (exists) return state;
      return [action.token, ...state].slice(0, MAX_ITEMS);
    },
    [],
  );

  const socketRef = useRef<ReturnType<typeof io>>();
  const [isLiveUpdate, setIsLiveUpdate] = useState(false);

  useEffect(() => {
    socketRef.current = io(CONTRACT_API_URL);
    const socket = socketRef.current;

    const handleNewToken = (updatedToken: unknown) => {
      const validatedToken = ValidTokenSchema.safeParse(updatedToken);
      if (validatedToken.success) {
        setIsLiveUpdate(true);
        dispatch({ type: "ADD_TOKEN", token: validatedToken.data });
      }
    };

    socket.emit("subscribeGlobal");
    socket.on("newToken", handleNewToken);

    return () => {
      socket.off("newToken", handleNewToken);
      socket.disconnect();
    };
  }, []);

  const allTokens = useMemo(() => {
    if (!fetchedData?.tokens) return liveTokens;

    // Start with live tokens first, then add fetched tokens that don't exist in live tokens
    const combined = [...liveTokens];
    const liveMints = new Set(liveTokens.map((t) => t.mint));

    fetchedData.tokens.forEach((token) => {
      if (!liveMints.has(token.mint)) {
        combined.push(token);
      }
    });

    return combined.slice(0, MAX_ITEMS);
  }, [fetchedData?.tokens, liveTokens]);

  const totalPages = useMemo(
    () => Math.min(Math.ceil(allTokens.length / ITEMS_PER_PAGE), MAX_PAGES),
    [allTokens.length],
  );

  const currentPageTokens = useMemo(
    () => allTokens.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE),
    [allTokens, page],
  );

  const nextPage = useCallback(() => {
    setPage((p) => (p < totalPages ? p + 1 : p));
  }, [totalPages]);

  const previousPage = useCallback(() => {
    setPage((p) => (p > 1 ? p - 1 : p));
  }, []);

  return {
    tokens: currentPageTokens,
    isLoading,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
    currentPage: page,
    totalPages,
    nextPage,
    previousPage,
    isLiveUpdate,
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
