import { useLocalStorage } from "@uidotdev/usehooks";
export const useFilter = () => {
    const [sortBy, setSortBy] = useLocalStorage("filter", "featured");
    const [sortOrder, setSortOrder] = useLocalStorage("sort", "desc");
    return [sortBy, setSortBy, sortOrder, setSortOrder];
};
