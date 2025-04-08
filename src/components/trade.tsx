import { useSwap } from "@/hooks/use-swap";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { useSolPriceContext } from "@/providers/use-sol-price-context";
import { IToken } from "@/types";
import { formatNumber } from "@/utils";
import { fetchTokenMarketMetrics } from "@/utils/blockchain";
import { useProgram } from "@/utils/program";
import { getSwapAmount } from "@/utils/swapUtils";
import { useQuery } from "@tanstack/react-query";
import { Info, Wallet } from "lucide-react";
import { useState } from "react";
import { twMerge } from "tailwind-merge";
import SkeletonImage from "./skeleton-image";

export default function Trade({ token }: { token: IToken }) {
  const { solPrice: contextSolPrice } = useSolPriceContext();
  const [isTokenSelling, setIsTokenSelling] = useState<boolean>(false);
  const [sellingAmount, setSellingAmount] = useState<number | undefined>(
    undefined,
  );
  const [slippage, setSlippage] = useState<number>(2);

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

  // const displayConvertedAmount = isTokenSelling
  //   ? convertedAmount
  //   : formatNumber(convertedAmount, false, true);

  // Calculate minimum amount received with slippage
  const minReceived = convertedAmount * (1 - slippage / 100);
  const displayMinReceived = isTokenSelling
    ? formatNumber(minReceived, false, true)
    : formatNumber(minReceived, false, true);

  const onSwap = async () => {
    if (!sellingAmount) return;

    await executeSwap({
      amount: sellingAmount,
      style: isTokenSelling ? "sell" : "buy",
      tokenAddress: token.mint,
      token,
    });
  };

  // Card styling for the right column items
  const cardStyle = "mb-4";

  return (
    <div className="relative p-4 pt-0">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4">
        {/* LEFT COLUMN - Controls and Swap - Takes 3/5 of the space on md screens */}
        <div className="col-span-1 md:col-span-1 lg:col-span-1">
          {/* BUY/SELL Toggle Buttons */}
          <div className="flex justify-between items-end w-full">
            <button
              onClick={() => setIsTokenSelling(false)}
              className="flex items-center justify-center w-1/2 translate-x-[0.12em]"
            >
              <img
                src={!isTokenSelling ? "/token/buyon.svg" : "/token/buyoff.svg"}
                alt="Buy"
                className="w-full"
              />
            </button>
            <button
              onClick={() => setIsTokenSelling(true)}
              className="flex items-center justify-center w-1/2 translate-x-[-0.12em]"
            >
              <img
                src={
                  isTokenSelling ? "/token/sellon.svg" : "/token/selloff.svg"
                }
                alt="Sell"
                className="w-full"
              />
            </button>
          </div>

          <div className="flex flex-col mt-4">
            {/* Selling */}
            <div
              className={twMerge([
                "flex flex-col py-3 px-4 gap-[18px] transition-colors duration-200",
                error ? "border-autofun-text-error" : "",
              ])}
            >
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
              <div className="flex items-center justify-end gap-2">
                <Balance
                  token={token}
                  isSolana={!isTokenSelling}
                  setSellingAmount={setSellingAmount}
                  balance={isTokenSelling ? tokenBalance : solBalance}
                />
              </div>
            </div>

            {/* Buying */}
            <div className="flex items-center p-4 gap-2 justify-between text-sm font-dm-mono text-autofun-text-secondary w-full">
              <span>Min Received:</span>
              <span>
                <span className="uppercase flex items-center">
                  {displayMinReceived}
                  <SkeletonImage
                    src={isTokenSelling ? "/solana.png" : token?.image || ""}
                    alt={isTokenSelling ? "SOL" : token?.name || "token"}
                    className="rounded-full size-4 mr-1"
                  />
                  {isTokenSelling ? "SOL" : token?.ticker}
                </span>
              </span>
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

          {/* Swap Button - Now in the left column below Min Received */}
          <div className="flex justify-center items-center">
            <button
              disabled={
                isDisabled ||
                insufficientBalance ||
                isExecutingSwap ||
                !sellingAmount ||
                sellingAmount === 0
              }
              onClick={onSwap}
              className="w-full mx-2"
            >
              <img
                src={
                  isExecutingSwap ? "/token/swapping.svg" : "/token/swapup.svg"
                }
                alt="Generate"
                className="w-full"
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

        {/* RIGHT COLUMN - Advanced Settings & Info - Takes 2/5 of the space on md screens */}
        <div className="col-span-1 md:col-span-1 lg:col-span-1">
          {/* Slippage Input */}
          <div className={cardStyle}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-dm-mono text-autofun-text-secondary">
                Slippage:
              </span>
              <div className="relative flex items-center">
                <input
                  type="number"
                  min="0.1"
                  max="100"
                  step="0.1"
                  value={slippage}
                  onChange={(e) => setSlippage(Number(e.target.value))}
                  className="w-16 py-1 pl-2 pr-6 bg-[#1a1a1a] border-b border-white/50 hover:border-white focus:border-white font-dm-mono text-autofun-text-secondary text-right"
                />
                <span className="absolute right-2 text-sm font-dm-mono text-autofun-text-secondary">
                  %
                </span>
              </div>
            </div>
          </div>

          {/* Balance and Value */}
          <div className={cardStyle}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-dm-mono text-autofun-text-secondary">
                Balance:
              </span>
              <span className="text-sm font-dm-mono text-autofun-text-secondary">
                {formatNumber(tokenBalance, false, true)} {token?.ticker}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-dm-mono text-autofun-text-secondary">
                Value:
              </span>
              <span className="text-sm font-dm-mono text-autofun-text-secondary">
                {formatNumber(tokenBalance * currentPrice, false, true)} SOL
              </span>
            </div>
          </div>

          {/* Price USD */}
          <div className={cardStyle}>
            <div className="flex justify-between items-center">
              <span className="text-sm font-dm-mono text-autofun-text-secondary">
                Price USD:
              </span>
              <span className="text-sm font-dm-mono text-autofun-text-secondary">
                {formatNumber(tokenPriceUSD * solanaPrice, true, false)}
              </span>
            </div>
          </div>
        </div>
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
    ? formatNumber(balance, false, true)
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
