import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { env } from "@/utils/env";

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

  return useQuery({
    queryKey: ["solBalance", walletAddress],
    queryFn: () => fetchSolBalance(walletAddress),
    enabled: Boolean(walletAddress),
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}
