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

export default function Page() {
  const [activeTab] = useViewMode();
  const { page, onPageChange } = usePagination();

  const query = useQuery({
    queryKey: ["tokens", page],
    queryFn: async () => {
      return await getTokens({
        page,
        limit: 12,
        sortBy: "featured",
        sortOrder: "desc",
      });
    },
    refetchInterval: 5000,
  });

  const data = query?.data?.tokens as IToken[];

  const pagination = {
    page: query?.data?.page || 1,
    totalPages: query?.data?.totalPages || 1,
    total: query?.data?.total || 1,
    hasMore: query?.data?.hasMore || false,
  } as IPagination;

  return (
    <div className="flex flex-col">
      {/* Top Navigation */}
      <div className="flex items-center gap-3 flex-wrap-reverse lg:flex-wrap">
        <GridListSwitcher />
        <div className="flex items-center gap-3">
          <Button variant="outline">All</Button>
          <Button>Market Cap</Button>
          <Button variant="outline">Creation Time</Button>
        </div>
      </div>

      {activeTab === "grid" ? (
        <div className="my-6">
          <GridView data={data} />
        </div>
      ) : (
        <div className="mb-2">
          <TableView data={data} />
        </div>
      )}

      <Pagination pagination={pagination} onPageChange={onPageChange} />
    </div>
  );
}
