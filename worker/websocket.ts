import { DurableObjectState } from "@cloudflare/workers-types";
import { Env } from "./env";
import { logger } from "./logger";

// Define allowed origins
export const allowedOrigins = [
  "https://api-dev.autofun.workers.dev",
  "https://api.autofun.workers.dev",
  "https://develop.auto-fun.pages.dev",
  "https://auto-fun.pages.dev",
  "https://develop.autofun.pages.dev",
  "https://autofun.pages.dev",
  "https://*.auto-fun.pages.dev",
  "https://develop.autofun.pages.dev",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3420",
  "https://auto.fun",
  "https://*.auto.fun",
  "https://dev.auto.fun",
  "https://api.auto.fun",
  "https://api-dev.auto.fun",
  "https://fix-develop-create.auto-fun.pages.dev",
];

// Define a custom WebSocket type that includes CloudflareWebSocket functionality
interface CloudflareWebSocket extends WebSocket {
  accept(): void;
}

// Define a WebSocketPair interface for Cloudflare
interface WebSocketPair {
  0: CloudflareWebSocket;
  1: CloudflareWebSocket;
}

/**
 * Main WebSocket Durable Object
 * Handles connections, rooms, and message broadcasting
 */
export class WebSocketDO {
  private state: DurableObjectState;
  private env: Env;
  private sessions: Map<string, CloudflareWebSocket> = new Map();
  private rooms: Map<string, Set<string>> = new Map();
  private clientRooms: Map<string, Set<string>> = new Map();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;

    // Set up storage for state that needs to persist
    state.blockConcurrencyWhile(async () => {
      // Load any persisted data - rooms, client mappings, etc.
      const storedRooms = (await state.storage.get("rooms")) as
        | Map<string, string[]>
        | undefined;
      if (storedRooms) {
        // Convert stored format back to runtime format
        for (const [roomName, clientIds] of storedRooms.entries()) {
          this.rooms.set(roomName, new Set(clientIds));
        }
      }

      const storedClientRooms = (await state.storage.get("clientRooms")) as
        | Map<string, string[]>
        | undefined;
      if (storedClientRooms) {
        // Convert stored format back to runtime format
        for (const [clientId, roomNames] of storedClientRooms.entries()) {
          this.clientRooms.set(clientId, new Set(roomNames));
        }
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Add CORS headers to all responses
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
      "Access-Control-Allow-Credentials": "true",
    };

    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // WebSocket upgrade endpoint
    if (path === "/ws" && request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocketUpgrade(request);
    }

    // Internal broadcast API
    if (path === "/broadcast") {
      return this.handleBroadcast(request);
    }

    // Direct client messaging API
    if (path === "/send") {
      return this.handleDirectMessage(request);
    }

    // Return 404 for unknown endpoints
    return new Response("Not found", {
      status: 404,
      headers: corsHeaders,
    });
  }

  // Handle WebSocket upgrades
  private handleWebSocketUpgrade(request: Request): Response {
    // Extract client ID from query params or generate one
    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId") || crypto.randomUUID();

    // Create a new WebSocketPair - we need to access Cloudflare's proprietary API
    // This is available in the global scope in Cloudflare Workers
    const pair = (self as any).WebSocketPair
      ? new (self as any).WebSocketPair()
      : {};

    // Get the server and client sides
    const server = pair[1] as CloudflareWebSocket;
    const client = pair[0] as CloudflareWebSocket;

    // Accept the connection on the server side
    server.accept();

    // Add client to sessions
    this.sessions.set(clientId, server);

    // Set up client room tracking
    this.clientRooms.set(clientId, new Set());

    // Handle messages from this client
    server.addEventListener("message", async (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data as string);
        await this.handleClientMessage(clientId, message);
      } catch (err) {
        logger.error("Error handling WebSocket message:", err);
      }
    });

    // Handle client disconnection
    server.addEventListener("close", () => {
      this.handleClientDisconnect(clientId);
    });

    // Handle WebSocket errors
    server.addEventListener("error", (err: Event) => {
      logger.error(`WebSocket error for client ${clientId}:`, err);
      this.handleClientDisconnect(clientId);
    });

