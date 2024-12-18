import { useEffect, useState } from "react";

type Transaction = {
  account: string;
  action: "Buy" | "Sell";
  amount: number;
  merlin: string;
  time: string;
  transactionId: string;
};

export const TransactionTable = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Fetch transactions data
  useEffect(() => {
    // API call to fetch transactions
    setTransactions([
      {
        account: "0x123",
        action: "Buy",
        amount: 100,
        merlin: "123",
        time: "2024-01-01",
        transactionId: "123",
      },
      {
        account: "0x123",
        action: "Sell",
        amount: 100,
        merlin: "123",
        time: "2024-01-01",
        transactionId: "124",
      },
    ]);
  }, []);

  return (
    <div className="p-4">
      <table className="w-full">
        <thead>
          <tr className="text-[#b3a0b3] font-medium text-left">
            <th className="py-4">Account</th>
            <th>Action</th>
            <th>Amount (SOL)</th>
            <th>MERLIN</th>
            <th>Time</th>
            <th>Transaction</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr key={tx.transactionId} className="border-t border-[#532954]">
              <td className="py-4">{tx.account}</td>
              <td
                className={
                  tx.action === "Buy" ? "text-[#42b642]" : "text-[#ef4242]"
                }
              >
                {tx.action}
              </td>
              <td>{tx.amount}</td>
              <td>{tx.merlin}</td>
              <td>{tx.time}</td>
              <td>{tx.transactionId}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
