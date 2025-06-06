import { v4 as uuidv4 } from "uuid";
import type { RedisCacheService } from "./redis";
import { logger } from "./util";
// Import the correct type from Hono
import type { WSContext } from "hono/ws";
import { getGlobalRedisCache } from "./redis";

// Interface for our client metadata, not extending WSContext
interface ClientMetadata {
  clientId: string;
  isAlive: boolean;
  rooms: Set<string>;
  ws: WSContext; // Reference to the Hono WebSocket context
}

class WebSocketManager {
  // Maps clientId to our metadata object
  private clients: Map<string, ClientMetadata> = new Map();
  // Local cache of room -> Set<clientId> (for efficient local broadcasting)
  private localRoomClients: Map<string, Set<string>> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  redisCache: RedisCacheService | null = null;

  // --- Redis Key Helper ---
  private async redisKey(rawKey: string): Promise<string> {
    if (!this.redisCache) {
      this.redisCache = await getGlobalRedisCache();
    }
    return this.redisCache.getKey(rawKey);
  }

  // --- Initialization ---
  async initialize(redisCache: RedisCacheService): Promise<void> {
    if (this.redisCache) return;
    this.redisCache = redisCache;

    // Listen for cross-cluster pub/sub
    const subClient = await this.redisCache.redisPool.getSubscriberClient();
    await subClient.subscribe("ws:broadcast");
    await subClient.subscribe("ws:direct");

    subClient.on("message", (ch, message) => {
      // logger.info(`📣 Received Redis message on ${ch}:`, message);
      const { clientId, room, event, data } = JSON.parse(message as string);
      if (room) {
        this.broadcastToRoom(room, event, data);
      }
      if (clientId) {
        this.sendToClient(clientId, event, data);
      }
    });

    logger.info("WebSocketManager Redis pub/sub listeners registered.");
    this.startHeartbeat();
  }

  // --- Connection Handling (Called by Hono route/adapter) ---
  public handleConnectionOpen(ws: WSContext): void {
    const clientId = uuidv4();
    const clientMetadata: ClientMetadata = {
      clientId,
      ws, // Store the context object
      isAlive: true,
      rooms: new Set(),
    };
    this.clients.set(clientId, clientMetadata);

    logger.log(`Client connected: ${clientId}`);
    try {
      clientMetadata.ws.send(
        JSON.stringify({ event: "clientId", data: clientId })
      );
    } catch (error) {
      logger.error(`Failed to send clientId to ${clientId}:`, error);
      this.handleConnectionClose(ws);
    }
  }

  // --- Message Handling (Called by Hono route/adapter or event listener) ---
  public async handleMessage(
    ws: WSContext,
    messageData: string | ArrayBuffer | Blob
  ): Promise<void> {
    if (!this.redisCache) {
      this.redisCache = await getGlobalRedisCache();
    }
    let parsedMessage: any;
    let clientIdFromMessage: string | undefined; // Variable to store clientId from payload
    let messageString: string = "(unable to convert messageData to string)";
    try {
      // Convert message data to string for JSON parsing
      if (typeof messageData === "string") {
        messageString = messageData;
      } else if (messageData instanceof ArrayBuffer) {
        messageString = Buffer.from(messageData).toString();
      } else if (messageData instanceof Blob) {
        messageString = await messageData.text();
      } else {
        logger.warn(
          `Unhandled message data type from unknown origin:`,
          typeof messageData
        );
        return;
      }
      parsedMessage = JSON.parse(messageString);
      // Extract clientId from the parsed message
      clientIdFromMessage = parsedMessage?.clientId;
    } catch (error) {
      logger.error(`Failed to parse message: ${messageString}`, error);
      return;
    }

    if (!clientIdFromMessage) {
      logger.warn(`Message received without clientId:`, parsedMessage);
      return;
    }

    const clientMetadata = this.clients.get(clientIdFromMessage);
    if (!clientMetadata) {
      logger.warn(
        `Message received for unknown clientId: ${clientIdFromMessage}`,
        parsedMessage
      );
      return;
    }

    clientMetadata.isAlive = true; // Got message, must be alive

    if (!this.redisCache) {
      logger.error(
        `Redis cache not available in handleMessage for client ${clientIdFromMessage}`
      );
      return;
    }
    if (!parsedMessage || !parsedMessage.event) {
      logger.warn(
        `Invalid message structure received from ${clientIdFromMessage}:`,
        parsedMessage
      );
      return;
    }

    const { event, data } = parsedMessage;
    logger.log(`Received message from ${clientMetadata.clientId}:`, {
      event,
      data,
    });

    try {
      switch (event) {
        case "join":
        case "leave":
        case "subscribe":
        case "unsubscribe":
        case "subscribeGlobal":
        case "unsubscribeGlobal":
        case "subscribeToChat":
        case "unsubscribeFromChat":
          await this.handleRoomEvent(clientMetadata, event, data);
          break;
        case "pong":
          // Heartbeat handled by isAlive flag set above
          break;
        default:
          logger.warn(
            `Unhandled event type '${event}' from client ${clientMetadata.clientId}`
          );
      }
    } catch (error) {
      logger.error(
        `Error handling message event '${event}' for client ${clientMetadata.clientId}:`,
        error
      );
      try {
        clientMetadata.ws.send(
          JSON.stringify({
            event: "error",
            data: `Failed to process event ${event}`,
          })
        );
      } catch (sendError) {
        logger.warn(
          `Failed to send error message back to client ${clientMetadata.clientId}`,
          sendError
        );
      }
    }
  }

