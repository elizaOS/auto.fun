import Button from "@/components/button";
import FrontpageHeader from "@/components/frontpage-header";
// import FrontpageHeader from "@/components/frontpage-header";
import GridListSwitcher from "@/components/grid-list-switcher";
import GridView from "@/components/grid-view";
import Loader from "@/components/loader";
// import Pagination from "@/components/pagination";
import { TableView } from "@/components/table-view";
// Remove useFilter import, manage state locally for now
// import { useFilter } from "@/hooks/use-filter";
import { useTokens, UseTokensParams } from "@/hooks/use-tokens";
import { useViewMode } from "@/hooks/use-view-mode";
import { getSocket } from "@/utils/socket";
import { IToken } from "@/types";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useLocalStorage } from "@uidotdev/usehooks";
import { Fragment } from "react/jsx-runtime";
import { FilterIcon, X } from "lucide-react"; // Example icons

// Define types for state
type GridSortByType = "newest" | "all" | "marketCap";
type TokenSourceType = "all" | "autofun";
type BondingStatusType = "all" | "inprogress" | "bonded";
type TableSortByType = keyof IToken | null;
type SortOrderType = "asc" | "desc";

// Define the type for params passed to useTokens hook locally
// We use the actual interface from the hook now
/*
interface UseTokensParams {
  sortBy: string;
  sortOrder: SortOrderType;
  hideImported?: number; // 0 or 1
  bondingStatus?: BondingStatusType;
  // Add other potential params if needed (e.g., search, page, limit)
}
*/

