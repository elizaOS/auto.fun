export type UserState = {
  authenticated: boolean;
};

export type UserActions = {
  setAuthenticated: (authenticated: boolean) => void;
};

export type UserStore = UserState & UserActions;
