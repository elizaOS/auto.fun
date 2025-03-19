import BondingCurveBar from "@/components/bonding-curve-bar";
import Button from "@/components/button";
import CopyButton from "@/components/copy-button";
import Divider from "@/components/divider";
import SkeletonImage from "@/components/skeleton-image";
import { IToken } from "@/types";
import {
  abbreviateNumber,
  fromNow,
  normalizedProgress,
  shortenAddress,
} from "@/utils";
import { Link } from "react-router";

export default function GridView({ data }: { data: IToken[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {data?.map((token: IToken, _: number) => (
        <Link
          to={`/token/${token.mint}`}
          key={token.mint}
          className="bg-autofun-background-card p-4 rounded-lg border flex flex-col gap-3"
        >
          <div className="flex items-start gap-3 min-w-0">
            <div className="size-32">
              <SkeletonImage src={token.image} alt="image" />
            </div>
            <div className="flex flex-col gap-3 justify-between min-w-0">
              {/* Token Info and Time */}
              <div className="flex items-center w-full min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="capitalize text-autofun-text-primary text-base font-medium font-satoshi leading-normal truncate min-w-0">
                    {token.name}
                  </div>
                  <div className="text-autofun-text-secondary text-base font-normal font-dm-mono uppercase leading-normal tracking-widest truncate min-w-0">
                    ${token.ticker}
                  </div>
                </div>
                <div className="px-2 py-1 rounded-md border flex ml-auto shrink-0">
                  <div className="text-autofun-text-secondary text-xs font-medium font-dm-mono">
                    {fromNow(token.createdAt, true)}
                  </div>
                </div>
              </div>

              {/* Marketcap & Address */}
              <div className="flex flex-col w-full min-w-0">
                <div className="flex items-center justify-between w-full min-w-0">
                  <div className="text-autofun-text-secondary text-xs font-medium font-satoshi">
                    Market Cap
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="text-autofun-text-secondary text-xs font-normal font-dm-mono">
                      {shortenAddress(token.mint)}
                    </div>
                    <CopyButton text={token.mint} className="size-4" />
                  </div>
                </div>
                <div className="inline-flex justify-start items-center gap-2 min-w-0">
                  <div className="justify-start text-autofun-text-highlight text-xl font-medium font-dm-mono leading-7 truncate">
                    {abbreviateNumber(token.marketCapUSD)}
                  </div>
                </div>
              </div>

              {/* Bonding Curve */}
              <div className="flex items-center gap-2">
                <div className="text-autofun-text-info text-sm font-medium font-dm-mono">
                  Bonding Curve Progress
                </div>
                <div className="text-autofun-text-highlight text-sm font-normal font-dm-mono">
                  {normalizedProgress(token.curveProgress)}%
                </div>
              </div>
              <BondingCurveBar progress={token.curveProgress} />
            </div>
          </div>
          {/* Description */}
          <div className="flex-1 self-stretch justify-start">
            <span className="text-autofun-text-secondary text-xs font-normal font-dm-mono leading-tight line-clamp-2 h-8">
              {token.description}
            </span>
            <span className="text-autofun-text-primary text-xs font-normal font-dm-mono leading-tight">
              See More...
            </span>
          </div>
          <Divider />
          <Button
            variant="primary"
            size="large"
            className="hover:border-autofun-stroke-highlight"
          >
            Buy
          </Button>
        </Link>
      ))}
    </div>
  );
}
