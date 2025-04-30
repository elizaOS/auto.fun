import { env } from "@/utils/env";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { PropsWithChildren, useEffect, useMemo, useState } from "react";

export const Wallet = ({ children }: PropsWithChildren) => {
  // Always use the latest endpoint from environment
  const endpoint = env.rpcUrl || "https://api.devnet.solana.com";
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  // Handle visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(document.visibilityState === "visible");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Initialize wallet adapters
  const wallets = useMemo(() => {
    return [new PhantomWalletAdapter()];
  }, []);

  // Check for stored wallet name and attempt direct connection if needed
  useEffect(() => {
    if (typeof window !== "undefined" && !autoConnectAttempted && isVisible) {
      setAutoConnectAttempted(true);
      const tryDirectConnection = async () => {
        try {
          // Check if Phantom wallet is detected
          if (window.solana && window.solana.isPhantom) {
            // Check for our enhanced wallet auth storage
            let walletAddress = null;
            let hasValidAuth = false;
            try {
              const walletAuthStr = localStorage.getItem("walletAuth");
              if (walletAuthStr) {
                const walletAuth = JSON.parse(walletAuthStr);
                if (walletAuth.walletAddress) {
                  walletAddress = walletAuth.walletAddress;
                  hasValidAuth = true;
                }
              }
            } catch (e) {
              console.error("Error reading wallet auth:", e);
            }

            // Safely check for public key
            const hasDirectConnection =
              window.solana.publicKey !== null &&
              window.solana.publicKey !== undefined;

            // Only attempt auto-connect if we have valid auth
            if (hasValidAuth) {
              if (!hasDirectConnection) {
                try {
                  const response = await window.solana.connect();
                  // If the wallet address matches our stored one, update localStorage immediately
                  if (
                    walletAddress &&
                    response.publicKey.toString() === walletAddress
                  ) {
                    console.log(
                      "Auto-connected wallet matches saved wallet address",
                    );
                  } else {
                    console.log(
                      "Auto-connected wallet address does not match saved address",
                    );
                  }
                } catch (err) {
                  console.error("Auto-connect failed:", err);
                }
              }
            }
          }
        } catch (err) {
          console.error("Error in auto-connect attempt:", err);
        }
      };

      // Try direct connection first
      tryDirectConnection();
    }
  }, [autoConnectAttempted, isVisible]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider
        wallets={wallets}
        autoConnect={true}
        localStorageKey="walletName"
        onError={(error) => {
          console.error("Wallet adapter error:", error);
        }}
      >
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
