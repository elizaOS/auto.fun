import Button from "@/components/button";
import FrontpageHeader from "@/components/frontpage-header";
import GridListSwitcher from "@/components/grid-list-switcher";
import GridView from "@/components/grid-view";
import Loader from "@/components/loader";
import Pagination from "@/components/pagination";
import { TableView } from "@/components/table-view";
import { useFilter } from "@/hooks/use-filter";
import usePagination from "@/hooks/use-pagination";
import { useViewMode } from "@/hooks/use-view-mode";
import { useGlobalWebSocket } from "@/hooks/use-websocket";
import { IPagination, IToken } from "@/types";
import { getTokens } from "@/utils/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Fragment } from "react/jsx-runtime";

// Import GLOBAL_AUTH_STATE to set token received flag
import { GLOBAL_AUTH_STATE } from "@/hooks/use-authentication";

// Define a more complete type for token responses
interface TokenResponse {
  tokens: IToken[];
  page: number;
  totalPages: number;
  total: number;
  hasMore: boolean;
  error?: string;
  _loading?: boolean;
  _wsData?: boolean;
  _isPlaceholder?: boolean;
}

export default function Page() {
  const [activeTab] = useViewMode();
  const { page, onPageChange } = usePagination();
  const [sortBy, setSortBy, sortOrder] = useFilter();
  const queryClient = useQueryClient();

  // Use global websocket for real-time updates
  const {
    addEventListener,
    connected: wsConnected,
    requestTokenList,
  } = useGlobalWebSocket();

  // State to store tokens data directly from WebSocket
  const [wsTokensData, setWsTokensData] = useState<TokenResponse | null>(null);

  // Track if effect has already requested data
  const dataRequested = useRef(false);
  // Track if we've sent an initial request through the WebSocket
  const initialRequestSent = useRef(false);

  // Effect to request tokens via WebSocket when parameters change
  useEffect(() => {
    if (wsConnected) {
      console.log(
        `Requesting tokens via WebSocket for page=${page}, sortBy=${sortBy}, sortOrder=${sortOrder}`,
      );
      requestTokenList(page, 12, sortBy, sortOrder);
      initialRequestSent.current = true;
    }
  }, [page, sortBy, sortOrder, wsConnected, requestTokenList]);

  // Set up WebSocket listeners in a single effect
  useEffect(() => {
    if (!wsConnected) return;

    console.log("Setting up WebSocket token listeners");

    // Listen for token list responses
    const unsubscribeTokensList = addEventListener<TokenResponse>(
      "tokensList",
      (data) => {
        if (data && data.tokens) {
          console.log(
            "Received tokens list via WebSocket:",
            data.tokens.length,
            "tokens",
          );

          // Mark that we've received a response to our initial request
          initialRequestSent.current = true;

          // Set global flag to inform authentication that tokens were received via WebSocket
          if (GLOBAL_AUTH_STATE) {
            console.log("Setting tokensReceivedViaWebSocket flag to true");
            GLOBAL_AUTH_STATE.tokensReceivedViaWebSocket = true;
            GLOBAL_AUTH_STATE.lastWebSocketActivity = Date.now();
          }

          // Store directly in state instead of just in the query cache
          const tokenData = {
            ...data,
            _wsData: true,
            _loading: false,
          };

          // Update both the state and the cache
          setWsTokensData(tokenData);
          queryClient.setQueryData(
            ["tokens", data.page, sortBy, sortOrder],
            tokenData,
          );
        }
      },
    );

    // Listen for new tokens
    const removeNewTokenListener = addEventListener<IToken>(
      "newToken",
      (token) => {
        console.log("Received new token via WebSocket:", token);

        // Only update if we're on the first page and viewing by creation time
        if (page === 1 && sortBy === "createdAt") {
          setWsTokensData((prev) => {
            if (!prev || !prev.tokens) return prev;

            // Add the new token to the beginning of the list
            const updatedTokens = [token, ...prev.tokens];
            // If using pagination, make sure we don't exceed the limit
            if (updatedTokens.length > 12) {
              updatedTokens.pop();
            }

            const updatedData = {
              ...prev,
              tokens: updatedTokens,
            };

            // Also update the query cache
            queryClient.setQueryData(
              ["tokens", page, sortBy, sortOrder],
              updatedData,
            );

            return updatedData;
          });
        }
      },
    );

    // Listen for significant swaps that might affect token rankings
    interface SwapEvent {
      token?: Partial<IToken>;
      tokenMint: string;
      txId: string;
      price: number;
      amountIn: number;
      timestamp: string;
    }

    const removeSwapListener = addEventListener<SwapEvent>(
      "newSwap",
      (swap) => {
        console.log("Received global swap via WebSocket:", swap);

        // If we're on the featured sort, this might affect our ranking
        if (sortBy === "featured" || sortBy === "marketCapUSD") {
          // Request fresh token data to get updated rankings
          console.log(
            "Swap may affect rankings, requesting updated token list",
          );
          requestTokenList(page, 12, sortBy, sortOrder);
        }
      },
    );

    // Initial request via WebSocket if not done already
    if (!dataRequested.current) {
      console.log("Initial token request via WebSocket");
      requestTokenList(page, 12, sortBy, sortOrder);
      dataRequested.current = true;
      initialRequestSent.current = true;
    }

    return () => {
      console.log("Cleaning up WebSocket token listeners");
      unsubscribeTokensList();
      removeNewTokenListener();
      removeSwapListener();
    };
  }, [
    addEventListener,
    queryClient,
    wsConnected,
    page,
    sortBy,
    sortOrder,
    requestTokenList,
  ]);

  // Only use React Query when WebSocket is not connected
  const query = useQuery({
    queryKey: ["tokens", page, sortBy, sortOrder],
    queryFn: async () => {
      console.log("Fallback HTTP request for tokens (WebSocket not connected)");
      return getTokens({
        page,
        limit: 12,
        sortBy,
        sortOrder,
      });
    },
    // Only enable the query when WebSocket is NOT connected and we have no WebSocket data
    enabled: !wsConnected && !wsTokensData,
    staleTime: 300_000, // 5 minutes
    refetchInterval: 60_000, // 1 minute
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // Choose data source: WebSocket data takes precedence over query data
  const tokensData =
    wsConnected && wsTokensData
      ? wsTokensData
      : (query.data as TokenResponse | undefined);

  // Add diagnostics when tokens data changes
  useEffect(() => {
    if (tokensData) {
      console.log(`Token data updated for page ${page}: `, {
        source: wsConnected && wsTokensData ? "WebSocket" : "HTTP Query",
        tokenCount: tokensData.tokens?.length || 0,
        isPlaceholder: tokensData._isPlaceholder,
        isLoading: tokensData._loading,
        isWSData: tokensData._wsData,
      });
    } else {
      console.log(`No token data available for page ${page}`);
    }
  }, [tokensData, page, wsConnected, wsTokensData]);

  const tokens = (tokensData?.tokens as IToken[]) || [];
  const isLoading = !wsConnected && query.isLoading;

  // Memoize tokens for the header to prevent unnecessary rerenders
  const headerTokens = useMemo(() => tokens || [], [tokens]);

  const pagination = {
    page: tokensData?.page || 1,
    totalPages: tokensData?.totalPages || 1,
    total: tokensData?.total || 1,
    hasMore: tokensData?.hasMore || false,
  } as IPagination;

  return (
    <div className="w-full min-h-[50vh]">
      {/* Header Section */}
      <FrontpageHeader tokens={headerTokens} />
      {/* Top Navigation */}
      <div className="flex justify-between gap-2 flex-wrap-reverse md:flex-wrap">
        <GridListSwitcher />
        <div className="flex items-center gap-2">
          <Button
            variant={sortBy === "featured" ? "primary" : "outline"}
            onClick={() => setSortBy("featured")}
          >
            All
          </Button>
          <Button
            variant={sortBy === "marketCapUSD" ? "primary" : "outline"}
            onClick={() => setSortBy("marketCapUSD")}
          >
            Market Cap
          </Button>
          <Button
            variant={sortBy === "createdAt" ? "primary" : "outline"}
            onClick={() => setSortBy("createdAt")}
          >
            Creation Time
          </Button>
        </div>
      </div>
      <div className="flex flex-col flex-1">
        {!isLoading ? (
          <Fragment>
            {activeTab === "grid" ? (
              <div className="my-6">
                <GridView data={tokens} />
              </div>
            ) : (
              <div className="mb-2">
                <TableView data={tokens} />
              </div>
            )}
          </Fragment>
        ) : (
          <Loader />
        )}
        <Pagination pagination={pagination} onPageChange={onPageChange} />
      </div>
    </div>
  );
}
