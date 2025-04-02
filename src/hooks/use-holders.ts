import { z } from "zod";
import { useEffect } from "react";
import { usePagination } from "./use-pagination";
import { getSocket } from "@/utils/socket";

const HolderSchema = z.object({
  address: z.string(),
  mint: z.string(),
  amount: z.number(),
  percentage: z.number(),
  lastUpdated: z.string().datetime(),
});

export type Holder = z.infer<typeof HolderSchema>;

export const useHolders = ({ tokenId }: { tokenId: string }) => {
  const pageSize = 100;
  const pagination = usePagination({
    endpoint: `/api/token/${tokenId}/holders`,
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
