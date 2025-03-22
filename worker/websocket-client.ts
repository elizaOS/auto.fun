// WebSocket client for sending messages to connected clients
// This replaces the Socket.io server implementation
import { Env } from './env';

interface WebSocketMessage {
  event: string;
  data: any;
}

export class WebSocketClient {
  private env: Env;
  private namespace: DurableObjectNamespace;

  constructor(env: Env) {
    this.env = env;
    this.namespace = env.WEBSOCKET_DO;
  }

  // Send a message to a specific room
  async emit(room: string, event: string, data: any): Promise<void> {
    const message: WebSocketMessage = { event, data };
    
    // Get the DO for this room
    const doId = this.namespace.idFromName(room);
    const doStub = this.namespace.get(doId);
    
    // Send the message to the DO which will forward to all clients in the room
    await doStub.fetch('https://internal/broadcast', {
      method: 'POST',
      body: JSON.stringify({ room, message }),
    });
  }

  // Send a message to a specific client
  async emitToClient(clientId: string, event: string, data: any): Promise<void> {
    const message: WebSocketMessage = { event, data };
    
    // Get the DO for this client
    const doId = this.namespace.idFromName(clientId);
    const doStub = this.namespace.get(doId);
    
    // Send the message to the DO
    await doStub.fetch('https://internal/send', {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  }

  // Helper that returns an object with direct emit method
  // This eliminates the need for await when chaining
  to(room: string) {
    return {
      emit: (event: string, data: any) => this.emit(room, event, data)
    };
  }
}

// Helper function to get websocket client instance
let wsClient: WebSocketClient | null = null;

export function getWebSocketClient(env: Env): WebSocketClient {
  if (!wsClient || !(wsClient instanceof WebSocketClient)) {
    wsClient = new WebSocketClient(env);
  }
  return wsClient;
} 