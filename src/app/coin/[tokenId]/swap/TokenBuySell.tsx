"use client";

import { RoundedButton } from "@/components/common/button/RoundedButton";
import { useMemo, useState } from "react";
import { useSwap } from "./useSwap";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { Slippage } from "./Slippage";
import { useWalletConnection } from "@/components/common/button/WalletButton";
import { MigrationOverlay } from "./MigrationOverlay";
import { useToken } from "@/utils/tokens";
import { Toast } from "@/components/common/Toast";
import { toast } from "react-toastify";

export const TokenBuySell = ({ tokenId }: { tokenId: string }) => {
  const { data: token } = useToken({ variables: tokenId });
  const [activeTab, setActiveTab] = useState<"Buy" | "Sell">("Buy");
  const [amount, setAmount] = useState<number | string>("");
  const [sellPercentage, setSellPercentage] = useState<number | string>("");
  const [isFocus, setIsFocus] = useState(false);
  const [slippage, setSlippage] = useState<number | string>(2);
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const { connectWallet } = useWalletConnection();
  const { handleSwap } = useSwap();
  const tradeDisabled = useMemo(() => {
    if (!publicKey) return true;
    if (activeTab === "Sell") return !sellPercentage;
    return !amount;
  }, [publicKey, activeTab, sellPercentage, amount]);

  if (!token) return null;

  const getUserTokenBalance = async (): Promise<number> => {
    if (!publicKey) return 0;

    try {
      const tokenMint = new PublicKey(tokenId);

      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        { mint: tokenMint },
      );

      if (tokenAccounts.value.length > 0) {
        return tokenAccounts.value[0].account.data.parsed.info.tokenAmount
          .uiAmount;
      }
      return 0;
    } catch (error) {
      console.error("Error fetching token balance:", error);
      return 0;
    }
  };

  const handlePresetClick = (value: number) => {
    if (activeTab === "Sell") {
      setSellPercentage(value);
    } else {
      setAmount(value);
    }
  };

  const handleTradeClick = async () => {
    if (activeTab === "Buy" && !amount) return;
    if (activeTab === "Sell" && !sellPercentage) return;

    if (activeTab === "Sell") {
      const currentBalance = await getUserTokenBalance();
      const actualAmount = (Number(sellPercentage) * currentBalance) / 100;

      if (actualAmount <= 0) {
        console.error("Invalid amount");
        return;
      }

      try {
        await handleSwap({
          amount: actualAmount,
          slippagePercentage: typeof slippage === "number" ? slippage : 2,
          style: "sell",
          tokenAddress: tokenId,
        });
        toast(
          <Toast message={`Sale of $${token.ticker}`} status="completed" />,
        );
      } catch {
        toast(<Toast message={`Sale of $${token.ticker}`} status="failed" />);
      }
    } else {
      try {
        await handleSwap({
          amount: Number(amount),
          slippagePercentage: typeof slippage === "number" ? slippage : 2,
          style: "buy",
          tokenAddress: tokenId,
        });
        toast(
          <Toast message={`Purchase of $${token.ticker}`} status="completed" />,
        );
      } catch {
        toast(
          <Toast message={`Purchase of $${token.ticker}`} status="failed" />,
        );
      }
    }
  };

  const presetButtons =
    activeTab === "Buy"
      ? [0.5, 1, 5, 10] // SOL amounts for Buy
      : [25, 50, 75, 100]; // Percentages for Sell

  return (
    <div className="relative">
      <MigrationOverlay tokenId={tokenId} />
      <div className="flex flex-col gap-4 bg-[#272727] p-4 rounded-xl">
        <div className="flex gap-2 bg-[#00ff0036] p-2 rounded-lg w-full">
          <button
            className={`rounded-lg flex-1 px-4 py-2 ${
              activeTab === "Buy" ? "bg-[#33c55e]" : ""
            } ${activeTab === "Buy" ? "text-[#0e0e0e]" : "text-[#33c55e]"}`}
            onClick={() => setActiveTab("Buy")}
          >
            Buy
          </button>
          <button
            className={`rounded-lg flex-1 px-4 py-2 ${
              activeTab === "Sell" ? "bg-[#33c55e]" : ""
            } ${activeTab === "Sell" ? "text-[#0e0e0e]" : "text-[#33c55e]"}`}
            onClick={() => setActiveTab("Sell")}
          >
            Sell
          </button>
        </div>

        <div>
          <div className="text-white font-medium mb-2">
            {activeTab === "Buy" ? "Amount (SOL)" : "Amount (%)"}
          </div>
          <div
            className={`border rounded-lg relative ${
              isFocus ? "border-[#33c55e]" : "border-[#42c55e]"
            }`}
          >
            <input
              className="text-[#33c55e] font-medium bg-inherit p-3 w-full"
              type="number"
              onKeyDown={(e) => {
                if (e.key === "-" || e.key === "e") {
                  e.preventDefault();
                }
              }}
              min={0}
              max={activeTab === "Sell" ? 100 : undefined}
              value={activeTab === "Sell" ? sellPercentage : amount}
              onChange={(e) => {
                const value =
                  e.target.value === "" ? "" : Number(e.target.value);
                if (activeTab === "Sell") {
                  if (typeof value === "number" && value > 100) return;
                  setSellPercentage(value);
                } else {
                  setAmount(value);
                }
              }}
              onFocus={() => setIsFocus(true)}
              onBlur={() => setIsFocus(false)}
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              {activeTab === "Sell" ? (
                "%"
              ) : (
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M20 14L16 18H4L8 14M20 14H8M20 14L16 10M8 14L4 10M4 10H16M4 10L8 6H20L16 10"
                    stroke="#33c55e"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
          </div>

          <div className="flex gap-2 mt-2 mb-4">
            {presetButtons.map((value) => (
              <button
                key={value}
                className="h-12 px-4 py-3 bg-[#00ff0036] rounded-lg flex-col justify-center items-center gap-2 inline-flex flex-1"
                onClick={() => handlePresetClick(value)}
              >
                <div className="text-[#33c55e] text-base font-medium font-['Inter'] leading-normal">
                  {activeTab === "Buy" ? `${value} SOL` : `${value}%`}
                </div>
              </button>
            ))}
          </div>

          <Slippage value={slippage} onChange={setSlippage} />
        </div>

        <RoundedButton
          className="p-3"
          onClick={handleTradeClick}
          disabled={tradeDisabled}
        >
          Place trade
        </RoundedButton>

        {!publicKey && (
          <div>
            <span className="text-[#cab7c7] text-base font-medium font-['Inter'] leading-normal">
              To place trades, please{" "}
            </span>
            <button
              className="text-[#33c55e] text-base font-medium font-['Inter'] leading-normal"
              onClick={connectWallet}
            >
              connect your wallet
            </button>
            <span className="text-[#cab7c7] text-base font-medium font-['Inter'] leading-normal">
              .
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
