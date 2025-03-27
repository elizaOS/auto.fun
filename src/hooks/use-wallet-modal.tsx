import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { useWallet } from "@solana/wallet-adapter-react";
import { Payload, SIWS } from "@web3auth/sign-in-with-solana";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
} from "react";

export interface Header {
  t: string;
}

// Enhanced context with authentication methods
export interface WalletModalContextState {
  visible: boolean;
  setVisible: (open: boolean) => void;
  hasStoredWallet?: boolean;
  authenticate: () => Promise<void>;
  isAuthenticating: boolean;
  isAuthenticated: boolean;
  logout: () => void;
  authToken: string | null;
}

const DEFAULT_CONTEXT = {
  setVisible(_open: boolean) {
    console.error(constructMissingProviderErrorMessage("call", "setVisible"));
  },
  visible: false,
  hasStoredWallet: false,
  authenticate: async () => {
    console.error(constructMissingProviderErrorMessage("call", "authenticate"));
  },
  isAuthenticating: false,
  isAuthenticated: false,
  logout: () => {
    console.error(constructMissingProviderErrorMessage("call", "logout"));
  },
  authToken: null,
};

Object.defineProperty(DEFAULT_CONTEXT, "visible", {
  get() {
    console.error(constructMissingProviderErrorMessage("read", "visible"));
    return false;
  },
});

Object.defineProperty(DEFAULT_CONTEXT, "hasStoredWallet", {
  get() {
    console.error(
      constructMissingProviderErrorMessage("read", "hasStoredWallet"),
    );
    return false;
  },
});

Object.defineProperty(DEFAULT_CONTEXT, "isAuthenticating", {
  get() {
    console.error(
      constructMissingProviderErrorMessage("read", "isAuthenticating"),
    );
    return false;
  },
});

Object.defineProperty(DEFAULT_CONTEXT, "isAuthenticated", {
  get() {
    console.error(
      constructMissingProviderErrorMessage("read", "isAuthenticated"),
    );
    return false;
  },
});

function constructMissingProviderErrorMessage(
  action: string,
  valueName: string,
) {
  return (
    "You have tried to " +
    ` ${action} "${valueName}"` +
    " on a WalletModalContext without providing one." +
    " Make sure to render a WalletModalProvider" +
    " as an ancestor of the component that uses " +
    "WalletModalContext"
  );
}

export const WalletModalContext = createContext<WalletModalContextState>(
  DEFAULT_CONTEXT as WalletModalContextState,
);

export function useWalletModal(): WalletModalContextState {
  return useContext(WalletModalContext);
}

