// WebSocket client for sending messages to connected clients
// This replaces the Socket.io server implementation
import type { DurableObjectNamespace } from "@cloudflare/workers-types";
import { Env } from "./env";
import { logger } from "./logger";

// Messages to send via WebSocket
interface WebSocketMessage {
  event: string;
  data: any;
}

export class WebSocketClient {
  private env: Env;
  private socketActor: DurableObjectNamespace | null = null;
  private legacyNamespace: DurableObjectNamespace | null = null;

  constructor(env: Env) {
    this.env = env;

    // Use socketActor if available, otherwise fall back to legacy WEBSOCKET_DO
    this.socketActor = (env as any).socketActor || null;
    this.legacyNamespace = (env as any).WEBSOCKET_DO || null;

    if (!this.socketActor && !this.legacyNamespace) {
      logger.warn(
        "WebSocketClient initialized but no socket namespace is available",
      );
    } else {
      logger.log(
        "WebSocketClient initialized with " +
          (this.socketActor ? "socketActor" : "legacy WEBSOCKET_DO"),
      );
    }
  }

  // Send a message to a specific room (token or global)
  async emit(room: string, event: string, data: any): Promise<void> {
    const message: WebSocketMessage = { event, data };
    logger.log(`Emitting to room ${room}, event: ${event}`, data);

    try {
      if (this.socketActor) {
        // Use socket.io implementation
        const doId = this.socketActor.idFromName("singleton");
        const doStub = this.socketActor.get(doId);

        // Format room name correctly for socket.io compatibility
        // For token room we need to use 'token-{mintAddress}' format
        const socketRoom =
          room === "global"
            ? "global"
            : room.startsWith("token-")
              ? room
              : `token-${room}`;

        // Send the message to the Socket.IO actor
        const response = await doStub.fetch(
          "https://internal/internal/broadcast",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              room: socketRoom,
              event,
              data,
            }),
          },
        );

        if (!response.ok) {
          const error = await response.text();
          logger.error(`Error broadcasting to room ${socketRoom}: ${error}`);
        } else {
          logger.log(`Successfully broadcasted to room ${socketRoom}`);
        }
      } else if (this.legacyNamespace) {
        // Use legacy implementation
        const doId = this.legacyNamespace.idFromName("singleton");
        const doStub = this.legacyNamespace.get(doId);

        // Format room name for legacy implementation
        const legacyRoom =
          room === "global"
            ? "global"
            : room.startsWith("token-")
              ? room
              : `token-${room}`;

        // Send the message to the legacy DO
        const response = await doStub.fetch("https://internal/broadcast", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            room: legacyRoom,
            message: {
              event,
              data,
            },
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          logger.error(`Error broadcasting to room ${legacyRoom}: ${error}`);
        } else {
          logger.log(
            `Successfully broadcasted to room ${legacyRoom} with legacy DO`,
          );
        }
      } else {
        logger.error("Cannot emit: No socket namespace available");
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
      if (this.socketActor) {
        // Use socket.io implementation
        const doId = this.socketActor.idFromName("singleton");
        const doStub = this.socketActor.get(doId);

        // Send the message to the Socket.IO actor targeting the specific client
        const response = await doStub.fetch("https://internal/internal/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ clientId, event, data }),
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
      } else if (this.legacyNamespace) {
        // Use legacy implementation
        const doId = this.legacyNamespace.idFromName("singleton");
        const doStub = this.legacyNamespace.get(doId);

        // Send the message to the legacy DO targeting the specific client
        const response = await doStub.fetch("https://internal/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            clientId,
            message: {
              event,
              data,
            },
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
        } else {
          logger.log(
            `Successfully sent message to client ${clientId} with legacy DO`,
          );
        }
      } else {
        logger.error("Cannot emit to client: No socket namespace available");
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
