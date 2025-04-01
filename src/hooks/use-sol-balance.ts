import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { env } from "../utils/env";
import { useEffect } from "react";
import { useWebSocket } from "./use-websocket";

const RPC_URL = env.rpcUrl;

const fetchSolBalance = async (walletAddress: string): Promise<number> => {
  if (!walletAddress) return 0;

  try {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getBalance",
        params: [walletAddress],
      }),
    });

    const data: { error: any; result: any } = await response.json();
    if (data.error) {
      throw new Error(data.error.message || "Error fetching SOL balance");
    }

    const rawBalance: number = data.result.value;
    return rawBalance / 1e9; // Convert lamports to SOL
  } catch (error) {
    console.error("Error fetching SOL balance:", error);
    return 0;
  }
};

export function useSolBalance() {
  const { publicKey } = useWallet();
  const walletAddress = publicKey?.toBase58() || "";
  const queryClient = useQueryClient();
  const { addEventListener, connected } = useWebSocket();

  const query = useQuery({
    queryKey: ["solBalance", walletAddress],
    queryFn: () => fetchSolBalance(walletAddress),
    enabled: Boolean(walletAddress),
    // Reduce polling frequency when connected to websocket
    refetchInterval: connected ? 2 * 60 * 1000 : 30 * 1000, // 2 min when connected, 30 sec otherwise
  });

  useEffect(() => {
    if (!walletAddress) return;

    // Set up listener for balance updates from websocket
    const unsubscribe = addEventListener<{ address: string; balance: number }>(
      "balanceUpdate", 
      (data) => {
        if (data && data.address === walletAddress) {
          // Update the cached value directly
          queryClient.setQueryData(["solBalance", walletAddress], data.balance);
          console.log("Received SOL balance update via WebSocket:", data.balance);
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [addEventListener, queryClient, walletAddress]);

  return query;
}
