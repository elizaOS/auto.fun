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
      console.log("Auto-connect check triggered. Checking conditions...");

      const tryDirectConnection = async () => {
        try {
          // Check if Phantom wallet is detected
          if (window.solana && window.solana.isPhantom) {
            console.log("Phantom wallet detected in window object");

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
                  console.log(
                    "Found valid wallet auth with address:",
                    walletAddress,
                  );
                } else {
                  console.log("Wallet auth found but no address present");
                }
              } else {
                console.log("No wallet auth found in localStorage");
              }
            } catch (e) {
              console.error("Error reading wallet auth:", e);
            }

            // Safely check for public key
            const hasDirectConnection =
              window.solana.publicKey !== null &&
              window.solana.publicKey !== undefined;

            console.log("Connection state:", {
              hasDirectConnection,
              hasValidAuth,
              walletAddress,
              publicKey: window.solana.publicKey?.toString(),
            });

            // Only attempt auto-connect if we have valid auth
            if (hasValidAuth) {
              if (!hasDirectConnection) {
                console.log(
                  "Attempting auto-connect - no direct connection but valid auth exists",
                );
                try {
                  const response = await window.solana.connect();
                  console.log(
                    "Auto-connect successful:",
                    response.publicKey.toString(),
                  );

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
              } else if (hasDirectConnection && window.solana.publicKey) {
                console.log(
                  "Phantom already connected:",
                  window.solana.publicKey.toString(),
                );

                // If the wallet address matches our stored one, update localStorage immediately
                if (
                  walletAddress &&
                  window.solana.publicKey.toString() === walletAddress
                ) {
                  console.log("Connected wallet matches saved wallet address");
                } else {
                  console.log(
                    "Connected wallet address does not match saved address",
                  );
                }
              }
            } else {
              console.log("Skipping auto-connect - no valid auth found");
            }
          } else {
            console.log("No Phantom wallet detected in window object");
          }
        } catch (err) {
          console.error("Error in auto-connect attempt:", err);
        }
      };

      // Try direct connection first
      tryDirectConnection();
    } else {
      console.log("Auto-connect check skipped:", {
        isWindowDefined: typeof window !== "undefined",
        autoConnectAttempted,
      });
    }
  }, [autoConnectAttempted]);

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
