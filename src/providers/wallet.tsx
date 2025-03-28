import { PropsWithChildren, useEffect } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";

import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { env } from "@/utils/env";

export const Wallet = ({ children }: PropsWithChildren) => {
  useEffect(() => {
    console.log(env.rpcUrl)
  }, [])

  return (
    <ConnectionProvider
      endpoint={env.rpcUrl || "https://api.devnet.solana.com"}
    >
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
