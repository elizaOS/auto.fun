import { UserContext, useUser } from "@/contexts/user";
import { useWalletModal } from "@/hooks/use-wallet-modal";
import { PropsWithChildren, useCallback, useEffect, useState } from "react";

export const UserProvider = ({ children }: PropsWithChildren) => {
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const { logout: walletLogout } = useWalletModal();

  const handleSetAuthenticated = useCallback((value: boolean) => {
    setAuthenticated(value);

    if (value === false) {
      localStorage.removeItem("walletConnected");
      localStorage.removeItem("lastWalletName");
      console.log("User state: logged out and cleared wallet data");
    }
  }, []);

  const logOut = useCallback(() => {
    setAuthenticated(false);

    // Clear wallet data
    localStorage.removeItem("walletConnected");
    localStorage.removeItem("lastWalletName");
    localStorage.removeItem("authToken");

    // Also call wallet logout to clear auth tokens
    try {
      walletLogout();
    } catch (error) {
      console.error("Error during wallet logout:", error);
    }

    console.log("User logged out via logOut()");

    // Refresh authentication status from backend
    try {
      fetch(import.meta.env.VITE_API_URL + "/api/auth-status", {
        credentials: "include", // Important for cookies
      })
        .then((response) => {
          if (response.ok) return response.json();
          throw new Error(`Failed to fetch: ${response.status}`);
        })
        .then((data) => console.log("Auth status after logout:", data))
        .catch((error) =>
          console.error("Error fetching auth status after logout:", error),
        );
    } catch (e) {
      console.error("Failed to check auth status after logout:", e);
    }

    // Force reload after a short delay if we're still on the same page
    setTimeout(() => {
      try {
        window.location.reload();
      } catch (e) {
        console.error("Failed to reload page after logout:", e);
      }
    }, 500);
  }, [walletLogout]);

  const value = {
    authenticated,
    setAuthenticated: handleSetAuthenticated,
    logOut,
  };

  return (
    <UserContext.Provider value={value}>
      <UserStatusFetcher />
      {children}
    </UserContext.Provider>
  );
};

interface AuthResponse {
  authenticated: boolean;
}

const UserStatusFetcher = () => {
  const { setAuthenticated } = useUser();

  useEffect(() => {
    const fetchAuthStatus = async () => {
      try {
        const response = await fetch(
          import.meta.env.VITE_API_URL + "/api/auth-status",
        );
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.status}`);
        }

        const data = (await response.json()) as AuthResponse;
        console.log("UserStatusFetcher: auth status response:", data);
        setAuthenticated(data.authenticated);
      } catch (error) {
        console.error("Error fetching auth status:", error);
        setAuthenticated(false);
      }
    };

    fetchAuthStatus();

    const intervalId = setInterval(fetchAuthStatus, 1 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [setAuthenticated]);

  return null;
};
