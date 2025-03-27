# AutoFun Worker Documentation

This folder contains documentation and examples for the AutoFun worker implementation.

## Available Documentation

- [WebSocket Implementation](../README_WEBSOCKET.md) - Overview of the WebSocket system
- [WebSocket Sample Code](./websocket-sample.ts) - TypeScript sample showing how to use WebSockets in frontend applications

## Testing Endpoints

The worker provides several testing endpoints for development:

### WebSockets

- `GET /api/emit-test-swap/:tokenId` - Emits a test swap event
- `POST /api/token/dev/create-test-swap/:mint` - Creates and emits a test swap
- `GET /api/token/dev/emit-token-update/:mint` - Emits a token update event
- `GET /api/token/websocket-status` - Checks WebSocket service status

### Tokens

- `GET /api/token/dev/update-holders/:mint` - Updates holder data for a token
- `GET /api/token/dev/add-test-holders/:mint` - Adds test holder data
- `GET /api/token/dev/add-all-test-data/:mint` - Adds both test holders and swaps

## General API Endpoints

- `GET /api/tokens/:mint` - Get token information
- `GET /api/tokens/:mint/refresh-holders` - Refresh holder data for a token
- `GET /api/tokens/:mint/refresh-swaps` - Refresh swap data for a token
- `GET /api/swaps/:mint` - Get swap history for a token 