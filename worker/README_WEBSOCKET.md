# WebSocket Implementation in AutoFun Worker

This document outlines the WebSocket implementation used in the AutoFun worker for real-time updates.

## Overview

The implementation uses Cloudflare Durable Objects to maintain WebSocket connections and rooms. This allows for real-time updates to be sent to clients based on:

1. Token-specific subscriptions (e.g., updates for a specific token)
2. Global events (e.g., new tokens, trending activity)

## Connection Setup

WebSockets are managed through the `/ws` endpoint, which accepts WebSocket upgrade requests. Clients can connect with:

```javascript
const ws = new WebSocket('wss://api.auto.fun/ws?clientId=optional-client-id');
```

When connecting, clients can provide an optional `clientId` parameter for persistent identification.

## Event Subscriptions

After connecting, clients can subscribe to different event channels:

### Token-Specific Events

To subscribe to a specific token's events:

```javascript
ws.send(JSON.stringify({
  event: 'subscribe',
  data: 'TOKEN_MINT_ADDRESS'
}));
```

This will subscribe the client to the `token-${mintAddress}` room.

### Global Events

To subscribe to global events:

```javascript
ws.send(JSON.stringify({
  event: 'subscribeGlobal',
  data: null
}));
```

This subscribes the client to the `global` room.

## Event Types

The WebSocket system emits various event types:

### Token-Specific Events

1. `newSwap` - Emitted when a new swap/trade happens for the token
2. `updateToken` - Emitted when token information is updated
3. `holdersUpdated` - Emitted when holder information is updated

### Global Events

1. `newToken` - Emitted when a new token is added
2. `newSwap` - Emitted when any notable swap happens (typically larger ones)

## Receiving Events

Clients can listen for events with:

```javascript
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.event) {
    case 'newSwap':
      // Handle new swap
      break;
    case 'updateToken':
      // Handle token update
      break;
    // ...other events
  }
};
```

## Development Endpoints

For testing, several development endpoints are available:

1. `/api/emit-test-swap/:tokenId` - Emits a test swap event
2. `/api/token/dev/create-test-swap/:mint` - Creates and emits a test swap
3. `/api/token/dev/emit-token-update/:mint` - Emits a token update event
4. `/api/token/websocket-status` - Checks WebSocket service status

## WebSocket Client

The WebSocket client is available in `worker/websocket-client.ts` and can be used:

```typescript
import { getWebSocketClient } from "../websocket-client";

// Get the client
const wsClient = getWebSocketClient(env);

// Emit to a specific token room
await wsClient.emit(`token-${tokenMint}`, "updateToken", tokenData);

// Emit globally
await wsClient.emit("global", "newToken", { 
  mint: tokenMint,
  // ... other data
});
```

## Implementation Files

- `worker/websocket.ts` - Durable Object implementation for WebSockets
- `worker/websocket-client.ts` - Client for sending WebSocket messages
- `worker/index.ts` - WebSocket setup and endpoint handling
- `worker/routes/token.ts` - Token-related event emissions

## Configuration

WebSocket Durable Object binding is configured in `wrangler.toml`:

```toml
[durable_objects]
bindings = [
  { name = "WebSocketDO", class_name = "WebSocketDO" }
]
``` 