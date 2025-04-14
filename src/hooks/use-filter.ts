import { HomepageSortBy } from "@/types";
import { useLocalStorage } from "@uidotdev/usehooks";

export const useFilter = () => {
  const [sortBy, setSortBy] = useLocalStorage<HomepageSortBy>("filter", "all");
  return [sortBy, setSortBy] as const;
};
