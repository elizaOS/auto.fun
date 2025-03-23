// WebSocket client for sending messages to connected clients
// This replaces the Socket.io server implementation
import { DurableObjectNamespace } from "@cloudflare/workers-types/experimental";
import { Env } from "./env";
import { logger } from "./logger";

interface WebSocketMessage {
  event: string;
  data: any;
}

export class WebSocketClient {
  private env: Env;
  private namespace: DurableObjectNamespace;

  constructor(env: Env) {
    this.env = env;
    // The WebSocketDO is the Durable Object that manages all WebSocket connections
    this.namespace = env.WEBSOCKET_DO;
    logger.log("WebSocketClient initialized");
  }

  // Send a message to a specific room (token or global)
  async emit(room: string, event: string, data: any): Promise<void> {
    const message: WebSocketMessage = { event, data };
    logger.log(`Emitting to room ${room}, event: ${event}`, data);

    try {
      // Get the DO for this room
      const doId = this.namespace.idFromName(room);
      const doStub = this.namespace.get(doId);

      // Send the message to the DO which will forward to all clients in the room
      const response = await doStub.fetch("https://internal/broadcast", {
        method: "POST",
        body: JSON.stringify({ room, message }),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error(`Error broadcasting to room ${room}: ${error}`);
      } else {
        logger.log(`Successfully broadcasted to room ${room}`);
      }
    } catch (error) {
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
    const message: WebSocketMessage = { event, data };
    logger.log(
      `Emitting directly to client ${clientId}, event: ${event}`,
      data,
    );

    try {
      // Get the DO based on client ID
      // We use the same DO namespace but with the clientId as the key
      const doId = this.namespace.idFromName(clientId);
      const doStub = this.namespace.get(doId);

      // Send the message to the DO targeting the specific client
      const response = await doStub.fetch("https://internal/send", {
        method: "POST",
        body: JSON.stringify({ clientId, message }),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error(`Error sending to client ${clientId}: ${error}`);

        if (response.status === 404) {
          throw new Error(`Client ${clientId} not found or disconnected`);
        } else {
          throw new Error(`Error sending to client ${clientId}: ${error}`);
        }
      } else {
        logger.log(`Successfully sent message to client ${clientId}`);
      }
    } catch (error) {
      logger.error(`Failed to emit to client ${clientId}:`, error);
      throw error;
    }
  }

  // Helper that returns an object with direct emit method
  // This eliminates the need for await when chaining
  to(room: string) {
    return {
      emit: (event: string, data: any) => this.emit(room, event, data),
    };
  }
}

// Helper function to get websocket client instance
let wsClient: WebSocketClient | null = null;

export function getWebSocketClient(env: Env): WebSocketClient {
  if (!wsClient || !(wsClient instanceof WebSocketClient)) {
    wsClient = new WebSocketClient(env);
  }
  return wsClient;
}
