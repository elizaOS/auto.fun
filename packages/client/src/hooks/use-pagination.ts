import { fetcher } from "@/utils/api";
import { useCallback, useMemo, useState } from "react";
import { z } from "zod";
import { useSearchParams } from "react-router";
import {
  useInfiniteQuery,
  useQueryClient,
  QueryKey,
  useQuery,
  keepPreviousData,
} from "@tanstack/react-query";

interface PaginatedResponse<T> {
  items: T[];
  page: number;
  totalPages: number;
  total: number;
  hasMore: boolean;
}

type PaginationOptions<TOutput, TInput> = {
  endpoint: string;
  page: number;
  limit: number;
  validationSchema?: z.ZodSchema<TOutput, z.ZodTypeDef, TInput>;
  sortBy: keyof TOutput;
  sortOrder: "asc" | "desc";
  itemsPropertyName: string;
  hideImported?: number;
  additionalParams?: Record<string, string>;
  refetchInterval?: number;
};

export type UsePaginationOptions<TOutput = object, TInput = TOutput> = Omit<
  PaginationOptions<TOutput, TInput>,
  "page"
> & { enabled?: boolean; useUrlState?: boolean };

type UseInfinitePaginationOptions<TOutput = object, TInput = TOutput> = Omit<
  PaginationOptions<TOutput, TInput>,
  "page"
> & { enabled?: boolean };

const fetchPaginatedData = async <
  TOutput extends Record<string, unknown>,
  TInput,
>({
  endpoint,
  page,
  limit,
  sortBy,
  sortOrder,
  itemsPropertyName,
  validationSchema,
  hideImported,
  additionalParams,
}: PaginationOptions<TOutput, TInput>): Promise<PaginatedResponse<TOutput>> => {
  const queryParams = new URLSearchParams({
    limit: limit.toString(),
    page: page.toString(),
    sortBy: sortBy.toString(),
    sortOrder: sortOrder.toString(),
    hideImported: hideImported ? "1" : "0",
  });

  // Add any additional parameters to the query string
  if (additionalParams) {
    Object.entries(additionalParams).forEach(([key, value]) => {
      queryParams.append(key, value);
    });
  }

  const queryEndpoint = `${endpoint}?${queryParams.toString()}`;

  const nonValidatedResponse = await fetcher(queryEndpoint, "GET");

  const response = nonValidatedResponse as any;

  const itemsKey = itemsPropertyName || "items";

  // Validate each item in the response with the provided schema if it exists
  const validatedItems = response[itemsKey]
    ? (response[itemsKey] as unknown[]).map((item) =>
        validationSchema ? validationSchema.parse(item) : (item as TOutput),
      )
    : [];

  return {
    items: validatedItems,
    page: response.page as number,
    totalPages: response.totalPages as number,
    hasMore: (response.page as number) < (response.totalPages as number),
    total: response.total as number,
  };
};

const usePage = ({ useUrlState }: { useUrlState: boolean }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPageParam = searchParams.get("page");
  const initialPage = initialPageParam
    ? Math.max(parseInt(initialPageParam, 10), 1)
    : 1;
  const [page, setPage] = useState(initialPage);

  const onPageChange = useCallback(
    (newPage: number) => {
      const validPage = newPage < 1 ? 1 : newPage;
      setPage(validPage);

      if (useUrlState) {
        const newParams = new URLSearchParams(searchParams);
        newParams.set("page", String(validPage));
        setSearchParams(newParams);
      }
    },
    [searchParams, setSearchParams],
  );

  return { page, setPage: onPageChange };
};

