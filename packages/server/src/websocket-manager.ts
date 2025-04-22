import { v4 as uuidv4 } from 'uuid';
import type { RedisCacheService } from './redis/redisCacheService';
import { logger } from './util';
// Use require syntax for ws WebSocket type, as suggested by linter
import WebSocket from 'ws';
// import type { Server as HttpServer } from 'http'; // Import Node HTTP Server type

// Our managed interface extending the standard WebSocket type
// Hono's handler will provide an object compatible with this standard type
interface ManagedWebSocket extends WebSocket {
    clientId: string;
    isAlive: boolean; // Used for ping/pong
    rooms: Set<string>;
}

class WebSocketManager {
    // Remove wss instance
    // private wss: WebSocket.Server | null = null;
    // Map clientId to the active Hono WebSocket connection
    private clients: Map<string, ManagedWebSocket> = new Map();
    // Local cache of room -> locally connected clients (for efficient broadcasting within this instance)
    // Note: Redis remains the source of truth for room memberships across instances
    private localRoomClients: Map<string, Set<ManagedWebSocket>> = new Map();
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private redisCache: RedisCacheService | null = null;

    // --- Redis Key Helper ---
    private redisKey(rawKey: string): string { // Renamed param for clarity
        // Ensure consistency with RedisCacheService prefixing (if any)
        // Call the service's getKey method for consistent prefixing.
        if (!this.redisCache) {
             // Should not happen if initialized correctly, but good practice
             logger.error("redisKey called before redisCache initialized!");
             return rawKey; // Or throw error
        }
        return this.redisCache.getKey(rawKey);
    }

    // --- Initialization (Simpler: only needs Redis) ---
    initialize(redisCache: RedisCacheService): void {
        if (this.redisCache) { // Check if already initialized
             logger.warn("WebSocketManager RedisCacheService already set.");
             // Optionally return or re-assign based on desired behavior
        }
        this.redisCache = redisCache;
        logger.info("WebSocketManager initialized with RedisCacheService.");
        this.startHeartbeat(); // Start ping/pong
    }

    // --- Connection Handling (Called by Hono route) ---
    public handleConnectionOpen(ws: WebSocket): void {
        const managedWs = ws as ManagedWebSocket;
        managedWs.clientId = uuidv4();
        managedWs.isAlive = true;
        managedWs.rooms = new Set();
        this.clients.set(managedWs.clientId, managedWs);

        logger.log(`Client connected: ${managedWs.clientId}`);
        try {
             managedWs.send(JSON.stringify({ event: 'clientId', data: managedWs.clientId }));
        } catch (error) { // Catch potential errors if socket closes immediately
             logger.error(`Failed to send clientId to ${managedWs.clientId}:`, error);
             this.handleConnectionClose(managedWs); // Treat as immediate close
        }

        // Handle pong responses for heartbeat
        managedWs.on('pong', () => {
            managedWs.isAlive = true;
        });

        // Standard close/error handlers attached here
        managedWs.on('close', () => this.handleConnectionClose(managedWs));
        managedWs.on('error', (error: Error) => this.handleConnectionError(managedWs, error));
    }

