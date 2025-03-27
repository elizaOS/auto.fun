// WebSocket client for sending messages to connected clients
// This is a simplified vanilla WebSocket implementation that replaces Socket.io
import type { DurableObjectNamespace } from "@cloudflare/workers-types";
import { Env } from "./env";
import { logger } from "./logger";

// Interface for WebSocket messages
interface WebSocketMessage {
  event: string;
  data: any;
}

// Simple in-memory store for local development
class LocalDevStore {
  private static instance: LocalDevStore;
  private localEvents: Map<string, Set<(data: any) => void>> = new Map();

  private constructor() {}

  static getInstance(): LocalDevStore {
    if (!this.instance) {
      this.instance = new LocalDevStore();
    }
    return this.instance;
  }

  // Emit an event to local listeners
  emit(room: string, event: string, data: any): void {
    const eventKey = `${room}:${event}`;
    logger.log(`[LocalDev] Emitting to ${eventKey}`, data);

    // Store the latest event data for any future listeners
    this.storeEventData(eventKey, data);

    // Notify any active listeners
    const listeners = this.localEvents.get(eventKey) || new Set();
    listeners.forEach((listener) => {
      try {
        listener(data);
      } catch (error) {
        logger.error(`[LocalDev] Error in listener for ${eventKey}:`, error);
      }
    });
  }

  // Listen for events
  on(room: string, event: string, callback: (data: any) => void): void {
    const eventKey = `${room}:${event}`;
    if (!this.localEvents.has(eventKey)) {
      this.localEvents.set(eventKey, new Set());
    }
    this.localEvents.get(eventKey)?.add(callback);

    // If we have stored data for this event, trigger immediately
    const stored = this.getStoredEventData(eventKey);
    if (stored) {
      callback(stored);
    }
  }

  // Remove a listener
  off(room: string, event: string, callback?: (data: any) => void): void {
    const eventKey = `${room}:${event}`;
    if (!callback) {
      this.localEvents.delete(eventKey);
    } else {
      const listeners = this.localEvents.get(eventKey);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.localEvents.delete(eventKey);
        }
      }
    }
  }

  // For development convenience, store the latest event data
  private eventDataStore: Map<string, any> = new Map();

  private storeEventData(eventKey: string, data: any): void {
    this.eventDataStore.set(eventKey, data);
  }

  private getStoredEventData(eventKey: string): any {
    return this.eventDataStore.get(eventKey);
  }
}

export class WebSocketClient {
  private env: Env;
  private webSocketDO: DurableObjectNamespace | null = null;
  private isLocalDev: boolean = false;
  private useMiniflare: boolean = false;
  private localDevStore: LocalDevStore;

  constructor(env: Env) {
    this.env = env;
    this.localDevStore = LocalDevStore.getInstance();

    // Get the WebSocket Durable Object
    this.webSocketDO = (env as any).WEBSOCKET_DO || null;

    // Detect if we're in Miniflare or other local development mode
    this.useMiniflare =
      !!this.webSocketDO &&
      (process.env.NODE_ENV === "development" ||
        (typeof self !== "undefined" && (self as any).MINIFLARE));
    this.isLocalDev = !this.webSocketDO || typeof window !== "undefined";

    if (this.useMiniflare) {
      logger.log("WebSocketClient initialized with Miniflare Durable Object");
    } else if (this.isLocalDev) {
      logger.log(
        "WebSocketClient initialized with in-memory fallback (no Durable Object available)",
      );
    } else if (this.webSocketDO) {
      logger.log("WebSocketClient initialized with Cloudflare Durable Object");
    } else {
      logger.warn(
        "WebSocketClient initialized but no implementation available",
      );
    }
  }

