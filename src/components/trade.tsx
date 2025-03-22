import { IToken } from "@/types";
import { formatNumber } from "@/utils";
import { ArrowUpDown, Cog, Info, Wallet } from "lucide-react";
import { Fragment, useState } from "react";
import { twMerge } from "tailwind-merge";
import Button from "./button";
import ConfigDialog from "./config-dialog";
import SkeletonImage from "./skeleton-image";

export default function Trade({ token }: { token: IToken }) {
  const solanaPrice = token?.solPriceUSD || 0;
  const [isTokenSelling, setIsTokenSelling] = useState<boolean>(false);
  const [sellingAmount, setSellingAmount] = useState<number | undefined>(
    undefined
  );
  const [error] = useState<string | undefined>("");

  const isDisabled = ["migrating", "migration_failed", "failed"].includes(
    token.status
  );

  return (
    <div className="relative border rounded-md p-4 bg-autofun-background-card">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col">
          {/* Selling */}
          <div
            className={twMerge([
              "flex flex-col py-3 px-4 bg-autofun-background-input border rounded-md gap-[18px] transition-colors duration-200",
              error ? "border-autofun-text-error" : "",
            ])}
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-base font-dm-mono text-autofun-text-primary select-none">
                Selling
              </span>
              <div className="flex items-center gap-0.5 xl:ml-auto">
                <Button size="small" variant="trade">
                  Reset
                </Button>
                {isTokenSelling ? (
                  <Fragment>
                    <Button size="small" variant="trade">
                      25%
                    </Button>
                    <Button size="small" variant="trade">
                      50%
                    </Button>
                    <Button size="small" variant="trade">
                      100%
                    </Button>
                  </Fragment>
                ) : (
                  <Fragment>
                    <Button size="small" variant="trade">
                      0.5
                    </Button>
                    <Button size="small" variant="trade">
                      1
                    </Button>
                    <Button size="small" variant="trade">
                      5
                    </Button>
                  </Fragment>
                )}
                <ConfigDialog>
                  <Button size="small" variant="trade">
                    <Cog />
                  </Button>
                </ConfigDialog>
              </div>
            </div>
            <div className="flex justify-between gap-3">
              <input
                className="text-4xl font-dm-mono text-autofun-text-secondary w-3/4 outline-none"
                min={0}
                type="number"
                onChange={({ target }) =>
                  setSellingAmount(Number(target.value))
                }
                value={sellingAmount}
                placeholder="0"
              />
              <div className="w-fit shrink-0">
                <TokenDisplay token={token} isSolana={!isTokenSelling} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-dm-mono text-autofun-text-secondary select-none">
                {!isTokenSelling
                  ? formatNumber(Number(sellingAmount || 0) * solanaPrice, true)
                  : token?.tokenPriceUSD
                    ? formatNumber(
                        Number(sellingAmount || 0) * token?.tokenPriceUSD,
                        true
                      )
                    : formatNumber(0)}
              </span>
              <Balance token={token} isSolana={!isTokenSelling} />
            </div>
          </div>
          <div className="h-[10px] z-20 relative">
            <div
              onClick={() => setIsTokenSelling(!isTokenSelling)}
              className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 size-10 rounded-full border-3 cursor-pointer select-none border-autofun-background-card bg-autofun-background-action-primary inline-flex"
            >
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
              <TokenDisplay token={token} isSolana={isTokenSelling} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-dm-mono text-autofun-text-secondary select-none">
                $0
              </span>
              <Balance token={token} isSolana={isTokenSelling} />
            </div>
          </div>
        </div>

        <div
          className={twMerge([
            "flex items-center gap-2 h-4 transition-opacity duration-200",
            error ? "opacity-100" : "opacity-0",
          ])}
        >
          <Info className="text-autofun-text-error size-4" />
          <p className="text-autofun-text-error text-xs font-dm-mono">
            Insufficient Funds: You have 0.0043 SOL
          </p>
        </div>
        <Button
          variant="secondary"
          className="font-dm-mono"
          size="large"
          disabled={isDisabled}
        >
          Swap
        </Button>
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
  token?: IToken;
  isSolana?: boolean;
}) => {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-autofun-background-card p-2 select-none">
      <SkeletonImage
        src={isSolana ? "/solana.png" : token?.image || ""}
        alt={token?.name || "token"}
        className="rounded-full size-6"
      />
      <span className="text-base uppercase font-dm-mono tracking-wider">
        {isSolana ? "SOL" : token?.ticker}
      </span>
    </div>
  );
};

const Balance = ({
  token,
  isSolana,
}: {
  token?: IToken;
  isSolana?: boolean;
}) => {
  return (
    <div className="flex items-center gap-2 select-none">
      <Wallet className="text-autofun-text-secondary size-[18px]" />
      <span className="text-sm font-dm-mono text-autofun-text-secondary uppercase">
        0.00 {isSolana ? "SOL" : token?.ticker}
      </span>
    </div>
  );
};
