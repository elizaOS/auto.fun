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
            return data.user;
          } else {
            console.log("User not authenticated or no user data");
            return null;
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

  const user: User | null | undefined = query?.data;

  return { user, isLoading: query?.isPending, query };
}
