import { Grid } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import CopyButton from "./copy-button";
import { formatNumber, fromNow, shortenAddress } from "@/utils";

export function TableView({ data }: { data: any }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-transparent">
          <TableHead className="max-w-[500px]">AI Agents</TableHead>
          <TableHead className="text-left">Market Cap</TableHead>
          <TableHead className="text-left">24H Volume</TableHead>
          <TableHead className="text-left">Holders Count</TableHead>
          <TableHead className="text-left">Bonding Curve</TableHead>
          <TableHead className="text-right">Creation Time</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data?.map((token, index: number) => {
          return (
            <TableRow key={index} className="cursor-pointer">
              <TableCell>
                <div className="flex items-center gap-4">
                  <div className="relative w-[50px] h-[50px] rounded-lg bg-[#262626] overflow-hidden">
                    {token.image ? (
                      <img
                        height={128}
                        width={128}
                        src={token.image}
                        alt={token.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Grid className="w-6 h-6 text-[#8C8C8C]" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-dm-mono text-base font-medium text-white truncate`}
                      >
                        {token.name}
                      </span>
                      <span
                        className={`font-dm-mono text-base font-normal text-[#8C8C8C] tracking-[2px] uppercase shrink-0`}
                      >
                        ${token.symbol}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-dm-mono text-xs text-[#8C8C8C] truncate`}
                      >
                        {shortenAddress(token.address)}
                      </span>
                      <CopyButton text={token.address} />
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-left text-[#2FD345]">{token.marketcap}</TableCell>
              <TableCell className="text-left">
                {formatNumber(token.marketcap)}
              </TableCell>
              <TableCell className="text-left">
                {token.bondingCurvePercentage}
              </TableCell>
              <TableCell className="text-left">
                <div className="flex items-center gap-2 w-full">
                  <div className="relative w-full h-2">
                    <div className="absolute w-full h-2 bg-[#2E2E2E] rounded-full" />
                    <div
                      className="absolute h-2 bg-gradient-to-r from-[#0F4916] to-[#2FD345] rounded-full"
                      style={{ width: `${token.bondingCurvePercentage}%` }}
                    />
                  </div>
                  <span className={`font-dm-mono text-sm text-white`}>
                    {token.bondingCurvePercentage}%
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-right">{fromNow(token.createdAt)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
