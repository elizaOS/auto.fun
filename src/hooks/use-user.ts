import { env } from "@/utils/env";
import { useWallet } from "@solana/wallet-adapter-react";
import { fetchWithAuth } from "./use-authentication";
import { useQuery } from "@tanstack/react-query";

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
  const query = useQuery({
    queryKey: ["user", publicKey],
    queryFn: async () => {
      if (!publicKey) {
        return null;
      }

      try {
        const response = await fetchWithAuth(`${env.apiUrl}/api/auth-status`, {
          method: "GET",
        });

        if (response.ok) {
          const data = (await response.json()) as AuthStatus;
          if (data.authenticated && data.user) {
            return { user: data.user, authenticated: data.authenticated };
          } else {
            return { authenticated: data.authenticated };
          }
        } else {
          console.error("Error response from auth-status:", response.status);
          return null;
        }
      } catch (error) {
        console.error("Error fetching user:", error);
        return null;
      }
    },
  });

  const user: User | null | undefined = query?.data?.user;
  const authenticated: boolean = query?.data?.authenticated ? true : false;

  return { user, authenticated, isLoading: query?.isPending, query };
}
