import { ISwap, IToken } from "@/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table-raw";
import { fromNow, shortenAddress } from "@/utils";
import { useQuery } from "@tanstack/react-query";
import { getTokenSwapHistory } from "@/utils/api";
import { Link } from "react-router";
import { ExternalLink } from "lucide-react";
import { twMerge } from "tailwind-merge";
import usePauseHook from "@/hooks/use-pause-hook";

export default function SwapsTable({ token }: { token: IToken }) {
  const { pause, setPause } = usePauseHook();
  const query = useQuery({
    queryKey: ["swaps", token?.mint],
    queryFn: async () => {
      const data = await getTokenSwapHistory({ address: token?.mint });
      return data as { swaps: ISwap[] };
    },
    enabled: !pause || token?.mint ? true : false,
    refetchInterval: 2_500,
  });

  const data = query?.data?.swaps || ([] as ISwap[]);

  return (
    <Table className="border-0 !rounded-0 !border-spacing-y-0">
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
        {data?.map((swap: ISwap) => {
          return (
            <TableRow
              onMouseEnter={() => setPause(true)}
              onMouseLeave={() => setPause(false)}
              className="hover:bg-white/5"
              key={swap?.txId}
            >
              <TableCell className="text-left">
                {shortenAddress(swap?.user)}
              </TableCell>
              <TableCell
                className={twMerge([
                  "text-left",
                  swap?.direction === 0 ? "text-[#2FD345]" : "text-[#EF5350]",
                ])}
              >
                {swap?.direction === 0 ? "Buy" : "Sell"}
              </TableCell>
              <TableCell className="text-left">{swap?.amountIn}</TableCell>
              <TableCell className="text-left">{swap?.amountOut}</TableCell>
              <TableCell className="text-left">
                {fromNow(swap?.timestamp)}
              </TableCell>
              <TableCell>
                <Link
                  to={`https://solscan.io/tx/${swap?.txId}`}
                  target="_blank"
                >
                  <ExternalLink className="ml-auto size-4 text-autofun-icon-secondary" />
                </Link>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
