import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

interface UserContextType {
  authenticated: boolean;
  setAuthenticated: (value: boolean) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const useUser = () => {
  const context = useContext(UserContext);

  if (!context) {
    throw new Error("useUser must be used within UserProvider");
  }

  return context;
};

export const UserProvider = ({ children }: PropsWithChildren) => {
  const [authenticated, setAuthenticated] = useState<boolean>(false);

  const handleSetAuthenticated = useCallback((value: boolean) => {
    setAuthenticated(value);
  }, []);

  const value = {
    authenticated,
    setAuthenticated: handleSetAuthenticated,
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
        setAuthenticated(data.authenticated);
      } catch (error) {
        console.error("Error fetching auth status:", error);
      }
    };

    fetchAuthStatus();

    const intervalId = setInterval(fetchAuthStatus, 1 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [setAuthenticated]);

  return null;
};
