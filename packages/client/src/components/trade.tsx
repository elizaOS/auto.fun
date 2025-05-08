import useAuthentication from "@/hooks/use-authentication";
import { useSlippage } from "@/hooks/use-slippage";
import { useSwap } from "@/hooks/use-swap";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { IToken } from "@/types";
import { formatNumber, sanitizeCheckmark } from "@/utils";
import { useProgram } from "@/utils/program";
import { getSwapAmount, getSwapAmountJupiter } from "@/utils/swapUtils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BN } from "bn.js";
import { Info, Wallet } from "lucide-react";
import numeral from "numeral";
import { useEffect, useMemo, useState } from "react";
import { twMerge } from "tailwind-merge";
import SkeletonImage from "./skeleton-image";
import { toast } from "react-toastify";
import { Link } from "react-router";

export default function Trade({ token }: { token: IToken }) {
  const queryClient = useQueryClient();
  // const { solPrice: contextSolPrice } = useSolPriceContext();
  const [isTokenSelling, setIsTokenSelling] = useState<boolean>(false);

  const [sellAmount, setSellAmount] = useState<number | undefined>(undefined);
  const [inputAmount, setInputAmount] = useState<string>("");
  const [slippage, setSlippage] = useSlippage();
  const [displaySlippage, setDisplaySlippage] = useState<string>(
    String(slippage),
  );
  const { isAuthenticated } = useAuthentication();

  useEffect(() => {
    // if somehow the slippage gets updated somewhere else
    setDisplaySlippage(String(slippage));
  }, [slippage]);

  const handleSlippageBlur = () => {
    const value = displaySlippage.trim();

    if (value === "") {
      setDisplaySlippage(String(slippage));
      return;
    }

    const numSlippage = Number(value);

    if (isNaN(numSlippage)) {
      setDisplaySlippage(String(slippage));
      return;
    }

    const finalValue = Math.max(0, Math.min(50, numSlippage));

    if (finalValue !== slippage) {
      setSlippage(finalValue);
    }

    setDisplaySlippage(String(finalValue));
  };

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

  const currentPrice = token?.currentPrice || 0;

  const { solBalance, tokenBalance } = useTokenBalance({ tokenId: token.mint });
  const balance = isTokenSelling ? tokenBalance : solBalance;

  const insufficientBalance = Number(sellAmount || 0) > Number(balance);

  const [error] = useState<string | undefined>("");

  const { executeSwap, isExecuting: isExecutingSwap } = useSwap();

  const isStatusDisabled = ["migrating", "migration_failed", "failed"].includes(
    token?.status,
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
      minReceivedRaw: number;
      priceImpact: string;
    }> => {
      const empty = {
        displayMinReceived: "0",
        convertedAmount: 0,
        minReceivedRaw: 0,
        priceImpact: "0",
      };
      if (!program) return empty;
      const style = isTokenSelling ? 1 : 0;
      const amount = sellAmount;
      if (!amount) return empty;

      const amountStr = amount.toString();
      const decimalPlaces = amountStr.includes(".")
        ? amountStr.split(".")[1].length
        : 0;
      const scaleFactor = 10 ** decimalPlaces;
      const amountBN = new BN(Math.round(amount * scaleFactor));
      const tokenDecimalsBN = new BN(
        token?.tokenDecimals ? 10 ** token?.tokenDecimals : 1e6,
      );
      const convertedAmountT = isTokenSelling
        ? amountBN.mul(tokenDecimalsBN).div(new BN(scaleFactor)).toNumber()
        : amountBN.mul(new BN(1e9)).div(new BN(scaleFactor)).toNumber();

      const decimals = isTokenSelling
        ? new BN(1e9)
        : token?.tokenDecimals
          ? new BN(10 ** token?.tokenDecimals)
          : new BN(1e6);
      const swapAmountResult =
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
              token.reserveLamport,
            );
      const swapAmount = swapAmountResult?.estimatedOutput || 0;
      const priceImpact = swapAmountResult?.priceImpact || "0";

      const SCALE_FACTOR = Math.max(1000000, decimals.toNumber());
      const scaledAmount = new BN(swapAmount).mul(new BN(SCALE_FACTOR));
      const convertedAmount =
        scaledAmount.div(decimals).toNumber() / SCALE_FACTOR;

      const minReceived = convertedAmount * (1 - slippage / 100);

      const formatWithoutTrailingZeros = (num: number): string => {
        let precision = 8;
        if (num < 0.0001) precision = 12;
        else if (num < 0.01) precision = 10;
        const rounded = parseFloat(num.toFixed(precision));
        const str = rounded.toString();
        if (!str.includes(".")) return str;
        return str.replace(/\.?0+$/, "");
      };

      const displayMinReceived =
        minReceived < 1000
          ? formatWithoutTrailingZeros(minReceived)
          : numeral(minReceived).format("0.00a");

      return {
        displayMinReceived,
        minReceivedRaw: minReceived,
        convertedAmount,
        priceImpact,
      };
    },
    refetchInterval: 5000,
  });

  const { displayMinReceived, convertedAmount, minReceivedRaw, priceImpact } =
    useMemo(() => {
      const data = displayhMinReceivedQuery?.data || {
        displayMinReceived: "0",
        convertedAmount: 0,
        minReceivedRaw: 0,
        priceImpact: "0",
      };
      return {
        displayMinReceived: data.displayMinReceived,
        convertedAmount: data.convertedAmount,
        minReceivedRaw: data.minReceivedRaw,
        priceImpact: data.priceImpact,
      };
    }, [displayhMinReceivedQuery?.data]);

    const showTransactionToast = (signature: string) => {
      const solscanUrl = `https://solscan.io/tx/${signature}`;
      toast.info(
        <div>
          <Link
            to={solscanUrl}
            target="_blank"
            className="text-blue-700 hover:underline"
          >
            {signature.slice(0, 8)}...
          </Link>
        </div>
      );
    };
    

  const onSwap = async () => {
    if (!sellAmount) return;
    const result = await executeSwap({
      amount: sellAmount,
      style: isTokenSelling ? "sell" : "buy",
      tokenAddress: token.mint,
      token,
    });
    if (result?.signature) {
      showTransactionToast(result?.signature)
    }
    queryClient.invalidateQueries({ queryKey: ["token", token.mint] });
    setSellAmount(0);
  };

  useEffect(() => {
    setSellAmount(Number(inputAmount));
  }, [inputAmount]);

  useEffect(() => {
    setInputAmount("0");
  }, [isTokenSelling]);

  const changeSlippage = (value: string) => {
    if (isNaN(Number(value))) {
      console.warn(`Invalid slippage input: "${value}" is not a number.`);
      return;
    }

    setDisplaySlippage(value);
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
                      : formatAmount(convertedAmount),
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

          <div className="flex flex-col gap-4">
            {/* Selling */}
            <div
              className={twMerge([
                "flex flex-col py-1 px-2 gap-4 transition-colors duration-200",
                error ? "border-autofun-text-error" : "",
              ])}
            >
              <div className="flex flex-col justify-between gap-3 border-b-1 border-autofun-background-input hover:border-white focus:border-white py-2">
                <input
                  className="text-6xl w-full p-2 overflow-clip font-dm-mono text-white outline-none"
                  min={0}
                  type="text"
                  style={{
                    fontSize: inputAmount.length > 6 ? "3rem" : "4rem",
                  }}
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
                    let value = target.value;
                    if (!/^\d*\.?\d*$/.test(value)) {
                      return; // invalid input, ignore
                    }
                    // If value starts with multiple zeros, trim them
                    if (/^0[0-9]+/.test(value)) {
                      value = value.replace(/^0+/, "");
                      if (value === "") value = "0"; // If all removed, fallback to single '0'
                    }

                    const [whole, decimal] = value.split(".");
                    if (decimal !== undefined) {
                      value = `${whole}.${decimal.slice(0, 18)}`;
                    }
                    setInputAmount(value);
                  }}
                  value={inputAmount}
                  onBlur={({ target }) => {
                    const value = target.value;

                    const parsed = parseFloat(value);
                    if (!value || isNaN(parsed) || parsed <= 0) {
                      setInputAmount("");
                    } else {
                      // Remove unnecessary decimals like ".0"
                      setInputAmount(parsed.toString());
                    }
                  }}
                  placeholder="0"
                />
                <div className="flex items-center gap-2 w-full justify-between">
                  <TokenDisplay token={token} isSolana={!isTokenSelling} />
                  <Balance
                    token={token}
                    isSolana={!isTokenSelling}
                    setSellAmount={setInputAmount}
                    balance={isTokenSelling ? tokenBalance : Number(solBalance)}
                  />
                </div>
              </div>

              {/* Balance Selection Buttons */}
              <div className="flex gap-1 w-full">
                <button
                  onClick={() => setSellAmount(0)}
                  className="flex-1 px-2 py-1 text-sm font-dm-mono text-autofun-text-secondary hover:text-autofun-text-primary bg-autofun-background-input disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Reset
                </button>
                {!isTokenSelling ? (
                  <>
                    {["0.1", "0.5", "1.0"].map((but: string) => (
                      <button
                        key={but}
                        onClick={() => {
                          setInputAmount(but);
                        }}
                        disabled={isButtonDisabled(but)}
                        className="flex-1 px-2 py-1 text-sm font-dm-mono text-autofun-text-secondary hover:text-autofun-text-primary bg-autofun-background-input disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                      >
                        {String(but)}
                      </button>
                    ))}
                  </>
                ) : (
                  <>
                    {["25", "50", "75", "100"].map((perc: string) => (
                      <button
                        key={perc}
                        onClick={() => {
                          const percentage = parseFloat(perc) / 100;
                          setInputAmount(String(Number(balance) * percentage));
                        }}
                        disabled={isButtonDisabled("25")}
                        className="flex-1 px-2 py-1 text-sm font-dm-mono text-autofun-text-secondary hover:text-autofun-text-primary bg-autofun-background-input disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                      >
                        {perc}%
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* Buying */}
            <div className="flex flex-col gap-4 px-2">
              <div className="flex items-center gap-2 justify-between text-sm font-dm-mono text-autofun-text-secondary w-full">
                <span>Min Received:</span>
                <div className="relative flex uppercase items-center gap-2">
                  {displayhMinReceivedQuery?.isError
                    ? "Error"
                    : displayMinReceived}
                  <img
                    src={
                      isTokenSelling
                        ? "/solana.svg"
                        : token?.image || "/placeholder.png"
                    }
                    alt={
                      isTokenSelling
                        ? "SOL"
                        : sanitizeCheckmark(token?.name) || "token"
                    }
                    className="size-6 m-2"
                  />
                  {isTokenSelling ? "SOL" : sanitizeCheckmark(token?.ticker)}
                </div>
              </div>

              <div className="flex items-center justify-between text-sm font-dm-mono text-autofun-text-secondary w-full">
                <span>Price Impact:</span>
                <span
                  className={twMerge([
                    "text-sm font-dm-mono",
                    Number(priceImpact) > 5 ? "text-red-500" : "",
                  ])}
                >
                  {priceImpact} %
                </span>
              </div>
              <div
                className={twMerge([
                  "flex items-center gap-2 select-none",
                  insufficientBalance ? "block" : "hidden",
                ])}
              >
                <div className="flex items-center gap-2">
                  <Info className="text-red-600 size-4" />
                  <p className="text-red-600 text-xs font-dm-mono">
                    Insufficient Funds: You have{" "}
                    {Number(balance).toFixed(4) || "0"}{" "}
                    {isTokenSelling ? sanitizeCheckmark(token?.ticker) : "SOL"}
                  </p>
                </div>
              </div>

              {/* Slippage Input */}
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
                    onBlur={handleSlippageBlur}
                    value={displaySlippage}
                    onChange={(e) => changeSlippage(e.target.value)}
                    className="w-16 py-1 pl-2 pr-6 bg-[#1a1a1a] border-b border-white/50 hover:border-white focus:border-white font-dm-mono text-autofun-text-secondary text-right"
                  />
                  <span className="absolute right-2 text-sm font-dm-mono text-autofun-text-secondary">
                    %
                  </span>
                </div>
              </div>

              <p
                className={twMerge([
                  "text-orange-500 font-dm-mono text-xs transition-opacity duration-300",
                  Number(displaySlippage) > 6 ? "opacity-100" : "h-0 opacity-0",
                ])}
              >
                Your transaction may be frontrun and result in an unfavorable
                trade
              </p>
            </div>
          </div>
          {/* Swap Button - Now in the left column below Min Received */}
          <div className="flex flex-col gap-4 justify-center items-center">
            <button
              onClick={onSwap}
              className={twMerge([
                "w-full mx-2 cursor-pointer mt-2 transition-opacity duration-200",
                isStatusDisabled ||
                insufficientBalance ||
                isExecutingSwap ||
                !sellAmount ||
                sellAmount === 0
                  ? "!cursor-not-allowed"
                  : "",
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
            <p
              className={twMerge([
                "text-orange-500 font-dm-mono text-xs transition-opacity duration-300",
                (token?.status === "active"
                  ? token?.curveProgress > 95
                  : false) || token?.status === "migrating"
                  ? "opacity-100"
                  : "h-0 opacity-0",
              ])}
            >
              During migrations, tokens are not tradeable on this platform.
            </p>
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
    <div className="flex items-center justify-end">
      <SkeletonImage
        src={isSolana ? "/solana.svg" : token?.image || "/placeholder.png"}
        alt={token?.name || "token"}
        className="size-4 mr-2"
      />
      <span className="text-lg uppercase font-dm-mono tracking-wider font-bold">
        {isSolana ? "SOL" : sanitizeCheckmark(token?.ticker)}
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
          {formattedBalance}{" "}
          {isSolana ? "SOL" : sanitizeCheckmark(token?.ticker)}
        </span>
      </div>
    </div>
  );
};