export default function Page() {
  const [activeTab] = useViewMode();
  // Manage sort/filter state locally, initializing from localStorage using the hook
  const [gridSortBy, setGridSortBy] = useLocalStorage<GridSortByType>(
    "gridSortBy",
    "newest",
  );
  const [tokenSource, setTokenSource] = useLocalStorage<TokenSourceType>(
    "tokenSource",
    "all",
  );
  const [bondingStatus, setBondingStatus] = useLocalStorage<BondingStatusType>(
    "bondingStatus",
    "all",
  );
  const [tableSortBy, setTableSortBy] = useLocalStorage<TableSortByType>(
    "tableSortBy",
    "marketCapUSD",
  );
  const [tableSortOrder, setTableSortOrder] = useLocalStorage<SortOrderType>(
    "tableSortOrder",
    "desc",
  );

  // State for filter popover visibility (no need to persist this)
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Determine API parameters based on active view and state
  const apiParams = useMemo((): UseTokensParams => {
    // Explicitly type params based on UseTokensParams from the hook
    const params: UseTokensParams = {
      hideImported: tokenSource === "autofun" ? 1 : 0,
      sortBy: "createdAt",
      sortOrder: "desc",
    };
    if (bondingStatus !== "all") {
      params.bondingStatus = bondingStatus;
    }
    if (activeTab === "list") {
      params.sortBy = tableSortBy || "marketCapUSD";
      params.sortOrder = tableSortOrder;
    } else {
      // Map grid sort options to API sort options
      params.sortBy =
        gridSortBy === "newest"
          ? "createdAt"
          : gridSortBy === "all" // "all" on frontend maps to "featured" on backend
            ? "featured"
            : "marketCapUSD";
      params.sortOrder = "desc"; // Grid view always sorts desc for these options
    }
    return params;
  }, [
    activeTab,
    gridSortBy,
    tableSortBy,
    tableSortOrder,
    tokenSource,
    bondingStatus,
  ]);

  const query = useTokens(apiParams);

  // Infinite Scroll Logic
  const observer = useRef<IntersectionObserver | null>(null);
  const lastElementRef = useCallback(
    (node: HTMLDivElement) => {
      if (query.isLoading || query.isFetchingNextPage) return;
      // Disconnect previous observer if any
      if (observer.current) observer.current.disconnect();
      // Create new observer
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && query.hasNextPage) {
          console.log("Type of fetchNextPage:", typeof query.fetchNextPage);
          // Explicitly cast to any to bypass persistent type error
          (query.fetchNextPage as any)();
        }
      });
      // Observe the new node
      if (node) observer.current.observe(node);
    },
    [
      query.isLoading,
      query.isFetchingNextPage,
      query.hasNextPage,
      query.fetchNextPage,
    ],
  );

  useEffect(() => {
    getSocket().emit("subscribeGlobal");
  }, []);

  const headerTokens = useMemo(() => {
    return query?.items || [];
  }, [query?.items]);

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
        {/* Grid Sort Buttons - Hide on Table View */}
        {activeTab === "grid" && (
          <div className="flex items-center gap-1">
            {/* TODO: change to toggle button for newest/oldest */}
            <Button
              variant={gridSortBy === "newest" ? "primary" : "outline"}
              onClick={() => setGridSortBy("newest")}
            >
              New
            </Button>
            <Button
              variant={gridSortBy === "all" ? "primary" : "outline"}
              onClick={() => setGridSortBy("all")}
            >
              {/* featured represents all */}
              Featured
            </Button>
            <Button
              variant={gridSortBy === "marketCap" ? "primary" : "outline"}
              onClick={() => setGridSortBy("marketCap")}
            >
              <span className="hidden sm:inline">Market Cap</span>
              <span className="sm:hidden">MCap</span>
            </Button>
          </div>
        )}
        {/* Placeholder div to maintain layout when grid buttons hide */}
        {activeTab !== "grid" && <div className="flex-1" />}

        <div className="flex items-center gap-2">
          {/* Filter Button & Popover */}
          <div className="relative">
            <Button
              variant="outline"
              size="small"
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className="relative p-2"
            >
              <FilterIcon size={24} />
              {(tokenSource !== "all" || bondingStatus !== "all") && (
                <span className="absolute top-0 right-0 block size-2 rounded-full bg-autofun-background-action-highlight ring-2 ring-autofun-background-action-primary" />
              )}
            </Button>
            {isFilterOpen && (
              <div className="absolute left-0 sm:right-0 sm:left-auto mt-2 w-56 shadow-lg bg-autofun-background-primary border border-b-autofun-stroke-primary z-20 p-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-dm-mono font-medium text-foreground">
                    Filters
                  </h3>
                  <Button
                    variant="ghost"
                    size="small"
                    onClick={() => setIsFilterOpen(false)}
                    className="p-1"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
                <div className="flex flex-col gap-2">
                  {/* Token Source Filter */}

                  <label className="text-sm font-dm-mono font-medium text-muted-foreground">
                    Token Source
                  </label>
                  <div className="flex gap-2 mt-1">
                    <Button
                      size="small"
                      variant={tokenSource === "all" ? "secondary" : "ghost"}
                      onClick={() => setTokenSource("all")}
                      className="flex-1"
                    >
                      All
                    </Button>
                    <Button
                      size="small"
                      variant={
                        tokenSource === "autofun" ? "secondary" : "ghost"
                      }
                      onClick={() => setTokenSource("autofun")}
                      className="flex-1"
                    >
                      auto.fun
                    </Button>
                  </div>

                  {/* Bonding Status Filter */}
                  <label className="text-sm font-dm-mono font-medium text-muted-foreground">
                    Bonding Status
                  </label>
                  <div className="flex flex-col gap-1 mt-1">
                    <Button
                      size="small"
                      variant={bondingStatus === "all" ? "secondary" : "ghost"}
                      onClick={() => setBondingStatus("all")}
                      className="w-full justify-start"
                    >
                      All
                    </Button>
                    <Button
                      size="small"
                      variant={
                        bondingStatus === "inprogress" ? "secondary" : "ghost"
                      }
                      onClick={() => setBondingStatus("inprogress")}
                      className="w-full justify-start"
                    >
                      In Progress
                    </Button>
                    <Button
                      size="small"
                      variant={
                        bondingStatus === "bonded" ? "secondary" : "ghost"
                      }
                      onClick={() => setBondingStatus("bonded")}
                      className="w-full justify-start"
                    >
                      Bonded
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
          {/* Existing Grid/List Switcher */}
          <GridListSwitcher />
        </div>
      </div>
      <div className="flex flex-col flex-1">
        {!query?.isLoading && query?.items?.length === 0 ? (
          <div className="text-center text-muted-foreground my-6">
            No tokens to be displayed
          </div>
        ) : (
          <Fragment>
            {activeTab === "grid" ? (
              <div className="my-6 relative">
                <GridView data={query.items} />
                <div ref={lastElementRef} style={{ height: "10px" }} />
              </div>
            ) : (
              <div className="mb-2 relative">
                <TableView
                  data={query.items}
                  sortBy={tableSortBy}
                  sortOrder={tableSortOrder}
                  setSortBy={setTableSortBy}
                  setSortOrder={setTableSortOrder}
                />
                <div ref={lastElementRef} style={{ height: "10px" }} />
              </div>
            )}
            {(query.isLoading || query.isFetchingNextPage) && (
              <div className="flex justify-center items-center my-4">
                <Loader />
              </div>
            )}
          </Fragment>
        )}
      </div>
    </div>
  );
}
