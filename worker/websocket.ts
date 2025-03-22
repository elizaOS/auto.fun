export class WebSocketDO {
  private state: DurableObjectState;
  private sessions: Map<string, WebSocket> = new Map();
  private rooms: Map<string, Set<string>> = new Map(); // roomName -> Set of sessionIds

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Special internal endpoints for broadcasting to rooms
    if (path === '/broadcast') {
      const { room, message } = await request.json() as { room: string, message: any };
      this.broadcastToRoom(room, message);
      return new Response('Message broadcasted', { status: 200 });
    }
    
    if (path === '/send') {
      const { message } = await request.json() as { message: any };
      // This would need the specific session ID, which we'd pass in the request
      return new Response('Direct message sent', { status: 200 });
    }
    
    // Handle WebSocket upgrade
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    // Create the WebSocket pair
    const { 0: client, 1: server } = new WebSocketPair();
    const sessionId = crypto.randomUUID();
    
    // Accept the WebSocket connection
    server.accept();
    this.sessions.set(sessionId, server);

    // Set up event handlers for the WebSocket
    server.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data as string);
        await this.handleMessage(sessionId, data);
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    });

    server.addEventListener('close', () => {
      this.handleClose(sessionId);
    });

    server.addEventListener('error', () => {
      this.handleClose(sessionId);
    });

    // Return the client end of the WebSocket to the client
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private async handleMessage(sessionId: string, data: any): Promise<void> {
    // Handle messages from clients
    if (data.type === 'subscribe') {
      const token = data.token;
      const roomName = `token-${token}`;
      this.joinRoom(sessionId, roomName);
      console.log(`Client ${sessionId} subscribed to ${roomName}`);
    } 
    else if (data.type === 'subscribeGlobal') {
      this.joinRoom(sessionId, 'global');
      console.log(`Client ${sessionId} subscribed to global updates`);
    }
    else if (data.type === 'unsubscribe') {
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
      session.close();
      this.sessions.delete(sessionId);
      
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
    
    for (const sessionId of room) {
      const session = this.sessions.get(sessionId);
      if (session && session.readyState === WebSocket.OPEN) {
        session.send(messageStr);
      }
    }
  }
} 