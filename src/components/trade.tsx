import useAuthentication from "@/hooks/use-authentication";
import { useSwap } from "@/hooks/use-swap";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { IToken } from "@/types";
import { formatNumber } from "@/utils";
import { useProgram } from "@/utils/program";
import { getSwapAmount, getSwapAmountJupiter } from "@/utils/swapUtils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Wallet } from "lucide-react";
import { useState } from "react";
import { twMerge } from "tailwind-merge";
import SkeletonImage from "./skeleton-image";
import { BN } from "bn.js";

export default function Trade({ token }: { token: IToken }) {
  const queryClient = useQueryClient();
  // const { solPrice: contextSolPrice } = useSolPriceContext();
  const [isTokenSelling, setIsTokenSelling] = useState<boolean>(false);

  const [sellAmount, setSellAmount] = useState<number | undefined>(undefined);
  const [slippage, setSlippage] = useState<number>(2);
  const { isAuthenticated } = useAuthentication();

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
  // const solanaPrice = contextSolPrice || token?.solPriceUSD || 0;
  const currentPrice = token?.currentPrice || 0;

  const { solBalance, tokenBalance } = useTokenBalance({ tokenId: token.mint });
  const balance = isTokenSelling ? tokenBalance : solBalance;

  const insufficientBalance = Number(sellAmount || 0) > Number(balance);

  const [error] = useState<string | undefined>("");

  const { executeSwap, isExecuting: isExecutingSwap } = useSwap();

  const isDisabled = ["migrating", "migration_failed", "failed"].includes(
    token?.status
  );

  const isButtonDisabled = (amount: number | string) => {
    if (typeof amount === "string") {
      // For percentage buttons, check if balance is 0
      return balance === 0;
    } else {
      // For fixed amount buttons, check if amount exceeds balance
      return amount > Number(balance);
    }
  };

  const displayhMinReceivedQuery = useQuery({
    queryKey: [
      "min-received",
      token?.mint,
      isTokenSelling,
      sellAmount,
      currentPrice,
    ],
    queryFn: async (): Promise<{
      displayMinReceived: string;
      convertedAmount: number;
    }> => {
      if (!program) return { displayMinReceived: "0", convertedAmount: 0 };
      const style = isTokenSelling ? 1 : 0;
      const amount = sellAmount;
      if (!amount) return { displayMinReceived: "0", convertedAmount: 0 };

      const amountBN = new BN(amount);
      const tokenDecimalsBN = new BN(
        token?.tokenDecimals ? 10 ** token?.tokenDecimals : 1e6
      );
      const convertedAmountT = isTokenSelling
        ? amountBN.mul(tokenDecimalsBN).toNumber()
        : amountBN.mul(new BN(1e9)).toNumber();

      const decimals = isTokenSelling
        ? new BN(1e9)
        : token?.tokenDecimals
          ? new BN(10 ** token?.tokenDecimals)
          : new BN(1e6);

      const swapAmount =
        token?.status === "locked"
          ? await getSwapAmountJupiter(token.mint, convertedAmountT, style, 0)
          : await getSwapAmount(
              program,
              convertedAmountT,
              style,
              // TODO: these values from the backend seem incorrect,
              // they are not dynamically calculated but instead use the
              // default values leading to slightly incorrect calculations
              token.reserveAmount,
              token.reserveLamport
            );

      const convertedAmount = new BN(swapAmount).div(decimals).toNumber();

      const minReceived = convertedAmount * (1 - slippage / 100);

      const displayMinReceived = isTokenSelling
        ? formatNumber(minReceived, false, true)
        : formatNumber(minReceived, false, true);

      return { displayMinReceived, convertedAmount };
    },
    refetchInterval: 5000,
  });

  const displayMinReceived =
    displayhMinReceivedQuery?.data?.displayMinReceived || "0";
  const convertedAmount = displayhMinReceivedQuery?.data?.convertedAmount || 0;

  const onSwap = async () => {
    if (!sellAmount) return;

    await executeSwap({
      amount: sellAmount,
      style: isTokenSelling ? "sell" : "buy",
      tokenAddress: token.mint,
      token,
    });

    queryClient.invalidateQueries({ queryKey: ["token", token.mint] });

    setSellAmount(0);
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
                  setSellAmount(formatAmount(convertedAmount));
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
                  setSellAmount(
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
                  className="text-6xl p-4 overflow-clip font-dm-mono text-white w-3/4 outline-none"
                  min={0}
                  type="number"
                  onKeyDown={(e) => {
                    if (
                      e.key === "-" ||
                      e.code === "Minus" ||
                      e.key === "e" ||
                      e.key === "E"
                    ) {
                      e.preventDefault();
                    }
                  }}
                  onChange={({ target }) => {
                    const value = target.value;
                    const [whole, decimal] = value.split(".");
                    const formattedValue = decimal
                      ? `${whole}.${decimal.slice(0, 2)}`
                      : value;

                    setSellAmount(Number(formattedValue));
                  }}
                  value={sellAmount === 0 ? "" : sellAmount}
                  placeholder="0"
                />
                <div className="w-fit absolute right-4 top-[50%] translate-y-[-50%]">
                  <TokenDisplay token={token} isSolana={!isTokenSelling} />
                  <Balance
                    token={token}
                    isSolana={!isTokenSelling}
                    setSellAmount={setSellAmount}
                    balance={isTokenSelling ? tokenBalance : Number(solBalance)}
                  />
                </div>
              </div>

              {/* Balance Selection Buttons */}
              <div className="flex flex-col gap-3">
                <div className="flex gap-1 mt-1 w-full">
                  <button
                    onClick={() => setSellAmount(0)}
                    className="flex-1 px-2 py-1 text-sm font-dm-mono text-autofun-text-secondary hover:text-autofun-text-primary bg-autofun-background-input disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Reset
                  </button>
                  {!isTokenSelling ? (
                    <>
                      {[0.1, 0.5, 1.0].map((but, _) => (
                        <button
                          onClick={() => {
                            setSellAmount(but);
                          }}
                          disabled={isButtonDisabled(but)}
                          className="flex-1 px-2 py-1 text-sm font-dm-mono text-autofun-text-secondary hover:text-autofun-text-primary bg-autofun-background-input disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {String(but)}
                        </button>
                      ))}
                    </>
                  ) : (
                    <>
                      {["25", "50", "75", "100"].map((perc, _) => (
                        <button
                          onClick={() => {
                            const percentage = parseFloat(perc) / 100;
                            setSellAmount(Number(balance) * percentage);
                          }}
                          disabled={isButtonDisabled("25")}
                          className="flex-1 px-2 py-1 text-sm font-dm-mono text-autofun-text-secondary hover:text-autofun-text-primary bg-autofun-background-input disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {perc}%
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Buying */}
            <div className="flex items-center p-4 gap-2 justify-between text-sm font-dm-mono text-autofun-text-secondary w-full">
              <span>Min Received:</span>
              <div className="relative flex uppercase items-center gap-2">
                {displayhMinReceivedQuery?.isError
                  ? "Error"
                  : displayMinReceived}
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
                !sellAmount ||
                sellAmount === 0
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
                className={twMerge([
                  !isAuthenticated
                    ? "cursor-not-allowed grayscale select-none"
                    : "",
                  "w-full",
                ])}
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
        {!isAuthenticated ? (
          <div className="text-center text-autofun-text-highlight font-dm-mono">
            Connect your wallet to proceed with trading
          </div>
        ) : null}
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
  setSellAmount,
  balance,
}: {
  token?: IToken;
  isSolana?: boolean;
  setSellAmount?: any;
  balance: number;
}) => {
  const formattedBalance = isSolana
    ? formatNumber(balance, false, true)
    : formatNumber(balance, undefined, true);

  return (
    <div
      className={twMerge([
        "flex items-center gap-2 select-none shrink-0",
        setSellAmount ? "cursor-pointer" : "",
      ])}
      onClick={() => {
        if (balance && setSellAmount) {
          setSellAmount(balance);
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
