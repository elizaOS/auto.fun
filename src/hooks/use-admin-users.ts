import { usePagination } from "./use-pagination";

export const useAdminUsers = (
  showSuspended: boolean = false,
  limit: number = 50
) => {
  return usePagination({
    endpoint: "/api/admin/users",
    limit,
    itemsPropertyName: "users",
    sortBy: "createdAt",
    sortOrder: "desc",
    useUrlState: true,
    // Pass suspended parameter if showSuspended is true
    ...(showSuspended && { suspended: "true" }),
  });
};
