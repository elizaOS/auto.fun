"use client";

import { createContext, PropsWithChildren, useEffect, useState } from "react";
import { SessionProvider } from "next-auth/react";
import { WalletProvider } from "./WalletProvider";
import { Session } from "next-auth";
import { ModalProvider } from "./ModalProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Create a context to share autoConnect state and setter
interface AutoConnectContextType {
  autoConnect: boolean;
  setAutoConnect: (value: boolean) => void;
}

export const AutoConnectContext = createContext<AutoConnectContextType>({
  autoConnect: true,
  setAutoConnect: () => {},
});

const queryClient = new QueryClient();

export function Providers({
  children,
  session,
}: PropsWithChildren<{ session: Session | null }>) {
  const [autoConnect, setAutoConnect] = useState(false);

  useEffect(() => {
    // Read 'walletAutoConnect' from localStorage
    const storedAutoConnect = localStorage.getItem("walletAutoConnect");
    setAutoConnect(storedAutoConnect === "true");
  }, []);

  return (
    <SessionProvider session={session}>
      <AutoConnectContext.Provider value={{ autoConnect, setAutoConnect }}>
        <WalletProvider autoConnect={autoConnect}>
          <QueryClientProvider client={queryClient}>
            <ModalProvider>{children}</ModalProvider>
          </QueryClientProvider>
        </WalletProvider>
      </AutoConnectContext.Provider>
    </SessionProvider>
  );
}
