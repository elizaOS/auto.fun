import { fetcher } from "@/utils/api";
import { useCallback, useState } from "react";
import { z } from "zod";
import { useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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

  // Validate each item in the response with the provided schema if it exists
  const validatedItems = response[itemsPropertyName]
    ? (response[itemsPropertyName] as unknown[]).map((item) =>
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

export const usePage = ({ useUrlState }: { useUrlState: boolean }) => {
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
  const queryClient = useQueryClient();
  const { page, setPage } = usePage({ useUrlState });

  const queryKey = [
    enabled,
    endpoint,
    itemsPropertyName,
    limit,
    page,
    sortBy,
    sortOrder,
    validationSchema,
    hideImported,
    // Include additionalParams in the dependency array to reload when they change
    JSON.stringify(additionalParams),
  ];
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      if (page < 1 || !enabled) return null;

      const result = await fetchPaginatedData({
        endpoint,
        limit,
        page,
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
  });

  const fetchedData = query?.data?.fetchedData || [];
  const totalPages = query?.data?.totalPages || 0;
  const totalItems = query?.data?.totalItems || 0;
  const hasMore = query?.data?.hasMore || false;

  const nextPage = useCallback(async () => {
    if (page < totalPages) {
      setPage(page + 1);
    }
  }, [page, totalPages]);

  const previousPage = useCallback(() => {
    if (page > 1) {
      setPage(page - 1);
    }
  }, [page]);

  const goToPage = useCallback(
    (pageNumber: number) => {
      if (page < 1 || page > totalPages) return;
      setPage(pageNumber);
    },
    [page, totalPages],
  );

  const setItems = useCallback(
    (itemsOrUpdater: TOutput[] | ((prevItems: TOutput[]) => TOutput[])) => {
      if (typeof itemsOrUpdater === "function") {
        queryClient.setQueryData(queryKey, (oldData: any) => {
          if (!oldData) {
            // Handle case when oldData is null or undefined
            const newItems = itemsOrUpdater([]);
            return {
              fetchedData: newItems,
              totalPages: 0,
              totalItems: newItems.length,
              hasMore: false,
            };
          }
          const prevItems = oldData.fetchedData || [];
          return {
            ...oldData,
            fetchedData: itemsOrUpdater(prevItems),
          };
        });
      } else {
        queryClient.setQueryData(queryKey, (oldData: any) => {
          if (!oldData) {
            // Handle case when oldData is null or undefined
            return {
              fetchedData: itemsOrUpdater,
              totalPages: 0,
              totalItems: itemsOrUpdater.length,
              hasMore: false,
            };
          }
          return {
            ...oldData,
            fetchedData: itemsOrUpdater,
          };
        });
      }
    },
    [queryKey, queryClient],
  );

  return {
    items: fetchedData,
    setItems,
    isLoading: query?.isPending && !fetchedData.length,
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
