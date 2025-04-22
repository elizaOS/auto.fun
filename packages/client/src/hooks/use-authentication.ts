import { env } from "@/utils/env";
import { getAuthToken, isTokenExpired, parseJwt } from "@/utils/auth";
import { useWallet } from "@solana/wallet-adapter-react";
import { useLocalStorage } from "@uidotdev/usehooks";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

// Helper function to send auth token in headers
export const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
  const authToken = getAuthToken();

  const headers = new Headers(options.headers || {});
  if (authToken && !isTokenExpired(authToken)) {
    const tokenWithBearer = authToken.startsWith("Bearer ")
      ? authToken
      : `Bearer ${authToken}`;
    headers.set("Authorization", tokenWithBearer);
  }

  const newOptions = {
    ...options,
    headers,
    credentials: "include" as RequestCredentials,
  };

  return fetch(url, newOptions);
};

interface AuthStatus {
  authenticated: boolean;
  privileges?: string[];
  user?: {
    address: string;
    points: number;
    solBalance?: number;
  };
}

export default function useAuthentication() {
  const {
    publicKey,
    connected,
    disconnect: adapterDisconnect,
    wallet,
  } = useWallet();
  const [authToken, setAuthToken] = useLocalStorage<string | null>(
    "authToken",
    null,
  );
  // const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [userPrivileges, setUserPrivileges] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const getWalletAddress = (): string | null => {
    if (authToken && !isTokenExpired(authToken)) {
      const payload = parseJwt(authToken);
      if (payload?.sub) {
        return payload.sub;
      }
    }
    if (connected && publicKey) {
      return publicKey.toString();
    }
    return null;
  };

  const currentWalletAddress = getWalletAddress();

  const authQuery = useQuery<AuthStatus>({
    queryKey: ["auth-status", authToken],
    queryFn: async () => {
      if (!authToken || isTokenExpired(authToken)) {
        return { authenticated: false };
      }
      try {
        const response = await fetchWithAuth(`${env.apiUrl}/api/auth-status`, {
          method: "GET",
        });

        if (response.ok) {
          const data = (await response.json()) as AuthStatus;
          if (data.authenticated) {
            setUserPrivileges(data.privileges || []);
            const tokenWallet = data.user?.address || parseJwt(authToken)?.sub;
            if (publicKey && tokenWallet !== publicKey.toString()) {
              console.warn(
                "Auth token wallet does not match connected wallet. Consider logging out.",
              );
            }
            return data;
          } else {
            setAuthToken(null);
            setUserPrivileges([]);
            return { authenticated: false };
          }
        } else if (response.status === 401 || response.status === 403) {
          setAuthToken(null);
          setUserPrivileges([]);
          return { authenticated: false };
        }
        return { authenticated: false };
      } catch (error) {
        console.error("Error checking auth status:", error);
        return { authenticated: false };
      }
    },
    enabled: !!authToken && !isTokenExpired(authToken),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const handleSuccessfulAuth = (token: string) => {
    const payload = parseJwt(token);
    const tokenWallet = payload?.sub;

    if (!tokenWallet) {
      console.error("Received token without wallet address (sub claim).");
      setAuthToken(null);
      return;
    }

    if (publicKey && tokenWallet !== publicKey.toString()) {
      console.error(
        "Token wallet address does not match connected wallet address. Aborting auth.",
      );
      return;
    }

    setAuthToken(token);
    setUserPrivileges(payload?.privileges || []);
    queryClient.invalidateQueries({ queryKey: ["auth-status"] });
  };

  // Effect to handle wallet connection/disconnection
  useEffect(() => {
    if (connected && publicKey && authToken) {
      // Wallet connected, check if token matches
      const payload = parseJwt(authToken);
      if (payload?.sub !== publicKey.toString()) {
        console.log(
          "Connected wallet does not match auth token wallet, clearing token.",
        );
        setAuthToken(null);
        setUserPrivileges([]);
        queryClient.invalidateQueries({ queryKey: ["auth-status"] });
      }
    } else if (connected && publicKey && !authToken) {
      console.log("Wallet connected, but no auth token found.");
    }
  }, [connected, publicKey, authToken, setAuthToken, queryClient]);

  // useLocalStorage handles this automatically, but we check expiration
  useEffect(() => {
    const initialToken = getAuthToken();
    if (initialToken && isTokenExpired(initialToken)) {
      console.log("Initial auth token is expired, clearing.");
      setAuthToken(null);
    } else if (initialToken && !authToken) {
      // Sync state if localStorage has a token but state doesn't (e.g. after refresh)
      setAuthToken(initialToken);
    }
  }, [setAuthToken, authToken]);

  const isAuthenticated =
    authQuery.data?.authenticated === true &&
    !!authToken &&
    !isTokenExpired(authToken);

  const signOut = async () => {
    const tokenToRevoke = authToken;
    setAuthToken(null);
    setUserPrivileges([]);
    queryClient.invalidateQueries({ queryKey: ["auth-status"] });

    try {
      if (tokenToRevoke) {
        const headers = new Headers();
        headers.set("Authorization", `Bearer ${tokenToRevoke}`);
        await fetch(`${env.apiUrl}/api/logout`, {
          method: "POST",
          headers: headers,
          credentials: "include",
        });
      }
    } catch (e) {
      console.error("Failed to complete server-side logout notification:", e);
    }

    try {
      if (adapterDisconnect) {
        await adapterDisconnect();
      } else if (wallet?.adapter?.disconnect) {
        await wallet.adapter.disconnect();
      }
    } catch (e) {
      console.error("Error disconnecting wallet adapter:", e);
    }
  };

  return {
    authToken,
    isAuthenticated,
    isAuthenticating: authQuery.isLoading,
    signOut,
    walletAddress: currentWalletAddress,
    privileges: userPrivileges,
    fetchWithAuth,
    authQuery,
    handleSuccessfulAuth,
  };
}
