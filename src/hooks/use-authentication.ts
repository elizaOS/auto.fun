import { env } from "@/utils/env";
import { useWallet } from "@solana/wallet-adapter-react";
import { useLocalStorage } from "@uidotdev/usehooks";
import { useEffect, useState } from "react";

// This global variable helps us avoid multiple API calls across instances
let checkStatusCalled = false;

// Allow resetting the check status flag when needed
export function resetAuthCheckStatus() {
  checkStatusCalled = false;
}

// Helper function to send auth token in headers
export const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
  // Get token from localStorage
  let authToken = null;
  try {
    // Try to read the expanded wallet auth data first (preferred method)
    const walletAuthStr = localStorage.getItem("walletAuth");
    if (walletAuthStr) {
      try {
        const walletAuthData = JSON.parse(walletAuthStr) as {
          token: string;
          walletAddress: string;
          timestamp: number;
        };

        if (walletAuthData && walletAuthData.token) {
          authToken = walletAuthData.token;
          console.log(
            "Using auth token from walletAuth:",
            authToken.substring(0, 20) + "...",
          );
          console.log(
            "Token format:",
            authToken.includes(".")
              ? "JWT"
              : authToken.startsWith("wallet_")
                ? "wallet_prefix"
                : "unknown",
          );
        }
      } catch (parseError) {
        console.error("Error parsing wallet auth data:", parseError);
      }
    }

    // Fallback to regular token check if walletAuth doesn't have a token
    if (!authToken) {
      const storedAuthToken = localStorage.getItem("authToken");
      if (storedAuthToken) {
        try {
          authToken = JSON.parse(storedAuthToken);
          console.log(
            "Using auth token from authToken:",
            authToken.substring(0, 20) + "...",
          );
          console.log(
            "Token format:",
            authToken.includes(".")
              ? "JWT"
              : authToken.startsWith("wallet_")
                ? "wallet_prefix"
                : "unknown",
          );
        } catch (parseError) {
          console.error("Error parsing stored auth token:", parseError);
        }
      }
    }
  } catch (e) {
    console.error("Error reading auth token from localStorage:", e);
  }

  // Set up headers with token
  const headers = new Headers(options.headers || {});
  if (authToken) {
    // Always ensure token has the Bearer prefix for JWT tokens
    const tokenWithBearer = authToken.startsWith("Bearer ")
      ? authToken
      : `Bearer ${authToken}`;

    headers.set("Authorization", tokenWithBearer);
    console.log(
      "Set Authorization header for request:",
      tokenWithBearer.substring(0, 30) + "...",
    );
  } else {
    console.log("No auth token found for request to:", url);
  }

  // Merge with existing options
  const newOptions = {
    ...options,
    headers,
    credentials: "include" as RequestCredentials, // Keep for backward compatibility
  };

  // Make the request
  console.log(`Making authenticated request to ${url}`);
  return fetch(url, newOptions);
};

