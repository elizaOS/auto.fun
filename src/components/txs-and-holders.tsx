import { IToken, ISwap, ITokenHolder } from "@/types";
import { useState } from "react";
import Button from "./button";
import SwapsTable from "./swaps-table";
import HoldersTable from "./holders-table";
import { toast } from "react-toastify";
import { Loader2, RefreshCw } from "lucide-react";
import { getTokenHolders, getTokenSwapHistory } from "@/utils/api";
import { queryClient } from "@/utils/api";

export default function TransactionsAndHolders({ token }: { token: IToken }) {
  const [mode, setMode] = useState<"transactions" | "holders">("transactions");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshData = async () => {
    if (isRefreshing) return;
    
    try {
      setIsRefreshing(true);
      toast.info("Refreshing blockchain data...");
      
      // To refresh data, we'll invalidate and refetch the blockchain queries
      queryClient.invalidateQueries({ queryKey: ["blockchain-swaps", token.mint] });
      queryClient.invalidateQueries({ queryKey: ["blockchain-holders", token.mint] });
      
      // Also invalidate market metrics data
      queryClient.invalidateQueries({ queryKey: ["blockchain-metrics", token.mint] });
      
      // Also invalidate any chart data that might be cached
      // This will force the chart to fetch fresh data on next render
      document.dispatchEvent(new CustomEvent('refresh-chart-data', { 
        detail: { tokenMint: token.mint }
      }));
      
      // Force immediate refetch
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["blockchain-swaps", token.mint] }),
        queryClient.refetchQueries({ queryKey: ["blockchain-holders", token.mint] }),
        queryClient.refetchQueries({ queryKey: ["blockchain-metrics", token.mint] })
      ]);
      
      toast.success("Blockchain data refreshed");
    } catch (error) {
      console.error("Error refreshing blockchain data:", error);
      toast.error("Could not refresh blockchain data. Please try again later.");
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="border md:overflow-x-hidden xs:max-w-fit md:max-w-full bg-autofun-background-card">
      <div className="flex items-center justify-between p-3">
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
        <Button
          size="small"
          variant="ghost"
          onClick={refreshData}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <Loader2 className="size-4 animate-spin mr-1" />
          ) : (
            <RefreshCw className="size-4 mr-1" />
          )}
          Refresh Data
        </Button>
      </div>
      {mode === "transactions" ? (
        <SwapsTable token={token} />
      ) : (
        <HoldersTable token={token} />
      )}
    </div>
  );
}
