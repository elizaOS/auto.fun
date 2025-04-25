import { useProgram } from "@/utils/program";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useEffect, useState } from "react";

export const useSolBalance = () => {
  const [solBalance, setSolBalance] = useState(0);
  const [error, setError] = useState<string>("");

  const { connection } = useConnection();
  const { publicKey } = useWallet();

  useEffect(() => {
    if (!publicKey || !connection) return;

    const fetchSolBalance = async () => {
      try {
        if (error) {
          setError("");
        }
        const balance = await connection.getBalance(publicKey);
        setSolBalance(balance / 1e9);
      } catch (error) {
        setError("Error");
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

  return error ? error : solBalance;
};

export const useTokenBalance = ({ tokenId }: { tokenId: string }) => {
  const solBalance = useSolBalance();
  const [tokenBalance, setTokenBalance] = useState(0);

  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const program = useProgram();

  // Get token balance
  useEffect(() => {
    if (!publicKey || !connection || !program || !tokenId) return;

    const fetchTokenBalance = async () => {
      const tokenMint = new PublicKey(tokenId);
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        { mint: tokenMint },
      );

      let balance = 0;
      if (tokenAccounts.value.length > 0) {
        const accountInfo = tokenAccounts.value[0].account.data.parsed.info;
        const amount = Number(accountInfo.tokenAmount.amount || 0); // Ensure amount is a number
        const decimals = accountInfo.tokenAmount.decimals || 0; // Ensure decimals is a number

        if (decimals > 0) {
          balance = amount / Math.pow(10, decimals);
        } else {
          balance = amount; // Handle case where decimals might be 0
        }
      }

      setTokenBalance(balance);
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
