import { womboApi } from "@/utils/fetch";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { Socket } from "socket.io-client";
import { z } from "zod";

interface PaginatedLiveDataConfig<T> {
  itemsPerPage: number;
  maxPages: number;
  endpoint: string;
  socket: Socket;
  validationSchema: z.ZodSchema<T>;
  getUniqueId: (item: T) => string | number;
  socketConfig: {
    subscribeEvent: string;
    newDataEvent: string;
  };
}

const fetchData = async <T>(
  endpoint: string,
  cursor: string | null,
  limit: number,
  validationSchema: z.ZodSchema<T>,
) => {
  const queryEndpoint = cursor
    ? `${endpoint}?limit=${limit}&cursor=${cursor}`
    : `${endpoint}?limit=${limit}`;

  const response = await womboApi.contract.get({
    endpoint: queryEndpoint,
    schema: z.object({
      tokens: z.array(validationSchema),
      nextCursor: z.string().nullable(),
    }),
  });

  const filteredItems = response.tokens.filter(
    (item): item is T => validationSchema.safeParse(item).success,
  );

  console.log(
    `items removed: ${response.tokens.length - filteredItems.length}`,
  );

  return {
    items: filteredItems,
    nextCursor: response.nextCursor,
  };
};

type LiveItemAction<T> = { type: "ADD_ITEM"; item: T } | { type: "TRIM" };

export const usePaginatedLiveData = <T>({
  itemsPerPage,
  maxPages,
  endpoint,
  socket,
  validationSchema,
  getUniqueId,
  socketConfig,
}: PaginatedLiveDataConfig<T>) => {
  const [page, setPage] = useState(1);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasAllData, setHasAllData] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchedData, setFetchedData] = useState<{ items: T[] }>({ items: [] });
  const [isLiveUpdate, setIsLiveUpdate] = useState(false);

  const [liveItems, dispatch] = useReducer(
    (state: T[], action: LiveItemAction<T>) => {
      switch (action.type) {
        case "ADD_ITEM": {
          const exists = state.some(
            (i) => getUniqueId(i) === getUniqueId(action.item),
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
  }, [endpoint, itemsPerPage, validationSchema]);

  useEffect(() => {
    const handleNewItem = (newItem: unknown) => {
      const validatedItem = validationSchema.safeParse(newItem);
      if (validatedItem.success) {
        setIsLiveUpdate(true);
        dispatch({ type: "ADD_ITEM", item: validatedItem.data });
      }
    };

    socket.emit(socketConfig.subscribeEvent);
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
    const liveIds = new Set(liveItems.map(getUniqueId));

    fetchedData.items.forEach((item) => {
      if (!liveIds.has(getUniqueId(item))) {
        combined.push(item);
      }
    });

    return combined;
  }, [fetchedData?.items, liveItems, getUniqueId]);

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
