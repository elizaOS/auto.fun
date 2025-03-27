import { useWallet } from "@solana/wallet-adapter-react";
import { useLocalStorage } from "@uidotdev/usehooks";
import { useEffect } from "react";

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

  useEffect(() => {
    const checkStatus = async () => {
      const authCheckResponse = await fetch(
        `${import.meta.env.VITE_API_URL}/api/auth-status`,
        { credentials: "include" }
      );

      if (authCheckResponse.ok) {
        const statusData = (await authCheckResponse.json()) as {
          authenticated: boolean;
        };
        if (!statusData?.authenticated) {
          signOut();
        }
      }
    };

    checkStatus();
  }, []);

  return {
    authToken,
    setAuthToken,
    isAuthenticated,
    signOut,
  };
}
