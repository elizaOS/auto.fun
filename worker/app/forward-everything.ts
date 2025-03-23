import { createDebugLogger } from "socket.io-serverless/dist/cf";
import type { Socket } from "socket.io";

export const parentNamespace = /^\/v1\/[-\w:.]+$/;

const logger = createDebugLogger("autofun:websocket:app");

/**
 * Socket.io server logic, handling various connection events.
 * @param socket - The connected socket instance
 */
export function onConnection(socket: Socket) {
  const namespace = socket.nsp;
  logger("connection", namespace.name, socket.id);

  socket.on("disconnecting", (reason: any) => {
    logger("disconnecting", namespace.name, socket.id, reason);
  });

  socket.on("disconnect", (reason: any) => {
    logger("disconnect", namespace.name, socket.id, reason);
  });

  socket.on("error", (error: any) => {
    logger("error", namespace.name, socket.id, error);
  });

  // Subscribe to specific token updates
  socket.on("subscribe", (token: string) => {
    socket.join(`token-${token}`);
    logger("Client subscribed to token", namespace.name, socket.id, token);

    // Emit subscribed event for compatibility with client
    socket.emit("subscribed", { token });
  });

  // Subscribe to global updates
  socket.on("subscribeGlobal", () => {
    socket.join("global");
    logger("Client subscribed to global updates", namespace.name, socket.id);

    // Emit subscribedGlobal event for compatibility with client
    socket.emit("subscribedGlobal");
  });

  // Unsubscribe from token updates
  socket.on("unsubscribe", (token: string) => {
    socket.leave(`token-${token}`);
    logger("Client unsubscribed from token", namespace.name, socket.id, token);

    // Emit unsubscribed event for compatibility with client
    socket.emit("unsubscribed", { token });
  });

  // Unsubscribe from global updates
  socket.on("unsubscribeGlobal", () => {
    socket.leave("global");
    logger(
      "Client unsubscribed from global updates",
      namespace.name,
      socket.id,
    );

    // Emit unsubscribedGlobal event for compatibility with client
    socket.emit("unsubscribedGlobal");
  });

  // Forward "message" events to the same namespace
  socket.on("message", (event: string, value: any) => {
    logger("forwarding message", namespace.name, socket.id, event, value);
    namespace.emit(event, value);
  });
}
