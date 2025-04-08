import { useProgram } from "@/utils/program";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useEffect, useState } from "react";

export const useSolBalance = () => {
  const [solBalance, setSolBalance] = useState(0);

  const { connection } = useConnection();
  const { publicKey } = useWallet();

  useEffect(() => {
    if (!publicKey || !connection) return;

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
  }, [publicKey, connection]);

  return solBalance;
};

export const useTokenBalance = ({ tokenId }: { tokenId: string }) => {
  const solBalance = useSolBalance();
  const [tokenBalance, setTokenBalance] = useState(0);

  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const program = useProgram();

  // Get token balance
  useEffect(() => {
    if (!publicKey || !connection || !program) return;

    const fetchTokenBalance = async () => {
      try {
        const tokenMint = new PublicKey(tokenId);
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          publicKey,
          { mint: tokenMint },
        );

        const balance =
          tokenAccounts.value.length > 0
            ? tokenAccounts.value[0].account.data.parsed.info.tokenAmount
                .uiAmount
            : 0;

        setTokenBalance(balance);
      } catch (error) {
        console.error("Error fetching token balance:", error);
      }
    };

    fetchTokenBalance();
    // Listen for token account changes
    const tokenAccountListener = connection.onProgramAccountChange(
      program.programId,
      fetchTokenBalance,
    );

    return () => {
      connection.removeProgramAccountChangeListener(tokenAccountListener);
    };
  }, [publicKey, connection, tokenId, program]);

  return {
    solBalance,
    tokenBalance,
  };
};
