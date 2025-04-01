import { useWebSocket } from "@/hooks/use-websocket";
import { IToken } from "@/types";
import { useCallback, useEffect, useState } from "react";
import { TokenMarketMetrics } from "./blockchain";

/**
 * WebSocket-powered hook for fetching token market metrics
 * This completely eliminates direct HTTP requests by using the WebSocket
 */
export function useTokenMarketMetricsWS(tokenMint: string | null | undefined) {
  const [metrics, setMetrics] = useState<TokenMarketMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    connected: wsConnected,
    sendMessage,
    addEventListener,
  } = useWebSocket();

  // Function to request metrics via WebSocket
  const fetchMetrics = useCallback(() => {
    if (!tokenMint || !wsConnected || !sendMessage) {
      return false;
    }

    setLoading(true);
    const sent = sendMessage({
      event: "tokenMetrics",
      data: { mint: tokenMint },
    });

    return sent;
  }, [tokenMint, wsConnected, sendMessage]);

  // Set up listener for metric updates
  useEffect(() => {
    if (!tokenMint || !addEventListener) return;

    const unsubscribe = addEventListener<{
      mint: string;
      data: TokenMarketMetrics | null;
      error?: string;
    }>("tokenMetrics", (response) => {
      setLoading(false);

      if (response.mint !== tokenMint) return;

      if (response.error) {
        setError(response.error);
        return;
      }

      if (response.data) {
        setMetrics(response.data);
        setError(null);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [tokenMint, addEventListener]);

  // Request metrics when dependencies change
  useEffect(() => {
    if (tokenMint && wsConnected) {
      fetchMetrics();
    }
  }, [tokenMint, wsConnected, fetchMetrics]);

  return {
    metrics,
    error,
    loading,
    refresh: fetchMetrics,
  };
}

/**
 * WebSocket-powered hook for fetching token data
 */
export function useTokenDataWS(tokenMint: string | null | undefined) {
  const [token, setToken] = useState<IToken | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    connected: wsConnected,
    sendMessage,
    addEventListener,
  } = useWebSocket();

  // Function to request token data via WebSocket
  const fetchToken = useCallback(
    (bypassCache: boolean = false) => {
      if (!tokenMint || !wsConnected || !sendMessage) {
        return false;
      }

      setLoading(true);
      const sent = sendMessage({
        event: "tokenData",
        data: {
          mint: tokenMint,
          bypassCache,
        },
      });

      return sent;
    },
    [tokenMint, wsConnected, sendMessage],
  );

  // Set up listener for token data updates
  useEffect(() => {
    if (!tokenMint || !addEventListener) return;

    const unsubscribe = addEventListener<{
      mint: string;
      data: IToken | null;
      error?: string;
    }>("tokenData", (response) => {
      setLoading(false);

      if (response.mint !== tokenMint) return;

      if (response.error) {
        setError(response.error);
        return;
      }

      if (response.data) {
        setToken(response.data);
        setError(null);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [tokenMint, addEventListener]);

  // Request token data when dependencies change
  useEffect(() => {
    if (tokenMint && wsConnected) {
      fetchToken();
    }
  }, [tokenMint, wsConnected, fetchToken]);

  return {
    token,
    error,
    loading,
    refresh: fetchToken,
  };
}

/**
 * WebSocket-powered hook for fetching wallet SOL balance
 */
export function useWalletBalanceWS(walletAddress: string | null | undefined) {
  const [balance, setBalance] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);

  const {
    connected: wsConnected,
    sendMessage,
    addEventListener,
  } = useWebSocket();

  // Function to request balance via WebSocket
  const fetchBalance = useCallback(() => {
    if (!walletAddress || !wsConnected || !sendMessage) {
      return false;
    }

    setLoading(true);
    const sent = sendMessage({
      event: "balanceUpdate",
      data: { address: walletAddress },
    });

    return sent;
  }, [walletAddress, wsConnected, sendMessage]);

  // Set up listener for balance updates
  useEffect(() => {
    if (!walletAddress || !addEventListener) return;

    const unsubscribe = addEventListener<{
      address: string;
      balance: number;
      error?: string;
      timestamp?: number;
    }>("balanceUpdate", (response) => {
      setLoading(false);

      if (response.address !== walletAddress) return;

      if (response.error) {
        setError(response.error);
        return;
      }

      setBalance(response.balance);
      setError(null);

      if (response.timestamp) {
        setLastUpdate(response.timestamp);
      } else {
        setLastUpdate(Date.now());
      }
    });

    return () => {
      unsubscribe();
    };
  }, [walletAddress, addEventListener]);

  // Request balance when dependencies change
  useEffect(() => {
    if (walletAddress && wsConnected) {
      fetchBalance();
    }
  }, [walletAddress, wsConnected, fetchBalance]);

  // Set up auto-refresh interval (reduced frequency compared to direct HTTP)
  useEffect(() => {
    if (!walletAddress || !wsConnected) return;

    const intervalId = setInterval(() => {
      fetchBalance();
    }, 30000); // 30 seconds

    return () => {
      clearInterval(intervalId);
    };
  }, [walletAddress, wsConnected, fetchBalance]);

  return {
    balance,
    error,
    loading,
    lastUpdate,
    refresh: fetchBalance,
  };
}

/**
 * WebSocket-powered hook for fetching token balance
 */
export function useTokenBalanceWS(
  walletAddress: string | null | undefined,
  tokenMint: string | null | undefined,
) {
  const [balance, setBalance] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);

  const {
    connected: wsConnected,
    sendMessage,
    addEventListener,
  } = useWebSocket();

  // Function to request token balance via WebSocket
  const fetchBalance = useCallback(() => {
    if (!walletAddress || !tokenMint || !wsConnected || !sendMessage) {
      return false;
    }

    setLoading(true);
    const sent = sendMessage({
      event: "tokenBalanceUpdate",
      data: {
        address: walletAddress,
        mint: tokenMint,
      },
    });

    return sent;
  }, [walletAddress, tokenMint, wsConnected, sendMessage]);

  // Set up listener for token balance updates
  useEffect(() => {
    if (!walletAddress || !tokenMint || !addEventListener) return;

    const unsubscribe = addEventListener<{
      address: string;
      mint: string;
      balance: number;
      error?: string;
      timestamp?: number;
    }>("tokenBalanceUpdate", (response) => {
      setLoading(false);

      if (response.address !== walletAddress || response.mint !== tokenMint)
        return;

      if (response.error) {
        setError(response.error);
        return;
      }

      setBalance(response.balance);
      setError(null);

      if (response.timestamp) {
        setLastUpdate(response.timestamp);
      } else {
        setLastUpdate(Date.now());
      }
    });

    return () => {
      unsubscribe();
    };
  }, [walletAddress, tokenMint, addEventListener]);

  // Request balance when dependencies change
  useEffect(() => {
    if (walletAddress && tokenMint && wsConnected) {
      fetchBalance();
    }
  }, [walletAddress, tokenMint, wsConnected, fetchBalance]);

  // Set up auto-refresh interval (reduced frequency compared to direct HTTP)
  useEffect(() => {
    if (!walletAddress || !tokenMint || !wsConnected) return;

    const intervalId = setInterval(() => {
      fetchBalance();
    }, 30000); // 30 seconds

    return () => {
      clearInterval(intervalId);
    };
  }, [walletAddress, tokenMint, wsConnected, fetchBalance]);

  return {
    balance,
    error,
    loading,
    lastUpdate,
    refresh: fetchBalance,
  };
}

/**
 * Combined hook for both SOL and token balances
 */
export function useWalletTokenBalanceWS(
  walletAddress: string | null | undefined,
  tokenMint: string | null | undefined,
) {
  const solBalance = useWalletBalanceWS(walletAddress);
  const tokenBalance = useTokenBalanceWS(walletAddress, tokenMint);

  const refreshAll = useCallback(() => {
    solBalance.refresh();
    tokenBalance.refresh();
  }, [solBalance, tokenBalance]);

  return {
    solBalance: solBalance.balance,
    tokenBalance: tokenBalance.balance,
    isLoading: solBalance.loading || tokenBalance.loading,
    error: solBalance.error || tokenBalance.error,
    lastUpdate:
      Math.max(solBalance.lastUpdate || 0, tokenBalance.lastUpdate || 0) ||
      null,
    refresh: refreshAll,
  };
}
