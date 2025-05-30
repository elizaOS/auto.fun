import Button from "@/components/button";
// import FrontpageHeader from "@/components/frontpage-header";
import GridListSwitcher from "@/components/grid-list-switcher";
import GridView from "@/components/grid-view";
import Loader from "@/components/loader";
// import Pagination from "@/components/pagination";
import { TableView } from "@/components/table-view";
// Remove useFilter import, manage state locally for now
// import { useFilter } from "@/hooks/use-filter";
import FeaturedSection from "@/components/featured-section";
import { useTokens, UseTokensParams } from "@/hooks/use-tokens";
import { useUrlSearchParams } from "@/hooks/use-url-searchparams";
import { useViewMode } from "@/hooks/use-view-mode";
import { IToken } from "@/types";
import { getSocket } from "@/utils/socket";
import { FilterIcon, X } from "lucide-react"; // Example icons
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { Fragment } from "react/jsx-runtime";

// Define types for state
type GridSortByType = "newest" | "all" | "marketCap" | "verified";
type VerifiedType = 1 | 0;
type TokenSourceType = "all" | "autofun";
type BondingStatusType = "all" | "active" | "locked";
type TableSortByType = keyof IToken | null;
type SortOrderType = "asc" | "desc";

export default function Page() {
  const [activeTab] = useViewMode();

  const [gridSortBy, setGridSortBy] = useUrlSearchParams<GridSortByType>(
    "category",
    "all",
  );

  const [tokenSource, setTokenSource] = useUrlSearchParams<TokenSourceType>(
    "source",
    "autofun",
  );
  const [bondingStatus, setBondingStatus] =
    useUrlSearchParams<BondingStatusType>("status", "all");
  const [tableSortBy, setTableSortBy] = useUrlSearchParams<TableSortByType>(
    "sort",
    "marketCapUSD",
  );

  const [tableSortOrder, setTableSortOrder] = useState<SortOrderType>("desc");

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        filterRef.current &&
        !filterRef.current.contains(event.target as Node)
      ) {
        setIsFilterOpen(false);
      }
    }
    // Add listener if popover is open
    if (isFilterOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      // Remove listener if popover is closed
      document.removeEventListener("mousedown", handleClickOutside);
    }
    // Cleanup listener on component unmount or when isFilterOpen changes
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isFilterOpen]); // Re-run effect when isFilterOpen changes

  // Determine API parameters based on active view and state
  const apiParams = useMemo((): UseTokensParams => {
    const params: UseTokensParams = {
      hideImported: tokenSource === "autofun" ? 1 : 0,
      sortBy: "createdAt",
      sortOrder: "desc",
    };
    if (bondingStatus !== "all") {
      params.status = bondingStatus;
    }
    if (activeTab === "list") {
      params.sortBy = tableSortBy || "marketCapUSD";
      params.sortOrder = tableSortOrder;
    } else {
      switch (gridSortBy) {
        case "newest":
          params.sortBy = "createdAt";
          break;
        case "all":
          params.sortBy = "featured";
          break;
        case "marketCap":
          params.sortBy = "marketCapUSD";
          break;
        case "verified":
          params.sortBy = "verified";
          break;
        default:
          params.sortBy = "featured";
      }
      params.sortOrder = "desc";
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

  return (
    <Fragment>
      <Helmet>
        <title>auto.fun</title>
      </Helmet>
      <div className="w-full min-h-[50vh] pb-24 flex flex-col gap-6">
        {/* Featured section */}
        <div className="w-full hidden md:block my-1">
          <img
            src="hero.svg"
            className="w-full my-auto select-none"
            alt="hero-svg"
          />
        </div>

        <FeaturedSection />
        {/* Top Navigation */}
        <div
          className={`flex flex-col-reverse sm:flex-row gap-1 w-full md:flex-wrap ${activeTab === "grid" ? "justify-between" : "justify-end"}`}
        >
          {/* Grid Sort Buttons - Hide on Table View */}
          {activeTab === "grid" && (
            <div className="flex items-center gap-1 justify-center sm:justify-start">
              {/* TODO: change to toggle button for newest/oldest */}
              <Button
                variant={gridSortBy === "all" ? "primary" : "outline"}
                onClick={() => setGridSortBy("all")}
              >
                {/* featured represents all */}
                Featured
              </Button>
              <Button
                variant={gridSortBy === "newest" ? "primary" : "outline"}
                onClick={() => setGridSortBy("newest")}
              >
                New
              </Button>
              <Button
                variant={gridSortBy === "marketCap" ? "primary" : "outline"}
                onClick={() => setGridSortBy("marketCap")}
              >
                <span className="hidden sm:inline">Market Cap</span>
                <span className="sm:hidden">MCap</span>
              </Button>
              <Button
                variant={gridSortBy === "verified" ? "primary" : "outline"}
                onClick={() => setGridSortBy("verified")}
              >
                <span className="hidden sm:inline">Verified</span>
                <span className="sm:hidden">Verified</span>
              </Button>
            </div>
          )}
          <div className="relative flex justify-end" ref={filterRef}>
            <Button
              variant="outline"
              size="small"
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className="relative p-2"
              aria-label="filter"
            >
              <FilterIcon size={24} />
              {(tokenSource !== "all" || bondingStatus !== "all") && (
                <span className="absolute top-0 right-0 block size-2 rounded-full bg-autofun-background-action-highlight ring-2 ring-autofun-background-action-primary" />
              )}
            </Button>
            <GridListSwitcher />
            {isFilterOpen && (
              <div className="absolute right-0 sm:right-0 sm:left-auto mt-8 w-56 shadow-lg bg-autofun-background-primary border border-b-autofun-stroke-primary z-20 p-4">
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
                        bondingStatus === "active" ? "secondary" : "ghost"
                      }
                      onClick={() => setBondingStatus("active")}
                      className="w-full justify-start"
                    >
                      In Progress
                    </Button>
                    <Button
                      size="small"
                      variant={
                        bondingStatus === "locked" ? "secondary" : "ghost"
                      }
                      onClick={() => setBondingStatus("locked")}
                      className="w-full justify-start"
                    >
                      Bonded
                    </Button>
                  </div>
                </div>
              </div>
            )}
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
                <div className="relative">
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
    </Fragment>
  );
}
