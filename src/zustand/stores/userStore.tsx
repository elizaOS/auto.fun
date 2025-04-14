import { createStore } from "zustand";
import {
  UserState,
  UserStore,
} from "../../../types/zustand/stores/userStore.type";

const defaultInitState: UserState = Object.freeze({
  authenticated: false,
});

export const createUserStore = (initialState: UserState = defaultInitState) => {
  return createStore<UserStore>()((set) => ({
    ...initialState,
    setAuthenticated: (authenticated: boolean) => {
      set({ authenticated });
    },
  }));
};
