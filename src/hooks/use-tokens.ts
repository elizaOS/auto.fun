import { useEffect } from "react";
import { usePagination } from "./use-pagination";
import { getSocket } from "@/utils/socket";
import { TokenSchema } from "@/types";
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

export type HomepageSortBy = "all" | "marketCap" | "newest" | "oldest";

export const useHomepageAll = (
  enabled: boolean,
  _hideImported?: boolean,
  pageSize: number = 24,
) => {
  const pagination = usePagination({
    endpoint: "/api/tokens",
    limit: pageSize,
    hideImported: 0,
    validationSchema: HomepageFeaturedSchema,
    itemsPropertyName: "tokens",
    sortBy: "featured",
    sortOrder: "desc",
    enabled,
  });

  useEffect(() => {
    if (!enabled) return;

    const socket = getSocket();

    const onTokenEvent = (token: unknown) => {
      const newToken = HomepageFeaturedSchema.parse(token);
      const existingToken = pagination.items.find(
        (token) => token.mint === newToken.mint,
      );

      if (existingToken) {
        pagination.setItems((items) =>
          items.map((token) =>
            token.mint === newToken.mint ? newToken : token,
          ),
        );
      } else if (
        (newToken?.featuredScore || 0) >=
          (pagination.items[pagination.items.length - 1]?.featuredScore || 0) &&
        (newToken?.featuredScore || 0) <=
          (pagination.items[0]?.featuredScore || 0)
      ) {
        pagination.setItems((items) => [
          newToken,
          ...items.slice(0, pageSize - 1),
        ]);
      }
    };

    socket.on("updateToken", onTokenEvent);
    socket.on("newToken", onTokenEvent);

    return () => {
      socket.off("updateToken");
      socket.off("newToken");
    };
  }, [enabled, pagination]);

  return pagination;
};

export const useHomepageMarketCap = (
  enabled: boolean,
  hideImported?: boolean,
  pageSize: number = 24,
) => {
  const pagination = usePagination({
    endpoint: "/api/tokens",
    limit: pageSize,
    hideImported: hideImported ? 1 : 0,
    validationSchema: HomepageTokenSchema,
    itemsPropertyName: "tokens",
    sortBy: "marketCapUSD",
    sortOrder: "desc",
    enabled,
  });

  useEffect(() => {
    if (!enabled) return;

    const socket = getSocket();

    const onTokenEvent = (token: unknown) => {
      const newToken = HomepageTokenSchema.parse(token);
      const existingTokenIndex = pagination.items.findIndex(
        (token) => token.mint === newToken.mint,
      );
      if (existingTokenIndex !== -1) {
        const itemsCopy = [...pagination.items];
        itemsCopy[existingTokenIndex] = newToken;
        itemsCopy
          .filter((token) => token.marketCapUSD)
          .sort((a, b) => (b.marketCapUSD || 0) - (a.marketCapUSD || 0));
        pagination.setItems(itemsCopy);
      } else if (
        pagination.items.length > 0 &&
        newToken.marketCapUSD != null &&
        pagination.items[pagination.items.length - 1]?.marketCapUSD != null &&
        pagination.items[0]?.marketCapUSD != null &&
        newToken.marketCapUSD >=
          (pagination.items[pagination.items.length - 1]?.marketCapUSD || 0) &&
        newToken.marketCapUSD <= (pagination.items[0]?.marketCapUSD || 0)
      ) {
        const itemsCopy = [...pagination.items];
        itemsCopy.push(newToken);
        itemsCopy.sort((a, b) => (b.marketCapUSD || 0) - (a.marketCapUSD || 0));
        pagination.setItems(itemsCopy.slice(0, pageSize));
      }
    };

    socket.on("updateToken", onTokenEvent);
    socket.on("newToken", onTokenEvent);

    return () => {
      socket.off("updateToken");
      socket.off("newToken");
    };
  }, [enabled, pagination]);

  return pagination;
};

export const useHomepageNewest = (
  enabled: boolean,
  hideImported?: boolean,
  pageSize: number = 24,
) => {
  const pagination = usePagination({
    endpoint: "/api/tokens",
    limit: pageSize,
    hideImported: hideImported ? 1 : 0,
    validationSchema: HomepageTokenSchema,
    itemsPropertyName: "tokens",
    sortBy: "createdAt",
    sortOrder: "desc",
    enabled,
  });

  useEffect(() => {
    if (!enabled) return;

    const socket = getSocket();

    socket.on("newToken", (token) => {
      const newToken = HomepageTokenSchema.parse(token);

      if (pagination.currentPage !== 1) return;

      pagination.setItems((items) => [newToken, ...items].slice(0, pageSize));
    });

    socket.on("updateToken", (token) => {
      const updatedToken = HomepageTokenSchema.parse(token);
      const existingToken = pagination.items.find(
        (item) => item.mint === updatedToken.mint,
      );

      if (existingToken) {
        pagination.setItems((items) =>
          items.map((token) =>
            token.mint === updatedToken.mint ? updatedToken : token,
          ),
        );
      }
    });

    return () => {
      socket.off("newToken");
      socket.off("updateToken");
    };
  }, [enabled, pagination]);

  return pagination;
};

export const useHomepageOldest = (
  enabled: boolean,
  hideImported?: boolean,
  pageSize: number = 24,
) => {
  const pagination = usePagination({
    endpoint: "/api/tokens",
    limit: pageSize,
    hideImported: hideImported ? 1 : 0,
    validationSchema: HomepageTokenSchema,
    itemsPropertyName: "tokens",
    sortBy: "createdAt",
    sortOrder: "asc",
    enabled,
  });

  useEffect(() => {
    if (!enabled) return;

    const socket = getSocket();

    socket.on("newToken", (token: unknown) => {
      const newToken = HomepageTokenSchema.parse(token);

      if (
        pagination.currentPage !== pagination.totalPages ||
        pagination.items.length >= pageSize
      )
        return;

      pagination.setItems((items) => [...items, newToken]);
    });

    socket.on("updateToken", (token) => {
      const updatedToken = HomepageTokenSchema.parse(token);
      const existingToken = pagination.items.find(
        (item) => item.mint === updatedToken.mint,
      );

      if (existingToken) {
        pagination.setItems((items) =>
          items.map((token) =>
            token.mint === updatedToken.mint ? updatedToken : token,
          ),
        );
      }
    });

    return () => {
      socket.off("newToken");
      socket.off("updateToken");
    };
  }, [enabled, pagination]);

  return pagination;
};

export const useTokens = (sortBy: HomepageSortBy, pageSize: number = 24) => {
  const allTokens = useHomepageAll(sortBy === "all", false, pageSize);
  const marketCapTokens = useHomepageMarketCap(
    sortBy === "marketCap",
    true,
    pageSize,
  );
  const newestTokens = useHomepageNewest(sortBy === "newest", true, pageSize);

  useEffect(() => {
    getSocket().emit("subscribeGlobal");
  }, []);

  switch (sortBy) {
    case "all":
      return allTokens;
    case "marketCap":
      return marketCapTokens;
    case "newest":
      return newestTokens;
  }
};
