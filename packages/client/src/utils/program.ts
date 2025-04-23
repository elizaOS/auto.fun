import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMemo } from "react";
import { Autofun } from "@autodotfun/program/types/autofun.ts";
import IDL from "@autodotfun/program/idl/autofun.json";

export const SEED_CONFIG = "config";
export const SEED_BONDING_CURVE = "bonding_curve";

export const useProgram = () => {
  const wallet = useWallet();
  const { connection } = useConnection();

  const program = useMemo(() => {
    if (
      !wallet.publicKey ||
      !wallet.signTransaction ||
      !wallet.signAllTransactions
    ) {
      return null;
    }

    const provider = new AnchorProvider(
      connection,
      {
        publicKey: wallet.publicKey,
        signTransaction: wallet.signTransaction,
        signAllTransactions: wallet.signAllTransactions,
      },
      AnchorProvider.defaultOptions(),
    );

    const program = new Program<Autofun>(IDL, provider);

    return program;
  }, [
    connection,
    wallet.publicKey,
    wallet.signAllTransactions,
    wallet.signTransaction,
  ]);

  return program;
};
