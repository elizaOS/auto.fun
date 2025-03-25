import { createContext, PropsWithChildren, useEffect, useState } from "react";
import { WalletProvider } from "./wallet";
import { UserProvider } from "./user";

// Create a context to share autoConnect state and setter
interface AutoConnectContextType {
  autoConnect: boolean;
  setAutoConnect: (value: boolean) => void;
}

export const AutoConnectContext = createContext<AutoConnectContextType>({
  autoConnect: true,
  setAutoConnect: () => {},
});

export function Providers({ children }: PropsWithChildren) {
  const [autoConnect, setAutoConnect] = useState(false);

  useEffect(() => {
    // Read 'walletAutoConnect' from localStorage
    const storedAutoConnect = localStorage.getItem("walletAutoConnect");
    setAutoConnect(storedAutoConnect === "true");
  }, []);

  return (
    <UserProvider>
      <AutoConnectContext.Provider value={{ autoConnect, setAutoConnect }}>
        <WalletProvider autoConnect={autoConnect}>{children}</WalletProvider>
      </AutoConnectContext.Provider>
    </UserProvider>
  );
}
