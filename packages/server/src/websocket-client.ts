// WebSocket client for sending messages to connected clients
// This now interacts directly with the in-memory WebSocketManager
// import type { DurableObjectNamespace } from "@cloudflare/workers-types"; // No longer needed
// import { Env } from "./env"; // Env might not be needed if not used for configuration
import { webSocketManager } from './websocket-manager'; // Import the manager instance
import { logger } from "./util";
import { getGlobalRedisCache } from './redis';

export class WebSocketClient {
  // No longer needs Durable Object reference
  // private webSocketDO: DurableObjectNamespace | null = null;

  constructor(/*  - Remove if Env is not used */) {
    // Initialization logic removed - we use the imported singleton manager
    // this.webSocketDO = (env as any).WEBSOCKET_DO || null;
  }

  // Send a message to a specific room (token or global)
  async emit(room: string, event: string, data: any): Promise<void> {
    const redis = await getGlobalRedisCache();
    const formattedRoom = room === "global" ? "global" : room.startsWith("token-") ? room : `token-${room}`;
    const message = JSON.stringify({ room: formattedRoom, event, data });
    await redis.publish("ws:broadcast", message);
  }

  // Send a message to a specific client by ID
  async emitToClient(clientId: string, event: string, data: any): Promise<void> {
    const redis = await getGlobalRedisCache();
    const message = JSON.stringify({ clientId, event, data });
    await redis.publish("ws:direct", message);
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
