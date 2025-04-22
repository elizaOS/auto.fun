import { useEffect } from "react";
import { useInfinitePagination } from "./use-pagination";
import { getSocket } from "@/utils/socket";
import { IToken, TokenSchema } from "@/types";
import { z } from "zod";

export type Token = z.infer<typeof TokenSchema>;
export const HomepageTokenSchema = TokenSchema.and(
  z.object({
    numComments: z.number().default(0),
  }),
);
export const HomepageFeaturedSchema = HomepageTokenSchema.and(
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
  });

  useEffect(() => {
    if (!enabled) return;

    const socket = getSocket();
    socket.emit("subscribeGlobal");

    const handleUpdate = (token: unknown) => {
      try {
        const updatedToken = validationSchema.parse(token);
        infiniteQuery.setItems((items) =>
          items.map((item) =>
            item.mint === updatedToken.mint ? updatedToken : item,
          ),
        );
      } catch (error) {
        console.error("Failed to parse token update:", error);
      }
    };

    socket.on("newToken", handleUpdate);
    socket.on("updateToken", handleUpdate);

    return () => {
      socket.off("newToken", handleUpdate);
      socket.off("updateToken", handleUpdate);
    };
  }, [enabled, validationSchema, infiniteQuery.setItems]);

  return infiniteQuery;
};
