import { IToken } from "@/types";
import { useState } from "react";
import Button from "./button";
import SwapsTable from "./swaps-table";
import HoldersTable from "./holders-table";

export default function TransactionsAndHolders({ token }: { token: IToken }) {
  const [mode, setMode] = useState<"transactions" | "holders">("transactions");

  return (
    <div className="border rounded-md bg-autofun-background-card">
      <div className="flex items-center p-3">
        <Button
          size="small"
          variant={mode === "transactions" ? "primary" : "ghost"}
          onClick={() => setMode("transactions")}
        >
          Trades
        </Button>
        <Button
          size="small"
          variant={mode === "holders" ? "primary" : "ghost"}
          onClick={() => setMode("holders")}
        >
          Holders
        </Button>
      </div>
      {mode === "transactions" ? (
        <SwapsTable token={token} />
      ) : (
        <HoldersTable token={token} />
      )}
    </div>
  );
}