// Custom hook to provide authentication functionality
export function useWalletAuthentication() {
  const { publicKey, signMessage } = useWallet();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const authInProgressRef = useRef(false);

  // Initialize auth token from localStorage on component mount
  useEffect(() => {
    const storedToken = localStorage.getItem("authToken");
    if (storedToken) {
      setAuthToken(storedToken);
      setIsAuthenticated(true);
    }
  }, []);

  // Check authentication status from backend
  useEffect(() => {
    const checkAuthStatus = async () => {
      if (!publicKey) return;

      try {
        console.log(
          "Checking auth status for wallet:",
          publicKey.toString().slice(0, 10) + "...",
        );

        // Include the auth token in the request if available
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (authToken) {
          headers["Authorization"] = `Bearer ${authToken}`;
        }

        const response = await fetch(
          import.meta.env.VITE_API_URL + "/api/auth-status",
          {
            credentials: "include",
            headers,
          },
        );

        if (response.ok) {
          const data = (await response.json()) as { authenticated: boolean };
          console.log("Auth status response:", data);

          // If we're already in the correct authentication state, don't update
          // This prevents unnecessary state changes that can trigger unwanted effects
          if (isAuthenticated !== data.authenticated) {
            setIsAuthenticated(data.authenticated);

            // If server says we're not authenticated but we have a token, clear it
            if (!data.authenticated && authToken) {
              console.log(
                "Server reports not authenticated, clearing local token",
              );
              localStorage.removeItem("authToken");
              setAuthToken(null);
            }
          }
        } else {
          // Only clear authentication if it's currently set to true
          if (isAuthenticated) {
            setIsAuthenticated(false);
            localStorage.removeItem("authToken");
            setAuthToken(null);
          }
        }
      } catch (error) {
        console.error("Error checking auth status:", error);
      }
    };

    // Add a slight delay to avoid race conditions with wallet connection
    const timeoutId = setTimeout(checkAuthStatus, 500);

    // Set up periodic check
    const intervalId = setInterval(checkAuthStatus, 30000); // Every 30 seconds

    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [publicKey, authToken, isAuthenticated]);

  // Generate a nonce for authentication
  const generateNonce = useCallback(async (): Promise<string> => {
    if (!publicKey) {
      throw new Error("Wallet not connected");
    }

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/generate-nonce`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ publicKey: publicKey.toString() }),
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to generate nonce: ${response.status}`);
      }

      const data = (await response.json()) as { nonce: string };
      return data.nonce;
    } catch (error) {
      console.error("Error generating nonce:", error);
      throw error;
    }
  }, [publicKey]);

  // Authentication method with proper token handling
  const authenticate = useCallback(async () => {
    if (!publicKey) {
      throw new Error("Wallet not connected");
    }

    // Check if solana provider is available
    if (!signMessage) {
      throw new Error("Wallet adapter doesn't support signMessage method");
    }

    // Guard against multiple concurrent authentication attempts
    if (authInProgressRef.current || isAuthenticating) {
      console.log(
        "Authentication already in progress, skipping duplicate call",
      );
      return;
    }

    setIsAuthenticating(true);
    authInProgressRef.current = true;

    try {
      console.log("Starting wallet authentication process");

      // Try to get a nonce first
      const nonce = await generateNonce();
      console.log("Generated nonce:", nonce);

      // Make sure wallet is still connected before continuing
      if (!publicKey) {
        throw new Error("Wallet disconnected during authentication");
      }

      const payload = new Payload();
      payload.domain = window.location.host;
      payload.address = publicKey.toString();
      payload.uri = window.location.origin;
      payload.statement = `Sign this message for authenticating with nonce: ${nonce}`;
      payload.version = "1";
      payload.chainId = 1;
      payload.nonce = nonce;

      const siwsMessage = new SIWS({ payload });

      // Create authentication message with nonce
      const messageText = siwsMessage.prepareMessage();
      const messageEncoded = new TextEncoder().encode(messageText);

      // Request signature from wallet
      console.log("Requesting signature from wallet");
      const signatureBytes = await signMessage(messageEncoded);

      // Double-check wallet is still connected
      if (!publicKey) {
        throw new Error("Wallet disconnected after signing");
      }

      // Convert to base58 or hex string as required by backend
      const signatureHex = bs58.encode(signatureBytes);

      // Send authentication request to backend
      console.log("Sending authentication to backend");
      const authResponse = await fetch(
        `${import.meta.env.VITE_API_URL}/api/authenticate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            publicKey: publicKey.toString(),
            signature: { t: "sip99", s: signatureHex },
            payload: siwsMessage.payload,
            header: { t: "sip99" },
            nonce,
            message: messageText,
          }),
          credentials: "include", // Important for cookies
        },
      );

      if (!authResponse.ok) {
        throw new Error(`Authentication failed: ${authResponse.status}`);
      }

      // Parse response
      const authData = (await authResponse.json()) as { token?: string };
      console.log("Auth response data:", authData);

      if (authData.token) {
        // Store the auth token
        localStorage.setItem("authToken", authData.token);
        setAuthToken(authData.token);
        console.log("Authentication successful, token stored");
      } else {
        console.warn("Authentication successful but no token received");

        // If no token but authentication succeeded, verify we're authenticated
        // by checking the auth status
        try {
          const authCheckResponse = await fetch(
            `${import.meta.env.VITE_API_URL}/api/auth-status`,
            { credentials: "include" },
          );

          if (authCheckResponse.ok) {
            const statusData = (await authCheckResponse.json()) as {
              authenticated: boolean;
            };
            if (statusData.authenticated) {
              console.log("Confirmed authenticated via session/cookies");

              // Create a synthetic token based on publicKey to ensure localStorage has something
              const syntheticToken = `session_${publicKey.toString()}_${Date.now()}`;
              localStorage.setItem("authToken", syntheticToken);
              setAuthToken(syntheticToken);
              console.log("Created and stored synthetic session token");
            }
          }
        } catch (e) {
          console.error("Error checking auth status after authentication:", e);
        }
      }

      // Update authentication status
      setIsAuthenticated(true);

      // Store wallet connection state for future visits
      localStorage.setItem("walletConnected", "true");
    } catch (error) {
      console.error("Authentication error:", error);
      setIsAuthenticated(false);
      localStorage.removeItem("authToken");
      setAuthToken(null);
      throw error;
    } finally {
      setIsAuthenticating(false);
      authInProgressRef.current = false;
    }
  }, [publicKey, generateNonce]);

  // Add a logout function to clear auth tokens
  const logout = useCallback(() => {
    console.log("Starting wallet authentication logout");

    // Clear token and authentication state
    localStorage.removeItem("authToken");
    setAuthToken(null);
    setIsAuthenticated(false);

    // Also clear wallet connection data for consistency
    localStorage.removeItem("walletConnected");
    localStorage.removeItem("lastWalletName");

    // Notify the server about logout - but don't block on failure
    try {
      fetch(`${import.meta.env.VITE_API_URL}/api/logout`, {
        method: "POST",
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        credentials: "include",
      }).catch((error) => {
        console.error("Error during server logout notification:", error);
      });
    } catch (e) {
      console.error("Error preparing logout request:", e);
    }

    console.log("Logged out, auth token cleared");
  }, [authToken]);

  return {
    isAuthenticated,
    isAuthenticating,
    authenticate,
    logout,
    authToken,
  };
}