export default function useAuthentication() {
  const { publicKey, connected, disconnect: adapterDisconnect } = useWallet();
  const [authToken, setAuthToken] = useLocalStorage<string | null>(
    "authToken",
    null,
  );
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [userPrivileges, setUserPrivileges] = useState<string[]>([]);

  // Enhance setAuthToken to ensure it's also directly set in localStorage
  const setAuthTokenWithStorage = (token: string | null) => {
    // Update the hook state
    setAuthToken(token);

    // Also directly set in localStorage as a backup
    try {
      if (token) {
        localStorage.setItem("authToken", JSON.stringify(token));
        console.log("Auth token stored in localStorage");
      } else {
        localStorage.removeItem("authToken");
        console.log("Auth token removed from localStorage");
      }
    } catch (e) {
      console.error("Error updating authToken in localStorage:", e);
    }
  };

  // Check for Phantom connection directly from window.solana
  const hasDirectPhantomConnection =
    typeof window !== "undefined" &&
    window.solana &&
    window.solana.isPhantom &&
    window.solana.publicKey;

  // Extract and store the wallet address from the authToken
  const getWalletAddressFromToken = (token: string | null): string | null => {
    if (!token) return null;

    // Handle our wallet_ prefix format
    if (token.startsWith("wallet_")) {
      const parts = token.split("_");
      if (parts.length >= 2) {
        return parts[1];
      }
    }

    // Handle JWT format token
    else if (token.includes(".")) {
      try {
        // JWT tokens have 3 parts separated by dots
        const parts = token.split(".");
        if (parts.length === 3) {
          // Decode the middle part (payload)
          const payload = JSON.parse(atob(parts[1]));
          // The subject field should contain the wallet address
          if (payload.sub) {
            return payload.sub;
          }
        }
      } catch (e) {
        console.error("Error decoding JWT token:", e);
      }
    }

    return null;
  };

  // The stored wallet address from token
  const [storedWalletAddress, setStoredWalletAddress] = useState<string | null>(
    authToken ? getWalletAddressFromToken(authToken) : null,
  );

  // Consider connected if:
  // 1. We have an auth token AND
  // 2. Either the wallet is connected directly, OR through the window.solana object
  const isAuthenticated =
    !!authToken &&
    (connected || hasDirectPhantomConnection || !!storedWalletAddress);

  // Clean sign out process
  const signOut = async () => {
    console.log("Signing out and cleaning up auth state");

    // Call the server logout endpoint to revoke the token in KV store
    try {
      await fetchWithAuth(`${env.apiUrl}/api/logout`, {
        method: "POST",
      });
      console.log("Server-side logout completed");
    } catch (e) {
      console.error("Failed to complete server-side logout:", e);
    }

    // Clear local storage and state
    setAuthTokenWithStorage(null);
    setStoredWalletAddress(null);
    setUserPrivileges([]);

    // Also clean up the expanded walletAuth data
    try {
      localStorage.removeItem("walletAuth");
    } catch (e) {
      console.error("Error removing walletAuth data:", e);
    }

    try {
      // Try to disconnect adapter
      if (adapterDisconnect) {
        try {
          adapterDisconnect().catch((e) =>
            console.error("Error disconnecting adapter:", e),
          );
        } catch (e) {
          console.error("Error disconnecting adapter:", e);
        }
      }

      // If using Phantom directly, disconnect
      if (window.solana && window.solana.disconnect) {
        try {
          window.solana
            .disconnect()
            .catch((e: Error) =>
              console.error("Error disconnecting Phantom:", e),
            );
        } catch (e) {
          console.error("Error disconnecting Phantom:", e);
        }
      }
    } catch (e) {
      console.error("Error during sign out:", e);
    }
  };

  // Check localStorage first for auth token and wallet data on initial mount
  useEffect(() => {
    // Reset the check status when component mounts to ensure auth check runs
    if (typeof window !== "undefined") {
      resetAuthCheckStatus();
    }

    // Check localStorage first for auth token and expanded wallet auth data
    try {
      // Try to read the expanded wallet auth data first
      const walletAuthStr = localStorage.getItem("walletAuth");
      if (walletAuthStr) {
        try {
          const walletAuthData = JSON.parse(walletAuthStr) as {
            token: string;
            walletAddress: string;
            timestamp: number;
          };

          console.log("Found wallet auth data in localStorage, restoring");
          setAuthToken(walletAuthData.token);
          setStoredWalletAddress(walletAuthData.walletAddress);

          // If we're within 7 days of the token creation, it's still valid
          const tokenAge = Date.now() - walletAuthData.timestamp;
          const tokenValid = tokenAge < 7 * 24 * 60 * 60 * 1000; // 7 days

          if (!tokenValid) {
            console.log("Token is older than 7 days, will try to refresh");
          }

          return; // Skip regular token check if we found the expanded data
        } catch (parseError) {
          console.error("Error parsing wallet auth data:", parseError);
          localStorage.removeItem("walletAuth");
        }
      }

      // Fallback to regular token check
      const storedAuthToken = localStorage.getItem("authToken");
      if (storedAuthToken && !authToken) {
        try {
          const parsedToken = JSON.parse(storedAuthToken);
          console.log("Found auth token in localStorage, restoring");
          setAuthToken(parsedToken);

          // Try to extract wallet address from token
          const extractedAddress = getWalletAddressFromToken(parsedToken);
          if (extractedAddress) {
            setStoredWalletAddress(extractedAddress);
          }
        } catch (parseError) {
          console.error("Error parsing stored auth token:", parseError);
          // Remove invalid token
          localStorage.removeItem("authToken");
        }
      }
    } catch (e) {
      console.error("Error reading auth token from localStorage:", e);
    }
  }, []);

  // Check server-side auth status on initial load and when wallet connection changes
  useEffect(() => {
    // Get public key from adapter or direct connection
    const connectedPublicKey =
      publicKey?.toString() ||
      (hasDirectPhantomConnection && window.solana?.publicKey
        ? window.solana.publicKey.toString()
        : null) ||
      storedWalletAddress; // Also use stored wallet address as a fallback

    if (!checkStatusCalled) {
      checkStatusCalled = true;
      const checkStatus = async () => {
        try {
          setIsAuthenticating(true);
          console.log("Checking auth status with server...");

          // First, check for auth token in localStorage
          let token = null;
          let walletAddressFromStorage = null;

          // Try to read the enhanced wallet auth data first
          try {
            const walletAuthStr = localStorage.getItem("walletAuth");
            if (walletAuthStr) {
              try {
                const walletAuthData = JSON.parse(walletAuthStr) as {
                  token: string;
                  walletAddress: string;
                  timestamp: number;
                };

                if (walletAuthData && walletAuthData.token) {
                  token = walletAuthData.token;
                  walletAddressFromStorage = walletAuthData.walletAddress;
                  console.log(
                    "Found auth token in walletAuth:",
                    token.substring(0, 20) + "...",
                  );
                }
              } catch (parseError) {
                console.error("Error parsing wallet auth data:", parseError);
              }
            }

            // Fallback to regular authToken storage
            if (!token) {
              const storedAuthToken = localStorage.getItem("authToken");
              if (storedAuthToken) {
                try {
                  token = JSON.parse(storedAuthToken);
                  console.log(
                    "Found auth token in authToken:",
                    token.substring(0, 20) + "...",
                  );
                } catch (parseError) {
                  console.error("Error parsing stored auth token:", parseError);
                }
              }
            }
          } catch (storageError) {
            console.error("Error accessing localStorage:", storageError);
          }

          // If we have a token, verify with server
          if (token) {
            console.log("Have token, checking with server...");
            try {
              // Always use explicit Authorization header with Bearer prefix
              const bearerToken = token.startsWith("Bearer ")
                ? token
                : `Bearer ${token}`;
              console.log(
                "Using token with Authorization header:",
                bearerToken.substring(0, 30) + "...",
              );

              const headers = new Headers();
              headers.set("Authorization", bearerToken);

              const authCheckResponse = await fetch(
                `${env.apiUrl}/api/auth-status`,
                {
                  method: "GET",
                  headers,
                  credentials: "include", // For backward compatibility
                },
              );

              console.log(
                `Auth status check response: ${authCheckResponse.status}`,
              );

              if (authCheckResponse.ok) {
                const statusData = (await authCheckResponse.json()) as {
                  authenticated: boolean;
                  privileges?: string[];
                };

                console.log(
                  "Auth status from server:",
                  statusData?.authenticated
                    ? "Authenticated"
                    : "Not authenticated",
                );

                // If authenticated, update local state
                if (statusData?.authenticated) {
                  console.log("Server confirms we are authenticated");

                  // Update privileges if provided
                  if (statusData.privileges) {
                    setUserPrivileges(statusData.privileges);
                  }

                  // Ensure token is stored in state
                  setAuthTokenWithStorage(token);

                  // If we have a wallet address from storage, use it
                  if (walletAddressFromStorage) {
                    setStoredWalletAddress(walletAddressFromStorage);
                  } else {
                    // Try to extract from token
                    const extractedAddress = getWalletAddressFromToken(token);
                    if (extractedAddress) {
                      setStoredWalletAddress(extractedAddress);
                    }
                  }

                  setIsAuthenticating(false);
                  return;
                } else {
                  console.log(
                    "Server says we're not authenticated despite having a token",
                  );
                  // Log headers in a way that's compatible with all browser versions
                  console.log("Response headers:");
                  authCheckResponse.headers.forEach((value, key) => {
                    console.log(`${key}: ${value}`);
                  });

                  // Let's try one more time with fetchWithAuth helper to ensure consistent header formatting
                  try {
                    console.log("Retrying with fetchWithAuth helper...");
                    const retryResponse = await fetchWithAuth(
                      `${env.apiUrl}/api/auth-status`,
                      {
                        method: "GET",
                      },
                    );

                    if (retryResponse.ok) {
                      const retryData = (await retryResponse.json()) as {
                        authenticated: boolean;
                        privileges?: string[];
                      };
                      console.log(
                        "Retry auth check result:",
                        retryData?.authenticated
                          ? "Authenticated"
                          : "Not authenticated",
                      );

                      if (retryData?.authenticated) {
                        console.log("Retry succeeded - we are authenticated");
                        if (retryData.privileges) {
                          setUserPrivileges(retryData.privileges);
                        }
                        setAuthTokenWithStorage(token);
                        if (walletAddressFromStorage) {
                          setStoredWalletAddress(walletAddressFromStorage);
                        }
                        setIsAuthenticating(false);
                        return;
                      }
                    }

                    // If retry failed, continue with normal flow
                    console.log(
                      "Retry also failed, proceeding with normal flow",
                    );
                  } catch (retryError) {
                    console.error(
                      "Error during auth status retry:",
                      retryError,
                    );
                  }

                  // If we have a direct wallet connection, create a new token
                  if (connectedPublicKey) {
                    console.log(
                      "Have wallet connection, will create new token",
                    );
                  } else {
                    // Otherwise sign out
                    console.log("No wallet connection, signing out");
                    signOut();
                    setIsAuthenticating(false);
                    return;
                  }
                }
              } else {
                console.warn(
                  "Auth status check failed:",
                  authCheckResponse.status,
                );
                // Log headers in a way that's compatible with all browser versions
                console.log("Response headers:");
                authCheckResponse.headers.forEach((value, key) => {
                  console.log(`${key}: ${value}`);
                });
              }
            } catch (checkError) {
              console.error(
                "Error checking auth status with server:",
                checkError,
              );
            }
          }

          // If we got here, either we don't have a token or the server didn't recognize our token

          // If we have a direct connection or a stored wallet address, create local token
          if (hasDirectPhantomConnection || connected || connectedPublicKey) {
            console.log("Have wallet connection, creating local token");

            if (!connectedPublicKey) {
              console.error("No connected public key available");
              setIsAuthenticating(false);
              return;
            }

            const walletSpecificToken = `wallet_${connectedPublicKey}_${Date.now()}`;

            // Store expanded auth data
            const authStorage = {
              token: walletSpecificToken,
              walletAddress: connectedPublicKey,
              timestamp: Date.now(),
            };

            try {
              localStorage.setItem("walletAuth", JSON.stringify(authStorage));
              console.log("Stored new wallet auth data in localStorage");
            } catch (e) {
              console.error("Error storing wallet auth data:", e);
            }

            setAuthTokenWithStorage(walletSpecificToken);
            setStoredWalletAddress(connectedPublicKey);
            setIsAuthenticating(false);
            return;
          }

          // If we got here, we have no token and no wallet connection
          console.log("No token and no wallet connection");
          signOut();
          setIsAuthenticating(false);
        } catch (error) {
          console.error("Error checking auth status:", error);
          setIsAuthenticating(false);
        }
      };

      checkStatus();
    }
  }, [
    connected,
    publicKey,
    hasDirectPhantomConnection,
    authToken,
    setAuthToken,
    adapterDisconnect,
    storedWalletAddress,
  ]);

  // Auto-reconnect if we have a token but wallet is not connected
  useEffect(() => {
    if (
      authToken &&
      !connected &&
      !hasDirectPhantomConnection &&
      !isAuthenticating
    ) {
      console.log(
        "Have auth token but wallet not connected - will try to reconnect via auto-connect",
      );

      // If we have window.solana available, try to directly connect Phantom
      if (
        typeof window !== "undefined" &&
        window.solana &&
        window.solana.isPhantom
      ) {
        try {
          console.log("Attempting direct Phantom reconnection");
          window.solana
            .connect()
            .then((response: any) => {
              console.log(
                "Direct reconnection successful:",
                response.publicKey.toString(),
              );
            })
            .catch((err: any) => {
              console.error("Failed to reconnect directly:", err);
            });
        } catch (err) {
          console.error("Error during reconnection attempt:", err);
        }
      }
    }
  }, [authToken, connected, hasDirectPhantomConnection, isAuthenticating]);

  // Mark first render as complete to let components know they can use authentication status
  const [isInitialized, setIsInitialized] = useState(false);
  useEffect(() => {
    if (!isInitialized) {
      setIsInitialized(true);
    }
  }, [isInitialized]);

  return {
    authToken,
    setAuthToken: setAuthTokenWithStorage,
    isAuthenticated,
    isAuthenticating,
    isInitialized,
    signOut,
    walletAddress:
      storedWalletAddress ||
      publicKey?.toString() ||
      (hasDirectPhantomConnection && window.solana?.publicKey
        ? window.solana.publicKey.toString()
        : null),
    privileges: userPrivileges,
    fetchWithAuth, // Export the fetchWithAuth function for use in other components
  };
}
