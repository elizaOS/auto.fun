"use client";

import { createUserStore } from "@/zustand/stores/userStore";
import { PropsWithChildren, useEffect } from "react";
import { createContext, useRef, useContext } from "react";
import { useStore } from "zustand";
import { UserStore } from "../../../types/zustand/stores/userStore.type";
import { usePathname } from "next/navigation";

type UserStoreApi = ReturnType<typeof createUserStore>;

export const UserStoreContext = createContext<UserStoreApi | undefined>(
  undefined,
);

export const useUserStore = <T,>(selector: (store: UserStore) => T): T => {
  const userStoreContext = useContext(UserStoreContext);

  if (!userStoreContext) {
    throw new Error(`useUserStore must be used within UserProvider`);
  }

  return useStore(userStoreContext, selector);
};

export const UserProvider = ({ children }: PropsWithChildren) => {
  const storeRef = useRef<UserStoreApi>();
  if (!storeRef.current) {
    storeRef.current = createUserStore();
  }

  return (
    <UserStoreContext.Provider value={storeRef.current}>
      <UserStatusFetcher />
      {children}
    </UserStoreContext.Provider>
  );
};

const UserStatusFetcher = () => {
  const pathname = usePathname();
  const setAuthenticated = useUserStore((state) => state.setAuthenticated);

  useEffect(() => {
    const fetchAuthStatus = async () => {
      try {
        const response = await fetch("/api/auth/status");
        const { authenticated } = await response.json();
        setAuthenticated(authenticated);
      } catch (error) {
        console.error("Error fetching auth status:", error);
      }
    };

    fetchAuthStatus();
  }, [setAuthenticated, pathname]);

  return <></>;
};
