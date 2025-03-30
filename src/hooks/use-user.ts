import { env } from "@/utils/env";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { useSolBalance } from "./use-sol-balance";

interface User {
  address: string;
  points: number;
  solBalance?: number;
}

interface AuthStatus {
  isAuthenticated: boolean;
  user?: User;
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
        const response = await fetch(`${env.apiUrl}/api/auth-status`, {
          credentials: "include",
        });
        if (response.ok) {
          const data = (await response.json()) as AuthStatus;
          if (data.isAuthenticated && data.user) {
            console.log("data", data);
            setUser({
              ...data.user,
              solBalance: solBalanceQuery.data,
            });
          } else {
            setUser(null);
          }
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
