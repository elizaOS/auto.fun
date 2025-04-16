import { useSwap } from "@/hooks/use-swap";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { useSolPriceContext } from "@/providers/use-sol-price-context";
import { IToken } from "@/types";
import { formatNumber } from "@/utils";
import { useProgram } from "@/utils/program";
import { getSwapAmount, getSwapAmountJupiter } from "@/utils/swapUtils";
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
    undefined
  );
  const [buyAmount, setBuyAmount] = useState<number | undefined>(undefined);
  const [sellAmount, setSellAmount] = useState<number | undefined>(undefined);
  const [slippage, setSlippage] = useState<number>(2);

  const program = useProgram();

  // Format number to 3 decimal places and remove trailing zeros
  const formatAmount = (amount: number): number => {
    if (Number.isInteger(amount)) return amount;
    // Convert to string with 3 decimal places
    const formatted = amount.toFixed(3);
    // Remove trailing zeros and decimal point if needed
    const clean = formatted.replace(/\.?0+$/, "");
    return parseFloat(clean);
  };

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

  const insufficientBalance = Number(sellingAmount || 0) > Number(balance);

  const [error] = useState<string | undefined>("");

  const { executeSwap, isExecuting: isExecutingSwap } = useSwap();

  const isDisabled = ["migrating", "migration_failed", "failed"].includes(
    token?.status
  );

  const [convertedAmount, setConvertedAmount] = useState(0);

  const isButtonDisabled = (amount: number | string) => {
    if (typeof amount === "string") {
      // For percentage buttons, check if balance is 0
      return balance === 0;
    } else {
      // For fixed amount buttons, check if amount exceeds balance
      return amount > Number(balance);
    }
  };

  const handleBalanceSelection = (amount: number | string) => {
    if (typeof amount === "string") {
      // Handle percentage
      const percentage = parseFloat(amount) / 100;
      setSellingAmount(Number(balance) * percentage);
    } else {
      // Handle fixed amount
      setSellingAmount(amount);
    }
  };

  const handleSellAmountChange = async (amount: number) => {
    if (!program) return;

    setSellingAmount(amount);
    if (isTokenSelling) {
      setSellAmount(amount);
    } else {
      setBuyAmount(amount);
    }

    const style = isTokenSelling ? 1 : 0;
    const convertedAmount = isTokenSelling
      ? amount * (token?.tokenDecimals || 1e6)
      : amount * 1e9;
    const decimals = isTokenSelling
      ? 1e9
      : token?.tokenDecimals
        ? 10 ** token?.tokenDecimals
        : 1e6;

    console.log(token?.status, "status");
    const swapAmount =
      token?.status === "locked"
        ? await getSwapAmountJupiter(token.mint, convertedAmount, style, 0)
        : await getSwapAmount(
            program,
            convertedAmount,
            style,
            // TODO: these values from the backend seem incorrect,
            // they are not dynamically calculated but instead use the
            // default values leading to slightly incorrect calculations
            token.reserveAmount,
            token.reserveLamport
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
      <div className="grid grid-cols-1 gap-4">
        {/* LEFT COLUMN - Controls and Swap - Takes 3/5 of the space on md screens */}
        <div className="col-span-1 md:col-span-1 lg:col-span-1">
          {/* BUY/SELL Toggle Buttons */}
          <div className="flex justify-between items-end w-full">
            <button
              onClick={() => {
                if (isTokenSelling) {
                  setSellingAmount(
                    buyAmount !== undefined
                      ? buyAmount
                      : formatAmount(convertedAmount)
                  );
                }
                setIsTokenSelling(false);
              }}
              className="flex items-center justify-center w-1/2 translate-x-[0.12em] cursor-pointer"
            >
              <img
                src={!isTokenSelling ? "/token/buyon.svg" : "/token/buyoff.svg"}
                alt="Buy"
                className="w-full"
              />
            </button>
            <button
              onClick={() => {
                if (!isTokenSelling) {
                  setSellingAmount(
                    sellAmount !== undefined
                      ? sellAmount
                      : formatAmount(convertedAmount)
                  );
                }
                setIsTokenSelling(true);
              }}
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

          {/* Balance and Value */}
          <div className={`flex flex-col gap-4 my-4 mx-2`}>
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
                  false
                )}
              </span>
            </div>
          </div>

          <div className="flex flex-col">
            {/* Selling */}
            <div
              className={twMerge([
                "flex flex-col py-1 px-2 gap-[18px] transition-colors duration-200",
                error ? "border-autofun-text-error" : "",
              ])}
            >
              <div className="flex justify-between gap-3 relative border-b-1 border-autofun-background-input hover:border-white focus:border-white ">
                <input
                  className={`${isTokenSelling ? "text-4xl" : "text-6xl"} p-4 overflow-clip font-dm-mono text-white w-3/4 outline-none`}
                  min={0}
                  type="number"
                  onChange={({ target }) => {
                    const value = target.value;
                    const [whole, decimal] = value.split(".");
                    const formattedValue = decimal
                      ? `${whole}.${decimal.slice(0, 2)}`
                      : value;
                    handleSellAmountChange(Number(formattedValue));
                  }}
                  value={sellingAmount}
                  placeholder="0"
                />
                <div className="w-fit absolute right-4 top-[50%] translate-y-[-50%]">
                  <TokenDisplay token={token} isSolana={!isTokenSelling} />
                  <Balance
                    token={token}
                    isSolana={!isTokenSelling}
                    setSellingAmount={setSellingAmount}
                    balance={isTokenSelling ? tokenBalance : Number(solBalance)}
                  />
                </div>
              </div>

              {/* Balance Selection Buttons */}
              <div className="flex flex-col gap-3">
                <div className="flex gap-1 mt-1 w-full">
                  <button
                    onClick={() => handleBalanceSelection(0)}
                    className="flex-1 px-2 py-1 text-sm font-dm-mono text-autofun-text-secondary hover:text-autofun-text-primary bg-autofun-background-input disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Reset
                  </button>
                  {!isTokenSelling ? (
                    <>
                      <button
                        onClick={() => handleBalanceSelection(0.1)}
                        disabled={isButtonDisabled(0.1)}
                        className="flex-1 px-2 py-1 text-sm font-dm-mono text-autofun-text-secondary hover:text-autofun-text-primary bg-autofun-background-input disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        0.1
                      </button>
                      <button
                        onClick={() => handleBalanceSelection(0.5)}
                        disabled={isButtonDisabled(0.5)}
                        className="flex-1 px-2 py-1 text-sm font-dm-mono text-autofun-text-secondary hover:text-autofun-text-primary bg-autofun-background-input disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        0.5
                      </button>
                      <button
                        onClick={() => handleBalanceSelection(1.0)}
                        disabled={isButtonDisabled(1.0)}
                        className="flex-1 px-2 py-1 text-sm font-dm-mono text-autofun-text-secondary hover:text-autofun-text-primary bg-autofun-background-input disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        1.0
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleBalanceSelection("25")}
                        disabled={isButtonDisabled("25")}
                        className="flex-1 px-2 py-1 text-sm font-dm-mono text-autofun-text-secondary hover:text-autofun-text-primary bg-autofun-background-input disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        25%
                      </button>
                      <button
                        onClick={() => handleBalanceSelection("50")}
                        disabled={isButtonDisabled("50")}
                        className="flex-1 px-2 py-1 text-sm font-dm-mono text-autofun-text-secondary hover:text-autofun-text-primary bg-autofun-background-input disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        50%
                      </button>
                      <button
                        onClick={() => handleBalanceSelection("75")}
                        disabled={isButtonDisabled("75")}
                        className="flex-1 px-2 py-1 text-sm font-dm-mono text-autofun-text-secondary hover:text-autofun-text-primary bg-autofun-background-input disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        75%
                      </button>
                      <button
                        onClick={() => handleBalanceSelection("100")}
                        disabled={isButtonDisabled("100")}
                        className="flex-1 px-2 py-1 text-sm font-dm-mono text-autofun-text-secondary hover:text-autofun-text-primary bg-autofun-background-input disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        100%
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Buying */}
            <div className="flex items-center p-4 gap-2 justify-between text-sm font-dm-mono text-autofun-text-secondary w-full">
              <span>Min Received:</span>
              <div className="relative flex uppercase items-center gap-2">
                {displayMinReceived}
                <img
                  src={isTokenSelling ? "/solana.svg" : token?.image || ""}
                  alt={isTokenSelling ? "SOL" : token?.name || "token"}
                  className="size-6 m-2"
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
                Insufficient Funds: You have {Number(balance).toFixed(4) || "0"}{" "}
                {isTokenSelling ? token?.ticker : "SOL"}
              </p>
            </div>
          </div>

          {/* Slippage Input */}
          <div className="mx-4 mb-2 flex flex-col gap-4">
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
                  isExecutingSwap ? "/token/swapdown.svg" : "/token/swapup.svg"
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
    <div className="flex items-center justify-end mb-4">
      <SkeletonImage
        src={isSolana ? "/solana.svg" : token?.image || ""}
        alt={token?.name || "token"}
        className="size-4"
      />
      <span className="text-xl uppercase font-dm-mono tracking-wider font-bold">
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
      <div className="flex gap-1 justify-end w-full">
        <Wallet className="text-autofun-text-secondary size-[18px]" />
        <span className="text-sm font-dm-mono text-autofun-text-secondary uppercase">
          {formattedBalance} {isSolana ? "SOL" : token?.ticker}
        </span>
      </div>
    </div>
  );
};
