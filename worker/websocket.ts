import { DurableObjectState } from "@cloudflare/workers-types/experimental";
import { logger } from "./logger";

// Define a more specific type for our sessions
type CFWebSocket = {
  accept(): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(event: string, handler: (event: any) => void): void;
  readyState: number;
};

// Define the WebSocketPair type structure for the Cloudflare environment
interface CFWebSocketPair {
  0: any; // client
  1: any; // server
}

// WebSocket readyState values
const WebSocketReadyState = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
};

export class WebSocketDO {
  // @ts-ignore
  private state: DurableObjectState;
  private sessions: Map<string, CFWebSocket> = new Map();
  private roomSubscriptions: Map<string, Set<string>> = new Map();
  private clientRooms: Map<string, Set<string>> = new Map();
  private pendingSessions: Map<CFWebSocket, string> = new Map(); // For sessions awaiting identification

  constructor(state: DurableObjectState) {
    this.state = state;
    logger.log("WebSocketDO created");
  }

  // Main entry point for the Durable Object
  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      logger.log(`WebSocketDO handling request: ${path}`);

      // Special internal endpoints for broadcasting to rooms
      if (path === "/broadcast") {
        try {
          const { room, message } = (await request.json()) as {
            room: string;
            message: any;
          };
          logger.log(`Broadcasting to room: ${room}`, message);
          this.broadcastToRoom(room, message);
          return new Response("Message broadcasted", { status: 200 });
        } catch (error) {
          logger.error("Error broadcasting message:", error);
          return new Response("Error broadcasting message", { status: 500 });
        }
      }

      if (path === "/send") {
        try {
          const { clientId, message } = (await request.json()) as {
            clientId: string;
            message: any;
          };

          logger.log(`Sending direct message to client: ${clientId}`, message);
          // Get the session for this client
          const session = this.sessions.get(clientId);
          if (session && session.readyState === WebSocketReadyState.OPEN) {
            try {
              session.send(JSON.stringify(message));
              return new Response("Direct message sent", { status: 200 });
            } catch (error) {
              logger.error(
                `Error sending direct message to ${clientId}:`,
                error,
              );
              // Session might be broken, handle close
              this.handleClose(clientId);
              return new Response(
                "Error sending message - client disconnected",
                { status: 404 },
              );
            }
          } else {
            // Client not found or not connected
            return new Response("Client not found or disconnected", {
              status: 404,
            });
          }
        } catch (error) {
          logger.error("Error sending direct message:", error);
          return new Response("Error sending message", { status: 500 });
        }
      }

      // Handle WebSocket upgrade
      const upgradeHeader = request.headers.get("Upgrade");
      if (!upgradeHeader || upgradeHeader !== "websocket") {
        return new Response("Expected Upgrade: websocket", { status: 426 });
      }

      // Create the WebSocket pair
      // @ts-ignore: WebSocketPair is available in the Cloudflare Workers runtime
      const pair = new WebSocketPair() as CFWebSocketPair;
      const server = pair[1] as CFWebSocket;
      const client = pair[0];

      // Accept the WebSocket connection
      server.accept();
      logger.log("WebSocket connection accepted");

      // Set up event handlers
      server.addEventListener("message", async (event) => {
        try {
          const data = JSON.parse(event.data);
          logger.log("WebSocket message received:", data);

          // Handle client identification
          if (data.type === "identify") {
            const clientId = data.clientId;
            if (clientId) {
              // Get pending session
              const pendingId = this.pendingSessions.get(server);
              if (pendingId) {
                // If this session was already identified, unregister it
                this.handleClose(pendingId);
              }

              // Register this client with its ID
              this.sessions.set(clientId, server);
              this.pendingSessions.delete(server);

              // Create an empty set of rooms for this client
              this.clientRooms.set(clientId, new Set());

              logger.log(`Client ${clientId} connected`);
            }
            return;
          }

          // All other message types require the client to be identified
          const clientId = this.getClientIdForSession(server);
          if (!clientId) {
            server.send(
              JSON.stringify({
                type: "error",
                error: "Not identified. Please send an identify message first.",
              }),
            );
            return;
          }

          // Handle subscription to specific token updates
          if (data.type === "subscribe" && data.token) {
            const token = data.token;
            const room = `token-${token}`;

            // Add client to the token room
            this.addClientToRoom(clientId, room);

            // Send confirmation
            server.send(
              JSON.stringify({
                type: "subscribed",
                token,
              }),
            );

            logger.log(`Client ${clientId} subscribed to token ${token}`);
          }

          // Handle subscription to global updates
          else if (data.type === "subscribeGlobal") {
            // Add client to the global room
            this.addClientToRoom(clientId, "global");

            // Send confirmation
            server.send(
              JSON.stringify({
                type: "subscribedGlobal",
              }),
            );

            logger.log(`Client ${clientId} subscribed to global updates`);
          }

          // Handle unsubscribe requests
          else if (data.type === "unsubscribe" && data.token) {
            const token = data.token;
            const room = `token-${token}`;

            // Remove client from token room
            this.removeClientFromRoom(clientId, room);

            // Send confirmation
            server.send(
              JSON.stringify({
                type: "unsubscribed",
                token,
              }),
            );

            logger.log(`Client ${clientId} unsubscribed from token ${token}`);
          }

          // Handle global unsubscribe
          else if (data.type === "unsubscribeGlobal") {
            // Remove client from global room
            this.removeClientFromRoom(clientId, "global");

            // Send confirmation
            server.send(
              JSON.stringify({
                type: "unsubscribedGlobal",
              }),
            );

            logger.log(`Client ${clientId} unsubscribed from global updates`);
          }

          // Handle unknown message types
          else {
            logger.warn(`Unknown message type: ${data.type}`);
            server.send(
              JSON.stringify({
                type: "error",
                message: `Unknown message type: ${data.type}`,
              }),
            );
          }
        } catch (error) {
          logger.error("Error handling WebSocket message:", error);
          server.send(
            JSON.stringify({
              type: "error",
              message: `Error processing message: ${error.message}`,
            }),
          );
        }
      });

