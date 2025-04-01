import { env } from "@/utils/env";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState, useCallback } from "react";
import { fetchWithAuth, GLOBAL_AUTH_STATE } from "./use-authentication";
import { useWebSocket } from "./use-websocket";

interface User {
  address: string;
  points: number;
  solBalance?: number;
}

interface AuthStatus {
  authenticated: boolean;
  user?: User;
  privileges?: string[];
}

export function useUser() {
  const { publicKey } = useWallet();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const { 
    connected: wsConnected, 
    sendMessage, 
    addEventListener 
  } = useWebSocket();

  // Fetch user data via WebSocket or HTTP fallback
  const fetchUser = useCallback(async () => {
    if (!publicKey) {
      setUser(null);
      return;
    }

    setIsLoading(true);
    
    try {
      // Try to get auth token from storage
      let token = null;
      
      // Try to read the enhanced wallet auth data first
      try {
        const walletAuthStr = localStorage.getItem("walletAuth");
        if (walletAuthStr) {
          const walletAuthData = JSON.parse(walletAuthStr);
          if (walletAuthData && walletAuthData.token) {
            token = walletAuthData.token;
          }
        }

        // Fallback to regular authToken storage
        if (!token) {
          const storedAuthToken = localStorage.getItem("authToken");
          if (storedAuthToken) {
            token = JSON.parse(storedAuthToken);
          }
        }
      } catch (storageError) {
        console.error("Error accessing localStorage:", storageError);
      }
      
      if (!token) {
        console.log("No auth token found, cannot fetch user data");
        setUser(null);
        setIsLoading(false);
        return;
      }
      
      // Try WebSocket first if connected
      if (wsConnected && sendMessage) {
        console.log("Using WebSocket to fetch user data");
        
        // Track WebSocket activity 
        if (GLOBAL_AUTH_STATE) {
          GLOBAL_AUTH_STATE.lastWebSocketActivity = Date.now();
        }
        
        const sent = sendMessage({
          event: "checkAuthStatus",
          data: { token }
        });
        
        if (sent) {
          console.log("Auth status check sent via WebSocket");
          // Wait for WebSocket response via the event listener
          // We'll set loading to false there
          return;
        } else {
          console.log("WebSocket send failed, falling back to HTTP");
        }
      }
      
      // HTTP Fallback if WebSocket is not available or failed
      console.log("Fetching user data with HTTP fallback...");
      
      const response = await fetchWithAuth(`${env.apiUrl}/api/auth-status`, {
        method: "GET",
      });

      if (response.ok) {
        const data = (await response.json()) as AuthStatus;
        console.log("Auth status HTTP response:", data);

        if (data.authenticated && data.user) {
          console.log("User authenticated, setting user data");
          setUser(data.user);
        } else {
          console.log("User not authenticated or no user data");
          setUser(null);
        }
      } else {
        console.error("Error response from auth-status:", response.status);
        setUser(null);
      }
    } catch (error) {
      console.error("Error fetching user:", error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, wsConnected, sendMessage]);

  // Set up WebSocket listener for auth status updates
  useEffect(() => {
    if (!addEventListener) return;
    
    const unsubscribe = addEventListener<{
      authenticated: boolean;
      user?: User;
      privileges?: string[];
    }>("authStatus", (data) => {
      console.log("Received auth status update via WebSocket in useUser:", data);
      
      if (data.authenticated && data.user) {
        console.log("User data received via WebSocket:", data.user);
        setUser(data.user);
      } else {
        setUser(null);
      }
      
      setIsLoading(false);
      
      // Track WebSocket activity
      if (GLOBAL_AUTH_STATE) {
        GLOBAL_AUTH_STATE.lastWebSocketActivity = Date.now();
      }
    });
    
    return () => {
      unsubscribe();
    };
  }, [addEventListener]);

  // Fetch user data when publicKey changes
  useEffect(() => {
    fetchUser();
  }, [publicKey, fetchUser]);

  return { user, isLoading, refreshUser: fetchUser };
}
