"use client";

import { Paginator } from "@/components/common/Paginator";
import { usePaginatedLiveData } from "@/utils/paginatedLiveData";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Socket } from "socket.io-client";
import { z } from "zod";

const TransactionSchema = z
  .object({
    txId: z.string(),
    timestamp: z.string().datetime(),
    user: z.string(),
    direction: z.number().int().min(0).max(1),
    amountIn: z.number(),
    amountOut: z.number(),
  })
  .transform((tx) => ({
    txId: tx.txId,
    timestamp: tx.timestamp,
    user: tx.user,
    type: tx.direction === 0 ? "Buy" : "Sell",
    solAmount:
      (tx.direction === 0 ? tx.amountIn : tx.amountOut) / LAMPORTS_PER_SOL,
    tokenAmount: tx.direction === 0 ? tx.amountOut : tx.amountIn,
  }));

export const TransactionTable = ({
  socket,
  mint,
  ticker,
}: {
  socket: Socket;
  mint: string;
  ticker: string;
}) => {
  const {
    items: transactions,
    currentPage,
    nextPage,
    previousPage,
    hasNextPage,
    hasPreviousPage,
  } = usePaginatedLiveData({
    itemsPerPage: 100,
    maxPages: 1,
    endpoint: `/swaps/${mint}`,
    socket,
    validationSchema: TransactionSchema,
    getUniqueId: (tx) => tx.txId,
    socketConfig: {
      subscribeEvent: {
        event: "subscribe",
        args: [mint],
      },
      newDataEvent: "newSwap",
    },
    itemsPropertyName: "swaps",
  });

  return (
    <div className="p-4">
      <table className="w-full">
        <thead>
          <tr className="text-[#b3a0b3] font-medium text-left">
            <th className="py-4">Account</th>
            <th>Action</th>
            <th>Amount (SOL)</th>
            <th>{ticker}</th>
            <th>Time</th>
            <th>Transaction</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr key={tx.txId} className="border-t border-[#532954]">
              <td className="py-4">{tx.user}</td>
              <td
                className={
                  tx.type === "Buy" ? "text-[#42b642]" : "text-[#ef4242]"
                }
              >
                {tx.type}
              </td>
              <td>{tx.solAmount}</td>
              <td>{tx.tokenAmount}</td>
              <td>{tx.timestamp}</td>
              <td>{tx.txId}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-center mt-4">
        <Paginator
          currentPage={currentPage}
          hasPreviousPage={hasPreviousPage}
          hasNextPage={hasNextPage}
          previousPage={previousPage}
          nextPage={nextPage}
        />
      </div>
    </div>
  );
};