      // Handle WebSocket closure
      server.addEventListener("close", (event) => {
        logger.log("WebSocket closed", event);
        const clientId = this.getClientIdForSession(server);
        if (clientId) {
          this.handleClose(clientId);
        } else {
          // If not identified yet, remove from pending sessions
          this.pendingSessions.delete(server);
        }
      });

      // Handle WebSocket errors
      server.addEventListener("error", (error) => {
        logger.error("WebSocket error:", error);
        // Cleanup will happen in the close handler
      });

      // Add to pending sessions (awaiting identification)
      const tempId = crypto.randomUUID();
      this.pendingSessions.set(server, tempId);
      logger.log(`Added pending session with temp ID: ${tempId}`);

      // Return the response with the client end of the WebSocket
      return new Response(null, {
        status: 101,
        webSocket: client,
      } as ResponseInit & { webSocket: any });
    } catch (error) {
      logger.error("Error in WebSocketDO fetch:", error);
      return new Response(`Internal Error: ${error.message}`, { status: 500 });
    }
  }

  // Get client ID for a session
  private getClientIdForSession(session: CFWebSocket): string | null {
    for (const [clientId, clientSession] of this.sessions.entries()) {
      if (clientSession === session) {
        return clientId;
      }
    }
    return null;
  }

  // Add a client to a room
  private addClientToRoom(clientId: string, room: string): void {
    // Add room to client's subscriptions
    const clientRooms = this.clientRooms.get(clientId) || new Set<string>();
    clientRooms.add(room);
    this.clientRooms.set(clientId, clientRooms);

    // Add client to room's subscribers
    const roomClients = this.roomSubscriptions.get(room) || new Set<string>();
    roomClients.add(clientId);
    this.roomSubscriptions.set(room, roomClients);

    logger.log(`Added client ${clientId} to room ${room}`);
  }

  // Remove a client from a room
  private removeClientFromRoom(clientId: string, room: string): void {
    // Remove room from client's subscriptions
    const clientRooms = this.clientRooms.get(clientId);
    if (clientRooms) {
      clientRooms.delete(room);
    }

    // Remove client from room's subscribers
    const roomClients = this.roomSubscriptions.get(room);
    if (roomClients) {
      roomClients.delete(clientId);
      if (roomClients.size === 0) {
        // If no clients left in room, remove the room
        this.roomSubscriptions.delete(room);
        logger.log(`Removed empty room: ${room}`);
      }
    }

    logger.log(`Removed client ${clientId} from room ${room}`);
  }

  // Clean up resources when a client disconnects
  private handleClose(clientId: string): void {
    // Get all rooms the client was subscribed to
    const clientRooms = this.clientRooms.get(clientId);
    if (clientRooms) {
      // Remove client from all those rooms
      for (const room of clientRooms) {
        const roomClients = this.roomSubscriptions.get(room);
        if (roomClients) {
          roomClients.delete(clientId);
          if (roomClients.size === 0) {
            // If no clients left in room, remove the room
            this.roomSubscriptions.delete(room);
            logger.log(`Removed empty room: ${room}`);
          }
        }
      }

      // Clean up client's room subscriptions
      this.clientRooms.delete(clientId);
    }

    // Remove the session
    this.sessions.delete(clientId);

    logger.log(`Client ${clientId} disconnected and cleaned up`);
  }

  // Broadcast a message to all clients in a room
  private broadcastToRoom(room: string, message: any): void {
    const clients = this.roomSubscriptions.get(room);
    if (!clients || clients.size === 0) {
      logger.log(`No clients in room ${room} to broadcast to`);
      return;
    }

    const messageStr = JSON.stringify(message);
    logger.log(
      `Broadcasting to ${clients.size} clients in room ${room}: ${messageStr}`,
    );

    // Track failed sends to clean up later
    const failedClients: string[] = [];

    for (const clientId of clients) {
      const session = this.sessions.get(clientId);
      if (!session || session.readyState !== WebSocketReadyState.OPEN) {
        // Client no longer connected, mark for cleanup
        failedClients.push(clientId);
        continue;
      }

      try {
        session.send(messageStr);
      } catch (error) {
        logger.error(`Error sending to client ${clientId}:`, error);
        failedClients.push(clientId);
      }
    }

    // Clean up any failed clients
    for (const clientId of failedClients) {
      logger.log(`Cleaning up failed client: ${clientId}`);
      this.handleClose(clientId);
    }
  }
}
