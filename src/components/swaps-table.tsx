import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table-raw";
import usePause from "@/hooks/use-pause";
import { IToken } from "@/types";
import { fromNow, shortenAddress } from "@/utils";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Link } from "react-router";
import { twMerge } from "tailwind-merge";
// import PausedIndicator from "./paused-indicator";
import { useTransactions } from "@/hooks/use-transactions";
import { env } from "@/utils/env";
import Pagination from "./pagination";

export default function SwapsTable({ token }: { token: IToken }) {
  const { /*paused,*/ setPause } = usePause();
  const {
    items: data,
    goToPage,
    isLoading,
    currentPage,
    hasNextPage,
    totalItems,
    totalPages,
  } = useTransactions({ tokenId: token.mint });

  // Helper to format swap amounts based on type
  const formatSwapAmount = (amount: number | string, isToken: boolean) => {
    const numericAmount =
      typeof amount === "string" ? parseFloat(amount) : amount;

    if (isNaN(numericAmount)) return "0";

    if (isToken) {
      // Format token amount
      if (numericAmount >= 1000000) {
        return `${(numericAmount / 1000000).toFixed(2)}M`;
      } else if (numericAmount >= 1000) {
        return `${(numericAmount / 1000).toFixed(2)}K`;
      } else {
        return numericAmount.toFixed(2);
      }
    } else {
      return numericAmount.toFixed(4);
    }
  };

  return (
    <div className="space-y-12 h-fit overflow-y-auto">
      <Table
        className="border-0 !rounded-0 !border-spacing-y-0"
        onMouseEnter={() => setPause(true)}
        onMouseLeave={() => setPause(false)}
      >
        {/* <PausedIndicator show={paused} /> */}
        <TableHeader>
          <TableRow className="bg-transparent">
            <TableHead>Account</TableHead>
            <TableHead className="text-left">Type</TableHead>
            <TableHead className="text-left">SOL</TableHead>
            <TableHead className="text-left">Token</TableHead>
            <TableHead className="text-left w-[150px]">Date</TableHead>
            <TableHead className="text-right">Txn</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8">
                <div className="flex flex-col items-center gap-2">
                  <RefreshCw className="animate-spin size-5 text-autofun-text-secondary" />
                  <p className="text-autofun-text-secondary">
                    Fetching transactions from blockchain...
                  </p>
                </div>
              </TableCell>
            </TableRow>
          ) : data.length > 0 ? (
            data
              .sort(
                (a, b) =>
                  new Date(b.timestamp).getTime() -
                  new Date(a.timestamp).getTime()
              )
              .map((swap, _) => {
                const isBuy = swap.type === "Buy";
                return (
                  <TableRow
                    className="hover:bg-white/5"
                    key={`${swap?.txId}_${_}`}
                  >
                    <TableCell className="text-left">
                      <Link
                        to={env.getAccountUrl(swap?.user)}
                        target="_blank"
                        className="hover:text-autofun-text-highlight"
                      >
                        {shortenAddress(swap?.user)}
                      </Link>
                    </TableCell>
                    <TableCell
                      className={twMerge([
                        "text-left",
                        isBuy ? "text-[#2FD345]" : "text-[#EF5350]",
                      ])}
                    >
                      {swap.type}
                    </TableCell>
                    <TableCell className="text-left">
                      {formatSwapAmount(swap.solAmount, !isBuy)}
                    </TableCell>
                    <TableCell className="text-left">
                      {formatSwapAmount(swap.tokenAmount, true)}
                    </TableCell>
                    <TableCell className="text-left">
                      {fromNow(swap?.timestamp)}
                    </TableCell>
                    <TableCell>
                      <Link
                        to={env.getTransactionUrl(swap.txId)}
                        target="_blank"
                      >
                        <ExternalLink className="ml-auto size-4 text-autofun-icon-secondary" />
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })
          ) : (
            <TableRow>
              <TableCell
                colSpan={6}
                className="text-center py-8 text-autofun-text-secondary"
              >
                <div className="flex flex-col items-center gap-2">
                  <p>No transaction data available from blockchain.</p>
                  <Link
                    to={`https://solscan.io/token/${token?.mint}#trades`}
                    target="_blank"
                    className="text-autofun-text-highlight hover:underline flex items-center gap-1"
                  >
                    View all trades on Solscan{" "}
                    <ExternalLink className="size-4" />
                  </Link>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <div className="grid place-content-center">
        <Pagination
          pagination={{
            hasMore: hasNextPage,
            page: currentPage,
            total: totalItems,
            totalPages: totalPages,
          }}
          onPageChange={(pageNumber: number) => {
            if (isLoading) return;
            goToPage(pageNumber);
          }}
        />
      </div>
    </div>
  );
}
