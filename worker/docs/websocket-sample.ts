/**
 * WebSocket Example Integration
 *
 * This file demonstrates how to connect to and use the AutoFun WebSocket API.
 * This can be adapted for use in React, Vue, or any other frontend framework.
 */

// Connection setup
class AutoFunWebSocketClient {
  private ws: WebSocket | null = null;
  private subscriptions: Set<string> = new Set();
  private globalSubscribed: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectTimeout: number = 1000; // Start with 1 second
  private eventHandlers: Map<string, Set<(data: any) => void>> = new Map();

  constructor(
    private apiUrl: string,
    private clientId?: string,
  ) {
    this.connect();
  }

  // Connect to the WebSocket server
  private connect(): void {
    const url = this.clientId
      ? `${this.apiUrl}/ws?clientId=${this.clientId}`
      : `${this.apiUrl}/ws`;

    this.ws = new WebSocket(url);

    this.ws.onopen = this.handleOpen.bind(this);
    this.ws.onmessage = this.handleMessage.bind(this);
    this.ws.onclose = this.handleClose.bind(this);
    this.ws.onerror = this.handleError.bind(this);

    console.log("Connecting to WebSocket...");
  }

  // Handle WebSocket open event
  private handleOpen(): void {
    console.log("WebSocket connected!");
    this.reconnectAttempts = 0;

    // Resubscribe to previous subscriptions
    this.subscriptions.forEach((mint) => {
      this.subscribeTo(mint);
    });

    // Resubscribe to global if previously subscribed
    if (this.globalSubscribed) {
      this.subscribeToGlobal();
    }
  }

  // Handle WebSocket messages
  private handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data);

      // Handle subscription confirmations
      if (message.event === "subscribed") {
        console.log(
          `Subscribed to token: ${message.data.room.replace("token-", "")}`,
        );
        return;
      }

      if (message.event === "joined") {
        console.log(`Joined room: ${message.data.room}`);
        return;
      }

      // Handle other events
      const eventHandlers = this.eventHandlers.get(message.event);
      if (eventHandlers) {
        eventHandlers.forEach((handler) => {
          try {
            handler(message.data);
          } catch (error) {
            console.error(
              `Error in event handler for ${message.event}:`,
              error,
            );
          }
        });
      }
    } catch (error) {
      console.error("Error handling WebSocket message:", error);
    }
  }

  // Handle WebSocket close
  private handleClose(event: CloseEvent): void {
    console.log(`WebSocket closed: ${event.code} - ${event.reason}`);

    // Attempt to reconnect
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(
        this.reconnectTimeout * this.reconnectAttempts,
        30000,
      ); // Max 30 seconds

      console.log(`Reconnecting in ${delay / 1000} seconds...`);
      setTimeout(() => this.connect(), delay);
    } else {
      console.error("Max reconnect attempts reached. Giving up.");
    }
  }

  // Handle WebSocket errors
  private handleError(error: Event): void {
    console.error("WebSocket error:", error);
  }

  // Subscribe to a specific token
  public subscribeTo(mint: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.subscriptions.add(mint);
      return;
    }

    this.subscriptions.add(mint);
    this.ws.send(
      JSON.stringify({
        event: "subscribe",
        data: mint,
      }),
    );
  }

  // Unsubscribe from a specific token
  public unsubscribeFrom(mint: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.subscriptions.delete(mint);
      return;
    }

    this.subscriptions.delete(mint);
    this.ws.send(
      JSON.stringify({
        event: "unsubscribe",
        data: mint,
      }),
    );
  }

  // Subscribe to global events
  public subscribeToGlobal(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.globalSubscribed = true;
      return;
    }

    this.globalSubscribed = true;
    this.ws.send(
      JSON.stringify({
        event: "subscribeGlobal",
      }),
    );
  }

  // Unsubscribe from global events
  public unsubscribeFromGlobal(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.globalSubscribed = false;
      return;
    }

    this.globalSubscribed = false;
    this.ws.send(
      JSON.stringify({
        event: "unsubscribeGlobal",
      }),
    );
  }

  // Register event handler
  public on(event: string, handler: (data: any) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }

    this.eventHandlers.get(event)!.add(handler);
  }

  // Remove event handler
  public off(event: string, handler?: (data: any) => void): void {
    if (!handler) {
      this.eventHandlers.delete(event);
      return;
    }

    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(event);
      }
    }
  }

  // Close connection
  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Example usage
const apiUrl = "https://api.auto.fun"; // Or 'https://api-dev.autofun.workers.dev'
const wsClient = new AutoFunWebSocketClient(apiUrl);

// Subscribe to a token
wsClient.subscribeTo("DvmXXp4tSXYwZJhM5HjtEUvQ6SfxwkA7daE1jQgCX1ri");

// Subscribe to global events
wsClient.subscribeToGlobal();

// Listen for swap events
wsClient.on("newSwap", (swap) => {
  console.log("New swap received:", swap);
  // Update UI with new swap
});

// Listen for token updates
wsClient.on("updateToken", (token) => {
  console.log("Token updated:", token);
  // Update token information in UI
});

// Listen for global events
wsClient.on("newToken", (token) => {
  console.log("New token created:", token);
  // Update global feed or trending list
});

// Clean up when done
// wsClient.disconnect();
