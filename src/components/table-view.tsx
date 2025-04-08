import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { IToken } from "@/types";
import { formatNumber, fromNow, shortenAddress } from "@/utils";
import { Grid } from "lucide-react";
import { useNavigate } from "react-router";
import BondingCurveBar from "./bonding-curve-bar";
import CopyButton from "./copy-button";
import SkeletonImage from "./skeleton-image";
import { twMerge } from "tailwind-merge";

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
        {data?.map((token: IToken) => {
          return (
            <TableRow
              key={token.mint}
              className="cursor-pointer"
              onClick={() => navigate(`/token/${token.mint}`)}
            >
              <TableCell>
                <div className="flex items-center gap-4">
                  <div className="relative size-[50px] bg-[#262626] overflow-hidden">
                    <SkeletonImage
                      src={token?.image || "/logo.png"}
                      alt={token?.name || "token"}
                      className={twMerge([
                        "w-full h-full object-cover",
                        !token?.image ? "grayscale" : "",
                      ])}
                    />
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
                      <div onClick={(e) => e.stopPropagation()}>
                        <CopyButton text={token.mint} />
                      </div>
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
                  <BondingCurveBar progress={token.curveProgress} />
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
