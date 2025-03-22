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
import { getTokenHolders } from "@/utils/api";
import { Link } from "react-router";
import { ExternalLink } from "lucide-react";

export default function HoldersTable({ token }: { token: IToken }) {
  const query = useQuery({
    queryKey: ["holders", token?.mint],
    queryFn: async () => {
      const data = await getTokenHolders({ address: token?.mint });
      return data as { holders: ITokenHolder[] };
    },
    enabled: token?.mint ? true : false,
    refetchInterval: 2_500,
  });

  const data = query?.data?.holders || ([] as ITokenHolder[]);

  return (
    <Table className="border-0 !rounded-0 !border-spacing-y-0">
      <TableHeader>
        <TableRow className="bg-transparent">
          <TableHead>Account</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="text-right">%</TableHead>
          <TableHead className="text-right" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {data?.map((holder: ITokenHolder) => {
          return (
            <TableRow key={holder?.address}>
              <TableCell className="text-left">
                {shortenAddress(holder?.address)}
              </TableCell>
              <TableCell className="text-right">{holder?.amount}</TableCell>
              <TableCell className="text-right">{holder?.percentage}</TableCell>
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
        })}
      </TableBody>
    </Table>
  );
}
