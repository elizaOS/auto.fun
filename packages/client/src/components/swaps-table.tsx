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
import {
  formatNumber,
  fromNow,
  LAMPORTS_PER_SOL,
  resizeImage,
  shortenAddress,
  useCodex,
} from "@/utils";
import { getSwaps } from "@/utils/api";
import { env } from "@/utils/env";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { Link } from "react-router";
import Interval from "./interval";
import Loader from "./loader";
import PausedIndicator from "./paused-indicator";
import Triangle from "./triangle";

export default function SwapsTable({ token }: { token: IToken }) {
  const { paused, setPause } = usePause();
  const isCodex = useCodex(token);

  const queryKey = ["token", token.mint, "swaps"];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const data = await getSwaps({ address: token.mint });
      return data;
    },
    refetchInterval: 7500,
  });

  const items = query?.data?.swaps;

  const dataExtractor = (swap: any) => {
    if (isCodex) return swap;
    const account = swap?.user || "NA";
    const swapType = swap?.direction === 0 ? "Buy" : "Sell";

    const solana =
      swap.direction === 0
        ? String(swap.amountIn / LAMPORTS_PER_SOL)
        : String(swap.amountOut / LAMPORTS_PER_SOL);

    const tokenAmount =
      swap.direction === 0
        ? String(swap.amountOut / 10 ** 6)
        : String(swap.amountIn / 10 ** 6);

    const transactionHash = swap?.txId || "";
    const timestamp = swap?.timestamp || 0;

    return {
      account,
      swapType,
      solana,
      tokenAmount,
      transactionHash,
      timestamp,
      usdValue: null,
    };
  };

  if (query?.isPending) {
    return <Loader />;
  }

  if ((items || [])?.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2">
        <img
          className="w-auto grayscale size-16 select-none"
          src="/dice.svg"
          alt="logo"
        />
        <p className="text-sm font-dm-mono text-autofun-text-secondary">
          No trades were found.
        </p>
      </div>
    );
  }

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
            <TableHead className="text-center w-[75px]">Type</TableHead>
            <TableHead className="text-left w-[275px]">SOL</TableHead>
            <TableHead className="text-left">Token</TableHead>
            <TableHead className="text-right w-[80px]">Date</TableHead>
            <TableHead className="text-right w-[50px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(items || [])?.length > 0
            ? ((items || []).length > 100 ? items?.splice(0, 50) : items)?.map(
                (swap, _) => {
                  const {
                    account,
                    swapType,
                    solana,
                    usdValue,
                    tokenAmount,
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
                      <TableCell className="text-center text-sm">
                        <Triangle
                          color={
                            swapType === "Buy"
                              ? "bg-[#03FF24] m-auto"
                              : "bg-[#EF5350] rotate-180 m-auto"
                          }
                        />
                      </TableCell>
                      <TableCell className="text-left">
                        <div className="flex items-center gap-2">
                          <img
                            src="/solana.svg"
                            width={32}
                            height={32}
                            className="size-2.5 rounded-full"
                          />
                          <span className="text-sm">
                            {solana}
                            {/* {formatNumber(solana, true, true)} */}
                          </span>
                          {usdValue ? (
                            <span className="text-autofun-text-secondary text-xs">
                              {formatNumber(usdValue, true)}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-left text-sm">
                        <div className="flex items-center gap-2">
                          <img
                            src={
                              token?.image
                                ? resizeImage(token.image, 50, 50)
                                : "/placeholder.png"
                            }
                            width={32}
                            height={32}
                            className="size-2.5 rounded-full"
                          />
                          <span className="text-sm">
                            {formatNumber(tokenAmount, true, true)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm text-autofun-text-secondary">
                        <Interval
                          ms={800}
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
                },
              )
            : null}
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
