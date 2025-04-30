import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { IToken } from "@/types";
import {
  abbreviateNumber,
  formatNumber,
  fromNow,
  resizeImage,
  sanitizeCheckmark,
  shortenAddress,
} from "@/utils";
import { useNavigate } from "react-router";
import BondingCurveBar from "./bonding-curve-bar";
import CopyButton from "./copy-button";
import SkeletonImage from "./skeleton-image";
import { twMerge } from "tailwind-merge";
import Verified from "./verified";
import { ArrowDown, ArrowUp } from "lucide-react";

type SortOrderType = "asc" | "desc";

interface TableViewProps {
  data: IToken[];
  sortBy: keyof IToken | null;
  sortOrder: SortOrderType;
  setSortBy: (sortBy: keyof IToken | null) => void;
  setSortOrder: (sortOrder: SortOrderType) => void;
}

export function TableView({
  data,
  sortBy,
  sortOrder,
  setSortBy,
  setSortOrder,
}: TableViewProps) {
  const navigate = useNavigate();

  const handleSort = (columnKey: keyof IToken) => {
    if (sortBy === columnKey) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(columnKey);
      setSortOrder("desc");
    }
  };

  const SortIcon = ({ columnKey }: { columnKey: keyof IToken }) => {
    if (sortBy !== columnKey) return null;
    return sortOrder === "asc" ? (
      <ArrowUp className="ml-1 h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3" />
    );
  };

  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-transparent">
          <TableHead className="w-[500px]">Coin</TableHead>
          <TableHead className="text-left">
            <button
              className="flex items-center gap-1 hover:text-foreground transition-colors uppercase"
              onClick={() => handleSort("marketCapUSD")}
            >
              <span className="hidden md:inline">Market Cap</span>
              <span className="md:hidden">MCap</span>
              <SortIcon columnKey="marketCapUSD" />
            </button>
          </TableHead>
          <TableHead className="text-left">
            <button
              className="flex items-center gap-1 hover:text-foreground transition-colors uppercase"
              onClick={() => handleSort("volume24h")}
            >
              <span className="hidden md:inline">24H Volume</span>
              <span className="md:hidden">24H</span>
              <SortIcon columnKey="volume24h" />
            </button>
          </TableHead>
          <TableHead className="text-left">
            <button
              className="flex items-center gap-1 hover:text-foreground transition-colors uppercase"
              onClick={() => handleSort("holderCount")}
            >
              <span className="hidden md:inline">Holders</span>
              <span className="md:hidden">Hold</span>
              <SortIcon columnKey="holderCount" />
            </button>
          </TableHead>
          <TableHead className="text-left">
            <button
              className="flex items-center gap-1 hover:text-foreground transition-colors uppercase"
              onClick={() => handleSort("curveProgress")}
            >
              <span className="hidden md:inline">Bonding Curve</span>
              <span className="md:hidden">Bonding</span>
              <SortIcon columnKey="curveProgress" />
            </button>
          </TableHead>
          <TableHead className="text-right mr-2">
            <button
              className="flex items-center gap-1 hover:text-foreground transition-colors ml-auto uppercase"
              onClick={() => handleSort("createdAt")}
            >
              Age
              <SortIcon columnKey="createdAt" />
            </button>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((token: IToken) => {
          return (
            <TableRow
              key={token.mint}
              className="cursor-pointer p-4"
              onClick={() => navigate(`/token/${token.mint}`)}
            >
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className="relative size-[50px] bg-[#262626] overflow-hidden">
                    <SkeletonImage
                      src={
                        token?.image
                          ? resizeImage(token.image, 50, 50)
                          : "/logo.png"
                      }
                      alt={token?.name || "token"}
                      className={twMerge([
                        "w-full h-full object-cover",
                        !token?.image ? "grayscale" : "",
                      ])}
                    />
                  </div>
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex flex-col md:flex-row min-w-0 items-start">
                      <div className="capitalize text-autofun-text-primary text-base font-medium font-satoshi truncate min-w-0">
                        {window.innerWidth <= 768
                          ? sanitizeCheckmark(token?.name).slice(0, 15) +
                            (sanitizeCheckmark(token?.name).length > 15
                              ? "..."
                              : "")
                          : token.name}
                      </div>
                      <div className="text-autofun-text-secondary md:ml-2 text-base font-normal font-dm-mono uppercase truncate min-w-0">
                        ${token.ticker}
                      </div>
                      <Verified isVerified={token?.verified ? true : false} />
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
              <TableCell className="text-left text-[#03FF24]">
                {formatNumber(token.marketCapUSD)}
              </TableCell>
              <TableCell className="text-left">
                {formatNumber(token.volume24h)}
              </TableCell>
              <TableCell className="text-left">
                {abbreviateNumber(token?.holderCount || 0, true)}
              </TableCell>
              <TableCell className="text-left">
                <div className="flex items-center gap-2 w-full">
                  {token.imported === 0 && (
                    <BondingCurveBar progress={token.curveProgress} />
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right pr-4">
                {fromNow(token.createdAt, true)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
