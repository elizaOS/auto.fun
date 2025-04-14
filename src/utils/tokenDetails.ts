import { z } from "zod";
import { usePagination } from "./paginatedLiveData";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useEffect } from "react";
import { getSocket } from "./socket";

const HolderSchema = z.object({
  address: z.string(),
  mint: z.string(),
  amount: z.number(),
  percentage: z.number(),
  createdAt: z.string().datetime(),
  lastUpdated: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Holder = z.infer<typeof HolderSchema>;

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

export type Transaction = z.infer<typeof TransactionSchema>;

export const useTransactions = ({ tokenId }: { tokenId: string }) => {
  const pageSize = 100;
  const pagination = usePagination({
    endpoint: `/swaps/${tokenId}`,
    limit: pageSize,
    validationSchema: TransactionSchema,
    itemsPropertyName: "swaps",
    sortBy: "timestamp",
    sortOrder: "desc",
  });

  useEffect(() => {
    const socket = getSocket();

    socket.on("newSwap", (transaction: unknown) => {
      const newTransaction = TransactionSchema.parse(transaction);

      if (pagination.currentPage !== 1) return;

      pagination.setItems((items) =>
        [newTransaction, ...items].slice(0, pageSize),
      );
    });

    return () => {
      socket.off("newSwap");
    };
  }, [pagination]);

  return pagination;
};

export const useHolders = ({ tokenId }: { tokenId: string }) => {
  const pageSize = 100;
  const pagination = usePagination({
    endpoint: `/tokens/${tokenId}/holders`,
    limit: pageSize,
    validationSchema: HolderSchema,
    itemsPropertyName: "holders",
    sortBy: "percentage",
    sortOrder: "desc",
  });

  useEffect(() => {
    const socket = getSocket();

    socket.on("newHolder", (holder: unknown) => {
      const newHolder = HolderSchema.parse(holder);

      if (pagination.currentPage !== 1) return;

      pagination.setItems((items) => [newHolder, ...items].slice(0, pageSize));
    });

    return () => {
      socket.off("newHolder");
    };
  }, [pagination]);

  return pagination;
};
