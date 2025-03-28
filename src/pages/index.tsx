import Button from "@/components/button";
import FrontpageHeader from "@/components/frontpage-header";
import GridListSwitcher from "@/components/grid-list-switcher";
import GridView from "@/components/grid-view";
import Loader from "@/components/loader";
import Pagination from "@/components/pagination";
import { TableView } from "@/components/table-view";
import { useFilter } from "@/hooks/use-filter";
import usePagination from "@/hooks/use-pagination";
import { useViewMode } from "@/hooks/use-view-mode";
import { IPagination, IToken } from "@/types";
import { getTokens } from "@/utils/api";
import { getSocket } from "@/utils/socket";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Fragment } from "react/jsx-runtime";

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
    refetchInterval: 20_000,
    staleTime: 1_000,
  });

  useEffect(() => {
    getSocket().emit('subscribeGlobal')
  }, [])

  const queryData = query?.data as {
    tokens: IToken[];
    page: number;
    totalPages: number;
    total: number;
    hasMore: boolean;
  };

  const tokens = queryData?.tokens as IToken[];

  const pagination = {
    page: queryData?.page || 1,
    totalPages: queryData?.totalPages || 1,
    total: queryData?.total || 1,
    hasMore: queryData?.hasMore || false,
  } as IPagination;

  console.log(query);

  return (
    <div className="w-full min-h-[100vh]">
      {/* Header Section */}
      <FrontpageHeader tokens={tokens} />
      {/* Top Navigation */}
      <div className="flex justify-between gap-2 flex-wrap-reverse md:flex-wrap">
        <GridListSwitcher />
        <div className="flex items-center gap-2">
          {/* <Button
            variant={sortBy === "featured" ? "primary" : "outline"}
            onClick={() => setSortBy("featured")}
          >
            All
          </Button> */}
          <Button
            variant={sortBy === "marketCapUSD" ? "primary" : "outline"}
            onClick={() => setSortBy("marketCapUSD")}
          >
            Market Cap
          </Button>
          <Button
            variant={sortBy === "createdAt" ? "primary" : "outline"}
            onClick={() => setSortBy("createdAt")}
          >
            Creation Time
          </Button>
        </div>
      </div>
      <div className="flex flex-col flex-1 min-h-[80vh]">
        {!query?.isLoading ? (
          <Fragment>
            {activeTab === "grid" ? (
              <div className="my-6">
                <GridView data={tokens} />
              </div>
            ) : (
              <div className="mb-2">
                <TableView data={tokens} />
              </div>
            )}
          </Fragment>
        ) : (
          <Loader />
        )}
        <Pagination pagination={pagination} onPageChange={onPageChange} />
      </div>
    </div>
  );
}
