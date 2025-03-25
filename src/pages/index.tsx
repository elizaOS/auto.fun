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
import SkeletonImage from "@/components/skeleton-image";

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
      <div className="flex flex-col lg:flex-row gap-6 mb-8">
        {/* Token Showcase */}
        <div className="flex-1">
          <div className="aspect-[16/9] rounded-lg overflow-hidden bg-gradient-to-br from-autofun-background-action-primary/20 to-autofun-background-action-highlight/20">
            {/* Placeholder for token carousel - will need to be implemented with proper carousel component */}
            <div className="h-full p-8 flex flex-col justify-end">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-autofun-background-action-primary to-autofun-background-action-highlight"></div>
                  <div>
                    <h3 className="text-xl font-medium text-autofun-text-primary">
                      DEGEN
                    </h3>
                    <p className="text-sm text-autofun-text-secondary font-dm-mono">
                      $DEGEN
                    </p>
                  </div>
                  <div className="ml-auto">
                    <span className="px-3 py-1 rounded-full bg-autofun-background-action-highlight/10 text-autofun-text-highlight text-sm font-dm-mono">
                      MC: $1.2M
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-autofun-text-secondary">Holders</span>
                    <span className="text-autofun-text-primary font-dm-mono">
                      1,234
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-autofun-text-secondary">
                      24h Volume
                    </span>
                    <span className="text-autofun-text-primary font-dm-mono">
                      $234.5K
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sales Pitch */}
        <div className="flex-1 p-6">
          <h2 className="text-3xl font-medium text-autofun-text-highlight mb-4">
            Create memes.
            <br />
            Build a community.
          </h2>
          <div className="space-y-4">
            <p className="text-autofun-text-secondary">
              Launch your own AI-powered token and build a thriving community
              around your meme.
              <br />
              Our platform provides all the tools you need to succeed.
            </p>
            <div className="flex flex-wrap gap-4">
              <Button variant="primary">Create Token</Button>
              <Button variant="outline">Learn More</Button>
            </div>
          </div>
        </div>
      </div>
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
    </div>
  );
}
