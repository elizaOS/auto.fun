import { PropsWithChildren, useEffect, useMemo, useState } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { env } from "@/utils/env";
import "@solana/wallet-adapter-react-ui/styles.css";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";

export const Wallet = ({ children }: PropsWithChildren) => {
  // Always use the latest endpoint from environment
  const endpoint = env.rpcUrl || "https://api.devnet.solana.com";
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(false);

  // Initialize wallet adapters
  const wallets = useMemo(() => {
    return [new PhantomWalletAdapter()];
  }, []);

  // Check for stored wallet name and attempt direct connection if needed
  useEffect(() => {
    if (typeof window !== "undefined" && !autoConnectAttempted) {
      setAutoConnectAttempted(true);

      const tryDirectConnection = async () => {
        try {
          // Check if Phantom wallet is detected
          if (window.solana && window.solana.isPhantom) {
            console.log("Detected Phantom wallet in window object");

            // Check for our enhanced wallet auth storage
            let walletAddress = null;
            try {
              const walletAuthStr = localStorage.getItem("walletAuth");
              if (walletAuthStr) {
                const walletAuth = JSON.parse(walletAuthStr);
                if (walletAuth.walletAddress) {
                  walletAddress = walletAuth.walletAddress;
                  console.log("Found stored wallet address:", walletAddress);
                }
              }
            } catch (e) {
              console.error("Error reading wallet auth:", e);
            }

            // Safely check for public key
            const hasDirectConnection =
              window.solana.publicKey !== null &&
              window.solana.publicKey !== undefined;

            // Always attempt to connect Phantom if it's available
            if (!hasDirectConnection) {
              console.log("Attempting to connect Phantom on page load");
              try {
                const response = await window.solana.connect();
                console.log(
                  "Direct Phantom connection successful on load:",
                  response.publicKey.toString(),
                );

                // If the wallet address matches our stored one, update localStorage immediately
                if (
                  walletAddress &&
                  response.publicKey.toString() === walletAddress
                ) {
                  console.log("Connected wallet matches saved wallet address");
                }
              } catch (err) {
                console.error("Failed to auto-connect Phantom:", err);
              }
            } else if (hasDirectConnection && window.solana.publicKey) {
              console.log(
                "Phantom is already connected:",
                window.solana.publicKey.toString(),
              );

              // If the wallet address matches our stored one, update localStorage immediately
              if (
                walletAddress &&
                window.solana.publicKey.toString() === walletAddress
              ) {
                console.log("Connected wallet matches saved wallet address");
              }
            }
          }
        } catch (err) {
          console.error("Error in direct connection attempt:", err);
        }
      };

      // Try direct connection first
      tryDirectConnection();
    }
  }, [autoConnectAttempted]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider
        wallets={wallets}
        autoConnect={false}
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
