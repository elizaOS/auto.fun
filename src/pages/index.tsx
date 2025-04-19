import Button from "@/components/button";
import FrontpageHeader from "@/components/frontpage-header";
// import FrontpageHeader from "@/components/frontpage-header";
import GridListSwitcher from "@/components/grid-list-switcher";
import GridView from "@/components/grid-view";
import Loader from "@/components/loader";
import Pagination from "@/components/pagination";
import { TableView } from "@/components/table-view";
import { useFilter } from "@/hooks/use-filter";
import { useTokens } from "@/hooks/use-tokens";
import { useViewMode } from "@/hooks/use-view-mode";
import { getSocket } from "@/utils/socket";
import { useEffect, useMemo } from "react";
import { Fragment } from "react/jsx-runtime";

export default function Page() {
  const [activeTab] = useViewMode();
  const [sortBy, setSortBy] = useFilter();

  const query = useTokens(sortBy);

  useEffect(() => {
    getSocket().emit("subscribeGlobal");
  }, []);

  const headerTokens = useMemo(() => {
    return query?.items || [];
  }, [query?.items]);

  const data = query?.items
    ? query?.items.filter(
        (item, index, self) =>
          index === self.findIndex((t) => t.mint === item.mint)
      )
    : [];

  return (
    <div className="w-full min-h-[50vh]">
      {/* Header Section */}
      {/* Show FrontpageHeader on desktop, logo on mobile */}
      <div className="hidden md:block">
        <FrontpageHeader tokens={headerTokens} />
      </div>
      <div className="md:hidden flex justify-center items-center py-8">
        <img src="/logo_wide.svg" alt="Logo" className="w-4/5 max-w-[400px]" />
      </div>
      {/* Top Navigation */}
      <div className="flex justify-between gap-1 flex-wrap-reverse md:flex-wrap">
        <div className="flex items-center gap-1">
          <Button
            variant={sortBy === "all" ? "primary" : "outline"}
            onClick={() => setSortBy("all")}
          >
            {/* featured represents all */}
            Featured
          </Button>
          <Button
            variant={sortBy === "marketCap" ? "primary" : "outline"}
            onClick={() => setSortBy("marketCap")}
          >
            <span className="hidden sm:inline">Market Cap</span>
            <span className="sm:hidden">MCap</span>
          </Button>

          {/* TODO: change to toggle button for newest/oldest */}
          <Button
            variant={sortBy === "newest" ? "primary" : "outline"}
            onClick={() => setSortBy("newest")}
          >
            New
          </Button>
        </div>
        <GridListSwitcher />
      </div>
      <div className="flex flex-col flex-1">
        {!query?.isLoading ? (
          <Fragment>
            {query?.items?.length === 0 ? (
              <div className="text-center text-muted-foreground my-6">
                No tokens to be displayed
              </div>
            ) : activeTab === "grid" ? (
              <div className="my-6">
                <GridView data={data} />
              </div>
            ) : (
              <div className="mb-2">
                <TableView data={data} />
              </div>
            )}
          </Fragment>
        ) : (
          <Loader />
        )}

        <Pagination
          pagination={{
            hasMore: query?.hasNextPage || false,
            page: query?.currentPage || 1,
            total: query?.totalItems || 0,
            totalPages: query?.totalPages || 1,
          }}
          onPageChange={(pageNumber: number) => {
            if (query?.isLoading) return;
            query?.goToPage(pageNumber);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      </div>
    </div>
  );
}
