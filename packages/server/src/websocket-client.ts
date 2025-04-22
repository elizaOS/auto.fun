// WebSocket client for sending messages to connected clients
// This now interacts directly with the in-memory WebSocketManager
// import type { DurableObjectNamespace } from "@cloudflare/workers-types"; // No longer needed
// import { Env } from "./env"; // Env might not be needed if not used for configuration
import { webSocketManager } from './websocket-manager'; // Import the manager instance
import { logger } from "./util";

export class WebSocketClient {
  // No longer needs Durable Object reference
  // private webSocketDO: DurableObjectNamespace | null = null;

  constructor(/*  - Remove if Env is not used */) {
    // Initialization logic removed - we use the imported singleton manager
    // this.webSocketDO = (env as any).WEBSOCKET_DO || null;
  }

  // Send a message to a specific room (token or global)
  async emit(room: string, event: string, data: any): Promise<void> {
    try {
      const formattedRoom =
        room === "global"
          ? "global"
          : room.startsWith("token-")
            ? room
            : `token-${room}`;

      // Directly call the manager's broadcast method
      webSocketManager.broadcastToRoom(formattedRoom, event, data);
      // No need to handle chunking here, ws library handles message sizes

    } catch (error) {
      logger.error(`Failed to emit to room ${room}:`, error);
      // Re-throw or handle as appropriate for the caller
      throw error;
    }
  }

  // Send a message to a specific client by ID
  async emitToClient(
    clientId: string,
    event: string,
    data: any,
  ): Promise<boolean> { // Return boolean indicating success
    try {
       // Directly call the manager's send method
      const success = webSocketManager.sendToClient(clientId, event, data);
      if (!success) {
          // Log or handle the failure case if needed
          logger.warn(`EmitToClient failed for client ${clientId} (likely disconnected)`);
      }
      return success;

    } catch (error) {
      logger.error(`Failed to emit to client ${clientId}:`, error);
      // Re-throw or handle as appropriate for the caller
      // Consider returning false on error
      return false;
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
// Since WebSocketClient now just wraps the singleton manager,
// we might not even need this class/function anymore.
// Code using getWebSocketClient() could potentially just import webSocketManager directly.
// However, keeping it maintains the existing interface.
let wsClient: WebSocketClient | null = null;

export function getWebSocketClient(): WebSocketClient {
  if (!wsClient) {
    wsClient = new WebSocketClient();
  }
  return wsClient;
}
