import { env } from "@/utils/env";
import { useEffect, useRef, useState, useCallback } from "react";
import { GLOBAL_AUTH_STATE } from "./use-authentication";

// Add client ID to global scope
declare global {
  interface Window {
    __wsClientId?: string;
  }
}

// Define the possible WebSocket event types
export type WebSocketEvent =
  | "tokensList"
  | "searchResults"
  | "newToken"
  | "newSwap"
  | "updateToken"
  | "solPriceUpdate"
  | "holdersUpdated"
  | "subscribed" 
  | "joined"
  | "left"
  | "unsubscribed"
  | "authStatus"
  | "tokenMetrics"
  | "tokenData" 
  | "balanceUpdate"
  | "tokenBalanceUpdate";

// Define a handler type for websocket events
export type WebSocketEventHandler = (data: any) => void;

// Interface for token list request parameters
interface TokenListRequest {
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: string;
  timestamp: number;
  received: boolean;
}

// Global connection state
const GLOBAL_STATE = {
  // The actual WebSocket instance
  socket: null as WebSocket | null,
  // Track if socket is connected
  isConnected: false,
  // Track references to the WebSocket to know when to close it
  instanceCount: 0,
  // Track reconnection attempts
  reconnectAttempts: 0,
  // Heartbeat interval to keep connection alive
  heartbeatInterval: null as NodeJS.Timeout | null,
  // Reconnect timeout
  reconnectTimeout: null as NodeJS.Timeout | null,
  // Event handlers for each event type
  eventHandlers: new Map<WebSocketEvent, Set<WebSocketEventHandler>>(),
  // Global subscriptions
  isGlobalSubscribed: false,
  // Token subscriptions
  tokenSubscriptions: new Set<string>(),
  // Connection state listeners
  connectionStateListeners: new Set<(connected: boolean) => void>(),
  // Last message timestamps to prevent duplicates
  lastMessageTimestamps: new Map<string, number>(),
  // Connection cooldown to prevent rapid reconnects  
  connectionCooldown: false,
  // Connection in progress flag
  connectionInProgress: false,
  // SOL price request info
  solPriceRequest: {
    // Last request time
    lastRequest: 0,
    // Cooldown period (reduced from 5 seconds to 3 seconds)
    cooldownPeriod: 3 * 1000,
    // Last received price
    lastPrice: null as number | null,
    // Pending request flag
    pendingRequest: false
  },
  // Track pending token list requests
  pendingTokenRequests: new Map<string, TokenListRequest>(),
  // Active request timeout: How long to consider a request active (15s)
  requestActiveTimeout: 15 * 1000
};

// Constants
const MAX_RECONNECT_ATTEMPTS = 5;
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const MESSAGE_DEDUPLICATION_WINDOW = 500; // 500ms
const CONNECTION_COOLDOWN_PERIOD = 2000; // 2 seconds

// Add a global flag to track mounted components
const MOUNTED_COMPONENTS = new Set<string>();

// Function to update global connection state
const updateConnectionState = (connected: boolean) => {
  // Only update if state actually changed
  if (GLOBAL_STATE.isConnected !== connected) {
    console.log(`WebSocket: Global connection state changed to ${connected}`);
    GLOBAL_STATE.isConnected = connected;
    
    // Notify all listeners
    GLOBAL_STATE.connectionStateListeners.forEach(listener => {
      try {
        listener(connected);
      } catch (error) {
        console.error("WebSocket: Error notifying connection state listener:", error);
      }
    });
  }
};

/**
 * Initialize the WebSocket connection
 */
