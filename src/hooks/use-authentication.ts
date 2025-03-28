import { env } from "@/utils/env";
import { useWallet } from "@solana/wallet-adapter-react";
import { useLocalStorage } from "@uidotdev/usehooks";
import { useEffect } from "react";

let checkStatusCalled = false;

export default function useAuthentication() {
  const { connected, disconnect } = useWallet();
  const [authToken, setAuthToken] = useLocalStorage<string | null>(
    "authToken",
    null
  );

  const isAuthenticated = authToken && connected;

  const signOut = () => {
    setAuthToken(null);
  };

  useEffect(() => {
    if (!checkStatusCalled) {
      checkStatusCalled = true;
      const checkStatus = async () => {
        const authCheckResponse = await fetch(
          `${env.apiUrl}/api/auth-status`,
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
    }
  }, []);

  return {
    authToken,
    setAuthToken,
    isAuthenticated,
    signOut,
  };
}
