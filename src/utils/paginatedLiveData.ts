import { womboApi } from "@/utils/fetch";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

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
  validationSchema: z.ZodSchema<TOutput, z.ZodTypeDef, TInput>;
  sortBy: keyof TOutput;
  sortOrder: "asc" | "desc";
  itemsPropertyName: string;
};

export type UsePaginationOptions<TOutput = object, TInput = TOutput> = Omit<
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
  validationSchema,
  sortBy,
  sortOrder,
  itemsPropertyName,
}: PaginationOptions<TOutput, TInput>): Promise<PaginatedResponse<TOutput>> => {
  const queryParams = new URLSearchParams({
    limit: limit.toString(),
    page: page.toString(),
    sortBy: sortBy.toString(),
    sortOrder: sortOrder.toString(),
  });

  const queryEndpoint = `${endpoint}?${queryParams.toString()}`;

  const response = await womboApi.get({
    endpoint: queryEndpoint,
    schema: z.object({
      [itemsPropertyName]: z.array(validationSchema),
      page: z.number(),
      totalPages: z.number(),
      total: z.number(),
    }),
  });

  return {
    items: response[itemsPropertyName] as TOutput[],
    page: response.page as number,
    totalPages: response.totalPages as number,
    hasMore: (response.page as number) < (response.totalPages as number),
    total: response.total as number,
  };
};

export const usePagination = <TOutput extends Record<string, unknown>, TInput>({
  endpoint,
  limit,
  itemsPropertyName,
  validationSchema,
  sortBy,
  sortOrder,
  enabled = true,
}: UsePaginationOptions<TOutput, TInput>) => {
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchedData, setFetchedData] = useState<TOutput[]>([]);

  const loadPage = useCallback(
    async (pageNumber: number) => {
      if (pageNumber < 1 || !enabled) return;

      setIsLoading(true);
      try {
        const result = await fetchPaginatedData({
          endpoint,
          limit,
          page,
          sortBy,
          sortOrder,
          validationSchema,
          itemsPropertyName,
        });

        setFetchedData(result.items);
        setTotalPages(result.totalPages);
        setTotalItems(result.total);
        setHasMore(result.hasMore);
        setPage(pageNumber);
      } catch (error) {
        console.error("Failed to fetch page:", error);
        return;
      } finally {
        setIsLoading(false);
      }
    },
    [
      enabled,
      endpoint,
      itemsPropertyName,
      limit,
      page,
      sortBy,
      sortOrder,
      validationSchema,
    ],
  );

  useEffect(
    function updateSortOrder() {
      loadPage(page);
    },
    [loadPage, page],
  );

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

  return {
    items: fetchedData,
    setItems: setFetchedData,
    isLoading,
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
