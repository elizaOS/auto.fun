import { useLocalStorage } from "@uidotdev/usehooks";
export const useViewMode = () => {
    const [viewMode, setViewMode] = useLocalStorage("view", "grid");
    return [viewMode, setViewMode];
};
