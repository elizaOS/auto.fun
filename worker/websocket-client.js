export class WebSocketClient {
    // @ts-ignore
    env;
    namespace;
    constructor(env) {
        this.env = env;
        this.namespace = env.WEBSOCKET_DO;
    }
    // Send a message to a specific room
    async emit(room, event, data) {
        const message = { event, data };
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
    async emitToClient(clientId, event, data) {
        const message = { event, data };
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
    to(room) {
        return {
            emit: (event, data) => this.emit(room, event, data)
        };
    }
}
// Helper function to get websocket client instance
let wsClient = null;
export function getWebSocketClient(env) {
    if (!wsClient || !(wsClient instanceof WebSocketClient)) {
        wsClient = new WebSocketClient(env);
    }
    return wsClient;
}
