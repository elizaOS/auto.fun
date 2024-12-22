"use client";

import { PropsWithChildren } from "react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
} from "@solana/wallet-adapter-react";
import { env } from "@/utils/env";

export const WalletProvider = ({
  children,
  autoConnect,
}: PropsWithChildren<{ autoConnect: boolean }>) => {
  const wallets = [new PhantomWalletAdapter()];

  return (
    <ConnectionProvider endpoint={env.rpcUrl}>
      <SolanaWalletProvider wallets={wallets} autoConnect={autoConnect}>
        {children}
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
};