    // --- Message Handling (Called by Hono route) ---
    // Make async as it calls async room methods
    public async handleMessage(ws: WebSocket, message: any): Promise<void> {
        const managedWs = ws as ManagedWebSocket;
        managedWs.isAlive = true; // Got message, must be alive

        let parsedMessage: any;
        try {
            const messageString = message.toString(); // ws RawData is Buffer | ArrayBuffer | Buffer[]
            parsedMessage = JSON.parse(messageString);
        } catch (error) {
            logger.error(`Failed to parse message from ${managedWs.clientId}:`, message, error);
            return;
        }

        if (!this.redisCache) {
            logger.error("Redis cache not available in handleMessage");
            return;
        }
        if (!parsedMessage || !parsedMessage.event) return;

        const { event, data } = parsedMessage;
        logger.log(`Received message from ${managedWs.clientId}:`, { event, data });

        try {
            switch (event) {
                case 'join':
                    if (data?.room && typeof data.room === 'string') {
                        await this.joinRoom(managedWs, data.room);
                    } else { logger.warn(`Invalid 'join' format from ${managedWs.clientId}:`, data); }
                    break;
                case 'leave':
                    if (data?.room && typeof data.room === 'string') {
                        await this.leaveRoom(managedWs, data.room);
                    } else { logger.warn(`Invalid 'leave' format from ${managedWs.clientId}:`, data); }
                    break;
                case 'subscribe':
                    if (data && typeof data === 'string') {
                        await this.joinRoom(managedWs, `token-${data}`);
                    } else { logger.warn(`Invalid 'subscribe' format from ${managedWs.clientId}:`, data); }
                    break;
                case 'unsubscribe':
                    if (data && typeof data === 'string') {
                        await this.leaveRoom(managedWs, `token-${data}`);
                    } else { logger.warn(`Invalid 'unsubscribe' format from ${managedWs.clientId}:`, data); }
                    break;
                case 'subscribeGlobal':
                    await this.joinRoom(managedWs, 'global');
                    break;
                case 'unsubscribeGlobal':
                    await this.leaveRoom(managedWs, 'global');
                    break;
                case 'pong':
                     // Handled by the 'pong' event listener set up in handleConnectionOpen
                    break;
                default:
                    logger.warn(`Unhandled event type '${event}' from client ${managedWs.clientId}`);
            }
        } catch (error) {
             logger.error(`Error handling message event '${event}' for client ${managedWs.clientId}:`, error);
        }
    }

    // --- Close/Error Handling (Called by Hono route) ---
    public handleConnectionClose(ws: WebSocket): void {
        const managedWs = ws as ManagedWebSocket;
        // Use clientId if available on the object already
        const clientId = managedWs.clientId || 'unknown';
        if (this.clients.has(clientId)) {
             logger.log(`Client disconnected: ${clientId}`);
             this.performClientCleanup(managedWs).catch(error => {
                 logger.error(`Error in async performClientCleanup for ${clientId}:`, error);
             });
        } else {
             // logger.log(`Cleanup skipped or already performed for client: ${clientId}`);
        }
    }

    public handleConnectionError(ws: WebSocket, error: Error): void {
        const managedWs = ws as ManagedWebSocket;
        const clientId = managedWs?.clientId || 'unknown';
        logger.error(`WebSocket error for client ${clientId}:`, error);
        this.handleConnectionClose(ws); // Trigger cleanup
    }

    // --- Heartbeat (Ping/Pong) ---
    private startHeartbeat(): void {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        logger.info("Starting WebSocketManager heartbeat (ping/pong)...");

        this.heartbeatInterval = setInterval(() => {
             this.clients.forEach(async (client) => {
                if (!client.isAlive) {
                    logger.warn(`Client ${client.clientId} unresponsive to ping, terminating.`);
                    try {
                         // Standard WebSocket terminate() or close()
                         if ('terminate' in client && typeof client.terminate === 'function') {
                            client.terminate();
                         } else {
                             client.close(1008, "Heartbeat Failure");
                         }
                    } catch (e) {
                        logger.warn(`Error closing/terminating unresponsive client ${client.clientId}:`, e);
                    }
                    await this.performClientCleanup(client).catch(err => {
                         logger.error(`Error in performClientCleanup (heartbeat timeout) for ${client.clientId}:`, err);
                    });
                    return;
                }
                client.isAlive = false;
                try {
                     // Standard WebSocket ping method
                     client.ping(() => {}); // Empty callback often needed
                } catch (e) {
                     logger.warn(`Failed to send ping to client ${client.clientId}:`, e);
                     await this.performClientCleanup(client).catch(err => {
                          logger.error(`Error in performClientCleanup (ping failed) for ${client.clientId}:`, err);
                     });
                }
            });
        }, 30000);
    }

