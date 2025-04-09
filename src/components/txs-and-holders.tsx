import { IToken } from "@/types";
import { queryClient } from "@/utils/api";
import { Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "react-toastify";
import Button from "./button";
import HoldersTable from "./holders-table";
import SwapsTable from "./swaps-table";

export default function TransactionsAndHolders({ token }: { token: IToken }) {
  const [mode, setMode] = useState<"transactions" | "holders">("transactions");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshData = async () => {
    if (isRefreshing) return;

    try {
      setIsRefreshing(true);

      // To refresh data, we'll invalidate and refetch the blockchain queries
      queryClient.invalidateQueries({
        queryKey: ["blockchain-swaps", token.mint],
      });
      queryClient.invalidateQueries({
        queryKey: ["blockchain-holders", token.mint],
      });

      // Also invalidate market metrics data
      queryClient.invalidateQueries({
        queryKey: ["blockchain-metrics", token.mint],
      });

      // Also invalidate any chart data that might be cached
      // This will force the chart to fetch fresh data on next render
      document.dispatchEvent(
        new CustomEvent("refresh-chart-data", {
          detail: { tokenMint: token.mint },
        })
      );

      // Force immediate refetch
      await Promise.all([
        queryClient.refetchQueries({
          queryKey: ["blockchain-swaps", token.mint],
        }),
        queryClient.refetchQueries({
          queryKey: ["blockchain-holders", token.mint],
        }),
        queryClient.refetchQueries({
          queryKey: ["blockchain-metrics", token.mint],
        }),
      ]);
    } catch (error) {
      console.error("Error refreshing blockchain data:", error);
      toast.error("Could not refresh blockchain data. Please try again later.");
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="md:overflow-x-hidden xs:max-w-fit md:max-w-full">
      <div className="flex items-center justify-between py-3">
        <div className="flex items-center">
          <Button
            size="small"
            variant={mode === "transactions" ? "primary" : "ghost"}
            onClick={() => setMode("transactions")}
          >
            Trades
          </Button>
          <Button
            size="small"
            variant={mode === "holders" ? "primary" : "ghost"}
            onClick={() => setMode("holders")}
          >
            Holders
          </Button>
        </div>
      </div>
      {mode === "transactions" ? (
        <SwapsTable token={token} />
      ) : (
        <HoldersTable token={token} />
      )}
    </div>
  );
}
