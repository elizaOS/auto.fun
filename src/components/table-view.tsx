import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { IToken } from "@/types";
import { formatNumber, fromNow, resizeImage, shortenAddress } from "@/utils";
import { useNavigate } from "react-router";
import BondingCurveBar from "./bonding-curve-bar";
import CopyButton from "./copy-button";
import SkeletonImage from "./skeleton-image";
import { twMerge } from "tailwind-merge";
import Verified from "./verified";

export function TableView({ data }: { data: IToken[] }) {
  const navigate = useNavigate();
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-transparent">
          <TableHead className="w-[500px]">Coin</TableHead>
          <TableHead className="text-left">
            <span className="hidden md:inline">Market Cap</span>
            <span className="md:hidden">MCap</span>
          </TableHead>
          <TableHead className="text-left">
            <span className="hidden md:inline">24H Volume</span>
            <span className="md:hidden">24H</span>
          </TableHead>
          <TableHead className="text-left">
            <span className="hidden md:inline">Holders</span>
            <span className="md:hidden">Hold</span>
          </TableHead>
          <TableHead className="text-left">
            <span className="hidden md:inline">Bonding Curve</span>
            <span className="md:hidden">Bonding</span>
          </TableHead>
          <TableHead className="text-right">Age</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data
          ?.filter(
            (token, index, self) =>
              self.findIndex((t) => t.mint === token.mint) === index,
          )
          .map((token: IToken) => {
            return (
              <TableRow
                key={token.mint}
                className="cursor-pointer"
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
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="capitalize text-autofun-text-primary text-base font-medium font-satoshi leading-normal truncate min-w-0">
                          {token.name}
                        </div>
                        <div className="text-autofun-text-secondary text-base font-normal font-dm-mono uppercase leading-normal tracking-widest truncate min-w-0">
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
                <TableCell className="text-left text-[#2FD345]">
                  {formatNumber(token.marketCapUSD)}
                </TableCell>
                <TableCell className="text-left">
                  {formatNumber(token.volume24h)}
                </TableCell>
                <TableCell className="text-left">{token.holderCount}</TableCell>
                <TableCell className="text-left">
                  <div className="flex items-center gap-2 w-full">
                    {token.imported === 0 && (
                      <BondingCurveBar progress={token.curveProgress} />
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {fromNow(token.createdAt)
                    .replace(" ago", "")
                    .replace(" days", "d")
                    .replace(" hours", "hr")
                    .replace(" minutes", "m")
                    .replace(" seconds", "s")
                    .replace(" day", "d")
                    .replace("an hour", "1hr")
                    .replace(" minute", "m")
                    .replace(" second", "s")
                    .trim()}
                </TableCell>
              </TableRow>
            );
          })}
      </TableBody>
    </Table>
  );
}
