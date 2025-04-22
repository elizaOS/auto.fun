import { useUrlSearchParams } from "./use-url-searchparams";

type ViewMode = "grid" | "list";

export const useViewMode = () => {
  const [viewMode, setViewMode] = useUrlSearchParams<ViewMode>("view", "grid");
  return [viewMode, setViewMode] as const;
};
