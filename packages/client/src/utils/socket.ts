import { env } from "./env";

// Custom WebSocket wrapper to maintain Socket.io-like API
class SocketWrapper {
  private ws: WebSocket | null = null;
  private eventHandlers: Record<string, Array<(data: unknown) => void>> = {};
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = Infinity;
  private reconnectInterval = 1000;
  private maxReconnectInterval = 5000;
  private reconnecting = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionPromise: Promise<void> | null = null;
  private connectionResolve: (() => void) | null = null;
  // Queue for messages that need to be sent when connection is established
  private messageQueue: Array<{ event: string; data?: unknown }> = [];
  // Store the client ID received from the server
  private clientId: string | null = null;

  constructor(url: string) {
    this.url = url;
    this.connect();
  }

  private connect(): void {
    /**
     * TODO: update as necessary once backend socket implementation is finalized
     */
    if (this.ws?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    // Create a connection promise that will be resolved when the connection is open
    this.connectionPromise = new Promise<void>((resolve) => {
      this.connectionResolve = resolve;
    });

    const wsUrl =
      (this.url.startsWith("https")
        ? this.url.replace(/^https/, "wss")
        : this.url.replace(/^http/, "ws")) + "/ws";

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      // Reset reconnection state on successful connection
      this.reconnectAttempts = 0;
      this.reconnecting = false;
      this.triggerEvent("connect", {});

      // Process any queued messages
      if (this.messageQueue.length > 0) {
        this.processQueue();
      }

      if (this.connectionResolve) {
        this.connectionResolve();
        this.connectionResolve = null;
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const { event: eventName, data } = JSON.parse(event.data);

        // Handle server pings
        if (eventName === 'ping') {
          // Respond immediately
          this.emit('pong'); // Use emit to handle queuing/connection state
          return; // Don't process ping further
        }

        // Listen for the clientId event specifically
        if (eventName === "clientId" && typeof data === "string") {
          console.log("Received client ID:", data);
          this.clientId = data;
          // Process queue again in case messages were waiting for clientId
          this.processQueue();
        } else {
          // Trigger other event handlers
          this.triggerEvent(eventName, data);
        }
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };

    this.ws.onclose = (event) => {
      // Don't attempt to reconnect if disconnect() was called
      if (this.ws === null) return;

      // Clear client ID on disconnect
      this.clientId = null;
      this.triggerEvent("disconnect", {
        reason: "io server disconnect",
        code: event.code,
      });

      // Attempt to reconnect unless this was a normal closure
      if (event.code !== 1000) {
        this.attemptReconnect();
      }
    };

    this.ws.onerror = (error) => {
      this.triggerEvent("error", error);
    };
  }

  private attemptReconnect(): void {
    if (this.reconnecting) return;

    this.reconnecting = true;
    this.triggerEvent("reconnecting", { attempt: this.reconnectAttempts + 1 });

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      // Calculate delay with exponential backoff, but cap at maxReconnectInterval
      const delay = Math.min(
        this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts),
        this.maxReconnectInterval,
      );

      this.reconnectTimer = setTimeout(() => {
        this.reconnectAttempts++;
        this.connect();
      }, delay);
    } else {
      this.triggerEvent("reconnect_failed", {});
      this.reconnecting = false;
    }
  }

  private triggerEvent(event: string, data: unknown): void {
    const handlers = this.eventHandlers[event] || [];
    handlers.forEach((handler) => handler(data));
  }

  on = (event: string, callback: (data: unknown) => void): this => {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(callback);
    return this;
  };

  off = (event: string, callback?: (data: unknown) => void): this => {
    if (!callback) {
      delete this.eventHandlers[event];
    } else if (this.eventHandlers[event]) {
      this.eventHandlers[event] = this.eventHandlers[event].filter(
        (handler) => handler !== callback,
      );
    }
    return this;
  };

  private processQueue = (): void => {
    // Only process queue if connected AND we have a client ID
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.clientId) {
      this.messageQueue.forEach((msg) => {
        // Add clientId to the message before sending
        const messageToSend = { ...msg, clientId: this.clientId };
        this.ws?.send(JSON.stringify(messageToSend));
      });
      this.messageQueue = [];
    }
  };

  emit = async (event: string, data?: unknown): Promise<this> => {
    // Always queue the message first
    this.messageQueue.push({ event, data });

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // If connected and have clientId, try processing queue immediately
      if (this.clientId) {
        this.processQueue();
      } else {
        // Waiting for clientId event
      }
    } else if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      // Connection is in progress, wait for open and clientId
      if (this.connectionPromise) {
        try {
          await this.connectionPromise;
          // Connection opened, clientId might arrive soon, queue is fine
        } catch (error) {
          // Error connecting, queue remains
        }
      }
    } else {
      // Socket is closed or closing, attempt reconnect (queue remains)
      this.connect();
    }
    return this;
  };

  disconnect = (): void => {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Clear client ID on disconnect
    this.clientId = null;

    // Clear any pending reconnection attempts
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnecting = false;
    this.connectionPromise = null;
    this.connectionResolve = null;
  };
}

// Create a type that matches the Socket.io Socket interface
type Socket = SocketWrapper;

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    // Get apiUrl from environment and ensure it's defined
    const apiUrl = env.apiUrl;
    if (!apiUrl) {
      throw new Error(
        "Client environment variable 'apiUrl' is not defined. Please set it in your client environment (e.g., .env file).",
      );
    }
    // Pass the guaranteed string to the constructor
    socket = new SocketWrapper(apiUrl);
  }
  return socket;
};
