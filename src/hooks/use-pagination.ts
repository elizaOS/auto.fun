import { fetcher } from "@/utils/api";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { useSearchParams } from "react-router";

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
}: PaginationOptions<TOutput, TInput>): Promise<PaginatedResponse<TOutput>> => {
  const queryParams = new URLSearchParams({
    limit: limit.toString(),
    page: page.toString(),
    sortBy: sortBy.toString(),
    sortOrder: sortOrder.toString(),
  });

  const queryEndpoint = `${endpoint}?${queryParams.toString()}`;

  const nonValidatedResponse = await fetcher(queryEndpoint, "GET");

  const response = nonValidatedResponse as any;

  return {
    items: response[itemsPropertyName] as TOutput[],
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
}: UsePaginationOptions<TOutput, TInput>) => {
  const { page, setPage } = usePage({ useUrlState });
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
