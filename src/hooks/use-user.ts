import { env } from "@/utils/env";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { useSolBalance } from "./use-sol-balance";
import { fetchWithAuth } from "./use-authentication";

interface User {
  address: string;
  points: number;
  solBalance?: number;
}

interface AuthStatus {
  authenticated: boolean;
  user?: User;
  privileges?: string[];
}

export function useUser() {
  const { publicKey } = useWallet();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const solBalanceQuery = useSolBalance();

  useEffect(() => {
    const fetchUser = async () => {
      if (!publicKey) {
        setUser(null);
        return;
      }

      setIsLoading(true);
      try {
        console.log("Fetching user data with auth token...");

        // Use fetchWithAuth instead of regular fetch to include the JWT token
        const response = await fetchWithAuth(`${env.apiUrl}/api/auth-status`, {
          method: "GET",
        });

        if (response.ok) {
          const data = (await response.json()) as AuthStatus;
          console.log("Auth status response:", data);

          if (data.authenticated && data.user) {
            console.log("User authenticated, setting user data");
            setUser({
              ...data.user,
              solBalance: solBalanceQuery.data,
            });
          } else {
            console.log("User not authenticated or no user data");
            setUser(null);
          }
        } else {
          console.error("Error response from auth-status:", response.status);
          setUser(null);
        }
      } catch (error) {
        console.error("Error fetching user:", error);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUser();
  }, [publicKey, solBalanceQuery.data]);

  return { user, isLoading };
}
