import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { GLOBAL_AUTH_STATE } from "./use-authentication";
import { useTokenWebSocket, useWebSocket } from "./use-websocket";

export const useSolBalance = () => {
  const [solBalance, setSolBalance] = useState(0);
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const {
    connected: wsConnected,
    sendMessage,
    addEventListener,
  } = useWebSocket();

  // Set up event listener for balance updates
  useEffect(() => {
    if (!publicKey || !addEventListener) return;

    const walletAddress = publicKey.toString();

    const unsubscribe = addEventListener("balanceUpdate", (data: any) => {
      if (
        data &&
        data.address === walletAddress &&
        typeof data.balance === "number"
      ) {
        console.log(
          `Received SOL balance update via WebSocket: ${data.balance}`,
        );
        setSolBalance(data.balance);

        // Track WebSocket activity
        if (GLOBAL_AUTH_STATE) {
          GLOBAL_AUTH_STATE.lastWebSocketActivity = Date.now();
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [publicKey, addEventListener]);

  // Request balance via WebSocket when connected
  useEffect(() => {
    if (!publicKey || !wsConnected || !sendMessage) return;

    console.log("Requesting SOL balance via WebSocket");
    const walletAddress = publicKey.toString();

    // Send initial request
    sendMessage({
      event: "balanceUpdate",
      data: { address: walletAddress },
    });

    // Set up periodic refresh
    const intervalId = setInterval(() => {
      sendMessage({
        event: "balanceUpdate",
        data: { address: walletAddress },
      });
    }, 30000); // Every 30 seconds

    return () => {
      clearInterval(intervalId);
    };
  }, [publicKey, wsConnected, sendMessage]);

  // Fallback to RPC request when WebSocket is not connected
  useEffect(() => {
    if (!publicKey || !connection || wsConnected) return;

    const fetchSolBalance = async () => {
      try {
        const balance = await connection.getBalance(publicKey);
        setSolBalance(balance / 1e9);
      } catch (error) {
        console.error("Error fetching SOL balance:", error);
      }
    };

    fetchSolBalance();
    const id = connection.onAccountChange(publicKey, () => {
      fetchSolBalance();
    });

    return () => {
      connection.removeAccountChangeListener(id);
    };
  }, [publicKey, connection, wsConnected]);

  return solBalance;
};

export const useTokenBalance = ({ tokenId }: { tokenId: string }) => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const queryClient = useQueryClient();
  const { addEventListener } = useTokenWebSocket(tokenId);

  // Get SOL balance using the query hook
  const solBalanceQuery = useQuery({
    queryKey: ["solBalance", publicKey?.toBase58()],
    queryFn: async () => {
      if (!publicKey || !connection) return 0;
      const balance = await connection.getBalance(publicKey);
      return balance / 1e9;
    },
    enabled: !!publicKey && !!connection,
  });

  // Get token balance
  const tokenBalanceQuery = useQuery({
    queryKey: ["tokenBalance", publicKey?.toBase58(), tokenId],
    queryFn: async () => {
      if (!publicKey || !connection || !tokenId) return 0;

      const tokenMint = new PublicKey(tokenId);
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        { mint: tokenMint },
      );

      return tokenAccounts.value.length > 0
        ? tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount
        : 0;
    },
    enabled: !!publicKey && !!connection && !!tokenId,
  });

  // Set up WebSocket listeners for real-time updates
  useEffect(() => {
    if (!tokenId || !publicKey) return;

    // Listen for token balance updates via WebSocket
    const unsubTokenBalance = addEventListener<{
      mint: string;
      owner: string;
      balance: number;
    }>("balanceUpdate", (data) => {
      if (
        data &&
        data.mint === tokenId &&
        data.owner === publicKey.toBase58()
      ) {
        queryClient.setQueryData(
          ["tokenBalance", publicKey.toBase58(), tokenId],
          data.balance,
        );
        console.log(
          "Received token balance update via WebSocket:",
          data.balance,
        );
      }
    });

    return () => {
      unsubTokenBalance();
    };
  }, [addEventListener, publicKey, queryClient, tokenId]);

  return {
    solBalance: solBalanceQuery.data || 0,
    tokenBalance: tokenBalanceQuery.data || 0,
    isLoading: solBalanceQuery.isLoading || tokenBalanceQuery.isLoading,
    refetch: () => {
      solBalanceQuery.refetch();
      tokenBalanceQuery.refetch();
    },
  };
};