  // Send a message to a specific room (token or global)
  async emit(room: string, event: string, data: any): Promise<void> {
    logger.log(`Emitting to room ${room}, event: ${event}`);

    try {
      // Format room name correctly for both implementations
      // For token room we need to use 'token-{mintAddress}' format
      const formattedRoom =
        room === "global"
          ? "global"
          : room.startsWith("token-")
            ? room
            : `token-${room}`;

      // Use local development store if in local dev mode without Miniflare
      if (this.isLocalDev && !this.useMiniflare) {
        this.localDevStore.emit(formattedRoom, event, data);
        return;
      }

      // Use Durable Object if available (production or Miniflare)
      if (this.webSocketDO) {
        // Get the singleton Durable Object
        const doId = this.webSocketDO.idFromName("singleton");
        const doStub = this.webSocketDO.get(doId);

        // Send the message to the WebSocket Durable Object
        const response = await doStub.fetch("https://internal/broadcast", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            room: formattedRoom,
            event,
            data,
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          logger.error(`Error broadcasting to room ${formattedRoom}: ${error}`);
          throw new Error(
            `Failed to broadcast to room ${formattedRoom}: ${error}`,
          );
        }

        logger.log(`Successfully broadcasted to room ${formattedRoom}`);
      } else {
        logger.error(
          "Cannot emit: No WebSocket Durable Object or local fallback available",
        );
        throw new Error("WebSocket not available");
      }
    } catch (error) {
      if (this.isLocalDev) {
        // In local development, don't throw errors that would break the UI
        logger.warn(
          `Local development: Error emitting to room ${room}:`,
          error,
        );
        return;
      }
      logger.error(`Failed to emit to room ${room}:`, error);
      throw error;
    }
  }

  // Send a message to a specific client by ID
  async emitToClient(
    clientId: string,
    event: string,
    data: any,
  ): Promise<void> {
    logger.log(`Emitting directly to client ${clientId}, event: ${event}`);

    try {
      // In local development mode, we don't track individual clients
      if (this.isLocalDev && !this.useMiniflare) {
        logger.log(
          `[LocalDev] Direct client messaging not supported. Broadcasting to all instead.`,
        );
        // Instead, broadcast to a special room for this client
        this.localDevStore.emit(`client-${clientId}`, event, data);
        return;
      }

      // Use Durable Object if available (production or Miniflare)
      if (this.webSocketDO) {
        // Get the singleton Durable Object
        const doId = this.webSocketDO.idFromName("singleton");
        const doStub = this.webSocketDO.get(doId);

        // Send the message to the specific client
        const response = await doStub.fetch("https://internal/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            clientId,
            event,
            data,
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          logger.error(`Error sending to client ${clientId}: ${error}`);

          if (response.status === 404) {
            throw new Error(`Client ${clientId} not found or disconnected`);
          } else {
            throw new Error(`Error sending to client ${clientId}: ${error}`);
          }
        }

        logger.log(`Successfully sent message to client ${clientId}`);
      } else {
        logger.error(
          "Cannot emit to client: No WebSocket implementation available",
        );
        throw new Error("WebSocket not available");
      }
    } catch (error) {
      if (this.isLocalDev) {
        // In local development, don't throw errors that would break the UI
        logger.warn(
          `Local development: Error emitting to client ${clientId}:`,
          error,
        );
        return;
      }
      logger.error(`Failed to emit to client ${clientId}:`, error);
      throw error;
    }
  }

  // Subscribe to events for a room (local development only)
  on(room: string, event: string, callback: (data: any) => void): void {
    if (this.isLocalDev && !this.useMiniflare) {
      const formattedRoom =
        room === "global"
          ? "global"
          : room.startsWith("token-")
            ? room
            : `token-${room}`;
      this.localDevStore.on(formattedRoom, event, callback);
    } else {
      logger.warn(
        "WebSocketClient.on() is only available in local development mode",
      );
    }
  }

  // Unsubscribe from events for a room (local development only)
  off(room: string, event: string, callback?: (data: any) => void): void {
    if (this.isLocalDev && !this.useMiniflare) {
      const formattedRoom =
        room === "global"
          ? "global"
          : room.startsWith("token-")
            ? room
            : `token-${room}`;
      this.localDevStore.off(formattedRoom, event, callback);
    } else {
      logger.warn(
        "WebSocketClient.off() is only available in local development mode",
      );
    }
  }

  // Helper that returns an object with direct emit method for chaining
  to(room: string) {
    return {
      emit: (event: string, data: any) => this.emit(room, event, data),
    };
  }
}

// Helper function to get websocket client instance
let wsClient: WebSocketClient | null = null;

export function getWebSocketClient(env: Env): WebSocketClient {
  if (!wsClient) {
    wsClient = new WebSocketClient(env);
  }
  return wsClient;
}