    // --- Room Management (with Redis) ---
    private async joinRoom(client: ManagedWebSocket, roomName: string): Promise<void> {
        if (!this.redisCache) throw new Error("Redis cache not initialized for joinRoom");

        // Add to local cache
        if (!this.localRoomClients.has(roomName)) {
            this.localRoomClients.set(roomName, new Set());
        }
        this.localRoomClients.get(roomName)?.add(client);
        client.rooms.add(roomName);

        const clientRoomsKey = this.redisKey(`client:${client.clientId}:rooms`);
        const roomClientsKey = this.redisKey(`room:${roomName}:clients`);
        try {
             await this.redisCache.sadd(clientRoomsKey, roomName);
             await this.redisCache.sadd(roomClientsKey, client.clientId);
             logger.log(`Client ${client.clientId} joined room (local+Redis): ${roomName}`);
             client.send(JSON.stringify({
                 event: roomName.startsWith('token-') ? 'subscribed' : 'joined',
                 data: { room: roomName }
             }));
        } catch (error) {
            logger.error(`Redis error joining room ${roomName} for client ${client.clientId}:`, error);
            this.localRoomClients.get(roomName)?.delete(client);
            client.rooms.delete(roomName);
            // Attempt to notify client of failure
             try { client.send(JSON.stringify({ event: 'join_error', data: { room: roomName, error: 'Failed to update subscription' } })); } catch {
                // do nothing
             } // Ignore send errors
            throw error;
        }
    }

    private async leaveRoom(client: ManagedWebSocket, roomName: string): Promise<void> {
         if (!this.redisCache) throw new Error("Redis cache not initialized for leaveRoom");

        // Remove from local cache
        this.localRoomClients.get(roomName)?.delete(client);
        if (this.localRoomClients.get(roomName)?.size === 0) {
            this.localRoomClients.delete(roomName);
        }
        client.rooms.delete(roomName);

        const clientRoomsKey = this.redisKey(`client:${client.clientId}:rooms`);
        const roomClientsKey = this.redisKey(`room:${roomName}:clients`);
        try {
             await this.redisCache.srem(clientRoomsKey, roomName);
             await this.redisCache.srem(roomClientsKey, client.clientId);
             logger.log(`Client ${client.clientId} left room (local+Redis): ${roomName}`);
             client.send(JSON.stringify({
                 event: roomName.startsWith('token-') ? 'unsubscribed' : 'left',
                 data: { room: roomName }
             }));
        } catch (error) {
             logger.error(`Redis error leaving room ${roomName} for client ${client.clientId}:`, error);
             // Re-add to local cache? Maybe not, state is inconsistent.
             // Attempt to notify client of failure
              try { client.send(JSON.stringify({ event: 'leave_error', data: { room: roomName, error: 'Failed to update subscription' } })); } catch {
                // do nothing
              } // Ignore send errors
             throw error;
        }
    }

    // --- Client Cleanup (Internal, handles local and Redis state) ---
    private async performClientCleanup(client: ManagedWebSocket): Promise<void> {
         if (!this.clients.has(client.clientId)) {
              return; // Already cleaned up
         }

        logger.log(`Performing cleanup for client: ${client.clientId}`);
        const roomsClientWasIn = Array.from(client.rooms); // Get rooms before clearing map/set

        // 1. Remove client from local data structures
        this.clients.delete(client.clientId);
        roomsClientWasIn.forEach(roomName => {
            const room = this.localRoomClients.get(roomName);
            if (room) {
                 room.delete(client);
                 if (room.size === 0) {
                    this.localRoomClients.delete(roomName);
                 }
            }
        });

        // 2. Remove client from Redis
        if (this.redisCache) {
            const clientRoomsKey = this.redisKey(`client:${client.clientId}:rooms`);
            try {
                for (const roomName of roomsClientWasIn) {
                     const roomClientsKey = this.redisKey(`room:${roomName}:clients`);
                     await this.redisCache.srem(roomClientsKey, client.clientId);
                }
                await this.redisCache.del(clientRoomsKey);
                 logger.log(`Cleaned up Redis state for client ${client.clientId}`);
            } catch (error) {
                logger.error(`Redis error during cleanup for client ${client.clientId}:`, error);
            }
        } else {
             logger.warn("Redis cache not available, skipping Redis cleanup for client:", client.clientId);
        }
    }

