import { useSwap } from "@/hooks/use-swap";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { useSolPriceContext } from "@/providers/use-sol-price-context";
import { IToken } from "@/types";
import { formatNumber } from "@/utils";
import { useProgram } from "@/utils/program";
import { getSwapAmount } from "@/utils/swapUtils";
import { Info, Wallet } from "lucide-react";
import { useState } from "react";
import { twMerge } from "tailwind-merge";
import SkeletonImage from "./skeleton-image";

export default function Trade({
  token,
  onSwapCompleted,
}: {
  token: IToken;
  onSwapCompleted: (signature: string) => void;
}) {
  const { solPrice: contextSolPrice } = useSolPriceContext();
  const [isTokenSelling, setIsTokenSelling] = useState<boolean>(false);
  const [sellingAmount, setSellingAmount] = useState<number | undefined>(
    undefined,
  );
  const [slippage, setSlippage] = useState<number>(2);

  const program = useProgram();

  // Use blockchain data if available, otherwise fall back to token data
  const solanaPrice = contextSolPrice || token?.solPriceUSD || 0;
  const currentPrice = token?.currentPrice || 0;
  const tokenPriceUSD = token?.tokenPriceUSD || 0;

  console.log("Trade component using prices:", {
    solanaPrice,
    currentPrice,
    tokenPriceUSD,
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

  const isButtonDisabled = (amount: number | string) => {
    if (typeof amount === 'string') {
      // For percentage buttons, check if balance is 0
      return balance === 0;
    } else {
      // For fixed amount buttons, check if amount exceeds balance
      return amount > balance;
    }
  };

  const handleBalanceSelection = (amount: number | string) => {
    if (typeof amount === 'string') {
      // Handle percentage
      const percentage = parseFloat(amount) / 100;
      setSellingAmount(balance * percentage);
    } else {
      // Handle fixed amount
      setSellingAmount(amount);
    }
  };

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

    const res = (await executeSwap({
      amount: sellingAmount,
      style: isTokenSelling ? "sell" : "buy",
      tokenAddress: token.mint,
      token,
    })) as { signature: string };

    onSwapCompleted(res.signature);
  };

  return (
    <div className="relative">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4">
        {/* LEFT COLUMN - Controls and Swap - Takes 3/5 of the space on md screens */}
        <div className="col-span-1 md:col-span-1 lg:col-span-1">
          {/* BUY/SELL Toggle Buttons */}
          <div className="flex justify-between items-end w-full">
            <button
              onClick={() => setIsTokenSelling(false)}
              className="flex items-center justify-center w-1/2 translate-x-[0.12em] cursor-pointer"
            >
              <img
                src={!isTokenSelling ? "/token/buyon.svg" : "/token/buyoff.svg"}
                alt="Buy"
                className="w-full"
              />
            </button>
            <button
              onClick={() => setIsTokenSelling(true)}
              className="flex items-center justify-center w-1/2 translate-x-[-0.12em] cursor-pointer"
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
                  className="text-4xl truncate font-dm-mono text-white w-3/4 outline-none"
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

              {/* Balance Selection Buttons */}
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => handleBalanceSelection(0)}
                  className="px-3 py-1 text-sm font-dm-mono text-autofun-text-secondary hover:text-autofun-text-primary bg-autofun-background-input rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Reset
                </button>
                {!isTokenSelling ? (
                  <>
                    <button
                      onClick={() => handleBalanceSelection(0.1)}
                      disabled={isButtonDisabled(0.1)}
                      className="px-3 py-1 text-sm font-dm-mono text-autofun-text-secondary hover:text-autofun-text-primary bg-autofun-background-input rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      0.1 SOL
                    </button>
                    <button
                      onClick={() => handleBalanceSelection(0.5)}
                      disabled={isButtonDisabled(0.5)}
                      className="px-3 py-1 text-sm font-dm-mono text-autofun-text-secondary hover:text-autofun-text-primary bg-autofun-background-input rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      0.5 SOL
                    </button>
                    <button
                      onClick={() => handleBalanceSelection(1.0)}
                      disabled={isButtonDisabled(1.0)}
                      className="px-3 py-1 text-sm font-dm-mono text-autofun-text-secondary hover:text-autofun-text-primary bg-autofun-background-input rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      1.0 SOL
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleBalanceSelection("25")}
                      disabled={isButtonDisabled("25")}
                      className="px-3 py-1 text-sm font-dm-mono text-autofun-text-secondary hover:text-autofun-text-primary bg-autofun-background-input rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      25%
                    </button>
                    <button
                      onClick={() => handleBalanceSelection("50")}
                      disabled={isButtonDisabled("50")}
                      className="px-3 py-1 text-sm font-dm-mono text-autofun-text-secondary hover:text-autofun-text-primary bg-autofun-background-input rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      50%
                    </button>
                    <button
                      onClick={() => handleBalanceSelection("75")}
                      disabled={isButtonDisabled("75")}
                      className="px-3 py-1 text-sm font-dm-mono text-autofun-text-secondary hover:text-autofun-text-primary bg-autofun-background-input rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      75%
                    </button>
                    <button
                      onClick={() => handleBalanceSelection("100")}
                      disabled={isButtonDisabled("100")}
                      className="px-3 py-1 text-sm font-dm-mono text-autofun-text-secondary hover:text-autofun-text-primary bg-autofun-background-input rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      100%
                    </button>
                  </>
                )}
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
              <div className="relative flex uppercase items-center gap-2">
                {displayMinReceived}
                <img
                  src={isTokenSelling ? "/solana.png" : token?.image || ""}
                  alt={isTokenSelling ? "SOL" : token?.name || "token"}
                  className="rounded-full size-4"
                />
                {isTokenSelling ? "SOL" : token?.ticker}
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
              className={twMerge([
                "w-full mx-2 cursor-pointer mt-2",
                isDisabled ? "cursor-not-allowed! opacity-50" : "",
              ])}
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
          <div className="mb-4 flex flex-col gap-4">
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
            {slippage > 3 ? (
              <p className="text-orange-500 font-dm-mono text-xs">
                Your transaction may be frontrun and result in an unfavorable
                trade
              </p>
            ) : null}
          </div>

          {/* Balance and Value */}
          <div className={`flex flex-col gap-4 mb-4`}>
            <div className="flex justify-between items-center">
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
                {formatNumber(tokenBalance * currentPrice, false, true)} SOL /{" "}
                {formatNumber(
                  tokenBalance * currentPrice * solanaPrice,
                  true,
                  false,
                )}
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
