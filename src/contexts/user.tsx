import { create } from "zustand";

export interface UserState {
  authenticated: boolean;
  setAuthenticated: (value: boolean) => void;
}

export const useUser = create<UserState>((set) => ({
  authenticated: false,
  setAuthenticated: (value: boolean) => set({ authenticated: value }),
}));