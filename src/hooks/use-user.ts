import { env } from "@/utils/env";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";

interface User {
  address: string;
  points: number;
}

interface AuthStatus {
  isAuthenticated: boolean;
  user?: User;
}

export function useUser() {
  const { publicKey } = useWallet();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
        console.log("response", response);
        if (response.ok) {
          const data = (await response.json()) as AuthStatus;
          console.log("data", data);
          if (data.isAuthenticated && data.user) {
            console.log("data", data);
            setUser(data.user);
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
  }, [publicKey]);

  return { user, isLoading };
}
