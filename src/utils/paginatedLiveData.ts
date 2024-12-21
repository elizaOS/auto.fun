import { womboApi } from "@/utils/fetch";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { Socket } from "socket.io-client";
import { z } from "zod";

interface PaginatedLiveDataConfig<TInput, TOutput> {
  itemsPerPage: number;
  maxPages: number;
  endpoint: string;
  socket: Socket;
  validationSchema: z.ZodSchema<TOutput, z.ZodTypeDef, TInput>;
  getUniqueId: (item: TOutput) => string | number;
  socketConfig: {
    subscribeEvent: string | { event: string; args: unknown[] };
    newDataEvent: string;
  };
  itemsPropertyName?: string;
}

const fetchData = async <TInput, TOutput>(
  endpoint: string,
  cursor: string | null,
  limit: number,
  validationSchema: z.ZodSchema<TOutput, z.ZodTypeDef, TInput>,
  itemsPropertyName: string,
) => {
  const queryEndpoint = cursor
    ? `${endpoint}?limit=${limit}&cursor=${cursor}`
    : `${endpoint}?limit=${limit}`;

  const response = await womboApi.get({
    endpoint: queryEndpoint,
    schema: z.object({
      [itemsPropertyName]: z.array(validationSchema),
      nextCursor: z.string().nullable(),
    }),
  });

  const filteredItems = (response[itemsPropertyName] as TOutput[]).filter(
    (item): item is TOutput => validationSchema.safeParse(item).success,
  );

  return {
    items: filteredItems,
    nextCursor: response.nextCursor as string | null,
  };
};

type LiveItemAction<T> = { type: "ADD_ITEM"; item: T } | { type: "TRIM" };

export const usePaginatedLiveData = <TInput, TOutput>({
  itemsPerPage,
  maxPages,
  endpoint,
  socket,
  validationSchema,
  getUniqueId,
  socketConfig,
  itemsPropertyName = "tokens",
}: PaginatedLiveDataConfig<TInput, TOutput>) => {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoizedGetUniqueId = useCallback(getUniqueId, []);
  const [page, setPage] = useState(1);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasAllData, setHasAllData] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchedData, setFetchedData] = useState<{ items: TOutput[] }>({
    items: [],
  });
  const [isLiveUpdate, setIsLiveUpdate] = useState(false);

  const [liveItems, dispatch] = useReducer(
    (state: TOutput[], action: LiveItemAction<TOutput>) => {
      switch (action.type) {
        case "ADD_ITEM": {
          const exists = state.some(
            (i) => memoizedGetUniqueId(i) === memoizedGetUniqueId(action.item),
          );
          if (exists) return state;
          return [action.item, ...state].slice(0, maxPages * itemsPerPage);
        }
        case "TRIM":
          return state.slice(0, maxPages * itemsPerPage);
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
          null,
          itemsPerPage,
          validationSchema,
          itemsPropertyName,
        );
        setFetchedData({ items: result.items });
        setCursor(result.nextCursor);
        setHasAllData(!result.nextCursor);
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
      const validatedItem = validationSchema.safeParse(newItem);
      if (validatedItem.success) {
        setIsLiveUpdate(true);
        dispatch({ type: "ADD_ITEM", item: validatedItem.data });
      }
    };

    if (typeof socketConfig.subscribeEvent === "string") {
      socket.emit(socketConfig.subscribeEvent);
    } else {
      socket.emit(
        socketConfig.subscribeEvent.event,
        ...socketConfig.subscribeEvent.args,
      );
    }

    socket.on(socketConfig.newDataEvent, handleNewItem);

    return () => {
      socket.off(socketConfig.newDataEvent, handleNewItem);
    };
  }, [
    socket,
    socketConfig.subscribeEvent,
    socketConfig.newDataEvent,
    validationSchema,
  ]);

  useEffect(() => {
    const trimInterval = setInterval(() => {
      dispatch({ type: "TRIM" });
    }, 60000);

    return () => {
      clearInterval(trimInterval);
    };
  }, [maxPages, itemsPerPage]);

  const allItems = useMemo(() => {
    if (!fetchedData?.items) return liveItems;

    const combined = [...liveItems];
    const liveIds = new Set(liveItems.map(memoizedGetUniqueId));

    fetchedData.items.forEach((item) => {
      if (!liveIds.has(memoizedGetUniqueId(item))) {
        combined.push(item);
      }
    });

    return combined;
  }, [fetchedData?.items, liveItems, memoizedGetUniqueId]);

  const totalPages = useMemo(
    () => Math.min(Math.ceil(allItems.length / itemsPerPage), maxPages),
    [allItems.length, itemsPerPage, maxPages],
  );

  const currentPageItems = useMemo(
    () => allItems.slice((page - 1) * itemsPerPage, page * itemsPerPage),
    [allItems, page, itemsPerPage],
  );

  const nextPage = useCallback(async () => {
    const nextPageIndex = page + 1;
    const nextPageStart = nextPageIndex * itemsPerPage;

    if (!hasAllData && allItems.length < nextPageStart) {
      setIsLoading(true);
      try {
        const result = await fetchData(
          endpoint,
          cursor,
          itemsPerPage,
          validationSchema,
          itemsPropertyName,
        );
        setFetchedData((prev) => {
          const keepItems = prev.items.slice(
            0,
            (nextPageIndex + 1) * itemsPerPage,
          );
          return {
            items: [...keepItems, ...result.items],
          };
        });
        setCursor(result.nextCursor);
        setHasAllData(!result.nextCursor);
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
    cursor,
    hasAllData,
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
    hasNextPage: !hasAllData && page < maxPages,
    hasPreviousPage: page > 1,
    currentPage: page,
    totalPages,
    nextPage,
    previousPage,
    isLiveUpdate,
  };
};
