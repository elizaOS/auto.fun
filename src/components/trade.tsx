import { useSwap } from "@/hooks/use-swap";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { useSolPriceContext } from "@/providers/use-sol-price-context";
import { IToken } from "@/types";
import { formatNumber } from "@/utils";
import { fetchTokenMarketMetrics } from "@/utils/blockchain";
import { useProgram } from "@/utils/program";
import { getSwapAmount } from "@/utils/swapUtils";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpDown, Cog, Info, Wallet } from "lucide-react";
import { Fragment, useState } from "react";
import { twMerge } from "tailwind-merge";
import Button from "./button";
import ConfigDialog from "./config-dialog";
import Loader from "./loader";
import SkeletonImage from "./skeleton-image";
import { toast } from "react-toastify";

export default function Trade({ token }: { token: IToken }) {
  const { solPrice: contextSolPrice } = useSolPriceContext();
  const [isTokenSelling, setIsTokenSelling] = useState<boolean>(false);
  const [sellingAmount, setSellingAmount] = useState<number | undefined>(
    undefined,
  );

  // Fetch real-time blockchain metrics for this token
  const metricsQuery = useQuery({
    queryKey: ["blockchain-metrics", token?.mint],
    queryFn: async () => {
      if (!token?.mint) return null;
      try {
        console.log(`Trade: Fetching blockchain metrics for ${token.mint}`);
        return await fetchTokenMarketMetrics(token.mint);
      } catch (error) {
        console.error(`Trade: Error fetching blockchain metrics:`, error);
        return null;
      }
    },
    enabled: !!token?.mint,
    refetchInterval: 30_000, // Longer interval for blockchain queries
    staleTime: 60000, // Data stays fresh for 1 minute
  });

  const program = useProgram();

  // Use blockchain data if available, otherwise fall back to token data
  const metrics = metricsQuery?.data;
  const solanaPrice =
    metrics?.solPriceUSD || contextSolPrice || token?.solPriceUSD || 0;
  const currentPrice = metrics?.currentPrice || token?.currentPrice || 0;
  const tokenPriceUSD = metrics?.tokenPriceUSD || token?.tokenPriceUSD || 0;

  console.log("Trade component using prices:", {
    solanaPrice,
    currentPrice,
    tokenPriceUSD,
    metricsAvailable: !!metrics,
  });

  const { solBalance, tokenBalance } = useTokenBalance({ tokenId: token.mint });
  const balance = isTokenSelling ? tokenBalance : solBalance;

  const insufficientBalance = (sellingAmount || 0) > balance;

  const [error] = useState<string | undefined>("");

  const { executeSwap, isExecuting: isExecutingSwap } = useSwap();

  const isDisabled = ["migrating", "migration_failed", "failed"].includes(
    token?.status,
  );

  // Set percentage buttons to use real balance
  const handlePercentage = (percentage: number) => {
    if (balance) {
      handleSellAmountChange(balance * (percentage / 100));
    }
  };

  const [convertedAmount, setConvertedAmount] = useState(0);

  const handleSellAmountChange = async (amount: number) => {
    if (!program) return;

    setSellingAmount(amount);

    const style = isTokenSelling ? 1 : 0;
    const convertedAmount = isTokenSelling ? amount * 1e6 : amount * 1e9;
    const decimals = isTokenSelling ? 1e9 : 1e6;
    const swapAmount = await getSwapAmount(
      program,
      convertedAmount,
      style,
      // TODO: these values from the backend seem incorrect,
      // they are not dynamically calculated but instead use the
      // default values leading to slightly incorrect calculations
      token.reserveAmount,
      token.reserveLamport,
    );
    setConvertedAmount(swapAmount / decimals);
  };

  const displayConvertedAmount = isTokenSelling
    ? convertedAmount
    : formatNumber(convertedAmount, false, true);

  const onSwap = async () => {
    if (!sellingAmount) return;

    await executeSwap({
      amount: sellingAmount,
      style: isTokenSelling ? "sell" : "buy",
      tokenAddress: token.mint,
      token,
    });

    toast.success('Trade executed')
  };

  return (
    <div className="relative p-4 pt-0">
      {isExecutingSwap && <Loader />}
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
                  onClick={() => handleSellAmountChange(0)}
                >
                  <span className="hidden sm:inline">Reset</span>
                  <span className="sm:hidden">0</span>
                </Button>
                {isTokenSelling ? (
                  <Fragment>
                    <Button
                      size="small"
                      variant="trade"
                      onClick={() => handlePercentage(25)}
                    >
                      25%
                    </Button>
                    <Button
                      size="small"
                      variant="trade"
                      onClick={() => handlePercentage(50)}
                    >
                      50%
                    </Button>
                    <Button
                      size="small"
                      variant="trade"
                      onClick={() => handlePercentage(100)}
                    >
                      100%
                    </Button>
                  </Fragment>
                ) : (
                  <Fragment>
                    <Button
                      size="small"
                      variant="trade"
                      onClick={() => handleSellAmountChange(0.5)}
                    >
                      0.5
                    </Button>
                    <Button
                      size="small"
                      variant="trade"
                      onClick={() => handleSellAmountChange(1)}
                    >
                      1
                    </Button>
                    <Button
                      size="small"
                      variant="trade"
                      onClick={() => handleSellAmountChange(5)}
                    >
                      5
                    </Button>
                  </Fragment>
                )}
                <ConfigDialog>
                  <Button
                    size="small"
                    variant="trade"
                    aria-label="config dialog"
                  >
                    <Cog />
                  </Button>
                </ConfigDialog>
              </div>
            </div>
            <div className="flex justify-between gap-3">
              <input
                className="text-4xl truncate font-dm-mono text-autofun-text-secondary w-3/4 outline-none"
                min={0}
                type="number"
                onChange={({ target }) =>
                  handleSellAmountChange(Number(target.value))
                }
                value={sellingAmount}
                placeholder="0"
              />
              <div className="w-fit shrink-0">
                <TokenDisplay token={token} isSolana={!isTokenSelling} />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-dm-mono truncate text-autofun-text-secondary select-none">
                {!isTokenSelling
                  ? formatNumber(Number(sellingAmount || 0) * solanaPrice, true)
                  : tokenPriceUSD
                    ? formatNumber(
                        Number(sellingAmount || 0) * tokenPriceUSD,
                        true
                      )
                    : formatNumber(0)}
              </span>
              <Balance
                token={token}
                isSolana={!isTokenSelling}
                setSellingAmount={setSellingAmount}
                balance={isTokenSelling ? tokenBalance : solBalance}
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
              <input
                className="text-4xl truncate font-dm-mono text-autofun-text-secondary w-3/4 outline-none"
                readOnly
                value={displayConvertedAmount}
                placeholder="0"
              />

              <TokenDisplay token={token} isSolana={isTokenSelling} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-dm-mono truncate text-autofun-text-secondary select-none">
                {sellingAmount && solanaPrice && !isTokenSelling
                  ? formatNumber(
                      (Number(sellingAmount) / currentPrice) * tokenPriceUSD,
                      true
                    )
                  : sellingAmount && isTokenSelling && tokenPriceUSD
                    ? formatNumber(
                        Number(sellingAmount) * currentPrice * solanaPrice,
                        true
                      )
                    : "$0.00"}
              </span>
              <Balance
                token={token}
                isSolana={isTokenSelling}
                balance={isTokenSelling ? solBalance : tokenBalance}
              />
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
              Insufficient Funds: You have {balance.toFixed(4) || "0"}{" "}
              {isTokenSelling ? token?.ticker : "SOL"}
            </p>
          </div>
        </div>
        <button
          className="mx-auto"
          disabled={
            isDisabled ||
            insufficientBalance ||
            isExecutingSwap ||
            !sellingAmount ||
            sellingAmount === 0
          }
          onClick={onSwap}
        >
          <img
            src={isExecutingSwap ? "/token/swapping.svg" : "/token/swapup.svg"}
            alt="Generate"
            className="h-32"
            onMouseDown={(e) => {
              if (!isExecutingSwap) {
                (e.target as HTMLImageElement).src = "/token/swapdown.svg";
              }
            }}
            onMouseUp={(e) => {
              if (!isExecutingSwap) {
                (e.target as HTMLImageElement).src = "/token/swapup.svg";
              }
            }}
            onDragStart={(e) => e.preventDefault()}
            onMouseOut={(e) => {
              if (!isExecutingSwap) {
                (e.target as HTMLImageElement).src = "/token/swapup.svg";
              }
            }}
          />
        </button>
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
    <div className="flex items-center gap-2 p-2 select-none">
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
  balance,
}: {
  token?: IToken;
  isSolana?: boolean;
  setSellingAmount?: any;
  balance: number;
}) => {
  const formattedBalance = isSolana
    ? formatNumber(balance, true, true)
    : formatNumber(balance, undefined, true);

  return (
    <div
      className={twMerge([
        "flex items-center gap-2 select-none shrink-0",
        setSellingAmount ? "cursor-pointer" : "",
      ])}
      onClick={() => {
        if (balance && setSellingAmount) {
          setSellingAmount(balance);
        }
      }}
    >
      <Wallet className="text-autofun-text-secondary size-[18px]" />
      <span className="text-sm font-dm-mono text-autofun-text-secondary uppercase">
        {formattedBalance} {isSolana ? "SOL" : token?.ticker}
      </span>
    </div>
  );
};
