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
        ? this.url.replace(/^https/, "ws")
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
        this.triggerEvent(eventName, data);
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };

    this.ws.onclose = (event) => {
      // Don't attempt to reconnect if disconnect() was called
      if (this.ws === null) return;

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
        this.maxReconnectInterval
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
        (handler) => handler !== callback
      );
    }
    return this;
  };

  private processQueue = (): void => {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.messageQueue.forEach((msg) => {
        this.ws?.send(JSON.stringify(msg));
      });
      this.messageQueue = [];
    }
  };

  emit = async (event: string, data?: unknown): Promise<this> => {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, data }));
    } else if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      // Wait for the connection to open before sending the message
      if (this.connectionPromise) {
        try {
          await this.connectionPromise;
          // Now the connection should be open, try to send again
          return this.emit(event, data);
        } catch (error) {
          // If there's an error waiting for the connection, queue the message
          this.messageQueue.push({ event, data });
        }
      } else {
        // No connection promise, queue the message
        this.messageQueue.push({ event, data });
      }
    } else {
      // Socket is closed or closing, reconnect and queue the message
      this.messageQueue.push({ event, data });
      this.connect();
    }
    return this;
  };

  disconnect = (): void => {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

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
    socket = new SocketWrapper(env.apiUrl);
  }
  return socket;
};
