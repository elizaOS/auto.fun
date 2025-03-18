import { useLocalStorage } from "@uidotdev/usehooks";

export type ViewMode = "grid" | "list";

export const useViewMode = () => {
  const [viewMode, setViewMode] = useLocalStorage<ViewMode>("view", "grid");
  return [viewMode, setViewMode] as const;
};
