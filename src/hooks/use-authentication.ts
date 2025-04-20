import { env } from "@/utils/env";
import { useWallet } from "@solana/wallet-adapter-react";
import { useLocalStorage } from "@uidotdev/usehooks";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

// Helper function to send auth token in headers
export const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
  let authToken = null;
  try {
    const walletAuthStr = localStorage.getItem("walletAuth");
    if (walletAuthStr) {
      try {
        const walletAuthData = JSON.parse(walletAuthStr) as {
          token: string;
          walletAddress: string;
          timestamp: number;
        };

        if (walletAuthData && walletAuthData.token) {
          authToken = walletAuthData.token;
        }
      } catch (parseError) {
        console.error("Error parsing wallet auth data:", parseError);
      }
    }

    if (!authToken) {
      const storedAuthToken = localStorage.getItem("authToken");
      if (storedAuthToken) {
        try {
          authToken = JSON.parse(storedAuthToken);
        } catch (parseError) {
          console.error("Error parsing stored auth token:", parseError);
        }
      }
    }
  } catch (e) {
    console.error("Error reading auth token from localStorage:", e);
  }

  const headers = new Headers(options.headers || {});
  if (authToken) {
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
  const { publicKey, connected, disconnect: adapterDisconnect } = useWallet();
  const [authToken, setAuthToken] = useLocalStorage<string | null>(
    "authToken",
    null,
  );
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [userPrivileges, setUserPrivileges] = useState<string[]>([]);

  const hasDirectPhantomConnection =
    typeof window !== "undefined" &&
    window.solana &&
    window.solana.isPhantom &&
    window.solana.publicKey;

  const getWalletAddressFromToken = (token: string | null): string | null => {
    if (!token) return null;

    if (token.startsWith("wallet_")) {
      const parts = token.split("_");
      if (parts.length >= 2) {
        return parts[1];
      }
    } else if (token.includes(".")) {
      try {
        const parts = token.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          if (payload.sub) {
            return payload.sub;
          }
        }
      } catch (e) {
        console.error("Error decoding JWT token:", e);
      }
    }

    return null;
  };

  const [storedWalletAddress, setStoredWalletAddress] = useState<string | null>(
    authToken ? getWalletAddressFromToken(authToken) : null,
  );

  const authQuery = useQuery<AuthStatus>({
    queryKey: [
      "auth-status",
      publicKey?.toString(),
      storedWalletAddress,
      connected,
      authToken,
    ],
    queryFn: async () => {
      try {
        setIsAuthenticating(true);
        const response = await fetchWithAuth(`${env.apiUrl}/api/auth-status`, {
          method: "GET",
        });

        if (response.ok) {
          const data = (await response.json()) as AuthStatus;
          if (data.authenticated) {
            if (data.privileges) {
              setUserPrivileges(data.privileges);
            }
            return data;
          }
        }
        return { authenticated: false };
      } catch (error) {
        console.error("Error checking auth status:", error);
        return { authenticated: false };
      } finally {
        setIsAuthenticating(false);
      }
    },
    enabled: !!publicKey || !!storedWalletAddress || connected || !!authToken,
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });

  // Enhance setAuthToken to ensure it's also directly set in localStorage
  const setAuthTokenWithStorage = (token: string | null) => {
    setAuthToken(token);
    try {
      if (token) {
        localStorage.setItem("authToken", JSON.stringify(token));
      } else {
        localStorage.removeItem("authToken");
      }
    } catch (e) {
      console.error("Error updating authToken in localStorage:", e);
    }
  };

  // Handle successful authentication
  const handleSuccessfulAuth = (token: string, userAddress: string) => {
    setAuthTokenWithStorage(token);
    setStoredWalletAddress(userAddress);

    // Store expanded auth data
    const authStorage = {
      token,
      walletAddress: userAddress,
      timestamp: Date.now(),
    };

    try {
      localStorage.setItem("walletAuth", JSON.stringify(authStorage));
    } catch (e) {
      console.error("Error storing wallet auth data:", e);
    }

    // Force a refetch of auth status
    authQuery.refetch();
  };

  // Auto-reconnect if we have a token but wallet is not connected
  useEffect(() => {
    if (
      authToken &&
      !connected &&
      !hasDirectPhantomConnection &&
      !isAuthenticating
    ) {
      if (
        typeof window !== "undefined" &&
        window.solana &&
        window.solana.isPhantom
      ) {
        try {
          window.solana.connect().catch((err: any) => {
            console.error("Failed to reconnect directly:", err);
          });
        } catch (err) {
          console.error("Error during reconnection attempt:", err);
        }
      }
    }
  }, [authToken, connected, hasDirectPhantomConnection, isAuthenticating]);

  const isAuthenticated =
    !!authToken &&
    authQuery.data?.authenticated &&
    (connected || hasDirectPhantomConnection || !!storedWalletAddress);

  const signOut = async () => {
    try {
      await fetchWithAuth(`${env.apiUrl}/api/logout`, {
        method: "POST",
      });
    } catch (e) {
      console.error("Failed to complete server-side logout:", e);
    }

    setAuthToken(null);
    setStoredWalletAddress(null);
    setUserPrivileges([]);

    try {
      localStorage.removeItem("walletAuth");
    } catch (e) {
      console.error("Error removing walletAuth data:", e);
    }

    try {
      if (adapterDisconnect) {
        try {
          await adapterDisconnect();
        } catch (e) {
          console.error("Error disconnecting adapter:", e);
        }
      }

      if (window.solana && window.solana.disconnect) {
        try {
          await window.solana.disconnect();
        } catch (e) {
          console.error("Error disconnecting Phantom:", e);
        }
      }
    } catch (e) {
      console.error("Error during sign out:", e);
    }
  };

  useEffect(() => {
    try {
      const walletAuthStr = localStorage.getItem("walletAuth");
      if (walletAuthStr) {
        try {
          const walletAuthData = JSON.parse(walletAuthStr) as {
            token: string;
            walletAddress: string;
            timestamp: number;
          };
          setAuthToken(walletAuthData.token);
          setStoredWalletAddress(walletAuthData.walletAddress);
          return;
        } catch (parseError) {
          console.error("Error parsing wallet auth data:", parseError);
          localStorage.removeItem("walletAuth");
        }
      }

      const storedAuthToken = localStorage.getItem("authToken");
      if (storedAuthToken && !authToken) {
        try {
          const parsedToken = JSON.parse(storedAuthToken);
          setAuthToken(parsedToken);
          const extractedAddress = getWalletAddressFromToken(parsedToken);
          if (extractedAddress) {
            setStoredWalletAddress(extractedAddress);
          }
        } catch (parseError) {
          console.error("Error parsing stored auth token:", parseError);
          localStorage.removeItem("authToken");
        }
      }
    } catch (e) {
      console.error("Error reading auth token from localStorage:", e);
    }
  }, []);

  return {
    authToken,
    setAuthToken: setAuthTokenWithStorage,
    isAuthenticated,
    isAuthenticating,
    isInitialized: true,
    signOut,
    walletAddress:
      storedWalletAddress ||
      publicKey?.toString() ||
      (hasDirectPhantomConnection && window.solana?.publicKey
        ? window.solana.publicKey.toString()
        : null),
    privileges: userPrivileges,
    fetchWithAuth,
    authQuery,
    handleSuccessfulAuth,
  };
}
