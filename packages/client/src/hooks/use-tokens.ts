import { IToken, TokenSchema } from "@/types";
import { getSocket } from "@/utils/socket";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { z } from "zod";
import { useInfinitePagination } from "./use-pagination";

type Token = z.infer<typeof TokenSchema>;
export const HomepageTokenSchema = TokenSchema.and(
  z.object({
    numComments: z.number().default(0),
  }),
);

const HomepageFeaturedSchema = HomepageTokenSchema.and(
  z.object({
    featuredScore: z.number().nullable().optional(),
  }),
);

type SortOrderType = "asc" | "desc";

export interface UseTokensParams {
  sortBy: keyof IToken | "featured";
  sortOrder: SortOrderType;
  hideImported?: number;
  status?: "all" | "active" | "locked";
  pageSize?: number;
  enabled?: boolean;
}

export const useTokens = (params: UseTokensParams) => {
  const queryClient = useQueryClient();
  const {
    sortBy,
    sortOrder,
    hideImported,
    status,
    pageSize = 50,
    enabled = true,
  } = params;

  const validationSchema =
    sortBy === "featured" ? HomepageFeaturedSchema : HomepageTokenSchema;

  const infiniteQuery = useInfinitePagination<IToken, IToken>({
    endpoint: "/api/tokens",
    limit: pageSize,
    sortBy: sortBy as keyof IToken,
    sortOrder,
    ...(hideImported !== undefined && { hideImported }),
    ...(status && status !== "all" && { status }),
    validationSchema: validationSchema as z.ZodType<IToken>,
    itemsPropertyName: "tokens",
    enabled,
    refetchInterval: 15000,
  });

  /** Prepopulate token cache, that we otherwise need to fetch first on the /token page */
  useEffect(() => {
    if ((infiniteQuery?.items || [])?.length > 0) {
      for (const item of infiniteQuery.items) {
        if (item?.mint) {
          queryClient.setQueryData(["token", item.mint], item);
        }
      }
    }
  }, [infiniteQuery?.items]);

  useEffect(() => {
    if (!enabled) return;

    const socket = getSocket();
    socket.emit("subscribeGlobal");

    const handleUpdate = (token: unknown) => {
      try {
        const updatedToken = validationSchema.parse(token);
        // Only update if token has a ticker
        if (updatedToken.ticker) {
          infiniteQuery.setItems((items) =>
            items.map((item) =>
              item.mint === updatedToken.mint ? updatedToken : item,
            ),
          );
        }
      } catch (error) {
        console.error("Failed to parse token update:", error, token);
      }
    };

    socket.on("newToken", handleUpdate);
    socket.on("updateToken", handleUpdate);

    return () => {
      socket.off("newToken", handleUpdate);
      socket.off("updateToken", handleUpdate);
    };
  }, [enabled, infiniteQuery.setItems]);

  return infiniteQuery;
};
