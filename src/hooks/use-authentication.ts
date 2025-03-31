import { env } from "@/utils/env";
import { useWallet } from "@solana/wallet-adapter-react";
import { useLocalStorage } from "@uidotdev/usehooks";
import { useEffect, useCallback, useState } from "react";
import bs58 from "bs58";
import { isTokenExpired } from "@/utils/auth";

// Helper to sanitize tokens (remove quotes if present)
const sanitizeToken = (token: string | null): string | null => {
  if (!token) return null;
  if (token.startsWith('"') && token.endsWith('"')) {
    return token.slice(1, -1);
  }
  return token;
};

export default function useAuthentication() {
  const { publicKey, signMessage, connected } = useWallet();
  const [storedToken, setStoredToken] = useLocalStorage<string | null>(
    "authToken",
    null,
  );

  // Clean version of the token that guarantees no quotes
  const authToken = sanitizeToken(storedToken);

  // Custom setter that ensures we don't store quotes
  const setAuthToken = useCallback(
    (token: string | null) => {
      // Ensure we're not storing the token with quotes
      setStoredToken(token ? sanitizeToken(token) : null);
    },
    [setStoredToken],
  );

  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Sign in with wallet method
  const signInWithWallet = useCallback(async () => {
    if (!publicKey || !signMessage) {
      console.error("Wallet not connected or doesn't support signing");
      return false;
    }

    try {
      // Step 1: Get a nonce from the server
      const nonceResponse = await fetch(`${env.apiUrl}/api/generate-nonce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey: publicKey.toString() }),
      });

      if (!nonceResponse.ok) {
        throw new Error("Failed to get authentication nonce");
      }

      const { nonce } = (await nonceResponse.json()) as { nonce: string };

      // Step 2: Create a message to sign
      const message = `Sign this message for authenticating with nonce: ${nonce}`;
      const messageUint8 = new TextEncoder().encode(message);

      // Step 3: Sign the message with wallet
      const signature = await signMessage(messageUint8);

      // Step 4: Send the signature to the server for verification
      const authResponse = await fetch(`${env.apiUrl}/api/authenticate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          publicKey: publicKey.toString(),
          signature: bs58.encode(signature),
          nonce,
          message,
        }),
      });

      if (!authResponse.ok) {
        const errorData = (await authResponse.json()) as { message?: string };
        throw new Error(errorData.message || "Authentication failed");
      }

      const authData = (await authResponse.json()) as { token: string };

      // Step 5: Store the returned JWT token and update state
      setAuthToken(authData.token);
      setIsAuthenticated(true); // Successfully authenticated
      return true;
    } catch (error) {
      console.error("Error during wallet authentication:", error);
      setAuthToken(null);
      setIsAuthenticated(false); // Failed to authenticate
      return false;
    }
  }, [publicKey, signMessage, setAuthToken]);

  const signOut = useCallback(() => {
    setAuthToken(null);
    setIsAuthenticated(false);

    // Call logout endpoint to clear server-side cookies
    fetch(`${env.apiUrl}/api/logout`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    }).catch((error) => {
      console.error("Error logging out:", error);
    });
  }, [setAuthToken]);

  // Effect to check authentication status on load or when wallet/token changes
  useEffect(() => {
    let isMounted = true; // Prevent state updates on unmounted component

    const checkStatus = async () => {
      // If wallet is not connected, ensure we are signed out
      if (!connected) {
        if (isMounted && isAuthenticated) {
          // Only sign out if currently authenticated
          console.log("Wallet disconnected, signing out.");
          signOut();
        }
        return; // Stop further checks if not connected
      }

      // Wallet is connected, now check the token
      if (authToken) {
        if (isTokenExpired(authToken)) {
          // Token exists but is expired
          if (isMounted) {
            console.log("Token found but expired on load/change.");
            signOut();
          }
        } else {
          // Token exists and is not expired, verify with server
          try {
            const authCheckResponse = await fetch(
              `${env.apiUrl}/api/auth-status`,
              {
                credentials: "include",
                headers: { Authorization: `Bearer ${authToken}` },
              },
            );

            if (isMounted) {
              if (authCheckResponse.ok) {
                const statusData = (await authCheckResponse.json()) as {
                  authenticated: boolean;
                  error?: string;
                };

                if (statusData.authenticated) {
                  if (!isAuthenticated) {
                    // Update state only if needed
                    console.log("Server confirmed authenticated status.");
                    setIsAuthenticated(true);
                  }
                } else {
                  console.log(
                    "Server denied authentication:",
                    statusData.error,
                  );
                  signOut(); // Token is invalid according to server
                }
              } else {
                console.error(
                  "Auth status check failed:",
                  authCheckResponse.status,
                );
                if (authCheckResponse.status === 401) {
                  signOut(); // Unauthorized, clear token
                }
                // Don't sign out on other network errors, could be temporary
                // But ensure isAuthenticated is false if it wasn't confirmed
                else if (isAuthenticated) {
                  setIsAuthenticated(false);
                }
              }
            }
          } catch (error) {
            if (isMounted) {
              console.error("Error checking auth status:", error);
              // Don't sign out on network errors, but ensure state reflects uncertainty
              if (isAuthenticated) setIsAuthenticated(false);
            }
          }
        }
      } else {
        // No token exists, ensure signed out state
        if (isMounted && isAuthenticated) {
          // Update state only if needed
          console.log("No token found, ensuring signed out state.");
          setIsAuthenticated(false);
        }
      }
    };

    checkStatus();

    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, [connected, authToken, isAuthenticated, signOut]); // Added isAuthenticated to dependencies

  return {
    authToken,
    setAuthToken,
    isAuthenticated,
    signOut,
    signInWithWallet,
    walletConnected: !!connected && !!publicKey,
    walletPublicKey: publicKey?.toString() || null,
  };
}
