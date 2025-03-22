import Button from "@/components/button";
import { useQuery } from "@tanstack/react-query";
import GridListSwitcher from "@/components/grid-list-switcher";
import { TableView } from "@/components/table-view";
import { useViewMode } from "@/hooks/use-view-mode";
import GridView from "@/components/grid-view";
import { getTokens } from "@/utils/api";
import { IPagination, IToken } from "@/types";
import Pagination from "@/components/pagination";
import usePagination from "@/hooks/use-pagination";
import { useFilter } from "@/hooks/use-filter";
import { Fragment } from "react/jsx-runtime";
import Loader from "@/components/loader";
import Footer from "@/components/footer";

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

  return (
    <div className="w-full min-h-[100vh]">
      {/* Top Navigation */}
      <div className="flex items-center gap-3 flex-wrap-reverse lg:flex-wrap">
        <GridListSwitcher />
        <div className="flex items-center gap-3">
          <Button
            variant={sortBy === "featured" ? "primary" : "outline"}
            onClick={() => setSortBy("featured")}
          >
            All
          </Button>
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
      <Footer />
    </div>
  );
}
