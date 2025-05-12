import { useWallet as useSolanaWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";
import { ERROR_MESSAGES } from "../consts";

interface UseWalletReturn {
  publicKey: PublicKey | null;
  signTransaction:
    | (<T extends Transaction | VersionedTransaction>(
        transaction: T,
      ) => Promise<T>)
    | null;
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  error: string | null;
}

export const useWallet = (): UseWalletReturn => {
  const {
    publicKey,
    signTransaction,
    connected,
    connecting,
    connect: solanaConnect,
    disconnect: solanaDisconnect,
  } = useSolanaWallet();

  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    try {
      setError(null);
      await solanaConnect();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : ERROR_MESSAGES.UNKNOWN_ERROR,
      );
    }
  }, [solanaConnect]);

  const disconnect = useCallback(async () => {
    try {
      setError(null);
      await solanaDisconnect();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : ERROR_MESSAGES.UNKNOWN_ERROR,
      );
    }
  }, [solanaDisconnect]);

  useEffect(() => {
    if (!connected) {
      setError(null);
    }
  }, [connected]);

  return {
    publicKey,
    signTransaction: signTransaction as UseWalletReturn["signTransaction"],
    isConnected: connected,
    isConnecting: connecting,
    connect,
    disconnect,
    error,
  };
};
