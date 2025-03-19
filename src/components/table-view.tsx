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
import BondingCurveBar from "./bonding-curve-bar";
import SkeletonImage from "./skeleton-image";
import { useNavigate } from "react-router";
import { IToken } from "@/types";

export function TableView({ data }: { data: IToken[] }) {
  const navigate = useNavigate();
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-transparent">
          <TableHead className="w-[500px]">AI Agents</TableHead>
          <TableHead className="text-left">Market Cap</TableHead>
          <TableHead className="text-left">24H Volume</TableHead>
          <TableHead className="text-left">Holders Count</TableHead>
          <TableHead className="text-left">Bonding Curve</TableHead>
          <TableHead className="text-right">Creation Time</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data?.map((token: IToken, index: number) => {
          return (
            <TableRow
              key={index}
              className="cursor-pointer"
              onClick={() => navigate(`/token/${token.mint}`)}
            >
              <TableCell>
                <div className="flex items-center gap-4">
                  <div className="relative w-[50px] h-[50px] rounded-lg bg-[#262626] overflow-hidden">
                    {token.image ? (
                      <SkeletonImage
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
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="capitalize text-autofun-text-primary text-base font-medium font-satoshi leading-normal truncate min-w-0">
                        {token.name}
                      </div>
                      <div className="text-autofun-text-secondary text-base font-normal font-dm-mono uppercase leading-normal tracking-widest truncate min-w-0">
                        ${token.ticker}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="text-autofun-text-secondary text-xs font-normal font-dm-mono">
                        {shortenAddress(token.mint)}
                      </div>
                      <CopyButton text={token.mint} className="size-4" />
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-left text-[#2FD345]">
                {formatNumber(token.marketCapUSD)}
              </TableCell>
              <TableCell className="text-left">
                {formatNumber(token.volume24h)}
              </TableCell>
              <TableCell className="text-left">{token.holderCount}</TableCell>
              <TableCell className="text-left">
                <div className="flex items-center gap-2 w-full">
                  <BondingCurveBar progress={100} />
                  <span className={`font-dm-mono text-sm text-white`}>
                    {100}%
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-right">
                {fromNow(token.createdAt)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
