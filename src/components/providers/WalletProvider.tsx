"use client";

import { PropsWithChildren } from "react";
import {
  PhantomWalletAdapter,
  SkyWalletAdapter,
  SolflareWalletAdapter,
  UnsafeBurnerWalletAdapter,
} from "@solana/wallet-adapter-wallets";
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
  const wallets =
    process.env.NODE_ENV === "development"
      ? // only safe in development
        [new UnsafeBurnerWalletAdapter()]
      : // TODO: add more wallets
        [
          new PhantomWalletAdapter(),
          new SolflareWalletAdapter(),
          new SkyWalletAdapter(),
        ];

  return (
    <ConnectionProvider endpoint={env.rpcUrl}>
      <SolanaWalletProvider wallets={wallets} autoConnect={autoConnect}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
};
