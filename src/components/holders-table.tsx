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
import { shortenAddress } from "@/utils";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Link } from "react-router";
// import PausedIndicator from "./paused-indicator";
import { useHolders } from "@/hooks/use-holders";
import { env } from "@/utils/env";

export default function HoldersTable({ token }: { token: IToken }) {
  const { /*paused,*/ setPause } = usePause();
  console.log(
    `HoldersTable: Rendering for token ${token?.ticker} (${token?.mint})`,
  );

  const query = useHolders({ tokenId: token.mint });

  const isLoading = query.isLoading;
  const data = query?.items;

  return (
    <Table
      className="border-0 !rounded-0 !border-spacing-y-0"
      onMouseEnter={() => setPause(true)}
      onMouseLeave={() => setPause(false)}
    >
      <TableHeader className="relative">
        {/* <PausedIndicator show={paused} /> */}
        <TableRow className="bg-transparent">
          <TableHead>Account</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="text-right">%</TableHead>
          <TableHead className="text-right">View</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableRow>
            <TableCell colSpan={4} className="text-center py-8">
              <div className="flex flex-col items-center gap-2">
                <RefreshCw className="animate-spin size-5 text-autofun-text-secondary" />
                <p className="text-autofun-text-secondary">
                  Fetching holders from blockchain...
                </p>
              </div>
            </TableCell>
          </TableRow>
        ) : data.length > 0 ? (
          data.map((holder) => {
            return (
              <TableRow className="hover:bg-white/5" key={holder?.address}>
                <TableCell className="text-left">
                  <Link
                    to={env.getWalletUrl(holder.address)}
                    target="_blank"
                    className="hover:text-autofun-text-highlight"
                  >
                    {holder?.address === import.meta.env.VITE_BONDING_CURVE_ADDRESS ? "Bonding Curve" : shortenAddress(holder?.address)}
                  </Link>
                </TableCell>
                <TableCell className="text-right">
                  {holder?.amount.toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  {holder?.percentage.toFixed(2)}%
                </TableCell>
                <TableCell>
                  <Link to={env.getWalletUrl(holder.address)} target="_blank">
                    <ExternalLink className="ml-auto size-4 text-autofun-icon-secondary" />
                  </Link>
                </TableCell>
              </TableRow>
            );
          })
        ) : (
          <TableRow>
            <TableCell
              colSpan={4}
              className="text-center py-8 text-autofun-text-secondary"
            >
              <div className="flex flex-col items-center gap-2">
                <p>No holders data available from blockchain.</p>
                <Link
                  to={env.getHolderURL(token?.mint)}
                  target="_blank"
                  className="text-autofun-text-highlight hover:underline flex items-center gap-1"
                >
                  View all token holders on Solscan{" "}
                  <ExternalLink className="size-4" />
                </Link>
              </div>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