const initializeSocket = () => {
  // Check if connection is already in progress or in cooldown
  if (GLOBAL_STATE.connectionInProgress || GLOBAL_STATE.connectionCooldown) {
    console.log(`WebSocket: Connection attempt skipped - in progress: ${GLOBAL_STATE.connectionInProgress}, cooldown: ${GLOBAL_STATE.connectionCooldown}`);
    return;
  }
  
  GLOBAL_STATE.connectionInProgress = true;
  
  // Generate a client ID for this browser session if not already generated
  if (!window.__wsClientId) {
    window.__wsClientId = `ws-client-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    console.log(`WebSocket: Generated client ID: ${window.__wsClientId}`);
  }
  
  // Add the client ID as a query parameter
  const clientId = window.__wsClientId;
  const wsUrl = `${env.apiUrl.replace('http', 'ws')}/ws?clientId=${encodeURIComponent(clientId)}`;
  
  try {
    console.log(`WebSocket: Initializing connection to ${wsUrl}`);
    GLOBAL_STATE.socket = new WebSocket(wsUrl);
    
    // Immediately after creating the socket, check if we're still in the CONNECTING state
    // and reset connection state properly
    if (GLOBAL_STATE.socket.readyState === WebSocket.CONNECTING) {
      console.log("WebSocket: Socket in CONNECTING state");
      updateConnectionState(false);
    }
    
    GLOBAL_STATE.socket.onopen = handleOpen;
    GLOBAL_STATE.socket.onmessage = handleMessage;
    GLOBAL_STATE.socket.onclose = handleClose;
    GLOBAL_STATE.socket.onerror = handleError;
  } catch (error) {
    console.error("Error initializing WebSocket:", error);
    GLOBAL_STATE.connectionInProgress = false;
    updateConnectionState(false);
    
    // Set connection cooldown to prevent rapid reconnect attempts
    GLOBAL_STATE.connectionCooldown = true;
    setTimeout(() => {
      GLOBAL_STATE.connectionCooldown = false;
    }, CONNECTION_COOLDOWN_PERIOD);
  }
};

/**
 * Setup a heartbeat to keep the connection alive
 */
const setupHeartbeat = () => {
  // Clear any existing heartbeat
  if (GLOBAL_STATE.heartbeatInterval) {
    clearInterval(GLOBAL_STATE.heartbeatInterval);
  }
  
  // Start a new heartbeat interval
  GLOBAL_STATE.heartbeatInterval = setInterval(() => {
    if (GLOBAL_STATE.socket?.readyState === WebSocket.OPEN) {
      try {
        // Send a ping message that the server will echo back
        GLOBAL_STATE.socket.send(JSON.stringify({
          event: 'ping',
          data: { timestamp: Date.now() }
        }));
      } catch (error) {
        console.error("WebSocket: Error sending heartbeat:", error);
        
        // If we fail to send a heartbeat, try to reconnect
        if (GLOBAL_STATE.socket) {
          GLOBAL_STATE.socket.close();
          GLOBAL_STATE.socket = null;
          initializeSocket();
        }
      }
    }
  }, HEARTBEAT_INTERVAL);
};

/**
 * Clean up heartbeat on disconnection
 */
const clearHeartbeat = () => {
  if (GLOBAL_STATE.heartbeatInterval) {
    clearInterval(GLOBAL_STATE.heartbeatInterval);
    GLOBAL_STATE.heartbeatInterval = null;
  }
};

/**
 * Handle WebSocket open event
 */
const handleOpen = () => {
  console.log("WebSocket: Connected successfully!");
  GLOBAL_STATE.reconnectAttempts = 0;
  GLOBAL_STATE.connectionInProgress = false;
  updateConnectionState(true);
  
  // Setup heartbeat to keep connection alive
  setupHeartbeat();
  
  // Resubscribe to previous subscriptions
  resubscribe();
  
  // Request SOL price if global subscribed
  if (GLOBAL_STATE.isGlobalSubscribed) {
    requestSolPriceInternal();
  }
  
  // Immediately send a ping to verify the connection is truly working
  setTimeout(() => {
    if (canSendMessages()) {
      sendMessageWithDeduplication({
        event: 'ping',
        data: { timestamp: Date.now(), initialCheck: true }
      });
    }
  }, 100);
};

/**
 * Handle WebSocket message event
 */
const handleMessage = (event: MessageEvent) => {
  try {
    const data = JSON.parse(event.data);
    const eventType = data.event;
    
    // Skip logging for ping events to reduce noise
    if (eventType !== "ping") {
      console.log(`WebSocket: Received event "${eventType}"`, data.data);
    }
    
    // Deduplicate messages by checking timestamp
    const messageKey = `${eventType}-${JSON.stringify(data.data)}`;
    const now = Date.now();
    const lastTimestamp = GLOBAL_STATE.lastMessageTimestamps.get(messageKey) || 0;
    
    if (now - lastTimestamp < MESSAGE_DEDUPLICATION_WINDOW) {
      // Skip processing duplicate messages received within the deduplication window
      return;
    }
    
    // Update timestamp for this message
    GLOBAL_STATE.lastMessageTimestamps.set(messageKey, now);
    
    // Handle connection acknowledgment
    if (eventType === "connected") {
      console.log("WebSocket: Server confirmed connection");
    }
    
    // Handle SOL price updates
    if (eventType === "solPriceUpdate" && data.data && data.data.price) {
      // Store the last received price
      const priceValue = data.data.price;
      GLOBAL_STATE.solPriceRequest.lastPrice = priceValue;
      GLOBAL_STATE.solPriceRequest.pendingRequest = false;
      console.log(`WebSocket: Received SOL price update: $${priceValue} (clearing pending flag)`);
      
      // Check if price is stale (older than 5 minutes)
      const fiveMinutes = 5 * 60 * 1000;
      if (now - GLOBAL_STATE.solPriceRequest.lastRequest > fiveMinutes) {
        console.log("WebSocket: SOL price update received after long delay, requesting fresh price");
        // Schedule a new price request to ensure we get fresh data
        setTimeout(() => {
          requestSolPriceInternal();
        }, 5000); // Wait 5 seconds before requesting again
      }
    }
    
    // Handle token list responses - mark the corresponding request as received
    if (eventType === "tokensList" && data.data && data.data.page) {
      // Find the matching request
      const page = data.data.page;
      const limit = data.data.tokens ? data.data.tokens.length : 0;
      
      // Look through pending requests to find a match
      for (const [key, request] of GLOBAL_STATE.pendingTokenRequests.entries()) {
        if (request.page === page) {
          console.log(`WebSocket: Received token list for page ${page} with ${limit} tokens`);
          // Mark as received
          request.received = true;
          // Update the timestamp to prevent immediate cleanup
          request.timestamp = now;
        }
      }
      
      // Set the tokensReceivedViaWebSocket flag in GLOBAL_AUTH_STATE for any tokensList event
      if (GLOBAL_AUTH_STATE) {
        console.log("WebSocket: Setting tokensReceivedViaWebSocket flag to true");
        GLOBAL_AUTH_STATE.tokensReceivedViaWebSocket = true;
        GLOBAL_AUTH_STATE.lastWebSocketActivity = now;
      }
    }
    
    // Process the message with appropriate handlers
    if (eventType && GLOBAL_STATE.eventHandlers.has(eventType as WebSocketEvent)) {
      const handlers = GLOBAL_STATE.eventHandlers.get(eventType as WebSocketEvent);
      handlers?.forEach(handler => handler(data.data));
    }
    
    // Clean up old completed requests
    cleanupTokenRequests();
    
  } catch (error) {
    console.error("Error handling WebSocket message:", error);
  }
};

/**
 * Handle WebSocket close event
 */
const handleClose = (event: CloseEvent) => {
  console.log(`WebSocket: Connection closed with code ${event.code}, reason: ${event.reason}`);
  updateConnectionState(false);
  GLOBAL_STATE.connectionInProgress = false;
  
  // Clean up heartbeat
  clearHeartbeat();
  
  // Set connection cooldown
  GLOBAL_STATE.connectionCooldown = true;
  setTimeout(() => {
    GLOBAL_STATE.connectionCooldown = false;
  }, CONNECTION_COOLDOWN_PERIOD);
  
  // Attempt to reconnect if not manually closed
  if (GLOBAL_STATE.instanceCount > 0 && GLOBAL_STATE.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    GLOBAL_STATE.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, GLOBAL_STATE.reconnectAttempts), 30000);
    console.log(`WebSocket: Reconnecting in ${delay/1000}s (attempt ${GLOBAL_STATE.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
    
    GLOBAL_STATE.reconnectTimeout = setTimeout(() => {
      console.log(`WebSocket: Attempting reconnect #${GLOBAL_STATE.reconnectAttempts}...`);
      initializeSocket();
    }, delay);
  } else if (GLOBAL_STATE.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error(`WebSocket: Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached, giving up.`);
  }
};

/**
 * Handle WebSocket error event
 */
const handleError = (event: Event) => {
  console.error("WebSocket: Error occurred:", event);
  GLOBAL_STATE.connectionInProgress = false;
};

/**
 * Resubscribe to any existing subscriptions after a reconnect
 */
const resubscribe = () => {
  console.log(`WebSocket: Resubscribing to ${GLOBAL_STATE.tokenSubscriptions.size} tokens and global=${GLOBAL_STATE.isGlobalSubscribed}`);
  
  // Resubscribe to tokens
  if (GLOBAL_STATE.tokenSubscriptions.size > 0) {
    GLOBAL_STATE.tokenSubscriptions.forEach(token => {
      if (GLOBAL_STATE.socket?.readyState === WebSocket.OPEN) {
        console.log(`WebSocket: Resubscribing to token ${token}`);
        GLOBAL_STATE.socket.send(JSON.stringify({
          event: "subscribe",
          data: token
        }));
      }
    });
  }
  
  // Resubscribe to global events
  if (GLOBAL_STATE.isGlobalSubscribed) {
    if (GLOBAL_STATE.socket?.readyState === WebSocket.OPEN) {
      console.log(`WebSocket: Resubscribing to global events`);
      GLOBAL_STATE.socket.send(JSON.stringify({
        event: "subscribeGlobal",
        data: null
      }));
    }
  }
};

/**
 * Requests SOL price via WebSocket (internal implementation)
 */
const requestSolPriceInternal = (): boolean => {
  const now = Date.now();
  
  // Skip if already have a pending request or in cooldown
  if (GLOBAL_STATE.solPriceRequest.pendingRequest) {
    console.log("WebSocket: SOL price request already pending, skipping");
    return false;
  }
  
  if (now - GLOBAL_STATE.solPriceRequest.lastRequest < GLOBAL_STATE.solPriceRequest.cooldownPeriod) {
    console.log(`WebSocket: SOL price request in cooldown (${Math.round((now - GLOBAL_STATE.solPriceRequest.lastRequest)/1000)}s elapsed of ${Math.round(GLOBAL_STATE.solPriceRequest.cooldownPeriod/1000)}s cooldown)`);
    return false;
  }
  
  // Update request state
  GLOBAL_STATE.solPriceRequest.lastRequest = now;
  GLOBAL_STATE.solPriceRequest.pendingRequest = true;
  
  // Send the request if connected
  if (GLOBAL_STATE.socket?.readyState === WebSocket.OPEN) {
    try {
      GLOBAL_STATE.socket.send(JSON.stringify({
        event: "getSolPrice",
        data: null
      }));
      console.log("WebSocket: Requested SOL price update");
      
      // Set a timeout to clear the pending flag in case we don't get a response
      setTimeout(() => {
        if (GLOBAL_STATE.solPriceRequest.pendingRequest) {
          console.log("WebSocket: SOL price request timed out, clearing pending flag");
          GLOBAL_STATE.solPriceRequest.pendingRequest = false;
        }
      }, 10000); // 10 second timeout
      
      return true;
    } catch (error) {
      console.error("WebSocket: Error requesting SOL price:", error);
      GLOBAL_STATE.solPriceRequest.pendingRequest = false;
      
      // Try to reconnect as the socket might be in a bad state
      if (GLOBAL_STATE.socket) {
        try {
          GLOBAL_STATE.socket.close();
        } catch (e) {
          // Ignore close errors
        }
        GLOBAL_STATE.socket = null;
        setTimeout(() => {
          console.log("WebSocket: Reconnecting after SOL price request error");
          initializeSocket();
        }, 1000);
      }
      
      return false;
    }
  } else {
    console.warn(`WebSocket: Cannot request SOL price, not connected (readyState: ${GLOBAL_STATE.socket?.readyState})`);
    GLOBAL_STATE.solPriceRequest.pendingRequest = false;
    
    // Try to fix connection state if needed
    if (GLOBAL_STATE.isConnected) {
      console.warn("WebSocket: Connection state mismatch in SOL price request");
      updateConnectionState(false);
      
      // Try to reconnect
      if (!GLOBAL_STATE.connectionInProgress && !GLOBAL_STATE.connectionCooldown) {
        setTimeout(() => {
          console.log("WebSocket: Reconnecting after connection state mismatch in SOL price request");
          initializeSocket();
        }, 1000);
      }
    }
    
    return false;
  }
};

// Check if we can actually send messages
const canSendMessages = () => {
  return GLOBAL_STATE.socket && GLOBAL_STATE.socket.readyState === WebSocket.OPEN;
};

/**
 * Send a message through the WebSocket with deduplication
 */
const sendMessageWithDeduplication = (message: any): boolean => {
  // Generate a key for this message to prevent duplicates
  const messageKey = `${message.event}-${JSON.stringify(message.data)}`;
  const now = Date.now();
  const lastTimestamp = GLOBAL_STATE.lastMessageTimestamps.get(messageKey) || 0;
  
  // Skip sending if the same message was sent recently
  if (now - lastTimestamp < MESSAGE_DEDUPLICATION_WINDOW) {
    console.log(`WebSocket: Skipping duplicate message: ${message.event}`);
    return true; // Return true to indicate "success" (since we're intentionally skipping)
  }
  
  // Update timestamp for this message
  GLOBAL_STATE.lastMessageTimestamps.set(messageKey, now);
  
  if (canSendMessages()) {
    try {
      const messageStr = JSON.stringify(message);
      GLOBAL_STATE.socket!.send(messageStr);
      
      // Skip verbose logging for ping events
      if (message.event !== "ping") {
        console.log(`WebSocket: Sent message: ${message.event}`, message.data);
      }
      return true;
    } catch (error) {
      console.error("WebSocket: Error sending message:", error);
      
      // If we get an error sending, the connection might be dead - reset the connection state
      updateConnectionState(false);
      
      // Try to reconnect if the send failed
      if (GLOBAL_STATE.socket) {
        try {
          GLOBAL_STATE.socket.close();
        } catch (e) {
          // Ignore close errors
        }
        GLOBAL_STATE.socket = null;
        
        // Wait a short time before reconnecting
        setTimeout(() => {
          console.log("WebSocket: Reconnecting after send error");
          initializeSocket();
        }, 1000);
      }
      
      return false;
    }
  } else {
    console.warn(`WebSocket: Cannot send message, socket not open (readyState: ${GLOBAL_STATE.socket?.readyState})`);
    
    // If we think we're connected but can't send, reset the connection state
    if (GLOBAL_STATE.isConnected) {
      console.warn("WebSocket: Connection state mismatch detected - fixing");
      updateConnectionState(false);
      
      // Try to reconnect after a short delay
      if (!GLOBAL_STATE.connectionInProgress && !GLOBAL_STATE.connectionCooldown) {
        setTimeout(() => {
          console.log("WebSocket: Reconnecting after connection state mismatch");
          initializeSocket();
        }, 1000);
      }
    }
    
    return false;
  }
};

/**
 * Clean up old token requests
 */
const cleanupTokenRequests = () => {
  const now = Date.now();
  for (const [key, request] of GLOBAL_STATE.pendingTokenRequests.entries()) {
    // Remove requests that are older than the timeout
    if (now - request.timestamp > GLOBAL_STATE.requestActiveTimeout) {
      GLOBAL_STATE.pendingTokenRequests.delete(key);
    }
  }
};

/**
 * Send token list request via WebSocket
 */
const requestTokenList = (
  page: number,
  limit: number,
  sortBy: string,
  sortOrder: string
): boolean => {
  if (!canSendMessages()) {
    console.log("WebSocket: Cannot request tokens - not connected or socket not ready");
    
    // Check for connection state mismatch and attempt to fix
    if (GLOBAL_STATE.isConnected && GLOBAL_STATE.socket && GLOBAL_STATE.socket.readyState !== WebSocket.OPEN) {
      console.warn("WebSocket: Connection state mismatch detected in requestTokenList - fixing");
      updateConnectionState(false);
      
      // Try to reconnect
      if (!GLOBAL_STATE.connectionInProgress && !GLOBAL_STATE.connectionCooldown) {
        setTimeout(() => {
          console.log("WebSocket: Reconnecting due to state mismatch in requestTokenList");
          if (GLOBAL_STATE.socket) {
            try {
              GLOBAL_STATE.socket.close();
            } catch (e) {
              // Ignore close errors
            }
            GLOBAL_STATE.socket = null;
          }
          initializeSocket();
        }, 1000);
      }
    }
    
    return false;
  }
  
  try {
    // Create a request key
    const requestKey = `tokens-${page}-${limit}-${sortBy}-${sortOrder}`;
    
    // Store the request details
    GLOBAL_STATE.pendingTokenRequests.set(requestKey, {
      page,
      limit,
      sortBy,
      sortOrder,
      timestamp: Date.now(),
      received: false
    });
    
    // Send the request
    const success = sendMessageWithDeduplication({
      event: "getTokens",
      data: {
        page,
        limit,
        sortBy,
        sortOrder
      }
    });
    
    if (success) {
      console.log(`WebSocket: Requested token list for page ${page} (${sortBy}, ${sortOrder})`);
    } else {
      console.error(`WebSocket: Failed to request token list for page ${page}`);
      // Remove the request from pending since it failed
      GLOBAL_STATE.pendingTokenRequests.delete(requestKey);
    }
    
    return success;
  } catch (error) {
    console.error("WebSocket: Error requesting token list:", error);
    return false;
  }
};

/**
 * Check if a token request is active
 */
const isTokenRequestActive = (
  page: number,
  sortBy: string,
  sortOrder: string
): boolean => {
  // Create the request key pattern - the limit might vary
  const requestKeyPattern = `tokens-${page}-`;
  
  // Find any matching request that's still active
  for (const [key, request] of GLOBAL_STATE.pendingTokenRequests.entries()) {
    if (key.startsWith(requestKeyPattern) && 
        request.sortBy === sortBy && 
        request.sortOrder === sortOrder &&
        !request.received &&
        Date.now() - request.timestamp < GLOBAL_STATE.requestActiveTimeout) {
      return true;
    }
  }
  
  return false;
};

/**
 * Manages the WebSocket connection for the application
 * Uses a singleton pattern to ensure only one connection exists
 */
export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const instanceIdRef = useRef<string>(`ws-${Math.random().toString(36).substring(2, 11)}`);
  
  useEffect(() => {
    const instanceId = instanceIdRef.current;
    
    // Only register once per component instance
    if (MOUNTED_COMPONENTS.has(instanceId)) {
      console.log(`WebSocket hook already initialized for instance ${instanceId}`);
      return;
    }
    
    // Mark this instance as mounted
    MOUNTED_COMPONENTS.add(instanceId);
    
    // Register this component as a connection state listener
    GLOBAL_STATE.connectionStateListeners.add(setConnected);
    
    // Increment reference counter
    GLOBAL_STATE.instanceCount++;
    console.log(`WebSocket hook instance created (${instanceId}). Total instances: ${GLOBAL_STATE.instanceCount}`);
    
    // Use a very short delay (or no delay) for first instance to prioritize WebSocket connection
    const isFirstInstance = GLOBAL_STATE.instanceCount === 1 || MOUNTED_COMPONENTS.size === 1;
    
    // Only initialize if there's no existing connection and no pending connection
    if (!GLOBAL_STATE.socket && !GLOBAL_STATE.connectionInProgress && !GLOBAL_STATE.connectionCooldown) {
      // For first instance, use a minimal delay to ensure WebSocket connects ASAP
      const delay = isFirstInstance ? 0 : Math.floor(Math.random() * 50);
      
      setTimeout(() => {
        // Double-check if someone else initiated a connection during our delay
        if (!GLOBAL_STATE.socket && !GLOBAL_STATE.connectionInProgress) {
          console.log(`Init WebSocket from instance ${instanceId}${isFirstInstance ? ' (first instance)' : ''} after ${delay}ms delay`);
          initializeSocket();
        } else {
          console.log(`Connection already in progress, skipping init from ${instanceId}`);
        }
      }, delay);
    } else {
      // Update with current state immediately
      setConnected(GLOBAL_STATE.isConnected);
    }
    
    // Set up a periodic connection verification for this instance
    // First instance will be responsible for checking connection health
    if (isFirstInstance) {
      const verificationInterval = setInterval(() => {
        // Verify connection is truly working
        if (GLOBAL_STATE.isConnected) {
          // Check if socket is actually in OPEN state
          if (!canSendMessages()) {
            console.warn("WebSocket: Connection verification failed - socket not ready despite connected state");
            updateConnectionState(false);
            
            // Try to reconnect
            if (!GLOBAL_STATE.connectionInProgress && !GLOBAL_STATE.connectionCooldown) {
              if (GLOBAL_STATE.socket) {
                try {
                  GLOBAL_STATE.socket.close();
                } catch (e) {
                  // Ignore close errors
                }
                GLOBAL_STATE.socket = null;
              }
              console.log("WebSocket: Reconnecting after verification failure");
              setTimeout(initializeSocket, 1000);
            }
          } else {
            // Send a ping to verify connection
            sendMessageWithDeduplication({
              event: 'ping',
              data: { timestamp: Date.now(), verificationCheck: true }
            });
          }
        } else if (!GLOBAL_STATE.socket && !GLOBAL_STATE.connectionInProgress && !GLOBAL_STATE.connectionCooldown) {
          // If we think we're disconnected and there's no connection attempt, try to connect
          console.log("WebSocket: No active connection detected during verification, attempting to connect");
          initializeSocket();
        }
      }, 30000); // Check every 30 seconds
      
      return () => {
        clearInterval(verificationInterval);
        
        // Remove this instance from mounted set
        MOUNTED_COMPONENTS.delete(instanceId);
        
        // Remove from connection state listeners
        GLOBAL_STATE.connectionStateListeners.delete(setConnected);
        
        // Decrement reference counter
        GLOBAL_STATE.instanceCount--;
        console.log(`WebSocket hook instance destroyed (${instanceId}). Remaining instances: ${GLOBAL_STATE.instanceCount}`);
        
        // Only close the socket when no components are using it
        if (GLOBAL_STATE.instanceCount <= 0) {
          console.log("Closing WebSocket connection as no components are using it");
          if (GLOBAL_STATE.socket) {
            GLOBAL_STATE.socket.close();
            GLOBAL_STATE.socket = null;
          }
          updateConnectionState(false);
          GLOBAL_STATE.instanceCount = 0; // Reset to ensure no negative counts
        }
      };
    }
    
    // Clean up function for non-first instances
    return () => {
      // Remove this instance from mounted set
      MOUNTED_COMPONENTS.delete(instanceId);
      
      // Remove from connection state listeners
      GLOBAL_STATE.connectionStateListeners.delete(setConnected);
      
      // Decrement reference counter
      GLOBAL_STATE.instanceCount--;
      console.log(`WebSocket hook instance destroyed (${instanceId}). Remaining instances: ${GLOBAL_STATE.instanceCount}`);
      
      // Only close the socket when no components are using it
      if (GLOBAL_STATE.instanceCount <= 0) {
        console.log("Closing WebSocket connection as no components are using it");
        if (GLOBAL_STATE.socket) {
          GLOBAL_STATE.socket.close();
          GLOBAL_STATE.socket = null;
        }
        updateConnectionState(false);
        GLOBAL_STATE.instanceCount = 0; // Reset to ensure no negative counts
      }
    };
  }, []);
  
  /**
   * Subscribe to a specific token's events
   */
  const subscribeToToken = useCallback((token: string) => {
    if (!GLOBAL_STATE.socket && !GLOBAL_STATE.connectionInProgress) initializeSocket();
    
    // Skip if already subscribed to this token
    if (GLOBAL_STATE.tokenSubscriptions.has(token)) {
      return true;
    }
    
    // Add to tracked subscriptions
    GLOBAL_STATE.tokenSubscriptions.add(token);
    
    // Only send the message if connected
    if (GLOBAL_STATE.socket?.readyState === WebSocket.OPEN) {
      console.log(`WebSocket: Subscribing to token ${token}`);
      return sendMessageWithDeduplication({
        event: "subscribe",
        data: token
      });
    } else {
      console.log(`WebSocket: Will subscribe to token ${token} when connected`);
      return false;
    }
  }, []);
  
  /**
   * Unsubscribe from a specific token's events
   */
  const unsubscribeFromToken = useCallback((mint: string) => {
    if (!mint) return;
    
    // Skip if not currently subscribed
    if (!GLOBAL_STATE.tokenSubscriptions.has(mint)) {
      return;
    }
    
    GLOBAL_STATE.tokenSubscriptions.delete(mint);
    
    if (GLOBAL_STATE.socket && GLOBAL_STATE.socket.readyState === WebSocket.OPEN) {
      sendMessageWithDeduplication({
        event: 'unsubscribe',
        data: mint
      });
    }
  }, []);
  
  /**
   * Subscribe to global events
   */
  const subscribeToGlobal = useCallback(() => {
    // Skip if already subscribed to global events
    if (GLOBAL_STATE.isGlobalSubscribed) {
      return;
    }
    
    GLOBAL_STATE.isGlobalSubscribed = true;
    
    if (GLOBAL_STATE.socket && GLOBAL_STATE.socket.readyState === WebSocket.OPEN) {
      sendMessageWithDeduplication({
        event: 'subscribeGlobal',
        data: null
      });
      
      // Request SOL price immediately when subscribing to global events
      requestSolPriceInternal();
    }
  }, []);
  
  /**
   * Unsubscribe from global events
   */
  const unsubscribeFromGlobal = useCallback(() => {
    // Skip if not currently subscribed
    if (!GLOBAL_STATE.isGlobalSubscribed) {
      return;
    }
    
    GLOBAL_STATE.isGlobalSubscribed = false;
    
    if (GLOBAL_STATE.socket && GLOBAL_STATE.socket.readyState === WebSocket.OPEN) {
      sendMessageWithDeduplication({
        event: 'unsubscribeGlobal',
        data: null
      });
    }
  }, []);
  
  /**
   * Add an event handler for a specific event type
   */
  const addEventListener = useCallback(<T>(
    event: WebSocketEvent, 
    handler: (data: T) => void
  ): () => void => {
    if (!GLOBAL_STATE.eventHandlers.has(event)) {
      GLOBAL_STATE.eventHandlers.set(event, new Set());
    }
    
    // Cast is safe because we're adding to the set for this event
    const handlers = GLOBAL_STATE.eventHandlers.get(event)!;
    handlers.add(handler as WebSocketEventHandler);
    
    return () => {
      handlers.delete(handler as WebSocketEventHandler);
      if (handlers.size === 0) {
        GLOBAL_STATE.eventHandlers.delete(event);
      }
    };
  }, []);
  
  /**
   * Force close and reconnect the socket
   */
  const reconnect = useCallback(() => {
    if (GLOBAL_STATE.socket) {
      GLOBAL_STATE.socket.close();
      GLOBAL_STATE.socket = null;
      initializeSocket();
    }
  }, []);
  
  /**
   * Send a message through the WebSocket
   */
  const sendMessage = useCallback((message: any): boolean => {
    return sendMessageWithDeduplication(message);
  }, []);
  
  /**
   * Request latest SOL price via WebSocket
   * Returns the last known price immediately if available, and requests an update
   */
  const requestSolPrice = useCallback((): number | null => {
    // Make sure we're subscribed to global events
    if (!GLOBAL_STATE.isGlobalSubscribed) {
      subscribeToGlobal();
    }
    
    // Request update if connected
    if (connected) {
      requestSolPriceInternal();
    }
    
    // Return last known price immediately if available
    return GLOBAL_STATE.solPriceRequest.lastPrice;
  }, [connected, subscribeToGlobal]);
  
  /**
   * Get the last known SOL price without requesting an update
   */
  const getLastSolPrice = useCallback((): number | null => {
    return GLOBAL_STATE.solPriceRequest.lastPrice;
  }, []);
  
  return {
    connected,
    subscribeToToken,
    unsubscribeFromToken,
    subscribeToGlobal,
    unsubscribeFromGlobal,
    addEventListener,
    reconnect,
    sendMessage,
    requestSolPrice,
    getLastSolPrice,
    requestTokenList,
    isTokenRequestActive
  };
}

/**
 * Hook for subscribing to a specific token's events
 */
export function useTokenWebSocket(mint: string | undefined | null) {
  const { 
    connected, 
    subscribeToToken, 
    unsubscribeFromToken, 
    addEventListener 
  } = useWebSocket();
  
  useEffect(() => {
    if (!mint) return;
    
    // Subscribe to this token's events
    subscribeToToken(mint);
    
    // Cleanup function to unsubscribe
    return () => {
      if (mint) {
        unsubscribeFromToken(mint);
      }
    };
  }, [mint, subscribeToToken, unsubscribeFromToken]);
  
  return {
    connected,
    addEventListener,
  };
}

/**
 * Hook for subscribing to global events
 */
export function useGlobalWebSocket() {
  const { 
    connected, 
    subscribeToGlobal, 
    unsubscribeFromGlobal, 
    addEventListener,
    sendMessage,
    requestTokenList,
    isTokenRequestActive
  } = useWebSocket();
  
  useEffect(() => {
    // Subscribe to global events
    subscribeToGlobal();
    
    // Cleanup function to unsubscribe
    return () => {
      unsubscribeFromGlobal();
    };
  }, [subscribeToGlobal, unsubscribeFromGlobal]);
  
  return {
    connected,
    addEventListener,
    sendMessage,
    requestTokenList,
    isTokenRequestActive
  };
} 