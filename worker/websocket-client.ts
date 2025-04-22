// WebSocket client for sending messages to connected clients
// This is a simplified vanilla WebSocket implementation that replaces Socket.io
import type { DurableObjectNamespace } from "@cloudflare/workers-types";
import { Env } from "./env";
import { logger } from "./util";
import { crypto } from "@cloudflare/workers-types";

export class WebSocketClient {
  private webSocketDO: DurableObjectNamespace | null = null;

  constructor(env: Env) {
    // Get the WebSocket Durable Object
    this.webSocketDO = (env as any).WEBSOCKET_DO || null;
  }

  // Send a message to a specific room (token or global)
  async emit(room: string, event: string, data: any): Promise<void> {
    try {
      // Format room name correctly for both implementations
      // For token room we need to use 'token-{mintAddress}' format
      const formattedRoom =
        room === "global"
          ? "global"
          : room.startsWith("token-")
            ? room
            : `token-${room}`;

      // Use Durable Object if available (production or Miniflare)
      if (this.webSocketDO) {
        // Get the singleton Durable Object
        const doId = this.webSocketDO.idFromName("singleton");
        const doStub = this.webSocketDO.get(doId);

        // Send the message to the WebSocket Durable Object
        const url = "https://internal/broadcast";
        const payloadObj = { room: formattedRoom, event, data };
        const serialized = JSON.stringify(payloadObj);
        const MAX_SIZE = 131072;
        if (serialized.length <= MAX_SIZE) {
          const response = await doStub.fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: serialized,
          });
          if (!response.ok) {
            const error = await response.text();
            logger.error(`Error broadcasting to room ${formattedRoom}: ${error}`);
            throw new Error(`Failed to broadcast to room ${formattedRoom}: ${error}`);
          }
        } else {
          const messageId = crypto.randomUUID();
          const chunkSize = MAX_SIZE - 1024;
          const totalChunks = Math.ceil(serialized.length / chunkSize);
          for (let i = 0; i < totalChunks; i++) {
            const chunk = serialized.slice(i * chunkSize, (i + 1) * chunkSize);
            const response = await doStub.fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Chunk-Index": i.toString(),
                "X-Total-Chunks": totalChunks.toString(),
                "X-Message-Id": messageId,
              },
              body: chunk,
            });
            if (!response.ok) {
              const error = await response.text();
              logger.error(`Error broadcasting chunk ${i} to room ${formattedRoom}: ${error}`);
              throw new Error(`Failed to broadcast chunk ${i} to room ${formattedRoom}: ${error}`);
            }
          }
        }
      } else {
        logger.error("Cannot emit: No WebSocket Durable Object available");
        throw new Error("WebSocket not available");
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
    try {
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
      } else {
        logger.error(
          "Cannot emit to client: No WebSocket implementation available",
        );
        throw new Error("WebSocket not available");
      }
    } catch (error) {
      logger.error(`Failed to emit to client ${clientId}:`, error);
      throw error;
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
