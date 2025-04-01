import { env } from "@/utils/env";
import { useWallet } from "@solana/wallet-adapter-react";
import { useLocalStorage } from "@uidotdev/usehooks";
import { useEffect, useState, useCallback, useRef } from "react";
import { useWebSocket } from "./use-websocket";

// Global state for auth status checks
export const GLOBAL_AUTH_STATE = {
  // Track if auth check has been called globally
  checkStatusCalled: false,
  // Last check timestamp
  lastCheckTime: 0,
  // Check cooldown period (30 seconds)
  CHECK_COOLDOWN: 30 * 1000,
  // Track mounted auth components
  mountedComponents: new Set<string>(),
  // Track auth check in progress
  checkInProgress: false,
  // Flag to indicate we're in the initial connection phase
  initialConnectionPhase: true,
  // Timeout to end initial connection phase
  initialPhaseTimeout: null as NodeJS.Timeout | null,
  // Flag to indicate auth data has been requested via WebSocket
  authRequestedViaWebSocket: false,
  // Last time we had WebSocket activity - to help coordinate HTTP fallbacks
  lastWebSocketActivity: 0,
  // Flag to indicate we've received tokens via WebSocket
  tokensReceivedViaWebSocket: false,
  // Extended initial phase when tokens are received - prevents all HTTP calls if tokens come via WS
  extendedInitialPhase: false
};

// Allow resetting the check status flag when needed
export function resetAuthCheckStatus() {
  GLOBAL_AUTH_STATE.checkStatusCalled = false;
  GLOBAL_AUTH_STATE.lastCheckTime = 0;
  GLOBAL_AUTH_STATE.checkInProgress = false;
  GLOBAL_AUTH_STATE.initialConnectionPhase = true;
  GLOBAL_AUTH_STATE.authRequestedViaWebSocket = false;
  GLOBAL_AUTH_STATE.tokensReceivedViaWebSocket = false;
  GLOBAL_AUTH_STATE.extendedInitialPhase = false;
  if (GLOBAL_AUTH_STATE.initialPhaseTimeout) {
    clearTimeout(GLOBAL_AUTH_STATE.initialPhaseTimeout);
  }
}

// Helper function to send auth token in headers
export const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
  // Create more detailed logging to identify the source of the request
  console.log(`📡 fetchWithAuth called for URL: ${url}`);
  // Get the call stack to identify the caller
  const stack = new Error().stack;
  if (stack) {
    // Extract and log the first few lines of the stack
    const stackLines = stack.split('\n').slice(1, 5);
    console.log('📋 Call stack (first few frames):');
    stackLines.forEach(line => console.log(`   ${line.trim()}`));
  }

  // Get stored token
  let token = null;
  try {
    const walletAuthStr = localStorage.getItem("walletAuth");
    if (walletAuthStr) {
      const walletAuthData = JSON.parse(walletAuthStr) as {
        token: string;
        walletAddress: string;
        timestamp: number;
      };
      token = walletAuthData.token;
    }
  } catch (e) {
    console.error("Error reading auth token:", e);
  }

  // If no token found in walletAuth, try legacy storage
  if (!token) {
    try {
      const authTokenStr = localStorage.getItem("authToken");
      if (authTokenStr) {
        token = JSON.parse(authTokenStr);
      }
    } catch (e) {
      console.error("Error reading legacy auth token:", e);
    }
  }

  // Add auth headers if we have a token
  if (token) {
    const headers = new Headers(options.headers);
    // Ensure token has Bearer prefix
    const bearerToken = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
    headers.set("Authorization", bearerToken);
    options = { ...options, headers };
  }

  // Make the fetch request
  try {
    console.log(`🚀 Making authenticated fetch request to: ${url}`);
    const response = await fetch(url, {
      ...options,
      credentials: "include", // Include cookies for backward compatibility
    });
    console.log(`✅ Fetch completed for ${url}: ${response.status}`);
    return response;
  } catch (error) {
    console.error(`❌ Error making authenticated request to ${url}:`, error);
    throw error;
  }
};

