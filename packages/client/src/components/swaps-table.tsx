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
import { fromNow, shortenAddress, useCodex } from "@/utils";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Link } from "react-router";
import { twMerge } from "tailwind-merge";
import PausedIndicator from "./paused-indicator";
import { useTransactions } from "@/hooks/use-transactions";
import { env } from "@/utils/env";
import Pagination from "./pagination";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Codex } from "@codex-data/sdk";
import { RankingDirection } from "@codex-data/sdk/dist/resources/graphql";
import {
  AddTokenEventsOutput,
  EventType,
} from "@codex-data/sdk/dist/sdk/generated/graphql";
import { networkId } from "@/utils";
import { useEffect } from "react";
import { Tooltip } from "react-tooltip";
import dayjs from "dayjs";
import Interval from "./interval";

const codex = new Codex(import.meta.env.VITE_CODEX_API_KEY);

export default function SwapsTable({ token }: { token: IToken }) {
  const { paused, setPause } = usePause();
  const isCodex = useCodex(token);
  const queryClient = useQueryClient();
  const { items: data, isLoading } = useTransactions({
    tokenId: token.mint,
    isPaused: paused || isCodex,
  });

  const queryKey = ["token", token.mint, "swaps"];
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const data = await codex.queries.getTokenEvents({
        query: {
          address: token.mint,
          networkId,
          eventType: EventType.Swap,
        },
        direction: RankingDirection.Desc,
        limit: 50,
      });

      const items = data?.getTokenEvents?.items;
      return items;
    },
    enabled: isCodex,
  });

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

  const items = isCodex ? query?.data : data;

  useEffect(() => {
    let cleanupPromise: any;
    const sink = {
      next({ data }: { data: { onTokenEventsCreated: AddTokenEventsOutput } }) {
        const events = data?.onTokenEventsCreated?.events || [];
        if (events?.length > 1) {
          for (const event of events) {
            if (event?.eventType === EventType.Swap) {
              const data = queryClient.getQueryData(queryKey);
              queryClient.setQueryData(queryKey, [event, ...(data as any)]);
            }
          }
        }
      },
      complete() {
        console.log("SWAPS SUBSCRIPTION CLEANED");
      },
      error(error) {
        console.error("SWAPS SUBSCRIPTION: ", error);
      },
    };

    if (isCodex) {
      cleanupPromise = codex.subscriptions.onTokenEventsCreated(
        {
          input: {
            networkId,
            tokenAddress: token.mint,
          },
        },
        sink
      );
    }

    return () => {
      if (cleanupPromise) {
        cleanupPromise
          .then((cleanupFn) => {
            cleanupFn();
          })
          .catch((error) => {
            console.error("Error during codex subscription cleanup:", error);
          });
      }
    };
  }, []);

  const dataExtractor = (swap: any) => {
    let account;
    let swapType;
    let solana;
    let token;
    let transactionHash;
    let timestamp;

    if (isCodex) {
      account = swap?.maker || "NA";
      swapType = swap?.eventDisplayType || "Buy";
      solana = swap?.data?.priceBaseTokenTotal || "0";
      token = swap?.data?.amountNonLiquidityToken || "0";
      transactionHash = swap?.transactionHash || "";
      timestamp = swap?.timestamp * 1000 || 0;
    } else {
      account = swap?.user || "NA";
      swapType = swap?.type || "Buy";
      solana = swap?.solAmount || "0";
      token = swap?.tokenAmount || "0";
      transactionHash = swap?.txId || "";
      timestamp = swap?.timestamp || 0;
    }

    return { account, swapType, solana, token, transactionHash, timestamp };
  };

  return (
    <div
      className="space-y-12 h-fit overflow-y-hidden overflow-x-none relative"
      onMouseEnter={() => setPause(true)}
      onMouseLeave={() => setPause(false)}
    >
      {!isCodex ? (
        <div className="absolute right-0 top-1 transform">
          <PausedIndicator show={paused} />
        </div>
      ) : null}
      <Table className="border-0 !rounded-0 !border-spacing-y-0">
        <TableHeader>
          <TableRow className="bg-transparent">
            <TableHead className="w-[120px]">Account</TableHead>
            <TableHead className="text-left w-[100px]">Type</TableHead>
            <TableHead className="text-left">SOL</TableHead>
            <TableHead className="text-left">Token</TableHead>
            <TableHead className="text-right w-[80px]">Date</TableHead>
            <TableHead className="text-right w-[50px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(!isCodex ? isLoading : query?.isPending) ? (
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
          ) : (items || [])?.length > 0 ? (
            items?.map((swap, _) => {
              const {
                account,
                swapType,
                solana,
                token,
                transactionHash,
                timestamp,
              } = dataExtractor(swap);
              return (
                <TableRow
                  className="hover:bg-white/5"
                  key={`${transactionHash}_${_}`}
                >
                  <TableCell className="text-left text-sm">
                    <Link
                      to={env.getAccountUrl(account)}
                      target="_blank"
                      className="hover:text-autofun-text-highlight"
                    >
                      {shortenAddress(account)}
                    </Link>
                  </TableCell>
                  <TableCell
                    className={twMerge([
                      "text-left text-sm",
                      swapType === "Buy" ? "text-[#03FF24]" : "text-[#EF5350]",
                    ])}
                  >
                    {swapType}
                  </TableCell>
                  <TableCell className="text-left text-sm">
                    {formatSwapAmount(solana, true)}
                  </TableCell>
                  <TableCell className="text-left text-sm">
                    {formatSwapAmount(token, true)}
                  </TableCell>
                  <TableCell className="text-right text-sm text-autofun-text-secondary">
                    <Interval
                      ms={1000}
                      resolver={() => fromNow(timestamp, true)}
                    />
                  </TableCell>
                  <TableCell className="text-sm">
                    <Link
                      to={env.getTransactionUrl(transactionHash)}
                      target="_blank"
                    >
                      <ExternalLink className="ml-auto size-4 text-autofun-icon-secondary hover:text-autofun-text-highlight transition-colors duration-200" />
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
      {/* <div className="grid place-content-center">
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
      </div> */}
    </div>
  );
}