  // Helper for room events to avoid repetition
  private async handleRoomEvent(
    client: ClientMetadata,
    event: string,
    data: any
  ): Promise<void> {
    if (!this.redisCache) {
      this.redisCache = await getGlobalRedisCache();
    }
    let roomName: string | undefined;
    let operation: "join" | "leave";

    switch (event) {
      case "join":
        if (data?.room && typeof data.room === "string") roomName = data.room;
        operation = "join";
        break;
      case "leave":
        if (data?.room && typeof data.room === "string") roomName = data.room;
        operation = "leave";
        break;
      case "subscribe":
        if (data && typeof data === "string") roomName = `token-${data}`;
        operation = "join"; // Subscribe maps to join
        break;
      case "unsubscribe":
        if (data && typeof data === "string") roomName = `token-${data}`;
        operation = "leave"; // Unsubscribe maps to leave
        break;
      case "subscribeGlobal":
        roomName = "global";
        operation = "join";
        break;
      case "unsubscribeGlobal":
        roomName = "global";
        operation = "leave";
        break;
      case "subscribeToChat":
        if (
          data?.tokenMint &&
          data?.tier &&
          typeof data.tokenMint === "string" &&
          typeof data.tier === "string"
        ) {
          roomName = `chat:${data.tokenMint}:${data.tier}`;
        }
        operation = "join";
        break;
      case "unsubscribeFromChat":
        if (
          data?.tokenMint &&
          data?.tier &&
          typeof data.tokenMint === "string" &&
          typeof data.tier === "string"
        ) {
          roomName = `chat:${data.tokenMint}:${data.tier}`;
        }
        operation = "leave";
        break;
      default: // Should not happen if called correctly
        logger.error("Invalid event type passed to handleRoomEvent");
        return;
    }

    if (roomName) {
      if (operation === "join") {
        await this.joinRoom(event, client, roomName);
      } else {
        await this.leaveRoom(event, client, roomName);
      }
    } else {
      logger.warn(
        `Invalid format for event '${event}' from ${client.clientId}:`,
        data
      );
    }
  }

  // --- Close/Error Handling (Called by Hono route/adapter) ---
  public handleConnectionClose(ws: WSContext): void {
    // Iterate to find the clientId associated with the closing ws context
    let clientIdToCleanup: string | null = null;
    for (const [id, metadata] of this.clients.entries()) {
      if (metadata.ws === ws) {
        clientIdToCleanup = id;
        break;
      }
    }

    if (clientIdToCleanup) {
      logger.log(`Client disconnected: ${clientIdToCleanup}`);
      // Pass only clientId for cleanup
      this.performClientCleanup(clientIdToCleanup).catch((error) => {
        logger.error(
          `Error in async performClientCleanup for ${clientIdToCleanup}:`,
          error
        );
      });
    }
  }

