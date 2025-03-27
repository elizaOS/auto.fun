import { TSortBy, TSortOrder } from "@/types";
import { useLocalStorage } from "@uidotdev/usehooks";

export const useFilter = () => {
  const [sortBy, setSortBy] = useLocalStorage<TSortBy>("filter", "createdAt");
  const [sortOrder, setSortOrder] = useLocalStorage<TSortOrder>("sort", "desc");
  return [sortBy, setSortBy, sortOrder, setSortOrder] as const;
};
