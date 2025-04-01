import { DurableObjectState } from "@cloudflare/workers-types";
import { Env } from "./env";
import { logger } from "./logger";

// Define allowed origins
export const allowedOrigins = [
  "https://api-dev.autofun.workers.dev",
  "https://api.autofun.workers.dev",
  "https://develop.autofun.pages.dev",
  "https://autofun.pages.dev",
  "https://*.autofun.pages.dev",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3420",
  "https://auto.fun",
  "https://dev.auto.fun",
  "*",
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

      case "checkAuthStatus":
        await this.handleAuthStatusCheck(clientId, data);
        break;

      case "getTokens":
        await this.handleGetTokens(clientId, data);
        break;

      case "searchTokens":
        await this.handleSearchTokens(clientId, data);
        break;

      case "tokenMetrics":
        await this.handleTokenMetrics(clientId, data);
        break;

      case "tokenData":
        await this.handleTokenData(clientId, data);
        break;

      case "balanceUpdate":
        await this.handleWalletBalance(clientId, data);
        break;

      case "tokenBalanceUpdate":
        await this.handleTokenBalance(clientId, data);
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

    logger.log(`Client ${clientId} joined room ${roomName}`);
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

    logger.log(`Client ${clientId} left room ${roomName}`);
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
      logger.log(`No clients in room ${roomName}`);
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

    logger.log(
      `Broadcasted ${event} to ${clients.size} clients in room ${roomName}`,
    );
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

  // Handle authentication status check request
  private async handleAuthStatusCheck(
    clientId: string,
    data: any,
  ): Promise<void> {
    try {
      if (!data?.token) {
        return this.sendToClient(clientId, "authStatus", {
          authenticated: false,
          error: "Missing token",
        });
      }

      const token = data.token;

      // Extract wallet address from token
      let walletAddress = null;
      if (token.startsWith("wallet_")) {
        const parts = token.split("_");
        if (parts.length >= 2) {
          walletAddress = parts[1];
        }

        // For wallet-based tokens, we consider them authenticated by default
        // Also add basic user data based on wallet address
        return this.sendToClient(clientId, "authStatus", {
          authenticated: true,
          walletAddress,
          user: {
            address: walletAddress,
            points: 0, // Default value since we don't have actual points data
          },
        });
      }

      // For JWT tokens, make an API call to check authentication
      if (token.includes(".")) {
        // Extract wallet address from JWT
        try {
          const parts = token.split(".");
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            walletAddress = payload.sub || payload.walletAddress || null;
          }
        } catch (e) {
          logger.error("Error extracting wallet address from JWT:", e);
        }

        try {
          // Call auth-status API using environment variables
          const response = await fetch(
            `${this.env.VITE_API_URL}/api/auth-status`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          );

          if (response.ok) {
            const responseData = await response.json();

            // Forward all data from the API, including user data if present
            return this.sendToClient(clientId, "authStatus", {
              authenticated: responseData.authenticated,
              privileges: responseData.privileges || [],
              walletAddress: walletAddress || responseData.user?.address,
              user: responseData.user,
            });
          } else {
            return this.sendToClient(clientId, "authStatus", {
              authenticated: false,
              error: `Auth check failed: ${response.status}`,
            });
          }
        } catch (error) {
          logger.error("Error checking auth status:", error);
          return this.sendToClient(clientId, "authStatus", {
            authenticated: false,
            error: "Internal error checking auth status",
          });
        }
      }

      // Default response for unknown token format
      return this.sendToClient(clientId, "authStatus", {
        authenticated: false,
        error: "Invalid token format",
      });
    } catch (error) {
      logger.error("Error in handleAuthStatusCheck:", error);
      return this.sendToClient(clientId, "authStatus", {
        authenticated: false,
        error: "Server error processing auth check",
      });
    }
  }

  // Send a message to a specific client
  private sendToClient(clientId: string, event: string, data: any): void {
    const client = this.sessions.get(clientId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ event, data }));
    }
  }

  // Handle tokens request
  private async handleGetTokens(clientId: string, data: any): Promise<void> {
    try {
      // Validate required parameters
      const page = data?.page || 1;
      const limit = data?.limit || 12;
      const sortBy = data?.sortBy || "createdAt";
      const sortOrder = data?.sortOrder || "desc";

      // Construct API URL with query parameters
      const url = new URL(`${this.env.VITE_API_URL}/api/tokens`);
      url.searchParams.append("page", page.toString());
      url.searchParams.append("limit", limit.toString());
      url.searchParams.append("sortBy", sortBy);
      url.searchParams.append("sortOrder", sortOrder);

      try {
        // Fetch token data from API
        const response = await fetch(url.toString());

        if (response.ok) {
          const tokenData = await response.json();
          return this.sendToClient(clientId, "tokensList", tokenData);
        } else {
          return this.sendToClient(clientId, "tokensList", {
            error: `Failed to fetch tokens: ${response.status}`,
            tokens: [],
          });
        }
      } catch (error) {
        logger.error("Error fetching tokens:", error);
        return this.sendToClient(clientId, "tokensList", {
          error: "Internal error fetching tokens",
          tokens: [],
        });
      }
    } catch (error) {
      logger.error("Error in handleGetTokens:", error);
      return this.sendToClient(clientId, "tokensList", {
        error: "Server error processing token request",
        tokens: [],
      });
    }
  }

  // Handle token search request
  private async handleSearchTokens(clientId: string, data: any): Promise<void> {
    try {
      // Validate required parameters
      const searchQuery = data?.search || "";

      // Log the search request for debugging
      logger.log(
        `WebSocket search request from client ${clientId}: "${searchQuery}"`,
      );

      // If search is empty, return empty results
      if (!searchQuery.trim()) {
        return this.sendToClient(clientId, "searchResults", { tokens: [] });
      }

      // Construct API URL with search parameter
      const url = new URL(`${this.env.VITE_API_URL}/api/tokens/search`);
      url.searchParams.append("search", searchQuery);

      try {
        // Fetch search results from API with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url.toString(), {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const searchData = await response.json();
          logger.log(
            `Search results for "${searchQuery}": found ${searchData.tokens?.length || 0} tokens`,
          );
          return this.sendToClient(clientId, "searchResults", searchData);
        } else {
          logger.error(`Error searching tokens: ${response.status}`);
          return this.sendToClient(clientId, "searchResults", {
            error: `Failed to search tokens: ${response.status}`,
            tokens: [],
          });
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(`Error fetching search results: ${errorMessage}`);

        return this.sendToClient(clientId, "searchResults", {
          error: `Error searching tokens: ${errorMessage}`,
          tokens: [],
        });
      }
    } catch (error) {
      logger.error("Error in handleSearchTokens:", error);
      return this.sendToClient(clientId, "searchResults", {
        error: "Server error processing search request",
        tokens: [],
      });
    }
  }

  // Handle request for token market metrics
  private async handleTokenMetrics(clientId: string, data: any): Promise<void> {
    try {
      if (!data?.mint) {
        return this.sendToClient(clientId, "tokenMetrics", {
          error: "Missing token mint address",
          data: null,
        });
      }

      const mint = data.mint;
      logger.log(`WebSocket request for token metrics: ${mint}`);

      try {
        // Call the API to get token metrics
        const url = new URL(
          `${this.env.VITE_API_URL}/api/token/${mint}/metrics`,
        );

        const response = await fetch(url.toString());

        if (response.ok) {
          const metricsData = await response.json();
          logger.log(`Token metrics for ${mint} fetched successfully`);
          return this.sendToClient(clientId, "tokenMetrics", {
            mint,
            data: metricsData,
          });
        } else {
          logger.error(`Error fetching token metrics: ${response.status}`);
          return this.sendToClient(clientId, "tokenMetrics", {
            mint,
            error: `Failed to fetch metrics: ${response.status}`,
            data: null,
          });
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(`Error fetching token metrics: ${errorMessage}`);

        return this.sendToClient(clientId, "tokenMetrics", {
          mint,
          error: `Error fetching metrics: ${errorMessage}`,
          data: null,
        });
      }
    } catch (error) {
      logger.error("Error in handleTokenMetrics:", error);
      return this.sendToClient(clientId, "tokenMetrics", {
        error: "Server error processing metrics request",
        data: null,
      });
    }
  }

  // Handle request for token data (e.g., complete token info)
  private async handleTokenData(clientId: string, data: any): Promise<void> {
    try {
      if (!data?.mint) {
        return this.sendToClient(clientId, "tokenData", {
          error: "Missing token mint address",
          data: null,
        });
      }

      const mint = data.mint;
      const bypassCache = data.bypassCache === true;

      logger.log(
        `WebSocket request for token data: ${mint} (bypass cache: ${bypassCache})`,
      );

      try {
        // Call the API to get token data
        const url = new URL(`${this.env.VITE_API_URL}/api/token/${mint}`);
        if (bypassCache) {
          url.searchParams.append("bypass_cache", "true");
        }

        const response = await fetch(url.toString());

        if (response.ok) {
          const tokenData = await response.json();
          logger.log(`Token data for ${mint} fetched successfully`);
          return this.sendToClient(clientId, "tokenData", {
            mint,
            data: tokenData,
          });
        } else {
          logger.error(`Error fetching token data: ${response.status}`);
          return this.sendToClient(clientId, "tokenData", {
            mint,
            error: `Failed to fetch token data: ${response.status}`,
            data: null,
          });
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(`Error fetching token data: ${errorMessage}`);

        return this.sendToClient(clientId, "tokenData", {
          mint,
          error: `Error fetching token data: ${errorMessage}`,
          data: null,
        });
      }
    } catch (error) {
      logger.error("Error in handleTokenData:", error);
      return this.sendToClient(clientId, "tokenData", {
        error: "Server error processing token data request",
        data: null,
      });
    }
  }

  // Handle request for wallet balance
  private async handleWalletBalance(
    clientId: string,
    data: any,
  ): Promise<void> {
    try {
      if (!data?.address) {
        return this.sendToClient(clientId, "balanceUpdate", {
          error: "Missing wallet address",
          balance: 0,
        });
      }

      const address = data.address;
      logger.log(`WebSocket request for wallet balance: ${address}`);

      try {
        // Call the API to get wallet balance
        const url = new URL(
          `${this.env.VITE_API_URL}/api/wallet/${address}/balance`,
        );

        const response = await fetch(url.toString());

        if (response.ok) {
          const balanceData = await response.json();
          logger.log(
            `Balance for ${address} fetched successfully: ${balanceData.balance}`,
          );
          return this.sendToClient(clientId, "balanceUpdate", {
            address,
            balance: balanceData.balance,
            timestamp: Date.now(),
          });
        } else {
          logger.error(`Error fetching wallet balance: ${response.status}`);
          return this.sendToClient(clientId, "balanceUpdate", {
            address,
            error: `Failed to fetch balance: ${response.status}`,
            balance: 0,
          });
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(`Error fetching wallet balance: ${errorMessage}`);

        return this.sendToClient(clientId, "balanceUpdate", {
          address,
          error: `Error fetching balance: ${errorMessage}`,
          balance: 0,
        });
      }
    } catch (error) {
      logger.error("Error in handleWalletBalance:", error);
      return this.sendToClient(clientId, "balanceUpdate", {
        error: "Server error processing balance request",
        balance: 0,
      });
    }
  }

  // Handle request for token balance
  private async handleTokenBalance(clientId: string, data: any): Promise<void> {
    try {
      if (!data?.address || !data?.mint) {
        return this.sendToClient(clientId, "tokenBalanceUpdate", {
          error: "Missing required parameters (address or mint)",
          balance: 0,
        });
      }

      const address = data.address;
      const mint = data.mint;

      logger.log(
        `WebSocket request for token balance: ${mint} for wallet ${address}`,
      );

      try {
        // Call the API to get token balance
        const url = new URL(
          `${this.env.VITE_API_URL}/api/wallet/${address}/token/${mint}`,
        );

        const response = await fetch(url.toString());

        if (response.ok) {
          const balanceData = await response.json();
          logger.log(
            `Token balance for ${mint} (owner ${address}) fetched successfully: ${balanceData.balance}`,
          );
          return this.sendToClient(clientId, "tokenBalanceUpdate", {
            address,
            mint,
            balance: balanceData.balance,
            timestamp: Date.now(),
          });
        } else {
          logger.error(`Error fetching token balance: ${response.status}`);
          return this.sendToClient(clientId, "tokenBalanceUpdate", {
            address,
            mint,
            error: `Failed to fetch token balance: ${response.status}`,
            balance: 0,
          });
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(`Error fetching token balance: ${errorMessage}`);

        return this.sendToClient(clientId, "tokenBalanceUpdate", {
          address,
          mint,
          error: `Error fetching token balance: ${errorMessage}`,
          balance: 0,
        });
      }
    } catch (error) {
      logger.error("Error in handleTokenBalance:", error);
      return this.sendToClient(clientId, "tokenBalanceUpdate", {
        error: "Server error processing token balance request",
        balance: 0,
      });
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
