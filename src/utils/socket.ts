// Custom WebSocket wrapper to maintain Socket.io-like API
class SocketWrapper {
  private ws: WebSocket | null = null;
  private eventHandlers: Record<string, Array<(data: unknown) => void>> = {};
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = Infinity;
  private reconnectInterval = 1000;
  private maxReconnectInterval = 5000;
  private reconnecting = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(url: string) {
    this.url = url;
    this.connect();
  }

  private connect(): void {
    /**
     * TODO: update as necessary once backend socket implementation is finalized
     */
    const wsUrl = this.url.replace(/^http/, 'ws');
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      // Reset reconnection state on successful connection
      this.reconnectAttempts = 0;
      this.reconnecting = false;
      this.emit('connect', {});
    };

    this.ws.onmessage = (event) => {
      try {
        const { event: eventName, data } = JSON.parse(event.data);
        this.triggerEvent(eventName, data);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    this.ws.onclose = (event) => {
      // Don't attempt to reconnect if disconnect() was called
      if (this.ws === null) return;
      
      this.triggerEvent('disconnect', { reason: 'io server disconnect', code: event.code });
      
      // Attempt to reconnect unless this was a normal closure
      if (event.code !== 1000) {
        this.attemptReconnect();
      }
    };

    this.ws.onerror = (error) => {
      this.triggerEvent('error', error);
    };
  }

  private attemptReconnect(): void {
    if (this.reconnecting) return;
    
    this.reconnecting = true;
    this.triggerEvent('reconnecting', { attempt: this.reconnectAttempts + 1 });
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      // Calculate delay with exponential backoff, but cap at maxReconnectInterval
      const delay = Math.min(
        this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts),
        this.maxReconnectInterval
      );
      
      this.reconnectTimer = setTimeout(() => {
        this.reconnectAttempts++;
        this.connect();
      }, delay);
    } else {
      this.triggerEvent('reconnect_failed', {});
      this.reconnecting = false;
    }
  }

  private triggerEvent(event: string, data: unknown): void {
    const handlers = this.eventHandlers[event] || [];
    handlers.forEach(handler => handler(data));
  }

  on = (event: string, callback: (data: unknown) => void): this => {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(callback);
    return this;
  };

  off = (event: string, callback?: (data: unknown) => void): this => {
    if (!callback) {
      delete this.eventHandlers[event];
    } else if (this.eventHandlers[event]) {
      this.eventHandlers[event] = this.eventHandlers[event].filter(
        handler => handler !== callback
      );
    }
    return this;
  };

  emit = (event: string, data: unknown): this => {
    console.log('emit called')
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, data }));
    } else {
      console.log('socket not connected')
    }
    return this;
  };

  disconnect = (): void => {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    // Clear any pending reconnection attempts
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnecting = false;
  };
}

// Create a type that matches the Socket.io Socket interface
type Socket = SocketWrapper;

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    socket = new SocketWrapper(import.meta.env.VITE_API_URL);
  }
  return socket;
};