  public handleConnectionError(ws: WSContext, error: Error): void {
    // Iterate to find the clientId
    let clientIdToCleanup: string | null = null;
    for (const [id, metadata] of this.clients.entries()) {
      if (metadata.ws === ws) {
        clientIdToCleanup = id;
        break;
      }
    }
    logger.error(
      `WebSocket error for client ${clientIdToCleanup || "unknown"}:`,
      error
    );
    // Trigger cleanup using the context (which eventually finds the clientId again)
    this.handleConnectionClose(ws);
  }

  // --- Heartbeat (Define before used) ---
  private startHeartbeat(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    logger.info("Starting WebSocketManager heartbeat (ping/pong)...");

    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach(async (clientMetadata) => {
        if (!clientMetadata.isAlive) {
          try {
            clientMetadata.ws.close(1008, "Heartbeat Failure");
          } catch (e) {
            logger.warn(
              `Error closing unresponsive client ${clientMetadata.clientId}:`,
              e
            );
          }
          // Call cleanup with only clientId
          await this.performClientCleanup(clientMetadata.clientId).catch(
            (err) => {
              logger.error(
                `Error in performClientCleanup (heartbeat timeout) for ${clientMetadata.clientId}:`,
                err
              );
            }
          );
          return;
        }
        clientMetadata.isAlive = false;
        try {
          clientMetadata.ws.send(JSON.stringify({ event: "ping" }));
        } catch (e) {
          logger.warn(
            `Failed to send ping to client ${clientMetadata.clientId}:`,
            e
          );
          // Call cleanup with only clientId
          await this.performClientCleanup(clientMetadata.clientId).catch(
            (err) => {
              logger.error(
                `Error in performClientCleanup (ping failed) for ${clientMetadata.clientId}:`,
                err
              );
            }
          );
        }
      });
    }, 30000);
  }

  // --- Room Management ---
  private async joinRoom(
    event: string,
    client: ClientMetadata,
    roomName: string
  ): Promise<void> {
    if (!this.redisCache) {
      this.redisCache = await getGlobalRedisCache();
    }
    if (!this.localRoomClients.has(roomName)) {
      this.localRoomClients.set(roomName, new Set<string>());
    }
    this.localRoomClients.get(roomName)?.add(client.clientId);
    client.rooms.add(roomName);
    const clientRoomsKey = await this.redisKey(
      `client:${client.clientId}:rooms`
    );
    const roomClientsKey = await this.redisKey(`room:${roomName}:clients`);
    await this.redisCache.sadd(clientRoomsKey, roomName);
    await this.redisCache.sadd(roomClientsKey, client.clientId);

    logger.log(
      `Client ${client.clientId} joined room (local+Redis): ${roomName}`
    );
    const responseEvent =
      event && String(event) === "subscribeToChat"
        ? "subscribedToChat"
        : roomName.startsWith("token-")
          ? "subscribed"
          : "joined";
    client.ws.send(
      JSON.stringify({
        event: responseEvent,
        data: { room: roomName },
      })
    );
  }

  private async leaveRoom(
    event: string,
    client: ClientMetadata,
    roomName: string
  ): Promise<void> {
    if (!this.redisCache) {
      this.redisCache = await getGlobalRedisCache();
    }
    this.localRoomClients.get(roomName)?.delete(client.clientId);
    if (this.localRoomClients.get(roomName)?.size === 0) {
      this.localRoomClients.delete(roomName);
    }
    client.rooms.delete(roomName);
    const clientRoomsKey = await this.redisKey(
      `client:${client.clientId}:rooms`
    );
    const roomClientsKey = await this.redisKey(`room:${roomName}:clients`);
    await this.redisCache.srem(clientRoomsKey, roomName);
    await this.redisCache.srem(roomClientsKey, client.clientId);
    logger.log(
      `Client ${client.clientId} left room (local+Redis): ${roomName}`
    );
    const responseEvent =
      String(event) === "unsubscribeFromChat"
        ? "unsubscribedFromChat"
        : roomName.startsWith("token-")
          ? "unsubscribed"
          : "left";
    client.ws.send(
      JSON.stringify({
        event: responseEvent,
        data: { room: roomName },
      })
    );
  }

  // --- Client Cleanup (Internal, handles local and Redis state) ---
  private async performClientCleanup(clientId: string): Promise<void> {
    logger.log(`Performing cleanup for client: ${clientId}`);
    const clientMetadata = this.clients.get(clientId);
    if (!clientMetadata) {
      logger.warn(
        `Cleanup skipped: Metadata for client ${clientId} not found.`
      );
      return;
    }
    const roomsClientWasIn = Array.from(clientMetadata.rooms);

    // 1. Remove client from local data structures
    this.clients.delete(clientId); // Remove from main map
    roomsClientWasIn.forEach((roomName) => {
      const room = this.localRoomClients.get(roomName);
      if (room) {
        room.delete(clientId);
        if (room.size === 0) {
          this.localRoomClients.delete(roomName);
        }
      }
    });

    // 2. Remove client from Redis
    if (this.redisCache) {
      const clientRoomsKey = await this.redisKey(`client:${clientId}:rooms`);
      try {
        for (const roomName of roomsClientWasIn) {
          const roomClientsKey = await this.redisKey(
            `room:${roomName}:clients`
          );
          await this.redisCache.srem(roomClientsKey, clientId);
        }
        await this.redisCache.del(clientRoomsKey);
        logger.log(`Cleaned up Redis state for client ${clientId}`);
      } catch (error) {
        logger.error(
          `Redis error during cleanup for client ${clientId}:`,
          error
        );
      }
    } else {
      logger.warn(
        "Redis cache not available, skipping Redis cleanup for client:",
        clientId
      );
    }
  }

  // --- Broadcasting ---
  public async broadcastToRoom(
    roomName: string,
    event: string,
    data: any,
    excludeClientId?: string
  ): Promise<void> {
    if (!this.redisCache) {
      this.redisCache = await getGlobalRedisCache();
    }
    const roomClientsKey = await this.redisKey(`room:${roomName}:clients`);
    let clientIdsInRoom: string[] = [];
    try {
      clientIdsInRoom = await this.redisCache.smembers(roomClientsKey);
    } catch (error) {
      logger.error(`Redis error fetching clients for room ${roomName}:`, error);
      return;
    }

    if (!clientIdsInRoom || clientIdsInRoom.length === 0) return;

    const message = JSON.stringify({ event, data });
    let count = 0;

    clientIdsInRoom.forEach((clientId) => {
      if (clientId === excludeClientId) return;
      const clientMetadata = this.clients.get(clientId);
      if (clientMetadata && clientMetadata.ws.readyState === 1) {
        try {
          clientMetadata.ws.send(message);
          count++;
        } catch (error) {
          logger.error(`Error sending broadcast to client ${clientId}:`, error);
        }
      }
    });
  }

  // --- Send Direct Message to Client ---
  public sendToClient(clientId: string, event: string, data: any): boolean {
    const clientMetadata = this.clients.get(clientId);
    if (!clientMetadata) {
      logger.warn(`Client ${clientId} not found in clients map.`);
      return false;
    }
    try {
      const message = JSON.stringify({ event, data });
      if (!clientMetadata.ws) {
        throw new Error(`Client ${clientId} has no WebSocket connection.`);
      }
      clientMetadata.ws.send(message);
      logger.log(`Sent direct message event ${event} to client ${clientId}`);
      return true;
    } catch (error) {
      logger.error(
        `Failed to stringify or send direct message to client ${clientId}:`,
        error
      );
      return false;
    }
  }

  // --- Graceful Shutdown ---
  public close(): void {
    logger.info("Closing WebSocketManager...");
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      logger.info("WebSocket heartbeat stopped.");
    }
    logger.info(
      `Closing ${this.clients.size} local WebSocket client connections...`
    );
    this.clients.forEach((clientMetadata) => {
      try {
        clientMetadata.ws.close(1000, "Server Shutting Down");
      } catch (e) {
        logger.warn(
          `Error sending close frame to client ${clientMetadata.clientId}:`,
          e
        );
      }
    });
    this.clients.clear();
    this.localRoomClients.clear();
    logger.info("WebSocketManager local client maps cleared.");
  }
}

const webSocketManager = new WebSocketManager();

export { webSocketManager };
