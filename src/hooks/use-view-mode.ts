import { useLocalStorage } from "@uidotdev/usehooks";

type ViewMode = "grid" | "list";

export const useViewMode = () => {
  const [viewMode, setViewMode] = useLocalStorage<ViewMode>("view", "grid");
  return [viewMode, setViewMode] as const;
};
