import { ArrowUpDown } from "lucide-react";
import Button from "./button";
import SkeletonImage from "./skeleton-image";
import { IToken } from "@/types";
import { optimizePinataImage } from "@/utils/api";
import { formatNumber } from "@/utils";

export default function Trade({ token }: { token: IToken }) {
  const solanaPrice = token?.solPriceUSD || 0;

  return (
    <div className="relative border rounded-md p-4 bg-autofun-background-card">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col">
          {/* Selling */}
          <div className="flex flex-col py-3 px-4 bg-autofun-background-input border rounded-md gap-[18px]">
            <span className="text-base font-dm-mono text-autofun-text-primary select-none">
              Selling
            </span>
            <div className="flex justify-between gap-3">
              <span className="text-4xl font-dm-mono text-autofun-text-secondary select-none">
                0.00
              </span>
              <TokenDisplay token={token} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-dm-mono text-autofun-text-secondary select-none">
                {formatNumber(solanaPrice, true)}
              </span>
            </div>
          </div>
          <div className="h-[10px] z-20 relative">
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 size-10 rounded-full border-3 cursor-pointer select-none border-autofun-background-card bg-autofun-background-action-primary inline-flex">
              <ArrowUpDown className="m-auto size-3.5" />
            </div>
          </div>
          {/* Buying */}
          <div className="flex flex-col py-3 px-4 bg-autofun-background-input border rounded-md gap-[18px]">
            <span className="text-base font-dm-mono text-autofun-text-primary select-none">
              Buying
            </span>
            <div className="flex justify-between gap-3">
              <span className="text-4xl font-dm-mono text-autofun-text-secondary select-none">
                0.00
              </span>
              <TokenDisplay token={token} isSolana />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-dm-mono text-autofun-text-secondary select-none">
                $0
              </span>
            </div>
          </div>
        </div>

        <Button variant="secondary" className="font-dm-mono" size="large">
          Connect
        </Button>
      </div>
    </div>
  );
}

const TokenDisplay = ({
  token,
  isSolana,
}: {
  token: IToken;
  isSolana?: boolean;
}) => {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-autofun-background-card p-2 select-none">
      <SkeletonImage
        src={
          isSolana
            ? "/solana.png"
            : token?.image
            ? optimizePinataImage(token.image, 50, 50)
            : ""
        }
        alt={token?.name || "token"}
        className="rounded-full size-6"
      />
      <span className="text-base uppercase font-dm-mono tracking-wider">
        {isSolana ? "SOL" : token?.ticker}
      </span>
    </div>
  );
};