    // Return the client end of the WebSocket
    return new Response(null, {
      status: 101,
      // Use non-standard Cloudflare-specific property
      webSocket: client,
    } as ResponseInit & { webSocket: CloudflareWebSocket });
  }

  // Handle client-to-server messages
  private async handleClientMessage(
    clientId: string,
    message: any,
  ): Promise<void> {
    if (!message || !message.event) return;

    const { event, data } = message;

    switch (event) {
      case "join":
        if (data?.room) {
          await this.joinRoom(clientId, data.room);
        }
        break;

      case "leave":
        if (data?.room) {
          await this.leaveRoom(clientId, data.room);
        }
        break;

      case "subscribe":
        if (data) {
          await this.joinRoom(clientId, `token-${data}`);
        }
        break;

      case "unsubscribe":
        if (data) {
          await this.leaveRoom(clientId, `token-${data}`);
        }
        break;

      case "subscribeGlobal":
        await this.joinRoom(clientId, "global");
        break;

      case "unsubscribeGlobal":
        await this.leaveRoom(clientId, "global");
        break;

      default:
        // Forward messages to appropriate rooms
        if (data?.room) {
          await this.broadcastToRoom(data.room, event, data, clientId);
        }
    }
  }

  // Join a client to a room
  private async joinRoom(clientId: string, roomName: string): Promise<void> {
    // Create room if it doesn't exist
    if (!this.rooms.has(roomName)) {
      this.rooms.set(roomName, new Set());
    }

    // Add client to room
    this.rooms.get(roomName)?.add(clientId);

    // Track room for client
    if (!this.clientRooms.has(clientId)) {
      this.clientRooms.set(clientId, new Set());
    }
    this.clientRooms.get(clientId)?.add(roomName);

    // Persist room data
    await this.persistRoomData();

    // Send confirmation to client
    const client = this.sessions.get(clientId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          event: roomName.startsWith("token-") ? "subscribed" : "joined",
          data: { room: roomName },
        }),
      );
    }
  }

  // Remove a client from a room
  private async leaveRoom(clientId: string, roomName: string): Promise<void> {
    // Remove client from room
    this.rooms.get(roomName)?.delete(clientId);

    // If room is empty, delete it
    if (this.rooms.get(roomName)?.size === 0) {
      this.rooms.delete(roomName);
    }

    // Remove room from client tracking
    this.clientRooms.get(clientId)?.delete(roomName);

    // Persist room data
    await this.persistRoomData();

    // Send confirmation to client
    const client = this.sessions.get(clientId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          event: roomName.startsWith("token-") ? "unsubscribed" : "left",
          data: { room: roomName },
        }),
      );
    }
  }

  // Handle client disconnection
  private async handleClientDisconnect(clientId: string): Promise<void> {
    // Get all rooms this client was in
    const roomNames = this.clientRooms.get(clientId) || new Set();

    // Remove client from all rooms
    for (const roomName of roomNames) {
      this.rooms.get(roomName)?.delete(clientId);

      // If room is empty, delete it
      if (this.rooms.get(roomName)?.size === 0) {
        this.rooms.delete(roomName);
      }
    }

    // Remove client from tracking
    this.sessions.delete(clientId);
    this.clientRooms.delete(clientId);

    // Persist room data
    await this.persistRoomData();

    logger.log(`Client ${clientId} disconnected`);
  }

  // Persist room data to storage
  private async persistRoomData(): Promise<void> {
    // Convert rooms to a format suitable for storage
    const storedRooms = new Map<string, string[]>();
    for (const [roomName, clients] of this.rooms.entries()) {
      storedRooms.set(roomName, Array.from(clients));
    }

    // Convert client rooms to a format suitable for storage
    const storedClientRooms = new Map<string, string[]>();
    for (const [clientId, rooms] of this.clientRooms.entries()) {
      storedClientRooms.set(clientId, Array.from(rooms));
    }

    // Store the data
    await this.state.storage.put("rooms", storedRooms);
    await this.state.storage.put("clientRooms", storedClientRooms);
  }

  // Handle broadcasting messages to a room
  private async broadcastToRoom(
    roomName: string,
    event: string,
    data: any,
    excludeClientId?: string,
  ): Promise<void> {
    const message = JSON.stringify({ event, data });
    const clients = this.rooms.get(roomName);

    if (!clients || clients.size === 0) {
      return;
    }

    // Send message to all clients in the room except the sender
    for (const clientId of clients) {
      if (excludeClientId && clientId === excludeClientId) continue;

      const client = this.sessions.get(clientId);
      if (client && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  // Handle HTTP POST requests to broadcast messages
  private async handleBroadcast(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      const { room, event, data } = (await request.json()) as {
        room: string;
        event: string;
        data: any;
      };

      if (!room || !event) {
        return new Response("Missing required fields", { status: 400 });
      }

      await this.broadcastToRoom(room, event, data);

      return new Response(
        JSON.stringify({
          success: true,
          message: `Broadcast to ${room} successful`,
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      logger.error("Error broadcasting message:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to broadcast message",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  // Handle direct messaging to a specific client
  private async handleDirectMessage(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      const { clientId, event, data } = (await request.json()) as {
        clientId: string;
        event: string;
        data: any;
      };

      if (!clientId || !event) {
        return new Response("Missing required fields", { status: 400 });
      }

      const client = this.sessions.get(clientId);
      if (!client || client.readyState !== WebSocket.OPEN) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Client not found or disconnected",
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      client.send(JSON.stringify({ event, data }));

      return new Response(
        JSON.stringify({
          success: true,
          message: `Message sent to client ${clientId}`,
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      logger.error("Error sending direct message:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to send message",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }
}

// Function to create a test swap object for testing
export function createTestSwap(tokenId: string, userAddress?: string): any {
  return {
    id: crypto.randomUUID(),
    tokenMint: tokenId,
    user: userAddress || "DvmXXp4tSXYwZJhM5HjtEUvQ6SfxwkA7daE1jQgCX1ri",
    direction: 0, // Buy
    amountIn: 2500000000, // 2.5 SOL
    amountOut: 10000000, // 10 tokens
    price: 0.00025,
    txId: `test-tx-${Date.now()}`,
    timestamp: new Date().toISOString(),
  };
}
