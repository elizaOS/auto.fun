import { useProgram } from "@/utils/program";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export const useSolBalance = ({
  enabled = true,
}: { enabled?: boolean } = {}) => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["solBalance", publicKey?.toString()],
    queryFn: async () => {
      if (!publicKey || !connection) {
        return 0;
      }

      try {
        const balance = await connection.getBalance(publicKey);
        return balance / 1e9;
      } catch (error) {
        console.error("Error fetching SOL balance:", error);
        throw new Error("Error fetching SOL balance");
      }
    },
    enabled: !!publicKey && !!connection && enabled,
    refetchInterval: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Set up account change listener in useEffect
  useEffect(() => {
    if (!publicKey || !connection || !enabled) return;

    const id = connection.onAccountChange(publicKey, () => {
      // Invalidate the query to trigger a refetch
      queryClient.invalidateQueries({
        queryKey: ["solBalance", publicKey?.toString()],
      });
    });

    // Return cleanup function
    return () => {
      connection.removeAccountChangeListener(id);
    };
  }, [publicKey, connection, enabled, queryClient]);

  return query.data ?? 0;
};

export const useTokenBalance = ({ tokenId }: { tokenId: string }) => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const program = useProgram();
  const queryClient = useQueryClient();

  const solBalance = useSolBalance();

  const tokenBalanceQuery = useQuery({
    queryKey: ["tokenBalance", publicKey?.toString(), tokenId],
    queryFn: async () => {
      if (!publicKey || !connection || !program || !tokenId) {
        return 0;
      }

      try {
        const tokenMint = new PublicKey(tokenId);
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          publicKey,
          { mint: tokenMint },
        );

        let balance = 0;
        if (tokenAccounts.value.length > 0) {
          const accountInfo = tokenAccounts.value[0].account.data.parsed.info;
          const amount = Number(accountInfo.tokenAmount.amount || 0);
          const decimals = accountInfo.tokenAmount.decimals || 0;

          if (decimals > 0) {
            balance = amount / Math.pow(10, decimals);
          } else {
            balance = amount;
          }
        }

        return balance;
      } catch (error) {
        console.error("Error fetching token balance:", error);
        throw new Error("Error fetching token balance");
      }
    },
    enabled: !!publicKey && !!connection && !!program && !!tokenId,
    refetchInterval: false,
    staleTime: 5 * 60 * 1000,
  });
  useEffect(() => {
    if (!publicKey || !connection || !program || !tokenId) return;

    const tokenAccountListener = connection.onProgramAccountChange(
      program.programId,
      () => {
        queryClient.invalidateQueries({
          queryKey: ["tokenBalance", publicKey?.toString(), tokenId],
        });
      },
    );

    return () => {
      connection.removeProgramAccountChangeListener(tokenAccountListener);
    };
  }, [publicKey, connection, program, tokenId, queryClient]);

  return {
    solBalance,
    tokenBalance: tokenBalanceQuery.data ?? 0,
    isLoading: tokenBalanceQuery.isLoading,
    error: tokenBalanceQuery.error,
  };
};
