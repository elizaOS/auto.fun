import { useState, useCallback } from "react";
import { useSearchParams } from "react-router";
const usePagination = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const initialPageParam = searchParams.get("page");
    const initialPage = initialPageParam
        ? Math.max(parseInt(initialPageParam, 10), 1)
        : 1;
    const [page, setPage] = useState(initialPage);
    const onPageChange = useCallback((newPage) => {
        const validPage = newPage < 1 ? 1 : newPage;
        setPage(validPage);
        const newParams = new URLSearchParams(searchParams);
        newParams.set("page", String(validPage));
        setSearchParams(newParams);
    }, [searchParams, setSearchParams]);
    return { page, onPageChange };
};
export default usePagination;
