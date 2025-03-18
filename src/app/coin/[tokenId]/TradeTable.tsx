import { useMemo } from "react";
import { Transaction } from "./page";
import { useTimeAgo } from "@/app/formatTimeAgo";
import { env } from "@/utils/env";

export const TradeTable = ({
  transactions,
  ticker,
}: {
  transactions: Transaction[];
  ticker: string;
}) => {
  const txTimestamps = useMemo(
    () => transactions?.map((tx) => tx.timestamp),
    [transactions],
  );

  const txTimeAgos = useTimeAgo(txTimestamps);

  return (
    <table className="w-full min-w-[600px]">
      <thead>
        <tr className="text-[#8C8C8C] text-xs uppercase">
          <th className="text-left py-2">Account</th>
          <th className="text-left py-2">Type</th>
          <th className="text-left py-2">SOL</th>
          <th className="text-left py-2">{ticker}</th>
          <th className="text-left py-2">Date</th>
          <th className="text-left py-2">TXN</th>
        </tr>
      </thead>
      <tbody className="text-sm">
        {transactions.map((tx, i) => (
          <tr key={i} className="border-b border-[#262626] last:border-0">
            <td className="py-3 text-[#8C8C8C]">
              {tx.user.slice(0, 5)}...{tx.user.slice(-3)}
            </td>
            <td
              className={`py-3 ${tx.type === "Buy" ? "text-[#4ADE80]" : "text-[#FF4444]"}`}
            >
              {tx.type}
            </td>
            <td className="py-3 text-white">{tx.solAmount}</td>
            <td className="py-3 text-white">
              {Intl.NumberFormat("en-US", {
                style: "decimal",
                notation: "compact",
              })
                .format(Number(tx.tokenAmount))
                .toLowerCase()}
            </td>
            <td className="py-3 text-[#8C8C8C]">{txTimeAgos[i]}</td>
            <td className="py-3">
              <a
                className="text-[#8C8C8C] hover:text-white"
                href={env.getTransactionUrl(tx.txId)}
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
