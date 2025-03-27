import { PropsWithChildren } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";

import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";

import("@solana/wallet-adapter-react-ui/styles.css");

export const Wallet = ({ children }: PropsWithChildren) => {
  return (
    <ConnectionProvider
      endpoint={import.meta.env.VITE_RPC_URL || "https://api.devnet.solana.com"}
    >
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
