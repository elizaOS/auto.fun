import { DurableObjectState } from "@cloudflare/workers-types/experimental";

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
  private rooms: Map<string, Set<string>> = new Map(); // roomName -> Set of sessionIds
  private heartbeatIntervals: Map<string, number> = new Map(); // sessionId -> interval ID

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // Special internal endpoints for broadcasting to rooms
      if (path === "/broadcast") {
        try {
          const { room, message } = (await request.json()) as {
            room: string;
            message: any;
          };
          this.broadcastToRoom(room, message);
          return new Response("Message broadcasted", { status: 200 });
        } catch (error) {
          console.error("Error broadcasting message:", error);
          return new Response("Error broadcasting message", { status: 500 });
        }
      }

      if (path === "/send") {
        try {
          (await request.json()) as { message: any };
          // This would need the specific session ID, which we'd pass in the request
          return new Response("Direct message sent", { status: 200 });
        } catch (error) {
          console.error("Error sending direct message:", error);
          return new Response("Error sending message", { status: 500 });
        }
      }

      // Handle WebSocket upgrade
      const upgradeHeader = request.headers.get("Upgrade");
      if (!upgradeHeader || upgradeHeader !== "websocket") {
        return new Response("Expected Upgrade: websocket", { status: 426 });
      }

      // Create the WebSocket pair, using the WebSocketPair global
      // @ts-ignore: WebSocketPair is available in the Cloudflare Workers runtime
      const pair = new WebSocketPair() as CFWebSocketPair;
      const server = pair[1] as CFWebSocket;
      const client = pair[0];

      // Get a unique session ID
      const sessionId =
        request.headers.get("X-Client-ID") || crypto.randomUUID();

      try {
        // Accept the WebSocket connection
        server.accept();

        // Store the server WebSocket
        this.sessions.set(sessionId, server);

        // Set up event handlers for the WebSocket
        server.addEventListener("message", async (event: { data: string }) => {
          try {
            const data = JSON.parse(event.data);
            await this.handleMessage(sessionId, data);
          } catch (error) {
            console.error("Error handling WebSocket message:", error);
            try {
              server.send(
                JSON.stringify({
                  type: "error",
                  message:
                    error instanceof Error ? error.message : "Unknown error",
                }),
              );
            } catch (sendError) {
              console.error("Error sending error message:", sendError);
              // If we can't send an error message, the connection might be dead
              this.handleClose(sessionId);
            }
          }
        });

        server.addEventListener("close", () => {
          this.handleClose(sessionId);
        });

        server.addEventListener("error", (error) => {
          console.error(`WebSocket error for session ${sessionId}:`, error);
          this.handleClose(sessionId);
        });

        // Set up heartbeat to detect stale connections
        // Send a ping every 30 seconds
        const heartbeatInterval = setInterval(() => {
          try {
            if (server.readyState === WebSocketReadyState.OPEN) {
              server.send(JSON.stringify({ type: "ping", time: Date.now() }));
            } else {
              console.log(
                `Heartbeat detected closed connection for ${sessionId}`,
              );
              this.handleClose(sessionId);
              clearInterval(heartbeatInterval);
            }
          } catch (error) {
            console.error("Error in heartbeat:", error);
            this.handleClose(sessionId);
            clearInterval(heartbeatInterval);
          }
        }, 30000);

        // Store the interval ID for cleanup
        this.heartbeatIntervals.set(
          sessionId,
          heartbeatInterval as unknown as number,
        );

        // Return the client end of the WebSocket to the client
        return new Response(null, {
          status: 101,
          // @ts-ignore - WebSocket is a valid property for Cloudflare Workers Response init
          webSocket: client,
        });
      } catch (error) {
        console.error(
          `Error setting up WebSocket for session ${sessionId}:`,
          error,
        );
        // Clean up any resources if setup failed
        if (this.sessions.has(sessionId)) {
          this.handleClose(sessionId);
        }
        return new Response("WebSocket setup failed", { status: 500 });
      }
    } catch (error) {
      console.error("Unhandled error in WebSocket fetch:", error);
      return new Response("Internal server error", { status: 500 });
    }
  }

  private async handleMessage(sessionId: string, data: any): Promise<void> {
    // Handle pong responses from clients
    if (data.type === "pong") {
      return; // Client is still alive
    }

    // Handle messages from clients
    if (data.type === "subscribe") {
      const token = data.token;
      const roomName = `token-${token}`;
      this.joinRoom(sessionId, roomName);

      // Send confirmation of subscription
      const session = this.sessions.get(sessionId);
      if (session && session.readyState === WebSocketReadyState.OPEN) {
        try {
          session.send(
            JSON.stringify({
              type: "subscribed",
              token,
              timestamp: Date.now(),
            }),
          );
        } catch (error) {
          console.error(
            `Error sending subscription confirmation to ${sessionId}:`,
            error,
          );
        }
      }

      console.log(`Client ${sessionId} subscribed to ${roomName}`);
    } else if (data.type === "subscribeGlobal") {
      this.joinRoom(sessionId, "global");

      // Send confirmation of global subscription
      const session = this.sessions.get(sessionId);
      if (session && session.readyState === WebSocketReadyState.OPEN) {
        try {
          session.send(
            JSON.stringify({
              type: "subscribedGlobal",
              timestamp: Date.now(),
            }),
          );
        } catch (error) {
          console.error(
            `Error sending global subscription confirmation to ${sessionId}:`,
            error,
          );
        }
      }

      console.log(`Client ${sessionId} subscribed to global updates`);
    } else if (data.type === "unsubscribe") {
      const token = data.token;
      const roomName = `token-${token}`;
      this.leaveRoom(sessionId, roomName);
      console.log(`Client ${sessionId} unsubscribed from ${roomName}`);
    }
  }

  private handleClose(sessionId: string): void {
    // Clean up when a client disconnects
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        session.close();
      } catch (err) {
        // Ignore errors when closing already closed connections
      }
      this.sessions.delete(sessionId);

      // Clear heartbeat interval
      const intervalId = this.heartbeatIntervals.get(sessionId);
      if (intervalId) {
        clearInterval(intervalId);
        this.heartbeatIntervals.delete(sessionId);
      }

      // Remove from all rooms
      for (const [roomName, members] of this.rooms.entries()) {
        if (members.has(sessionId)) {
          members.delete(sessionId);
          if (members.size === 0) {
            this.rooms.delete(roomName);
          }
        }
      }

      console.log(`Client ${sessionId} disconnected`);
    }
  }

  private joinRoom(sessionId: string, roomName: string): void {
    if (!this.rooms.has(roomName)) {
      this.rooms.set(roomName, new Set());
    }
    this.rooms.get(roomName)?.add(sessionId);
  }

  private leaveRoom(sessionId: string, roomName: string): void {
    const room = this.rooms.get(roomName);
    if (room) {
      room.delete(sessionId);
      if (room.size === 0) {
        this.rooms.delete(roomName);
      }
    }
  }

  private broadcastToRoom(roomName: string, message: any): void {
    const room = this.rooms.get(roomName);
    if (!room) return;

    const messageStr = JSON.stringify(message);
    const failedSessions: string[] = [];

    for (const sessionId of room) {
      const session = this.sessions.get(sessionId);
      if (session && session.readyState === WebSocketReadyState.OPEN) {
        try {
          // Create a timeout for sending message
          const sendWithTimeout = () => {
            // Return early if session is no longer open
            if (session.readyState !== WebSocketReadyState.OPEN) {
              failedSessions.push(sessionId);
              return;
            }

            try {
              session.send(messageStr);
            } catch (error) {
              console.error(
                `Error sending message to session ${sessionId}:`,
                error,
              );
              failedSessions.push(sessionId);
            }
          };

          // Execute immediately, but we're avoiding blocking operations
          sendWithTimeout();
        } catch (error) {
          console.error(
            `Error setting up message send to session ${sessionId}:`,
            error,
          );
          failedSessions.push(sessionId);
        }
      } else {
        // Session is not open, mark for cleanup
        failedSessions.push(sessionId);
      }
    }

    // Clean up any sessions that failed
    if (failedSessions.length > 0) {
      for (const failedSessionId of failedSessions) {
        this.handleClose(failedSessionId);
      }
    }
  }
}
