import { v4 as uuidv4 } from 'uuid';
// import WebSocket, { WebSocketServer } from 'ws'; // Standard import causing issues
import WebSocket from 'ws'; // Import default only
// import { WebSocketServer } from 'ws';         
// import WebSocket = require('ws');         
import type { RedisCacheService } from './redis/redisCacheService';
import { logger } from './util';
import type { Redis } from 'ioredis';

// Interface for our WebSocket connection wrapper
interface ManagedWebSocket extends WebSocket {
    clientId: string;
    isAlive: boolean;
    // Local rooms cache for quick access during disconnect, but Redis is source of truth
    rooms: Set<string>;
}

class WebSocketManager {
    private wss: WebSocket.Server | null = null;
    // Locally connected clients
    private clients: Map<string, ManagedWebSocket> = new Map();
    // Local cache of room -> locally connected clients (for efficient broadcasting)
    private localRoomClients: Map<string, Set<ManagedWebSocket>> = new Map();
    private heartbeatInterval: NodeJS.Timeout | null = null;
    private redisCache: RedisCacheService | null = null; // Add Redis dependency

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

    // --- Initialization ---
    initialize(server: any, redisCache: RedisCacheService): void {
        if (this.wss) {
            logger.warn("WebSocketManager already initialized.");
            return;
        }
        this.redisCache = redisCache; // Store Redis instance
        logger.info("WebSocketManager received RedisCacheService.");

        this.wss = new WebSocket.Server({ server });
        logger.info("WebSocketServer initialized and attached to HTTP server.");

        this.wss.on('connection', (ws: WebSocket) => {
            const managedWs = ws as ManagedWebSocket;
            managedWs.clientId = uuidv4();
            managedWs.isAlive = true;
            managedWs.rooms = new Set(); // Initialize local room cache
            this.clients.set(managedWs.clientId, managedWs);

            logger.log(`Client connected: ${managedWs.clientId}`);
            managedWs.send(JSON.stringify({ event: 'clientId', data: managedWs.clientId }));

            // Note: Automatic state restoration from Redis on connect is complex
            // because the client doesn't provide a persistent ID by default.
            // Clients need to explicitly rejoin rooms.

            managedWs.on('pong', () => { managedWs.isAlive = true; });

            managedWs.on('message', (message: Buffer) => {
                try {
                    const parsedMessage = JSON.parse(message.toString());
                    // Make async as handlers now involve Redis
                    this.handleClientMessage(managedWs, parsedMessage).catch(error => {
                         logger.error(`Error in async handleClientMessage for ${managedWs.clientId}:`, error);
                    });
                } catch (error) {
                    logger.error(`Failed to parse or handle message for ${managedWs.clientId}:`, message.toString(), error);
                }
            });

            managedWs.on('close', () => {
                logger.log(`Client disconnected: ${managedWs.clientId}`);
                // Make async as handlers now involve Redis
                this.handleClientDisconnect(managedWs).catch(error => {
                    logger.error(`Error in async handleClientDisconnect for ${managedWs.clientId}:`, error);
                });
            });

            managedWs.on('error', (error) => {
                logger.error(`WebSocket error for client ${managedWs.clientId}:`, error);
                 // Make async as handlers now involve Redis
                this.handleClientDisconnect(managedWs).catch(err => {
                    logger.error(`Error in async handleClientDisconnect (from error event) for ${managedWs.clientId}:`, err);
                });
            });
        });

        this.startHeartbeat();
    }

    private startHeartbeat(): void {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

        this.heartbeatInterval = setInterval(() => {
            this.clients.forEach((client) => {
                if (!client.isAlive) {
                    logger.warn(`Client ${client.clientId} unresponsive, terminating.`);
                    // handleClientDisconnect is called via 'close' or 'error' events eventually
                    client.terminate();
                    return;
                }
                client.isAlive = false;
                client.ping();
            });
        }, 30000);
        logger.info("WebSocketManager heartbeat started.");
    }

