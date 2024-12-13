"use client";

import { useState } from "react";

export const TokenBuySell = () => {
  const [activeTab, setActiveTab] = useState<"Buy" | "Sell">("Buy");

  return (
    <div>
      <div className="flex bg-[#401141] p-4 rounded-xl">
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
      </div>
    </div>
  );
};
