import { z } from "zod";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useEffect } from "react";
import { getSocket } from "@/utils/socket";
import { usePagination } from "./use-pagination";

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
    type: tx.direction === 0 ? ("Buy" as const) : ("Sell" as const),
    solAmount:
      (tx.direction === 0 ? tx.amountIn : tx.amountOut) / LAMPORTS_PER_SOL,
    tokenAmount:
      tx.direction === 0 ? tx.amountOut / 10 ** 6 : tx.amountIn / 10 ** 6,
  }));

// type Transaction = z.infer<typeof TransactionSchema>;

export const useTransactions = ({
  tokenId,
  isPaused,
}: {
  tokenId: string;
  isPaused?: boolean;
}) => {
  const pageSize = 20;
  const pagination = usePagination({
    endpoint: `/api/swaps/${tokenId}`,
    limit: pageSize,
    validationSchema: TransactionSchema,
    itemsPropertyName: "swaps",
    sortBy: "timestamp",
    sortOrder: "desc",
    enabled: isPaused ? false : true,
    refetchInterval: 30000
  });

  useEffect(() => {
    const socket = getSocket();

    socket.on("newSwap", (transaction: any) => {
      if (isPaused) return;
      let newTransactions: any = [];
      if (Array.isArray(transaction)) {
        newTransactions = transaction.map((item) =>
          TransactionSchema.parse(item),
        );
      } else if (transaction && typeof transaction === "object") {
        newTransactions = [TransactionSchema.parse(transaction)];
      } else {
        newTransactions = [];
      }

      if (pagination.currentPage !== 1) return;

      pagination.setItems((items) => {
        const uniqueItems = Array.from(
          new Map(items.map((item) => [item.txId, item])).values(),
        );

        const existingTxIds = new Set(uniqueItems.map((item) => item.txId));

        const uniqueNewTransactions = newTransactions.filter(
          (tx: any) => !existingTxIds.has(tx.txId),
        );

        const mergedItems = [...uniqueNewTransactions, ...uniqueItems];

        const sortedItems = mergedItems.sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );

        return sortedItems.slice(0, pageSize);
      });
    });

    return () => {
      socket.off("newSwap");
    };
  }, [pagination]);

  return pagination;
};