    // --- Message Handling ---
    // Make async as it calls async room methods
    private async handleClientMessage(client: ManagedWebSocket, message: any): Promise<void> {
        if (!this.redisCache) {
            logger.error("Redis cache not available in handleClientMessage");
            return;
        }
        if (!message || !message.event) return;

        const { event, data } = message;
        logger.log(`Received message from ${client.clientId}:`, { event, data });

        try {
            switch (event) {
                case 'join':
                    if (data?.room && typeof data.room === 'string') {
                        await this.joinRoom(client, data.room);
                    } else { logger.warn(`Invalid 'join' format from ${client.clientId}:`, data); }
                    break;
                case 'leave':
                    if (data?.room && typeof data.room === 'string') {
                        await this.leaveRoom(client, data.room);
                    } else { logger.warn(`Invalid 'leave' format from ${client.clientId}:`, data); }
                    break;
                case 'subscribe': // Maps to joinRoom('token-...')
                    if (data && typeof data === 'string') {
                        await this.joinRoom(client, `token-${data}`);
                    } else { logger.warn(`Invalid 'subscribe' format from ${client.clientId}:`, data); }
                    break;
                case 'unsubscribe': // Maps to leaveRoom('token-...')
                    if (data && typeof data === 'string') {
                        await this.leaveRoom(client, `token-${data}`);
                    } else { logger.warn(`Invalid 'unsubscribe' format from ${client.clientId}:`, data); }
                    break;
                case 'subscribeGlobal':
                    await this.joinRoom(client, 'global');
                    break;
                case 'unsubscribeGlobal':
                    await this.leaveRoom(client, 'global');
                    break;
                default:
                    logger.warn(`Unhandled event type '${event}' from client ${client.clientId}`);
            }
        } catch (error) {
             logger.error(`Error handling message event '${event}' for client ${client.clientId}:`, error);
        }
    }

    // --- Room Management (with Redis) ---
    // Make async
    private async joinRoom(client: ManagedWebSocket, roomName: string): Promise<void> {
        if (!this.redisCache) throw new Error("Redis cache not initialized for joinRoom");

        // Add to local cache for broadcasting efficiency
        if (!this.localRoomClients.has(roomName)) {
            this.localRoomClients.set(roomName, new Set());
        }
        this.localRoomClients.get(roomName)?.add(client);
        client.rooms.add(roomName); // Also update client's local room set

        // Add to Redis Sets for persistence
        const clientRoomsKey = this.redisKey(`client:${client.clientId}:rooms`);
        const roomClientsKey = this.redisKey(`room:${roomName}:clients`);
        try {
             // Use the specific service methods
             // Note: These are not atomic without a MULTI wrapper in the service itself.
             // If atomicity is critical, consider adding transactional methods to RedisCacheService.
             await this.redisCache.sadd(clientRoomsKey, roomName);
             await this.redisCache.sadd(roomClientsKey, client.clientId);

             logger.log(`Client ${client.clientId} joined room (local+Redis): ${roomName}`);

             // Send confirmation back to client
             client.send(JSON.stringify({
                 event: roomName.startsWith('token-') ? 'subscribed' : 'joined',
                 data: { room: roomName }
             }));
        } catch (error) {
            logger.error(`Redis error joining room ${roomName} for client ${client.clientId}:`, error);
            // Optional: Revert local changes if Redis fails?
            this.localRoomClients.get(roomName)?.delete(client);
            client.rooms.delete(roomName);
            throw error; // Re-throw to be caught by handleClientMessage
        }
    }

    // Make async
    private async leaveRoom(client: ManagedWebSocket, roomName: string): Promise<void> {
        if (!this.redisCache) throw new Error("Redis cache not initialized for leaveRoom");

        // Remove from local cache
        this.localRoomClients.get(roomName)?.delete(client);
        if (this.localRoomClients.get(roomName)?.size === 0) {
            this.localRoomClients.delete(roomName);
        }
        client.rooms.delete(roomName); // Update client's local room set

        // Remove from Redis Sets
        const clientRoomsKey = this.redisKey(`client:${client.clientId}:rooms`);
        const roomClientsKey = this.redisKey(`room:${roomName}:clients`);
        try {
             // Use the specific service methods
             // Consider atomicity needs - might need a transactional method in RedisCacheService
             await this.redisCache.srem(clientRoomsKey, roomName);
             await this.redisCache.srem(roomClientsKey, client.clientId);

             logger.log(`Client ${client.clientId} left room (local+Redis): ${roomName}`);

             // Send confirmation back to client
             client.send(JSON.stringify({
                 event: roomName.startsWith('token-') ? 'unsubscribed' : 'left',
                 data: { room: roomName }
             }));
        } catch (error) {
             logger.error(`Redis error leaving room ${roomName} for client ${client.clientId}:`, error);
             // Optional: Revert local changes? Difficult as client might be gone.
             throw error;
        }
    }

