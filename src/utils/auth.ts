import { AuthOptions, getServerSession } from "next-auth";
import TwitterProvider from "next-auth/providers/twitter";

const authOptions: AuthOptions = {
  providers: [
    TwitterProvider({
      clientId: process.env.TWITTER_CLIENT_ID,
      clientSecret: process.env.TWITTER_CLIENT_SECRET,
      version: "2.0",
      authorization: {
        url: "https://twitter.com/i/oauth2/authorize",
        params: {
          scope:
            "users.read tweet.read tweet.write offline.access like.read list.read bookmark.read follows.read follows.write", // ask for all scopes
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account && account.provider && !token[account.provider]) {
        token[account.provider] = account;
      }

      return token;
    },
  },
};

/**
 * Helper function to get the session on the server without having to import the authOptions object every single time
 * @returns The session object or null
 */
const getSession = () => getServerSession(authOptions);

export { authOptions, getSession };
