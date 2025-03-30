import { IToken, ITokenHolder } from "@/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table-raw";
import { shortenAddress } from "@/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { ExternalLink, RefreshCw } from "lucide-react";
import usePause from "@/hooks/use-pause";
import PausedIndicator from "./paused-indicator";
import { fetchTokenHolders, TokenHolder } from "@/utils/blockchain";

export default function HoldersTable({ token }: { token: IToken }) {
  const { paused, setPause } = usePause();
  console.log(`HoldersTable: Rendering for token ${token?.ticker} (${token?.mint})`);
  
  const query = useQuery({
    queryKey: ["blockchain-holders", token?.mint],
    queryFn: async () => {
      console.log(`HoldersTable: Fetching holders directly from blockchain for ${token?.mint}`);
      try {
        const result = await fetchTokenHolders(token?.mint);
        console.log(`HoldersTable: Retrieved ${result.total} holders from blockchain`);
        return result;
      } catch (error) {
        console.error(`HoldersTable: Error fetching holders data:`, error);
        return { holders: [], total: 0 };
      }
    },
    enabled: !paused && token?.mint ? true : false,
    refetchInterval: 30000, // Longer interval for blockchain queries to avoid rate limits
    staleTime: 60000, // Data stays fresh for 1 minute
  });

  const isLoading = query.isLoading;
  const data = query?.data?.holders || [];
  const totalHolders = query?.data?.total || 0;

  return (
    <Table
      className="border-0 !rounded-0 !border-spacing-y-0"
      onMouseEnter={() => setPause(true)}
      onMouseLeave={() => setPause(false)}
    >
      <TableHeader className="relative">
        <PausedIndicator show={paused} />
        <TableRow className="bg-transparent">
          <TableHead>Account</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="text-right">%</TableHead>
          <TableHead className="text-right" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableRow>
            <TableCell colSpan={4} className="text-center py-8">
              <div className="flex flex-col items-center gap-2">
                <RefreshCw className="animate-spin size-5 text-autofun-text-secondary" />
                <p className="text-autofun-text-secondary">Fetching holders from blockchain...</p>
              </div>
            </TableCell>
          </TableRow>
        ) : data.length > 0 ? (
          data.map((holder: TokenHolder) => {
            return (
              <TableRow className="hover:bg-white/5" key={holder?.address}>
                <TableCell className="text-left">
                  <Link to={`https://solscan.io/account/${holder?.address}`} target="_blank" className="hover:text-autofun-text-highlight">
                    {shortenAddress(holder?.address)}
                  </Link>
                </TableCell>
                <TableCell className="text-right">{holder?.amount.toLocaleString()}</TableCell>
                <TableCell className="text-right">{holder?.percentage}%</TableCell>
                <TableCell>
                  <Link
                    to={`https://solscan.io/account/${holder?.address}`}
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
            <TableCell colSpan={4} className="text-center py-8 text-autofun-text-secondary">
              <div className="flex flex-col items-center gap-2">
                <p>No holders data available from blockchain.</p>
                <Link to={`https://solscan.io/token/${token?.mint}#holders`} target="_blank" className="text-autofun-text-highlight hover:underline flex items-center gap-1">
                  View all token holders on Solscan <ExternalLink className="size-4" />
                </Link>
              </div>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
