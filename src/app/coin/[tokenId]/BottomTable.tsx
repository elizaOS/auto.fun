"use client";

import { useState } from "react";
import { TransactionTable } from "./TransactionTable";
import { HolderDistributionTable } from "./HolderDistributionTable";
import { Socket } from "socket.io-client";
import { useToken } from "@/utils/tokens";

export const BottomTable = ({
  socket,
  mint,
}: {
  socket: Socket;
  mint: string;
}) => {
  const { data: token } = useToken(mint);
  const [activeTab, setActiveTab] = useState<
    "Transactions" | "Holder Distribution"
  >("Transactions");

  return (
    <div className="rounded-lg bg-[#401141] overflow-hidden min-h-[300px] flex flex-col">
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

      {/* Component containers with visibility toggling */}
      <div className={activeTab === "Transactions" ? "block" : "hidden"}>
        {token && (
          <TransactionTable socket={socket} mint={mint} ticker={token.ticker} />
        )}
      </div>

      <div className={activeTab === "Holder Distribution" ? "block" : "hidden"}>
        <HolderDistributionTable socket={socket} mint={mint} />
      </div>
    </div>
  );
};
