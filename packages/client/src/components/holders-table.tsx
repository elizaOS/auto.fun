import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table-raw";
import { IToken } from "@/types";
import { networkId, shortenAddress } from "@/utils";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Link } from "react-router";
import { env } from "@/utils/env";
import { Codex } from "@codex-data/sdk";
import { useQuery } from "@tanstack/react-query";
import {
  HoldersSortAttribute,
  RankingDirection,
} from "@codex-data/sdk/dist/sdk/generated/graphql";

function getPercentageOfTotal(value: number, total: number): string | number {
  if (total === 0) {
    return 0;
  }

  const percentage = (value / total) * 100;
  return percentage?.toFixed(2);
}

const codex = new Codex(import.meta.env.VITE_CODEX_API_KEY);

export default function HoldersTable({ token }: { token: IToken }) {
  const query = useQuery({
    queryKey: ["token", token.mint, "holders"],
    queryFn: async () => {
      const holders = await codex.queries.holders({
        input: {
          tokenId: `${token.mint}:${networkId}`,
          sort: {
            attribute: HoldersSortAttribute.Balance,
            direction: RankingDirection.Desc,
          },
        },
      });

      return holders?.holders?.items;
    },
    refetchInterval: 30_000,
  });

  const isLoading = query.isLoading;
  const supply = token?.tokenSupplyUiAmount;
  const data = query?.data || [];

  return (
    <Table className="border-0 !rounded-0 !border-spacing-y-0">
      <TableHeader className="relative">
        {/* <PausedIndicator show={paused} /> */}
        <TableRow className="bg-transparent">
          <TableHead className="text-left w-[120px]">Account</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="text-right w-[80px]">%</TableHead>
          <TableHead className="text-right w-[50px]" />
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
        ) : data?.length > 0 ? (
          data.map((holder) => {
            const formattedAmount: number =
              (Number(holder?.balance) ? Number(holder.balance) : 0) /
              10 ** (token.tokenDecimals || 6);
            return (
              <TableRow className="hover:bg-white/5" key={holder?.address}>
                <TableCell className="text-left text-sm">
                  <Link
                    to={env.getWalletUrl(holder.address)}
                    target="_blank"
                    className="hover:text-autofun-text-highlight"
                  >
                    {holder?.address ===
                    import.meta.env.VITE_BONDING_CURVE_ADDRESS
                      ? "Bonding Curve"
                      : shortenAddress(holder?.address)}
                  </Link>
                </TableCell>
                <TableCell className="text-right text-sm">
                  {formattedAmount.toLocaleString()}
                </TableCell>
                <TableCell className="text-right text-sm">
                  {getPercentageOfTotal(formattedAmount, supply)}%
                </TableCell>
                <TableCell className="text-sm">
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
