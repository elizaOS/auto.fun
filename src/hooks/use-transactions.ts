import { z } from "zod";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useEffect } from "react";
import { getSocket } from "@/utils/socket";
import { usePagination } from "./use-pagination";
import { fetchTokenTransactions } from "@/utils/blockchain";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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
  const queryClient = useQueryClient();

  // Fetch directly from blockchain
  const blockchainQuery = useQuery({
    queryKey: ["blockchain-swaps", tokenId],
    queryFn: async () => {
      try {
        console.log(`Fetching blockchain swaps directly for ${tokenId}`);
        const result = await fetchTokenTransactions(tokenId, 100);

        if (result.swaps && result.swaps.length > 0) {
          console.log(`Found ${result.swaps.length} swaps from blockchain`);
          return result.swaps.map((swap) => TransactionSchema.parse(swap));
        }

        console.log(`No blockchain swaps found for ${tokenId}`);
        return [];
      } catch (error) {
        console.error(`Error fetching blockchain swaps:`, error);
        return [];
      }
    },
    enabled: !!tokenId,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Fallback to API for backward compatibility
  const pagination = usePagination({
    endpoint: `/api/swaps/${tokenId}`,
    limit: pageSize,
    validationSchema: TransactionSchema,
    itemsPropertyName: "swaps",
    sortBy: "timestamp",
    sortOrder: "desc",
  });

  useEffect(() => {
    const socket = getSocket();

    socket.on("newSwap", (transaction: unknown) => {
      try {
        const newTransaction = TransactionSchema.parse(transaction);

        if (pagination.currentPage !== 1) return;

        // Update React Query cache with new transaction
        queryClient.setQueryData(
          ["blockchain-swaps", tokenId],
          (oldData: Transaction[] | undefined) => {
            if (oldData && oldData.length > 0) {
              return [newTransaction, ...oldData].slice(0, pageSize);
            }
            return oldData;
          },
        );

        // Also update the pagination items for the API fallback
        pagination.setItems((items) =>
          [newTransaction, ...items].slice(0, pageSize),
        );
      } catch (error) {
        console.error("Error processing socket swap:", error);
      }
    });

    return () => {
      socket.off("newSwap");
    };
  }, [pagination, tokenId, queryClient]);

  // Use blockchain data if available, otherwise fallback to API data
  const items =
    blockchainQuery.data && blockchainQuery.data.length > 0
      ? blockchainQuery.data
      : pagination.items;

  const isLoading = blockchainQuery.isLoading || pagination.isLoading;

  return {
    ...pagination,
    items,
    isLoading,
    hasBlockchainData: blockchainQuery.data && blockchainQuery.data.length > 0,
  };
};
