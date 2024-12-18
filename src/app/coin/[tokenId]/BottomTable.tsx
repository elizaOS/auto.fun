"use client";

import { useState } from "react";
import { TransactionTable } from "./TransactionTable";
import { HolderDistributionTable } from "./HolderDistributionTable";

export const BottomTable = () => {
  const [activeTab, setActiveTab] = useState<
    "Transactions" | "Holder Distribution"
  >("Transactions");

  return (
    <div className="rounded-lg bg-[#401141] overflow-hidden">
      {/* Tab Navigation */}
      <div className="flex bg-[#521653] p-4">
        <div className="flex gap-2 bg-[#401141] p-2 rounded-lg">
          <button
            className={`rounded-lg px-4 py-2 ${
              activeTab === "Transactions" ? "bg-[#f743f6]" : ""
            } ${activeTab === "Transactions" ? "text-[#521653]" : "text-[#F743F6]"}`}
            onClick={() => setActiveTab("Transactions")}
          >
            Transactions
          </button>
          <button
            className={`rounded-lg px-4 py-2 ${
              activeTab === "Holder Distribution" ? "bg-[#f743f6]" : ""
            } ${activeTab === "Holder Distribution" ? "text-[#521653]" : "text-[#F743F6]"}`}
            onClick={() => setActiveTab("Holder Distribution")}
          >
            Holder Distribution
          </button>
        </div>
      </div>

      {activeTab === "Transactions" && <TransactionTable />}

      {activeTab === "Holder Distribution" && <HolderDistributionTable />}
    </div>
  );
};