    // --- Broadcasting ---
    public async broadcastToRoom(roomName: string, event: string, data: any, excludeClientId?: string): Promise<void> {
        if (!this.redisCache) {
            logger.error("Cannot broadcast: Redis cache not available.");
            return;
        }
        const roomClientsKey = this.redisKey(`room:${roomName}:clients`);
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

        clientIdsInRoom.forEach(clientId => {
            if (clientId === excludeClientId) return;
            const client = this.clients.get(clientId);
            if (client && client.readyState === WebSocket.OPEN) { // Use WebSocket.OPEN
                 try {
                      client.send(message);
                      count++;
                 } catch (error) {
                      logger.error(`Error sending broadcast to client ${clientId}:`, error);
                 }
            }
        });

        if (count > 0) {
            logger.log(`Broadcasted event ${event} to ${count} locally connected clients in room ${roomName}.`);
        }
    }

    // --- Send Direct Message to Client ---
    public sendToClient(clientId: string, event: string, data: any): boolean {
        const client = this.clients.get(clientId);
        // Check if client is connected to *this* instance and ready
        if (client && client.readyState === WebSocket.OPEN) { // Use WebSocket.OPEN
             try {
                 const message = JSON.stringify({ event, data });
                 client.send(message);
                 logger.log(`Sent direct message event ${event} to client ${clientId}`);
                 return true;
             } catch (error) {
                 logger.error(`Failed to stringify or send direct message to client ${clientId}:`, error);
                 return false;
             }
        } else {
             // Logger warning removed as client might just be connected to another instance
             // logger.warn(`Could not send to client ${clientId}: Not found locally or connection not open.`);\n            return false; // Indicate message was not sent by this instance\n        }\n    }\n\n    // --- Graceful Shutdown ---\n    public close(): void {\n        logger.info(\"Closing WebSocketManager...\");\n        if (this.heartbeatInterval) {\n            clearInterval(this.heartbeatInterval);\n            this.heartbeatInterval = null;\n            logger.info(\"WebSocket heartbeat stopped.\");\n        }\n        // No wss instance to close\n        // Close existing connections gracefully?\n        logger.info(`Closing ${this.clients.size} local WebSocket client connections...`);\n        this.clients.forEach(client => {\n            try {\n                 // Send a closing reason if desired, then close\n                 // client.send(JSON.stringify({ event: 'server_shutdown', data: 'Server is shutting down' }));\n                 client.close(1000, \"Server Shutting Down\"); // 1000 = Normal Closure\n            } catch (e) {\n                 logger.warn(`Error sending close frame to client ${client.clientId}:`, e);\n            }\n        });\n        this.clients.clear();\n        this.localRoomClients.clear();\n         logger.info(\"WebSocketManager local client maps cleared.\");\n    }\n}\n\nconst webSocketManager = new WebSocketManager();\n\nexport { webSocketManager };\n// Export the ManagedWebSocket type if needed elsewhere, though casting internally is common\n// export type { ManagedWebSocket };\n
            return false; // Indicate message was not sent by this instance
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
        // No wss instance to close
        // Close existing connections gracefully?
        logger.info(`Closing ${this.clients.size} local WebSocket client connections...`);
        this.clients.forEach(client => {
            try {
                 // Send a closing reason if desired, then close
                 // client.send(JSON.stringify({ event: 'server_shutdown', data: 'Server is shutting down' }));
                 client.close(1000, "Server Shutting Down"); // 1000 = Normal Closure
            } catch (e) {
                 logger.warn(`Error sending close frame to client ${client.clientId}:`, e);
            }
        });
        this.clients.clear();
        this.localRoomClients.clear();
         logger.info("WebSocketManager local client maps cleared.");
    }
}

const webSocketManager = new WebSocketManager();

export { webSocketManager };
// Export the ManagedWebSocket type if needed elsewhere, though casting internally is common
// export type { ManagedWebSocket };