    // --- Disconnect Handling (with Redis cleanup) ---
    // Make async
    private async handleClientDisconnect(client: ManagedWebSocket): Promise<void> {
        if (!this.redisCache) {
             logger.error("Redis cache not available in handleClientDisconnect for client:", client.clientId);
             // Proceed with local cleanup anyway
        }

        logger.log(`Cleaning up disconnected client: ${client.clientId}`);

        // Use the client's local room cache for cleanup efficiency
        const roomsClientWasIn = Array.from(client.rooms); // Get rooms before clearing

        // 1. Remove client from local data structures
        this.clients.delete(client.clientId);
        roomsClientWasIn.forEach(roomName => {
             this.localRoomClients.get(roomName)?.delete(client);
             if (this.localRoomClients.get(roomName)?.size === 0) {
                this.localRoomClients.delete(roomName);
            }
        });

        // 2. Remove client from Redis room sets and delete client's room set
        if (this.redisCache) {
            const clientRoomsKey = this.redisKey(`client:${client.clientId}:rooms`);
            try {
                // Use specific methods. Atomicity note: If one srem fails, others might still execute.
                // A dedicated transactional cleanup method in RedisCacheService would be more robust.
                for (const roomName of roomsClientWasIn) {
                     const roomClientsKey = this.redisKey(`room:${roomName}:clients`);
                     await this.redisCache.srem(roomClientsKey, client.clientId);
                     // Optional: Check room size and delete if empty (requires SCARD)
                     // const size = await this.redisCache.scard(roomClientsKey); // Requires scard method
                     // if (size === 0) await this.redisCache.del(roomClientsKey);
                }
                await this.redisCache.del(clientRoomsKey); // Delete the client's own room list

                 logger.log(`Cleaned up Redis state for client ${client.clientId}`);
            } catch (error) {
                logger.error(`Redis error during cleanup for client ${client.clientId}:`, error);
            }
            // No need to release client explicitly if useClient handles it
        } else {
             logger.warn("Redis cache not available, skipping Redis cleanup for client:", client.clientId);
        }
    }


    // --- Broadcasting (using Redis for audience list) ---
    // Make async
    public async broadcastToRoom(roomName: string, event: string, data: any, excludeClientId?: string): Promise<void> {
        if (!this.redisCache) {
            logger.error("Cannot broadcast: Redis cache not available.");
            return;
        }

        const roomClientsKey = this.redisKey(`room:${roomName}:clients`);
        let clientIdsInRoom: string[] = [];

        try {
            // Get all client IDs subscribed to the room from Redis
             clientIdsInRoom = await this.redisCache.smembers(roomClientsKey);
        } catch (error) {
            logger.error(`Redis error fetching clients for room ${roomName}:`, error);
            return; // Cannot broadcast if we can't get the list
        }


        if (!clientIdsInRoom || clientIdsInRoom.length === 0) {
            // logger.log(`No clients listed in Redis for room ${roomName} to broadcast event ${event}.`);
            return;
        }

        const message = JSON.stringify({ event, data });
        let count = 0;

        // Iterate through client IDs from Redis
        clientIdsInRoom.forEach(clientId => {
            if (clientId === excludeClientId) return;

            // Find the client in the *local* map (must be connected to *this* server instance)
            const client = this.clients.get(clientId);
            if (client && client.readyState === WebSocket.OPEN) {
                client.send(message);
                count++;
            }
        });

        if (count > 0) {
            logger.log(`Broadcasted event ${event} to ${count} clients in room ${roomName}.`);
        }
    }

    // --- Graceful Shutdown ---
    public close(): void {
        logger.info("Closing WebSocketManager...");
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        if (this.wss) {
            logger.info("Terminating all local WebSocket client connections...");
            this.clients.forEach(client => {
                client.terminate();
            });
            // Type annotation for err in close callback is still Error | null
            this.wss.close((err: Error | null) => {
                if (err) {
                    logger.error("Error closing WebSocketServer:", err);
                } else {
                    logger.info("WebSocketServer closed.");
                }
            });
            this.wss = null;
            this.clients.clear();
            this.localRoomClients.clear();
        }
    }
}

const webSocketManager = new WebSocketManager();

export { webSocketManager };
export type { ManagedWebSocket };