export const usePagination = <TOutput extends Record<string, unknown>, TInput>({
  endpoint,
  limit,
  itemsPropertyName,
  validationSchema,
  sortBy,
  sortOrder,
  enabled = true,
  useUrlState = false,
  hideImported,
  refetchInterval,
  ...rest
}: UsePaginationOptions<TOutput, TInput>) => {
  const additionalParams: Record<string, string> = {};
  Object.entries(rest).forEach(([key, value]) => {
    if (typeof value === "string") {
      additionalParams[key] = value;
    } else if (typeof value === "boolean") {
      additionalParams[key] = String(value);
    } else if (typeof value === "number") {
      additionalParams[key] = String(value);
    }
  });
  const queryClient = useQueryClient();
  const { page, setPage } = usePage({ useUrlState });

  const queryKey: QueryKey = useMemo(
    () => [
      enabled,
      endpoint,
      itemsPropertyName,
      limit,
      page,
      sortBy,
      sortOrder,
      validationSchema,
      hideImported,
      JSON.stringify(additionalParams),
    ],
    [
      enabled,
      endpoint,
      itemsPropertyName,
      limit,
      page,
      sortBy,
      sortOrder,
      validationSchema,
      hideImported,
      additionalParams,
    ],
  );

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      if (page < 1 || !enabled) return null;

      const result = await fetchPaginatedData<TOutput, TInput>({
        endpoint,
        limit,
        page: page,
        sortBy,
        sortOrder,
        itemsPropertyName,
        validationSchema,
        hideImported,
        additionalParams,
      });

      if (page !== result.page) {
        setPage(result.page);
      }

      return {
        fetchedData: result.items,
        totalPages: result.totalPages,
        totalItems: result.total,
        hasMore: result.hasMore,
      };
    },
    refetchInterval: refetchInterval ? refetchInterval : 5000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 3,
    enabled: enabled,
    placeholderData: keepPreviousData,
  });

  const fetchedData = query?.data?.fetchedData || [];
  const totalPages = query?.data?.totalPages || 0;
  const totalItems = query?.data?.totalItems || 0;
  const hasMore = query?.data?.hasMore || false;

  const nextPage = useCallback(async () => {
    if (page < totalPages) {
      setPage(page + 1);
    }
  }, [page, totalPages, setPage]);

  const previousPage = useCallback(() => {
    if (page > 1) {
      setPage(page - 1);
    }
  }, [page, setPage]);

  const goToPage = useCallback(
    (pageNumber: number) => {
      if (pageNumber < 1 || pageNumber > totalPages) return;
      setPage(pageNumber);
    },
    [totalPages, setPage],
  );

  const setItems = useCallback(
    (itemsOrUpdater: TOutput[] | ((prevItems: TOutput[]) => TOutput[])) => {
      if (typeof itemsOrUpdater === "function") {
        queryClient.setQueryData(queryKey, (oldData: any) => {
          if (!oldData) {
            const newItems = itemsOrUpdater([]);
            return {
              fetchedData: newItems,
              totalPages: 0,
              totalItems: newItems.length,
              hasMore: false,
            };
          }
          const prevItems = oldData.fetchedData || [];
          return { ...oldData, fetchedData: itemsOrUpdater(prevItems) };
        });
      } else {
        queryClient.setQueryData(queryKey, (oldData: any) => {
          if (!oldData) {
            return {
              fetchedData: itemsOrUpdater,
              totalPages: 0,
              totalItems: itemsOrUpdater.length,
              hasMore: false,
            };
          }
          return { ...oldData, fetchedData: itemsOrUpdater };
        });
      }
    },
    [queryKey, queryClient],
  );

  return {
    items: fetchedData,
    setItems,
    isLoading: query?.isLoading,
    hasNextPage: hasMore,
    hasPreviousPage: page > 1,
    currentPage: page,
    totalPages,
    totalItems,
    nextPage,
    previousPage,
    goToPage,
  };
};

export const useInfinitePagination = <
  TOutput extends Record<string, unknown>,
  TInput,
>({
  endpoint,
  limit,
  itemsPropertyName,
  validationSchema,
  sortBy,
  sortOrder,
  enabled = true,
  hideImported,
  refetchInterval,
  ...rest
}: UseInfinitePaginationOptions<TOutput, TInput>) => {
  // Extract additional parameters (excluding known parameters)
  const additionalParams: Record<string, string> = {};
  Object.entries(rest).forEach(([key, value]) => {
    if (typeof value === "string") {
      additionalParams[key] = value;
    } else if (typeof value === "boolean") {
      additionalParams[key] = String(value);
    } else if (typeof value === "number") {
      additionalParams[key] = String(value);
    }
  });
  // Memoize queryKey to prevent unnecessary recalculations
  const queryKey: QueryKey = useMemo(
    () => [
      enabled,
      endpoint,
      itemsPropertyName,
      limit,
      sortBy,
      sortOrder,
      validationSchema,
      hideImported,
      JSON.stringify(additionalParams),
    ],
    [
      enabled,
      endpoint,
      itemsPropertyName,
      limit,
      sortBy,
      sortOrder,
      validationSchema,
      hideImported,
      additionalParams,
    ],
  );

  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam = 1 }) => {
      if (!enabled) {
        return {
          tokens: [],
          totalPages: 0,
          totalItems: 0,
          hasMore: false,
          currentPage: 1,
        };
      }
      const result = await fetchPaginatedData<TOutput, TInput>({
        endpoint,
        limit,
        page: pageParam,
        sortBy,
        sortOrder,
        itemsPropertyName,
        validationSchema,
        hideImported,
        additionalParams,
      });
      return {
        tokens: result.items,
        totalPages: result.totalPages,
        totalItems: result.total,
        hasMore: result.hasMore,
        currentPage: result.page,
      };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage || !lastPage.hasMore) {
        return undefined;
      }
      return lastPage.currentPage + 1;
    },
    refetchInterval: refetchInterval ? refetchInterval : 5000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 3,
    enabled: enabled,
  });

  // Flatten the pages array into a single items array
  const items = query.data?.pages.flatMap((page) => page.tokens) ?? [];
  const totalItems = query.data?.pages[0]?.totalItems ?? 0;
  const totalPages = query.data?.pages[0]?.totalPages ?? 0;

  // Simplify setItems - recommend invalidation instead of direct manipulation
  const setItems = useCallback(
    (_itemsOrUpdater: TOutput[] | ((prevItems: TOutput[]) => TOutput[])) => {
      console.warn(
        "setItems is not fully supported with useInfinitePagination. Please use queryClient.invalidateQueries({ queryKey: [...] }) to refresh data.",
      );
      // No-op or basic placeholder action
    },
    [], // No dependencies needed for a no-op/warning
  );

  return {
    items,
    setItems,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage ?? false,
    totalPages,
    totalItems,
  };
};
