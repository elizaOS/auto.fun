"use client";

import { useState, useMemo, useEffect } from "react";
import { useSwap } from "./useSwap";
import { useWallet } from "@solana/wallet-adapter-react";
import { useToken } from "@/utils/tokens";
import { Toast } from "@/components/common/Toast";
import { toast } from "react-toastify";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { formatNumber } from "@/utils/number";
import { useProgram } from "@/utils/program";
import { TradeSettingsModal } from "./TradeSettingsModal";
import { useWalletModal } from "@/components/common/custom-wallet-multi";
import { SolanaIcon } from "./SolanaIcon";
import { Settings, Wallet } from "lucide-react";

interface TokenInputProps {
  type: "Selling" | "Buying";
  value: string;
  onChange?: (value: string) => void;
  tokenSymbol: string;
  disabled?: boolean;
  dollarValue: number;
  tokenBalance: number;
  tokenImage: string;
  onSettingsClick?: () => void;
}

const TokenInput = ({
  type,
  value,
  onChange,
  tokenSymbol,
  disabled = false,
  dollarValue,
  tokenBalance,
  tokenImage,
  onSettingsClick,
}: TokenInputProps) => {
  // Format only for display, not for the input value itself
  const displayValue = disabled
    ? value === ""
      ? "0.00"
      : type === "Buying"
        ? formatNumber(parseFloat(value))
        : parseFloat(value).toFixed(4)
    : value;

  const handlePercentageClick = (percent: string) => {
    if (!onChange) return;

    if (percent === "MAX" || percent === "100%") {
      onChange(tokenBalance.toString());
    } else if (percent === "Reset") {
      onChange("");
    } else {
      const percentage = Number(percent.replace("%", "")) / 100;
      onChange((tokenBalance * percentage).toFixed(4));
    }
  };

  const handleSolPresetClick = (sol: string) => {
    if (!onChange) return;

    if (sol === "Reset") {
      onChange("");
    } else {
      onChange(sol);
    }
  };

  const buyingButtons = ["Reset", "25%", "50%", "100%"];
  const sellingButtons = ["Reset", "0.5", "1", "5"];

  return (
    <div className="p-3.5 bg-[#171717] rounded-lg border border-neutral-800">
      <div className="flex flex-col gap-[18px]">
        <div className="flex justify-between items-center gap-[10px] h-[36px] w-full">
          <div className="text-white text-base font-normal font-['DM Mono'] flex-grow">
            {type}
          </div>
          {!disabled && (
            <div className="flex items-center h-[36px]">
              <div className="flex h-full">
                {(tokenSymbol === "SOL" ? sellingButtons : buyingButtons).map(
                  (value, index, arr) => (
                    <button
                      key={value}
                      onClick={() =>
                        tokenSymbol === "SOL"
                          ? handleSolPresetClick(value)
                          : handlePercentageClick(value)
                      }
                      className={`
                      h-[36px] px-4 bg-[#121212] flex items-center justify-center
                      ${index === 0 ? "rounded-l-md" : ""}
                      ${index === arr.length - 1 ? "" : ""}
                      ${index !== 0 ? "border-l border-neutral-800" : ""}
                      hover:bg-[#1a1a1a] transition-colors
                    `}
                    >
                      <span className="text-white text-sm font-medium font-['DM Mono'] min-w-[9px] flex items-center">
                        {value}
                      </span>
                    </button>
                  ),
                )}
                <button
                  onClick={onSettingsClick}
                  className={`
                    h-[36px] w-[52px] bg-[#121212] flex items-center justify-center
                    rounded-r-md border-l border-neutral-800
                    hover:bg-[#1a1a1a] transition-colors
                  `}
                >
                  <Settings className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between w-full pr-[2px] text-4xl">
          <input
            type="text"
            placeholder="0.00"
            className="w-[120px] font-normal font-['DM Mono'] bg-transparent outline-none placeholder:text-[#a1a1a1] text-[#a1a1a1]"
            value={displayValue}
            onChange={(e) => onChange?.(e.target.value)}
            disabled={disabled}
          />
          <div className="p-2 bg-neutral-900 rounded-lg border border-neutral-800 flex items-center gap-2">
            <div className="flex items-center gap-2">
              {tokenSymbol === "SOL" ? (
                <SolanaIcon />
              ) : (
                <img
                  src={tokenImage}
                  alt={tokenSymbol}
                  className="w-6 h-6 rounded-2xl"
                />
              )}
              <span className="text-white text-base font-normal font-['DM Mono'] uppercase tracking-widest">
                {tokenSymbol}
              </span>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-start w-full">
          <span className="text-[#a1a1a1] text-sm font-normal font-['DM Mono']">
            ${dollarValue.toFixed(2)}
          </span>
          <div className="flex gap-1 items-center">
            <Wallet className="w-3 h-3 text-[#a6a6a6]" />
            <span className="text-[#a6a6a6] text-xs font-normal font-['DM Mono']">
              {tokenSymbol === "SOL"
                ? tokenBalance.toFixed(4)
                : formatNumber(tokenBalance)}{" "}
              {tokenSymbol}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const getStatusContent = (status: string) => {
  switch (status) {
    case "completed":
      return (
        <div className="flex items-center gap-2">
          <div className="w-full bg-neutral-800 rounded-full h-2">
            <div className="bg-green-500 h-2 rounded-full w-full"></div>
          </div>
          <span className="text-green-500 text-sm font-['DM Mono']">100%</span>
        </div>
      );
    case "migrating":
      return (
        <div className="w-full flex items-center justify-center bg-yellow-500/10 py-2 rounded-lg">
          <span className="text-yellow-500 text-sm font-['DM Mono']">
            MIGRATING
          </span>
        </div>
      );
    case "migration_failed":
      return (
        <div className="w-full flex items-center justify-center bg-red-500/10 py-2 rounded-lg">
          <span className="text-red-500 text-sm font-['DM Mono']">
            MIGRATION FAILED
          </span>
        </div>
      );
    case "failed":
      return (
        <div className="w-full flex items-center justify-center bg-red-500/10 py-2 rounded-lg">
          <span className="text-red-500 text-sm font-['DM Mono']">FAILED</span>
        </div>
      );
    default:
      return null;
  }
};

const TokenInputSkeleton = () => {
  return (
    <div className="p-3.5 bg-[#171717] rounded-lg border border-neutral-800 animate-pulse">
      <div className="flex flex-col gap-[18px]">
        <div className="flex justify-between items-center gap-[10px] h-[36px] w-full">
          <div className="w-20 h-4 bg-neutral-800 rounded"></div>
          <div className="flex items-center h-[36px]">
            <div className="flex h-full">
              {[1, 2, 3, 4].map((_, index) => (
                <div
                  key={index}
                  className={`
                    h-[36px] w-14 bg-[#121212] flex items-center justify-center
                    ${index === 0 ? "rounded-l-md" : ""}
                    ${index !== 0 ? "border-l border-neutral-800" : ""}
                  `}
                >
                  <div className="w-8 h-3 bg-neutral-800 rounded"></div>
                </div>
              ))}
              <div className="h-[36px] w-[52px] bg-[#121212] flex items-center justify-center rounded-r-md border-l border-neutral-800">
                <div className="w-5 h-5 bg-neutral-800 rounded"></div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between w-full pr-[2px]">
          <div className="w-24 h-8 bg-neutral-800 rounded"></div>
          <div className="p-2 bg-neutral-900 rounded-lg border border-neutral-800 flex items-center gap-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-neutral-800 rounded-2xl"></div>
              <div className="w-16 h-4 bg-neutral-800 rounded"></div>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-start w-full">
          <div className="w-20 h-3 bg-neutral-800 rounded"></div>
          <div className="flex gap-1 items-center">
            <div className="w-3 h-3 bg-neutral-800 rounded"></div>
            <div className="w-24 h-3 bg-neutral-800 rounded"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const TokenBuySellSkeleton = () => {
  return (
    <div className="bg-[#121212] rounded-[6px] border border-neutral-800 p-4 flex flex-col gap-4">
      <div className="flex flex-col gap-4 relative">
        <TokenInputSkeleton />

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 p-2 bg-[#171717] rounded-full border-2 border-[#121212] flex justify-center z-10">
          <div className="w-6 h-6 bg-neutral-800 rounded"></div>
        </div>

        <TokenInputSkeleton />
      </div>

      <div className="mt-auto w-full">
        <div className="w-full h-10 bg-neutral-800 rounded animate-pulse"></div>
      </div>
    </div>
  );
};

export const TokenBuySell = ({ tokenId }: { tokenId: string }) => {
  const { data: token } = useToken({
    variables: tokenId,
    // update price data on interval. can maybe move this to the socket connection
    refetchInterval: 5000,
  });
  const program = useProgram();

  const [amountInput, setAmountInput] = useState<string>("");
  const { publicKey } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const { connection } = useConnection();
  const { executeSwap } = useSwap();
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [solBalance, setSolBalance] = useState<number>(0);
  const [isBuyMode, setIsBuyMode] = useState(true);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  // Get SOL balance
  useEffect(() => {
    if (!publicKey || !connection) return;

    const fetchSolBalance = async () => {
      try {
        const balance = await connection.getBalance(publicKey);
        setSolBalance(balance / 1e9);
      } catch (error) {
        console.error("Error fetching SOL balance:", error);
      }
    };

    fetchSolBalance();
    const id = connection.onAccountChange(publicKey, () => {
      fetchSolBalance();
    });
    return () => {
      connection.removeAccountChangeListener(id);
    };
  }, [publicKey, connection]);

  // Get token balance
  useEffect(() => {
    if (!publicKey || !connection || !program) return;

    const fetchTokenBalance = async () => {
      try {
        const tokenMint = new PublicKey(tokenId);
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          publicKey,
          { mint: tokenMint },
        );

        const balance =
          tokenAccounts.value.length > 0
            ? tokenAccounts.value[0].account.data.parsed.info.tokenAmount
                .uiAmount
            : 0;

        setTokenBalance(balance);
      } catch (error) {
        console.error("Error fetching token balance:", error);
      }
    };

    fetchTokenBalance();
    // Listen for token account changes
    const tokenAccountListener = connection.onProgramAccountChange(
      program.programId,
      fetchTokenBalance,
    );

    return () => {
      connection.removeProgramAccountChangeListener(tokenAccountListener);
    };
  }, [publicKey, connection, tokenId, program]);

  const calculatedAmounts = useMemo(() => {
    const amount =
      amountInput === "" || amountInput === "." ? 0 : parseFloat(amountInput);
    if (!token || isNaN(amount)) {
      return { dollarValue: 0, tokenAmount: 0 };
    }

    let dollarValue: number;
    let outputAmount: number;

    if (isBuyMode) {
      dollarValue = amount * token.solPriceUSD;
      outputAmount = amount / token.currentPrice;
    } else {
      dollarValue = amount * token.currentPrice * token.solPriceUSD;
      outputAmount = amount * token.currentPrice;
    }

    return {
      dollarValue,
      tokenAmount: outputAmount,
    };
  }, [amountInput, token, isBuyMode]);

  if (!token) return <TokenBuySellSkeleton />;

  const isDisabled = ["migrating", "migration_failed", "failed"].includes(
    token.status,
  );

  const handleSwapClick = async () => {
    if (isDisabled) return;

    const amount = parseFloat(amountInput);
    if (isNaN(amount) || amount === 0) return;

    try {
      await executeSwap({
        amount,
        style: isBuyMode ? "buy" : "sell",
        tokenAddress: tokenId,
        token,
      });

      toast(
        <Toast
          message={`${isBuyMode ? "Purchase" : "Sale"} of $${token.ticker}`}
          status="completed"
        />,
        {
          position: "bottom-right",
          autoClose: 5000,
          hideProgressBar: true,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: false,
          closeButton: false,
          className: "!p-0 !m-0",
        },
      );
    } catch (err) {
      console.error("Swap failed:", err);

      toast(
        <Toast
          message={`${isBuyMode ? "Purchase" : "Sale"} of $${token.ticker}: ${err}`}
          status="failed"
        />,
        {
          position: "bottom-right",
          autoClose: false,
          hideProgressBar: true,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: false,
          closeButton: false,
          className: "!p-0 !m-0",
        },
      );
    }
  };

  const handleAmountChange = (value: string) => {
    // Only allow numbers and a single decimal point
    if (value === "" || value === "." || /^\d*\.?\d*$/.test(value)) {
      setAmountInput(value);
    }
  };

  const handleModeSwitch = () => {
    // Use the calculated amount directly without formatting
    setAmountInput(calculatedAmounts.tokenAmount.toString());
    setIsBuyMode(!isBuyMode);
  };

  return (
    <div className="bg-[#121212] rounded-[6px] border border-neutral-800 p-4 flex flex-col gap-4">
      <TradeSettingsModal
        modalOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
      />

      {token.status !== "active" && (
        <div className="w-full">{getStatusContent(token.status)}</div>
      )}

      {token.status !== "active" && getStatusContent(token.status)}

      <div className="flex-1 flex flex-col justify-center gap-6 border-b border-neutral-800 rounded-b-xl min-w-fit">
        <div className="flex flex-col gap-2.5 relative min-w-fit">
          <TokenInput
            type="Selling"
            value={amountInput}
            onChange={handleAmountChange}
            tokenSymbol={isBuyMode ? "SOL" : token.ticker}
            disabled={isDisabled}
            dollarValue={calculatedAmounts.dollarValue}
            tokenBalance={isBuyMode ? solBalance : tokenBalance}
            tokenImage={token.image}
            onSettingsClick={() => setSettingsModalOpen(true)}
          />

          <button
            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 p-2 bg-[#212121] rounded-full border-2 border-neutral-900 flex justify-center z-10 ${
              isDisabled ? "opacity-50 cursor-not-allowed" : ""
            }`}
            disabled={isDisabled}
            onClick={handleModeSwitch}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M11 16L8 19M8 19L5 16M8 19V5M13 8L16 5M16 5L19 8M16 5V19"
                stroke="white"
                strokeWidth="1.41176"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <TokenInput
            type="Buying"
            value={calculatedAmounts.tokenAmount.toString()}
            onChange={undefined}
            tokenSymbol={isBuyMode ? token.ticker : "SOL"}
            disabled={true}
            dollarValue={calculatedAmounts.dollarValue}
            tokenBalance={isBuyMode ? tokenBalance : solBalance}
            tokenImage={token.image}
            onSettingsClick={() => setSettingsModalOpen(true)}
          />
        </div>

        <div className="w-full h-10">
          <button
            className={`w-full h-10 relative flex items-center justify-center ${
              isDisabled ? "bg-neutral-700 cursor-not-allowed" : "bg-green-500"
            }`}
            style={{
              clipPath:
                "polygon(0% 72%, 0% 0%, 95% 0%, 100% 29%, 100% 100%, 5% 100%)",
            }}
            onClick={
              isDisabled
                ? undefined
                : publicKey
                  ? handleSwapClick
                  : () => setWalletModalVisible(true)
            }
            disabled={isDisabled}
          >
            <span className="text-black text-xl font-['DM Mono']">
              {isDisabled
                ? token.status.toUpperCase()
                : publicKey
                  ? "SWAP"
                  : "CONNECT WALLET"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
