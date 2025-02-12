import { womboApi } from "@/utils/fetch";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { z } from "zod";
import { getSocket } from "./socket";

interface PaginatedLiveDataConfig<TInput, TOutput> {
  itemsPerPage: number;
  endpoint: string;
  validationSchema: z.ZodSchema<TOutput, z.ZodTypeDef, TInput>;
  getUniqueId: (item: TOutput) => string | number;
  socketConfig: {
    subscribeEvent: string | { event: string; args: unknown[] };
    newDataEvent: string;
  };
  itemsPropertyName?: string;
}

interface PaginatedResponse<T> {
  items: T[];
  page: number;
  totalPages: number;
  total: number;
  hasMore: boolean;
}

const fetchData = async <TInput, TOutput>(
  endpoint: string,
  page: number,
  limit: number,
  validationSchema: z.ZodSchema<TOutput, z.ZodTypeDef, TInput>,
  itemsPropertyName: string,
): Promise<PaginatedResponse<TOutput>> => {
  const queryEndpoint = `${endpoint}?limit=${limit}&page=${page}`;

  const response = await womboApi.get({
    endpoint: queryEndpoint,
    schema: z.object({
      [itemsPropertyName]: z.array(validationSchema),
      page: z.number(),
      totalPages: z.number(),
      total: z.number(),
      // hasMore: z.boolean(),
    }),
  });

  return {
    items: response[itemsPropertyName] as TOutput[],
    page: response.page as number,
    totalPages: response.totalPages as number,
    hasMore: ((response.page as number) < response.totalPages) as number,
    total: response.total as number,
  };
};

type LiveItemAction<T> = { type: "ADD_ITEM"; item: T } | { type: "TRIM" };

export const usePaginatedLiveData = <TInput, TOutput>({
  itemsPerPage,
  endpoint,
  validationSchema,
  getUniqueId,
  socketConfig,
  itemsPropertyName = "tokens",
}: PaginatedLiveDataConfig<TInput, TOutput>) => {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoizedGetUniqueId = useCallback(getUniqueId, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoizedSocketConfig = useMemo(() => socketConfig, [socketConfig]);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchedData, setFetchedData] = useState<{ items: TOutput[] }>({
    items: [],
  });
  const [isLiveUpdate, setIsLiveUpdate] = useState(false);
  const socket = getSocket();

  const [liveItems, dispatch] = useReducer(
    (state: TOutput[], action: LiveItemAction<TOutput>) => {
      switch (action.type) {
        case "ADD_ITEM": {
          const exists = state.some(
            (i) => memoizedGetUniqueId(i) === memoizedGetUniqueId(action.item),
          );
          if (exists) return state;
          return [action.item, ...state].slice(0, totalPages * itemsPerPage);
        }
        case "TRIM":
          return state.slice(0, totalPages * itemsPerPage);
        default:
          return state;
      }
    },
    [],
  );

  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      try {
        const result = await fetchData(
          endpoint,
          1,
          itemsPerPage,
          validationSchema,
          itemsPropertyName,
        );

        setFetchedData({ items: result.items });
        setTotalPages(result.totalPages);
        setTotalItems(result.total);
        setHasMore(result.hasMore);
      } catch (error) {
        console.error("Failed to fetch initial data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialData();
  }, [endpoint, itemsPerPage, validationSchema, itemsPropertyName]);

  useEffect(() => {
    const handleNewItem = (newItem: unknown) => {
      console.log("newItem", newItem);
      const validatedItem = validationSchema.parse(newItem);
      setIsLiveUpdate(true);
      dispatch({ type: "ADD_ITEM", item: validatedItem });
    };

    if (typeof memoizedSocketConfig.subscribeEvent === "string") {
      socket.emit(memoizedSocketConfig.subscribeEvent);
    } else {
      console.log("subscribing to socket", memoizedSocketConfig.subscribeEvent);
      socket.emit(
        memoizedSocketConfig.subscribeEvent.event,
        ...memoizedSocketConfig.subscribeEvent.args,
      );
    }

    socket.on(memoizedSocketConfig.newDataEvent, handleNewItem);

    return () => {
      socket.off(memoizedSocketConfig.newDataEvent, handleNewItem);
    };
  }, [socket, memoizedSocketConfig, validationSchema]);

  useEffect(() => {
    const trimInterval = setInterval(() => {
      dispatch({ type: "TRIM" });
    }, 60000);

    return () => {
      clearInterval(trimInterval);
    };
  }, []);

  const allItems = useMemo(() => {
    if (!fetchedData?.items) return liveItems;

    const combined = [...liveItems];
    const liveIds = new Set(liveItems.map(memoizedGetUniqueId));

    for (const item of fetchedData.items) {
      if (!liveIds.has(memoizedGetUniqueId(item))) {
        combined.push(item);
      }
    }

    return combined;
  }, [fetchedData?.items, liveItems, memoizedGetUniqueId]);

  const currentPageItems = useMemo(
    () => allItems.slice((page - 1) * itemsPerPage, page * itemsPerPage),
    [allItems, page, itemsPerPage],
  );

  const nextPage = useCallback(async () => {
    const nextPageIndex = page + 1;

    if (nextPageIndex > totalPages) return;

    if (hasMore && allItems.length < nextPageIndex * itemsPerPage) {
      setIsLoading(true);
      try {
        const result = await fetchData(
          endpoint,
          nextPageIndex,
          itemsPerPage,
          validationSchema,
          itemsPropertyName,
        );
        setFetchedData((prev) => ({
          items: [...prev.items, ...result.items],
        }));
        setTotalPages(result.totalPages as number);
        setTotalItems(result.total as number);
        setHasMore(result.hasMore as boolean);
        setPage(nextPageIndex);
      } catch (error) {
        console.error("Failed to fetch next page:", error);
        return;
      } finally {
        setIsLoading(false);
      }
    } else {
      setPage(nextPageIndex);
    }
  }, [
    page,
    totalPages,
    hasMore,
    allItems.length,
    endpoint,
    itemsPerPage,
    validationSchema,
    itemsPropertyName,
  ]);

  const previousPage = useCallback(() => {
    setPage((p) => (p > 1 ? p - 1 : p));
  }, []);

  return {
    items: currentPageItems,
    isLoading,
    hasNextPage: hasMore,
    hasPreviousPage: page > 1,
    currentPage: page,
    totalPages,
    totalItems,
    nextPage,
    previousPage,
    isLiveUpdate,
  };
};
