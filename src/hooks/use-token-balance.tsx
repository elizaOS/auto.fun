import { useQuery } from "@tanstack/react-query";

export interface TokenBalance {
  balance: number;
  decimals: number;
  formattedBalance: number;
}

const HELIUS_RPC_URL = import.meta.env.VITE_RPC_URL;

const fetchTokenBalance = async (
  walletAddress: string,
  contractAddress: "So11111111111111111111111111111111111111111" | string
): Promise<TokenBalance> => {
  // If the contract address is for native SOL
  if (contractAddress === "So11111111111111111111111111111111111111111") {
    const response = await fetch(HELIUS_RPC_URL, {
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
    return {
      balance: rawBalance,
      decimals: 9,
      formattedBalance: rawBalance / 1e9,
    };
  } else {
    // Fetch SPL token balance using getTokenAccountsByOwner with a mint filter
    const response = await fetch(HELIUS_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [
          walletAddress,
          { mint: contractAddress },
          { encoding: "jsonParsed" },
        ],
      }),
    });

    const data: { error: any; result: any } = await response.json();
    if (data.error) {
      throw new Error(data.error.message || "Error fetching token balance");
    }

    let total = 0;
    let tokenDecimals: number | null = null;
    if (data.result.value && data.result.value.length > 0) {
      data.result.value.forEach((tokenAccount: any) => {
        const tokenInfo = tokenAccount.account.data.parsed.info.tokenAmount;
        total += parseInt(tokenInfo.amount, 10);
        tokenDecimals = tokenInfo.decimals;
      });
    }

    return {
      balance: total,
      decimals: tokenDecimals !== null ? tokenDecimals : 0,
      formattedBalance:
        tokenDecimals !== null ? total / Math.pow(10, tokenDecimals) : 0,
    };
  }
};

const useTokenBalance = (
  walletAddress: string,
  contractAddress: "So11111111111111111111111111111111111111111" | string
) => {
  return useQuery<TokenBalance, Error>({
    queryKey: ["tokenBalance", walletAddress, contractAddress],
    queryFn: async () =>
      await fetchTokenBalance(walletAddress, contractAddress),
    enabled: Boolean(walletAddress && contractAddress),
    refetchInterval: 7500,
  });
};

export default useTokenBalance;