// Fix interface declaration to avoid linter error
interface Window {
  // Use the existing solana definition without modifying it
  solana?: any;
}

export default function useAuthentication() {
  const { publicKey, connected, disconnect: adapterDisconnect } = useWallet();

  // Store auth token and wallet address
  const [authToken, setAuthToken] = useLocalStorage<string | null>(
    "authToken",
    null,
  );
  const [storedWalletAddress, setStoredWalletAddress] = useState<string | null>(
    null,
  );
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [userPrivileges, setUserPrivileges] = useState<string[]>([]);

  // Track if we have a direct Phantom connection (non-adapter)
  const [hasDirectPhantomConnection, setHasDirectPhantomConnection] =
    useState(false);
    
  // Use WebSocket for authentication status
  const { 
    addEventListener, 
    subscribeToGlobal, 
    connected: wsConnected,
    sendMessage 
  } = useWebSocket();
  
  // Track if this component instance has mounted
  const componentMountedRef = useRef(false);
  
  // Track if auth check has been sent via websocket
  const authCheckSentViaWebSocket = useRef(false);

  // Generate a unique ID for this component instance
  const instanceIdRef = useRef<string>(`auth-${Math.random().toString(36).substring(2, 11)}`);

  // Set auth token and store it in localStorage in enhanced format
  const setAuthTokenWithStorage = useCallback((token: string | null) => {
    if (token) {
      setAuthToken(token);
      setIsAuthenticated(true);

      // Also store in the enhanced format if we have a wallet address
      if (storedWalletAddress || publicKey?.toString()) {
        const walletAddress = storedWalletAddress || publicKey?.toString() || "";
        try {
          localStorage.setItem(
            "walletAuth",
            JSON.stringify({
              token,
              walletAddress,
              timestamp: Date.now(),
            }),
          );
        } catch (e) {
          console.error("Error storing enhanced wallet auth data:", e);
        }
      }
    } else {
      // Clear both storage mechanisms
      setAuthToken(null);
      setIsAuthenticated(false);
      try {
        localStorage.removeItem("walletAuth");
      } catch (e) {
        console.error("Error clearing enhanced wallet auth data:", e);
      }
    }
  }, [setAuthToken, storedWalletAddress, publicKey]);

  // Get wallet address from a JWT token
  const getWalletAddressFromToken = useCallback((token: string | null): string | null => {
    if (!token) return null;

    try {
      // For wallet-based tokens (created client-side)
      if (token.startsWith("wallet_")) {
        const parts = token.split("_");
        if (parts.length >= 2) {
          return parts[1]; // The wallet address is the second part
        }
      }

      // For JWT tokens
      const parts = token.split(".");
      if (parts.length === 3) {
        // This is likely a JWT token
        try {
          const payload = JSON.parse(atob(parts[1]));
          return payload.sub || payload.walletAddress || null;
        } catch (error) {
          console.error("Error parsing JWT payload:", error);
          return null;
        }
      }
    } catch (error) {
      console.error("Error extracting wallet address from token:", error);
    }

    return null;
  }, []);

  // Sign out function
  const signOut = useCallback(async () => {
    // Clear local state
    setAuthTokenWithStorage(null);
    setStoredWalletAddress(null);
    setIsAuthenticated(false);
    setUserPrivileges([]);

    try {
      // Try to disconnect from wallet adapter
      if (connected && adapterDisconnect) {
        await adapterDisconnect();
      }

      // Try to disconnect from direct Phantom connection
      if (window.solana?.isPhantom && window.solana.disconnect) {
        try {
          await window.solana.disconnect();
        } catch (e) {
          console.error("Error disconnecting from Phantom:", e);
        }
      }
    } catch (e) {
      console.error("Error during sign out:", e);
    }

    // Reset auth check status to force a new check on next component mount
    resetAuthCheckStatus();
  }, [connected, adapterDisconnect, setAuthTokenWithStorage]);

  // Check for direct Phantom connection
  useEffect(() => {
    // Skip if already mounted
    if (componentMountedRef.current) return;
    
    const checkDirectConnection = async () => {
      // Access window.solana without using declared type
      const solana = window.solana as any;
      if (solana?.isPhantom) {
        try {
          // Check if already connected by checking for publicKey
          const isConnected = !!solana.publicKey;
          setHasDirectPhantomConnection(isConnected);
        } catch (e) {
          console.error("Error checking direct Phantom connection:", e);
          setHasDirectPhantomConnection(false);
        }
      } else {
        setHasDirectPhantomConnection(false);
      }
    };

    checkDirectConnection();
  }, []);

  // Function to check authentication status
  const checkAuthStatus = useCallback(async () => {
    // Skip if we've checked recently
    const now = Date.now();
    if (now - GLOBAL_AUTH_STATE.lastCheckTime < GLOBAL_AUTH_STATE.CHECK_COOLDOWN) {
      console.log(`Skipping auth check - last check was ${(now - GLOBAL_AUTH_STATE.lastCheckTime) / 1000}s ago`);
      return;
    }
    
    // Update last check time
    GLOBAL_AUTH_STATE.lastCheckTime = now;
    
    try {
      setIsAuthenticating(true);
      console.log("Checking auth status with server...");

      // Check for auth token in localStorage
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
        try {
          console.log("Have token, checking with server...");
          // Create authorization header from token
          const authHeader = `Bearer ${token}`;
          console.log(
            "Using token with Authorization header:",
            authHeader.substring(0, 30) + "...",
          );

          // Try to use WebSocket for auth check if available
          if (wsConnected && sendMessage) {
            console.log("Using WebSocket to check auth status");
            
            // Set flag to avoid duplicate checks
            authCheckSentViaWebSocket.current = true;
            GLOBAL_AUTH_STATE.authRequestedViaWebSocket = true;
            // Track WebSocket activity 
            GLOBAL_AUTH_STATE.lastWebSocketActivity = Date.now();
            
            const sent = sendMessage({
              event: "checkAuthStatus",
              data: { token }
            });
            
            if (sent) {
              console.log("Auth check sent via WebSocket");
              // Don't set any state here - wait for WebSocket response
              return;
            } else {
              console.log("WebSocket send failed, falling back to fetch");
              authCheckSentViaWebSocket.current = false;
            }
          } else {
            console.log("WebSocket not available, falling back to fetch");
          }

          // Fallback to HTTP fetch if WebSocket isn't available or failed
          const headers = new Headers();
          headers.set("Authorization", authHeader);
          
          const authCheckResponse = await fetch(
            `${env.apiUrl}/api/auth-status`,
            {
              method: "GET",
              headers,
              credentials: "include",
            },
          );

          console.log(`Auth status check response: ${authCheckResponse.status}`);

          if (authCheckResponse.ok) {
            const statusData = (await authCheckResponse.json()) as {
              authenticated: boolean;
              privileges?: string[];
            };

            console.log(
              "Auth status from server:",
              statusData?.authenticated ? "Authenticated" : "Not authenticated",
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

              setIsAuthenticated(true);
              setIsAuthenticating(false);
              return;
            }
            
            console.log("Server says we're not authenticated despite having a token");
          }
        } catch (serverCheckError) {
          console.error("Error checking auth with server:", serverCheckError);
        }
      }

      // If we got here, either we don't have a token or the server didn't recognize our token
      const connectedPublicKey =
        publicKey?.toString() ||
        (hasDirectPhantomConnection && window.solana?.publicKey
          ? window.solana.publicKey.toString()
          : null) ||
        storedWalletAddress;

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
        setIsAuthenticated(true);
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
  }, [
    connected, 
    publicKey, 
    hasDirectPhantomConnection, 
    storedWalletAddress, 
    wsConnected, 
    sendMessage, 
    setAuthTokenWithStorage,
    getWalletAddressFromToken,
    signOut
  ]);

  // Subscribe to WebSocket auth status events
  useEffect(() => {
    const instanceId = instanceIdRef.current;
    
    // Skip if already mounted
    if (GLOBAL_AUTH_STATE.mountedComponents.has(instanceId)) {
      console.log(`Auth hook already initialized for instance ${instanceId}`);
      return;
    }
    
    // Mark this instance as mounted
    GLOBAL_AUTH_STATE.mountedComponents.add(instanceId);
    console.log(`Auth component mounted: ${instanceId}. Total: ${GLOBAL_AUTH_STATE.mountedComponents.size}`);
    
    // Subscribe to global events for auth status
    subscribeToGlobal();
 
    // Set up listener for auth status updates
    const unsubscribe = addEventListener<{ 
      authenticated: boolean;
      privileges?: string[];
      walletAddress?: string;
    }>("authStatus", (data) => {
      if (data) {
        console.log("Received auth status update via WebSocket:", data);
        setIsAuthenticated(data.authenticated);
        
        if (data.privileges) {
          setUserPrivileges(data.privileges);
        }
        
        if (data.walletAddress) {
          setStoredWalletAddress(data.walletAddress);
        }
        
        setIsAuthenticating(false);
        
        // Flag that we've completed an auth check 
        GLOBAL_AUTH_STATE.checkStatusCalled = true;
        GLOBAL_AUTH_STATE.lastCheckTime = Date.now();
        GLOBAL_AUTH_STATE.checkInProgress = false;
        // Track WebSocket activity time
        GLOBAL_AUTH_STATE.lastWebSocketActivity = Date.now();
      }
    });
    
    return () => {
      // Remove this instance from mounted set
      GLOBAL_AUTH_STATE.mountedComponents.delete(instanceId);
      console.log(`Auth component unmounted: ${instanceId}. Remaining: ${GLOBAL_AUTH_STATE.mountedComponents.size}`);
      
      unsubscribe();
    };
  }, [addEventListener, subscribeToGlobal]);

  // Run authentication check on mount and when dependencies change
  useEffect(() => {
    const instanceId = instanceIdRef.current;
    
    // Skip if auth check is already in progress
    if (GLOBAL_AUTH_STATE.checkInProgress) {
      console.log(`Auth check already in progress, skipping from ${instanceId}`);
      return;
    }
    
    // Skip if we've just handled a WebSocket auth update
    if (authCheckSentViaWebSocket.current) {
      console.log(`Auth check already sent via WebSocket, skipping HTTP check from ${instanceId}`);
      return;
    }
    
    // During initial page load, give WebSocket a chance to connect before making HTTP requests
    if (GLOBAL_AUTH_STATE.initialConnectionPhase || GLOBAL_AUTH_STATE.extendedInitialPhase) {
      // If we're in initial phase, log appropriately
      if (GLOBAL_AUTH_STATE.initialConnectionPhase) {
        console.log(`In initial connection phase, waiting for WebSocket before auth check. Instance: ${instanceId}`);
      } else {
        console.log(`In extended initial phase (tokens received via WS), skipping HTTP auth. Instance: ${instanceId}`);
      }
      
      // Only set a timeout to end the initial phase if one isn't already set
      if (!GLOBAL_AUTH_STATE.initialPhaseTimeout) {
        GLOBAL_AUTH_STATE.initialPhaseTimeout = setTimeout(() => {
          console.log("Initial connection phase ended");
          
          // Only end the initial phase if we haven't received tokens via WebSocket
          if (!GLOBAL_AUTH_STATE.tokensReceivedViaWebSocket) {
            GLOBAL_AUTH_STATE.initialConnectionPhase = false;
            
            // If WebSocket is connected, extend the initial phase
            if (wsConnected) {
              console.log("WebSocket is connected, extending initial phase");
              GLOBAL_AUTH_STATE.extendedInitialPhase = true;
              
              // End extended phase after a longer delay
              setTimeout(() => {
                console.log("Extended initial phase ended");
                GLOBAL_AUTH_STATE.extendedInitialPhase = false;
              }, 10000); // 10 second extended phase
            }
          } else {
            // If tokens were received, keep both phases active longer
            console.log("Tokens received via WebSocket, maintaining extended phase");
            GLOBAL_AUTH_STATE.initialConnectionPhase = false;
            GLOBAL_AUTH_STATE.extendedInitialPhase = true;
            
            // End extended phase after a much longer delay
            setTimeout(() => {
              console.log("Extended initial phase ended (after tokens received)");
              GLOBAL_AUTH_STATE.extendedInitialPhase = false;
            }, 30000); // 30 second extended phase when tokens received
          }
        }, 3000); // Initial 3 second phase
      }
      
      // If we received tokens via WebSocket, always skip HTTP auth
      if (GLOBAL_AUTH_STATE.tokensReceivedViaWebSocket) {
        console.log("Tokens received via WebSocket, skipping HTTP auth completely");
        setIsAuthenticating(false);
        return;
      }
      
      // If we already have WebSocket activity, don't make HTTP requests
      const timeSinceLastWSActivity = Date.now() - GLOBAL_AUTH_STATE.lastWebSocketActivity;
      if (GLOBAL_AUTH_STATE.authRequestedViaWebSocket && timeSinceLastWSActivity < 5000) {
        console.log(`Auth already requested via WebSocket ${timeSinceLastWSActivity}ms ago, skipping HTTP check`);
        setIsAuthenticating(false);
        return;
      }
      
      // Skip HTTP checks during this phase unless WebSocket is connected
      if (!wsConnected) {
        setIsAuthenticating(false);
        return;
      }
    }
    
    // Skip if this global flag is already set and we're within cooldown period
    const now = Date.now();
    if (GLOBAL_AUTH_STATE.checkStatusCalled && 
        now - GLOBAL_AUTH_STATE.lastCheckTime < GLOBAL_AUTH_STATE.CHECK_COOLDOWN) {
      console.log(`Auth check already performed within cooldown period. Instance: ${instanceId}`);
      setIsAuthenticating(false);
      return;
    }
    
    // Set check in progress flag
    GLOBAL_AUTH_STATE.checkInProgress = true;
    
    console.log(`Starting auth check from instance ${instanceId}`);
    GLOBAL_AUTH_STATE.checkStatusCalled = true;
    checkAuthStatus().finally(() => {
      GLOBAL_AUTH_STATE.checkInProgress = false;
    });
    
    // If using WebSocket, don't set up polling
    if (wsConnected) {
      console.log(`Using WebSocket for auth status, no polling needed. Instance: ${instanceId}`);
      return;
    }
    
    // Only set up polling from one component instance
    if (GLOBAL_AUTH_STATE.mountedComponents.size > 0 && 
        instanceId !== Array.from(GLOBAL_AUTH_STATE.mountedComponents)[0]) {
      console.log(`Polling already set up by another instance, not duplicating. Instance: ${instanceId}`);
      return;
    }
    
    // Fallback to polling only when WebSocket isn't available
    console.log(`WebSocket not connected, setting up polling for auth status. Instance: ${instanceId}`);
    const interval = setInterval(() => {
      // Only proceed with polling if no WebSocket and not in progress
      if (!wsConnected && !GLOBAL_AUTH_STATE.checkInProgress && 
          !GLOBAL_AUTH_STATE.initialConnectionPhase && !GLOBAL_AUTH_STATE.extendedInitialPhase) {
        console.log(`Polling auth status from instance ${instanceId}...`);
        GLOBAL_AUTH_STATE.checkInProgress = true;
        checkAuthStatus().finally(() => {
          GLOBAL_AUTH_STATE.checkInProgress = false;
        });
      }
    }, 5 * 60 * 1000); // 5 minute polling interval as fallback
    
    return () => {
      clearInterval(interval);
    };
  }, [
    checkAuthStatus,
    publicKey,
    connected,
    wsConnected,
    hasDirectPhantomConnection,
  ]);

  return {
    isAuthenticated,
    isAuthenticating,
    authToken,
    setAuthToken: setAuthTokenWithStorage,
    signOut,
    walletAddress: storedWalletAddress || publicKey?.toString() || null,
    hasWallet: !!(storedWalletAddress || publicKey?.toString()),
    userPrivileges,
    hasPrivilege: (privilege: string) => userPrivileges.includes(privilege),
  };
}
