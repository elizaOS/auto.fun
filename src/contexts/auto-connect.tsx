import { createContext } from "react";

// Create a context to share autoConnect state and setter
interface AutoConnectContextType {
  autoConnect: boolean;
  setAutoConnect: (value: boolean) => void;
}

export const AutoConnectContext = createContext<AutoConnectContextType>({
  autoConnect: true,
  setAutoConnect: () => {},
});
