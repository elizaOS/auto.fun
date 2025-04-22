import { useWallet } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import useAuthentication from "./use-authentication";

interface User {
  address: string;
  points: number;
  solBalance?: number;
}

export function useUser() {
  const { publicKey } = useWallet();
  const { authQuery } = useAuthentication();

  const query = useQuery({
    queryKey: ["user", publicKey, authQuery.data],
    queryFn: async () => {
      if (!publicKey) {
        return null;
      }

      const authData = authQuery.data;
      if (authData?.authenticated) {
        return {
          user: authData.user,
          authenticated: authData.authenticated,
        };
      }
      return { authenticated: false };
    },
    enabled: !!publicKey && authQuery.isSuccess,
  });

  const user: User | null | undefined = query?.data?.user;
  const authenticated: boolean = query?.data?.authenticated || false;

  return { user, authenticated, isLoading: query?.isPending, query };
}
