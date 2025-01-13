"use client";

import { useState } from "react";
import { TransactionTable } from "./TransactionTable";
import { HolderDistributionTable } from "./HolderDistributionTable";
import { useToken } from "@/utils/tokens";

export const BottomTable = ({ mint }: { mint: string }) => {
  const { data: token } = useToken({ variables: mint });
  const [activeTab, setActiveTab] = useState<
    "Transactions" | "Holder Distribution"
  >("Transactions");

  return (
    <div className="rounded-lg bg-[#272727] overflow-hidden min-h-[300px] flex flex-col">
      {/* Tab Navigation */}
      <div className="flex bg-[#00ff0036] p-4">
        <div className="flex gap-2 bg-[#272727] p-2 rounded-lg">
          <button
            className={`rounded-lg px-4 py-2 ${
              activeTab === "Transactions" ? "bg-[#33c55e]" : ""
            } ${activeTab === "Transactions" ? "text-[#0e0e0e]" : "text-[#33c55e]"}`}
            onClick={() => setActiveTab("Transactions")}
          >
            Transactions
          </button>
          <button
            className={`rounded-lg px-4 py-2 ${
              activeTab === "Holder Distribution" ? "bg-[#33c55e]" : ""
            } ${activeTab === "Holder Distribution" ? "text-[#0e0e0e]" : "text-[#33c55e]"}`}
            onClick={() => setActiveTab("Holder Distribution")}
          >
            Holder Distribution
          </button>
        </div>
      </div>

      {/* Component containers with visibility toggling */}
      <div
        className={`${activeTab === "Transactions" ? "flex flex-col" : "hidden"} flex-1`}
      >
        {token && <TransactionTable mint={mint} ticker={token.ticker} />}
      </div>

      <div
        className={`${activeTab === "Holder Distribution" ? "flex flex-col" : "hidden"} flex-1`}
      >
        <HolderDistributionTable mint={mint} />
      </div>
    </div>
  );
};
