import { PropsWithChildren, useMemo } from "react";
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

  // Initialize wallet adapters
  const wallets = useMemo(() => {
    return [new PhantomWalletAdapter()];
  }, []);

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
