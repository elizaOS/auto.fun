"use client";

import { createContext, PropsWithChildren, useEffect, useState } from "react";
import { WalletProvider } from "./WalletProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserProvider } from "./UserProvider";

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

export function Providers({ children }: PropsWithChildren) {
  const [autoConnect, setAutoConnect] = useState(false);

  useEffect(() => {
    // Read 'walletAutoConnect' from localStorage
    const storedAutoConnect = localStorage.getItem("walletAutoConnect");
    setAutoConnect(storedAutoConnect === "true");
  }, []);

  return (
    <AutoConnectContext.Provider value={{ autoConnect, setAutoConnect }}>
      <WalletProvider autoConnect={autoConnect}>
        <QueryClientProvider client={queryClient}>
          <UserProvider>{children}</UserProvider>
        </QueryClientProvider>
      </WalletProvider>
    </AutoConnectContext.Provider>
  );
}
