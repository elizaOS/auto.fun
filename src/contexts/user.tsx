import { createContext, useContext } from "react";

export interface UserContextType {
  authenticated: boolean;
  setAuthenticated: (value: boolean) => void;
  logOut: () => void;
}

export const UserContext = createContext<UserContextType | undefined>(
  undefined,
);

export const useUser = () => {
  const context = useContext(UserContext);

  if (!context) {
    throw new Error("useUser must be used within UserProvider");
  }

  return context;
};
