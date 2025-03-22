import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import Button from "@/components/button";
import { useQuery } from "@tanstack/react-query";
import GridListSwitcher from "@/components/grid-list-switcher";
import { TableView } from "@/components/table-view";
import { useViewMode } from "@/hooks/use-view-mode";
import GridView from "@/components/grid-view";
import { getTokens } from "@/utils/api";
import Pagination from "@/components/pagination";
import usePagination from "@/hooks/use-pagination";
import { useFilter } from "@/hooks/use-filter";
import { Fragment } from "react/jsx-runtime";
import Loader from "@/components/loader";
export default function Page() {
    const [activeTab] = useViewMode();
    const { page, onPageChange } = usePagination();
    const [sortBy, setSortBy, sortOrder] = useFilter();
    const query = useQuery({
        queryKey: ["tokens", page, sortBy, sortOrder],
        queryFn: async () => {
            return await getTokens({
                page,
                limit: 12,
                sortBy,
                sortOrder,
            });
        },
        refetchInterval: 5_000,
        staleTime: 1_000,
    });
    const queryData = query?.data;
    const tokens = queryData?.tokens;
    const pagination = {
        page: queryData?.page || 1,
        totalPages: queryData?.totalPages || 1,
        total: queryData?.total || 1,
        hasMore: queryData?.hasMore || false,
    };
    return (_jsxs("div", { className: "flex flex-col", children: [_jsxs("div", { className: "flex items-center gap-3 flex-wrap-reverse lg:flex-wrap", children: [_jsx(GridListSwitcher, {}), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx(Button, { variant: sortBy === "featured" ? "primary" : "outline", onClick: () => setSortBy("featured"), children: "All" }), _jsx(Button, { variant: sortBy === "marketCapUSD" ? "primary" : "outline", onClick: () => setSortBy("marketCapUSD"), children: "Market Cap" }), _jsx(Button, { variant: sortBy === "createdAt" ? "primary" : "outline", onClick: () => setSortBy("createdAt"), children: "Creation Time" })] })] }), !query?.isLoading ? (_jsx(Fragment, { children: activeTab === "grid" ? (_jsx("div", { className: "my-6", children: _jsx(GridView, { data: tokens }) })) : (_jsx("div", { className: "mb-2", children: _jsx(TableView, { data: tokens }) })) })) : (_jsx(Loader, {})), _jsx(Pagination, { pagination: pagination, onPageChange: onPageChange })] }));
}
