import { useWallet } from "@solana/wallet-adapter-react";
import { useLocalStorage } from "@uidotdev/usehooks";

export default function useAuthentication() {
  const { connected, disconnect } = useWallet();
  const [authToken, setAuthToken] = useLocalStorage<string | null>(
    "authToken",
    null
  );
  const isAuthenticated = authToken && connected ? true : false;

  const signOut = () => {
    setAuthToken(null);
    disconnect();
  };

  return {
    authToken,
    setAuthToken,
    isAuthenticated,
    signOut,
  };
}
