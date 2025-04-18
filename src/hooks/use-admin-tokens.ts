import { usePagination } from "./use-pagination";

export const useAdminTokens = (
  sortBy: string = "newest",
  hideImported: boolean = false,
  limit: number = 50
) => {
  // Map frontend sort values to API sort values
  const apiSortBy = 
    sortBy === "all" ? "featured" :
    sortBy === "marketCap" ? "marketCapUSD" :
    sortBy === "newest" ? "createdAt" :
    sortBy === "oldest" ? "createdAt" :
    "createdAt";
  
  // For "oldest", we'll reverse the sort order
  const sortOrder = sortBy === "oldest" ? "asc" : "desc";

  return usePagination({
    endpoint: "/api/admin/tokens",
    limit,
    itemsPropertyName: "tokens",
    sortBy: apiSortBy,
    sortOrder,
    useUrlState: true,
    hideImported: hideImported ? 1 : 0,
  });
};
