import { IToken } from "@/types";
import { formatNumber, sleep } from "@/utils";
import { ArrowUpDown, Cog, Info, Loader2, Wallet } from "lucide-react";
import { Fragment, useState } from "react";
import { twMerge } from "tailwind-merge";
import Button from "./button";
import ConfigDialog from "./config-dialog";
import SkeletonImage from "./skeleton-image";
import useTokenBalance from "@/hooks/use-token-balance";
import { useWallet } from "@solana/wallet-adapter-react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "react-toastify";

export default function Trade({ token }: { token: IToken }) {
  const solanaPrice = token?.solPriceUSD || 0;
  const [isTokenSelling, setIsTokenSelling] = useState<boolean>(false);
  const [sellingAmount, setSellingAmount] = useState<number | undefined>(
    undefined
  );
  const wallet = useWallet();
  const balance = useTokenBalance(
    wallet.publicKey?.toBase58() || "",
    !isTokenSelling
      ? "So11111111111111111111111111111111111111111"
      : token?.mint || ""
  );

  const insufficientBalance =
    (sellingAmount || 0) > (balance?.data?.formattedBalance || 0);

  const [error] = useState<string | undefined>("");

  const isDisabled = ["migrating", "migration_failed", "failed"].includes(
    token?.status
  );

  const swapMutation = useMutation({
    mutationFn: async () => sleep(1500),
    mutationKey: ["swap", isTokenSelling, token.mint],
    onSuccess: () => toast.success(`Successfully swapped.`),
    onError: () => toast.error("Something bad happened.."),
  });

  return (
    <div className="relative border p-4 bg-autofun-background-card">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col">
          {/* Selling */}
          <div
            className={twMerge([
              "flex flex-col py-3 px-4 bg-autofun-background-input border gap-[18px] transition-colors duration-200",
              error ? "border-autofun-text-error" : "",
            ])}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-base font-dm-mono text-autofun-text-primary select-none">
                Selling
              </span>
              <div className="flex items-center gap-0.5 xl:ml-auto">
                <Button
                  size="small"
                  variant="trade"
                  onClick={() => setSellingAmount(0)}
                >
                  <span className="hidden sm:inline">Reset</span>
                  <span className="sm:hidden">0</span>
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
                    <Button
                      size="small"
                      variant="trade"
                      onClick={() => setSellingAmount(0.5)}
                    >
                      0.5
                    </Button>
                    <Button
                      size="small"
                      variant="trade"
                      onClick={() => setSellingAmount(1)}
                    >
                      1
                    </Button>
                    <Button
                      size="small"
                      variant="trade"
                      onClick={() => setSellingAmount(5)}
                    >
                      5
                    </Button>
                  </Fragment>
                )}
                <ConfigDialog>
                  <Button size="small" variant="trade" aria-label="config dialog">
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
              <Balance
                token={token}
                isSolana={!isTokenSelling}
                setSellingAmount={setSellingAmount}
              />
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
          <div className="flex flex-col py-3 px-4 bg-autofun-background-input border gap-[18px]">
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
            "flex items-center gap-2 h-4 m-2 select-none",
            insufficientBalance ? "block" : "hidden",
          ])}
        >
          <div className="flex items-center gap-2">
            <Info className="text-red-600 size-4" />
            <p className="text-red-600 text-xs font-dm-mono">
              Insufficient Funds: You have {balance?.data?.formattedBalance}{" "}
              {isTokenSelling ? token?.ticker : "SOL"}
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          className="font-dm-mono"
          size="large"
          disabled={
            isDisabled ||
            insufficientBalance ||
            swapMutation?.isPending ||
            !sellingAmount ||
            sellingAmount === 0
          }
          onClick={() => swapMutation.mutate()}
        >
          {swapMutation?.isPending ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            "Swap"
          )}
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
    <div className="flex items-center gap-2 border bg-autofun-background-card p-2 select-none">
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
  setSellingAmount,
}: {
  token?: IToken;
  isSolana?: boolean;
  setSellingAmount?: any;
}) => {
  const wallet = useWallet();
  const balance = useTokenBalance(
    wallet.publicKey?.toBase58() || "",
    isSolana ? "So11111111111111111111111111111111111111111" : token?.mint || ""
  );
  return (
    <div
      className={twMerge([
        "flex items-center gap-2 select-none",
        setSellingAmount ? "cursor-pointer" : "",
      ])}
      onClick={() => {
        if (balance?.data?.formattedBalance && setSellingAmount) {
          setSellingAmount(balance?.data?.formattedBalance);
        }
      }}
    >
      <Wallet className="text-autofun-text-secondary size-[18px]" />
      <span className="text-sm font-dm-mono text-autofun-text-secondary uppercase">
        {balance.data?.formattedBalance} {isSolana ? "SOL" : token?.ticker}
      </span>
    </div>
  );
};
