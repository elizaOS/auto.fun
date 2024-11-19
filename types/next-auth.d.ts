import "next-auth/jwt";

declare module "next-auth/jwt" {
  /** returned by the `jwt` callback and `getToken`, when using jwt sessions */
  interface jwt {
    twitter?: {
      provider: string;
      type: string;
      provideraccountid: string;
      token_type: string;
      expires_at: number;
      access_token: string;
      scope: string;
      refresh_token: string;
    };
  }
}
