"use client";

import { RoundedButton } from "@/components/common/button/RoundedButton";
import { useState } from "react";
import { useSwap } from "./useSwap";

export const TokenBuySell = ({ tokenId }: { tokenId: string }) => {
  const [activeTab, setActiveTab] = useState<"Buy" | "Sell">("Buy");
  const [amount, setAmount] = useState<number | string>("");
  const [isFocus, setIsFocus] = useState(false);

  const { handleSwap } = useSwap();

  return (
    <div>
      <div className="flex flex-col gap-4 bg-[#401141] p-4 rounded-xl">
        <div className="flex gap-2 bg-[#521653] p-2 rounded-lg w-full">
          <button
            className={`rounded-lg flex-1 px-4 py-2 ${
              activeTab === "Buy" ? "bg-[#f743f6]" : ""
            } ${activeTab === "Buy" ? "text-[#521653]" : "text-[#F743F6]"}`}
            onClick={() => setActiveTab("Buy")}
          >
            Buy
          </button>
          <button
            className={`rounded-lg flex-1 px-4 py-2 ${
              activeTab === "Sell" ? "bg-[#f743f6]" : ""
            } ${activeTab === "Sell" ? "text-[#521653]" : "text-[#F743F6]"}`}
            onClick={() => setActiveTab("Sell")}
          >
            Sell
          </button>
        </div>

        <div>
          <div className="text-white font-medium mb-2">Amount (SOL)</div>
          <div
            className={`border rounded-lg relative ${
              isFocus ? "border-[#f743f6]" : "border-[#662066]"
            }`}
          >
            <input
              className="text-[#f743f6] font-medium bg-inherit p-3 w-full"
              type="number"
              onKeyDown={(e) => {
                if (e.key === "-" || e.key === "e") {
                  e.preventDefault();
                }
              }}
              min={0}
              value={amount}
              onChange={(e) =>
                setAmount(e.target.value === "" ? "" : Number(e.target.value))
              }
              onFocus={() => setIsFocus(true)}
              onBlur={() => setIsFocus(false)}
            />
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="absolute right-4 top-1/2 -translate-y-1/2"
            >
              <path
                d="M20 14L16 18H4L8 14M20 14H8M20 14L16 10M8 14L4 10M4 10H16M4 10L8 6H20L16 10"
                stroke="#F743F6"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        <RoundedButton
          className="p-3"
          onClick={() =>
            handleSwap({
              amountSol: Number(amount),
              // TODO: get slippage from user
              slippagePercentage: 0,
              style: activeTab === "Buy" ? "buy" : "sell",
              tokenAddress: tokenId,
            })
          }
        >
          Place trade
        </RoundedButton>
      </div>
    </div>
  );
};
