"use client";

import { PropsWithChildren } from "react";
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
} from "@solana/wallet-adapter-react";
import { env } from "@/utils/env";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";

export const WalletProvider = ({
  children,
  autoConnect,
}: PropsWithChildren<{ autoConnect: boolean }>) => {
  return (
    <ConnectionProvider endpoint={env.rpcUrl}>
      <SolanaWalletProvider wallets={[]} autoConnect={autoConnect}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
};
