import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ChevronRight } from "lucide-react";
import { twMerge } from "tailwind-merge";
const Pagination = ({ pagination, onPageChange, }) => {
    const { page, hasMore, totalPages } = pagination;
    if (totalPages <= 1)
        return null;
    const renderPages = () => {
        if (totalPages <= 6) {
            return Array.from({ length: totalPages }, (_, i) => i + 1);
        }
        return [1, 2, 3, "...", totalPages - 2, totalPages - 1, totalPages];
    };
    const pages = renderPages();
    return (_jsx("nav", { "aria-label": "pagination", className: "ml-auto", children: _jsxs("ul", { className: "flex items-center gap-1", children: [pages.map((item, index) => {
                    if (typeof item === "number") {
                        const isActive = item === page;
                        return (_jsx("div", { className: twMerge([
                                isActive
                                    ? "outline-autofun-background-action-highlight bg-autofun-background-card text-autofun-text-primary "
                                    : "outline-transparent bg-transparent text-autofun-text-secondary ",
                                "cursor-pointer h-8 px-3 py-2 rounded-md outline outline-offset-[-1px] inline-flex flex-col items-center justify-center gap-2.5 overflow-hidden",
                            ]), onClick: () => {
                                if (onPageChange) {
                                    onPageChange(item);
                                }
                            }, children: _jsx("div", { className: "select-none text-center text-base font-normal font-dm-mono uppercase leading-normal tracking-widest", children: item }) }));
                    }
                    else {
                        return (_jsx("li", { className: "h-8 px-3 py-2 select-none text-center justify-center text-autofun-text-secondary text-base font-normal font-dm-mono uppercase leading-normal tracking-widest", children: item }, `ellipsis-${index}`));
                    }
                }), _jsx("li", { children: _jsx(ChevronRight, { className: twMerge([
                            "text-autofun-text-primary size-6",
                            hasMore ? "opacity-100" : "opacity-50",
                        ]), onClick: () => {
                            if (hasMore && onPageChange) {
                                onPageChange(page + 1);
                            }
                        } }) })] }) }));
};
export default Pagination;
