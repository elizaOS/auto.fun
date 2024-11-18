import "next";

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      TWITTER_CLIENT_ID: string;
      TWITTER_CLIENT_SECRET: string;
    }
  }
}
