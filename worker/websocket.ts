import {
  createDebugLogger,
  createEioActor,
  createSioActor,
  generateBase64id,
  setEnabledLoggerNamespace,
} from "socket.io-serverless/dist/cf";
import type { DurableObjectNamespace } from "@cloudflare/workers-types";
import { logger } from "./logger";
import * as forwardEverything from "./app/forward-everything";
import type { Server } from "socket.io";

// Create debug logger
const debugLogger = createDebugLogger("autofun:websocket");

// Enable debug logging for socket.io-serverless
setEnabledLoggerNamespace([
  "socket.io-serverless:",
  "autofun:websocket",
  "autofun:websocket:app",
]);

// Define the worker binding types
export interface WorkerBindings extends Record<string, unknown> {
  engineActor: DurableObjectNamespace;
  socketActor: DurableObjectNamespace;
  WEBSOCKET_DO: DurableObjectNamespace;
}

/**
 * Utility function to create a new Response with CORS headers
 * This handles the type conversions between Cloudflare Workers types and standard web types
 */
function createCorsResponse(
  originalResponse: any,
  corsHeaders: Record<string, string>,
): Response {
  // Handle body
  let body: any = null;

  // For non-null bodies, use string or ArrayBuffer
  if (originalResponse.body) {
    // For WebSocket responses, keep the original body
    const contentType = originalResponse.headers.get("content-type");
    const upgradeHeader = originalResponse.headers.get("upgrade");

    if (upgradeHeader && upgradeHeader.toLowerCase() === "websocket") {
      // For WebSocket handshakes, use null body (the WebSocket handshake happens at a lower level)
      body = null;
    } else {
      try {
        // For other responses, use empty string (for simplicity)
        // Headers are what matter for many responses
        body = "";
      } catch (e) {
        // If we can't clone the body, use empty body
        body = null;
      }
    }
  }

  // Create new headers
  const newHeaders: { [key: string]: string } = {};

  // Copy original headers
  originalResponse.headers.forEach((value: string, key: string) => {
    newHeaders[key] = value;
  });

  // Add CORS headers
  Object.entries(corsHeaders).forEach(([key, value]) => {
    newHeaders[key] = value;
  });

  // Create and return the new response
  return new Response(body, {
    status: originalResponse.status,
    statusText: originalResponse.statusText,
    headers: newHeaders,
  });
}

/**
 * Engine.io Actor for handling WebSocket connections
 */
export const EngineActor = createEioActor<WorkerBindings>({
  getSocketActorNamespace(bindings: WorkerBindings) {
    return bindings.socketActor;
  },
});

/**
 * Socket.io Actor for handling Socket.IO protocol and rooms
 */
export const SocketActor = createSioActor<WorkerBindings>({
  /**
   * Called when the Socket.IO server is created
   */
  async onServerCreated(server: Server) {
    debugLogger("Socket.IO Server created");

    // Handler when a client connects to the default namespace
    server.on("connection", (socket) => {
      debugLogger("Client connected to default namespace:", socket.id);
      forwardEverything.onConnection(socket);
    });

    // Add parent namespace with regex to match custom namespaces
    server.of(forwardEverything.parentNamespace).on("connection", (socket) => {
      debugLogger(
        "Client connected to parent namespace:",
        socket.nsp.name,
        socket.id,
      );
      forwardEverything.onConnection(socket);
    });
  },

  /**
   * Called when namespaces/clients/sockets are restored
   */
  async onServerStateRestored(server: any) {
    for (const [name, namespace] of server._nsps) {
      debugLogger("Namespace restored:", name);
      for (const [socketId, socket] of namespace.sockets) {
        debugLogger("Active client:", socketId, (socket.client as any).id);
      }
    }
  },

  /**
   * Get the engine actor namespace
   */
  getEngineActorNamespace(bindings: WorkerBindings) {
    return bindings.engineActor;
  },
});

/**
 * Legacy WebSocketDO class for backward compatibility
 */
export class WebSocketDO {
  private state: any;
  private engineActor: DurableObjectNamespace;
  private socketActor: DurableObjectNamespace;

  constructor(state: any) {
    this.state = state;
    // Try to extract the bindings from state
    this.engineActor = state.bindings?.engineActor;
    this.socketActor = state.bindings?.socketActor;
    logger.log("Legacy WebSocketDO created");

    if (!this.engineActor || !this.socketActor) {
      logger.error(
        "Socket.IO not configured - missing engineActor or socketActor",
      );
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    logger.log(`WebSocketDO handling: ${path}`);

    // Add CORS headers to all responses
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
      "Access-Control-Allow-Credentials": "true",
    };

    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // Handle Socket.IO requests (both polling and WebSocket)
    if (
      path.startsWith("/socket.io/") ||
      (path === "/ws" && request.headers.get("Upgrade") === "websocket")
    ) {
      try {
        if (!this.engineActor) {
          logger.error("Socket.IO not configured - no engineActor available");
          return new Response("Socket.IO not available", {
            status: 503,
            headers: corsHeaders,
          });
        }

        const doId = this.engineActor.idFromName("singleton");
        const stub = this.engineActor.get(doId);

        // If it's a WebSocket request, convert it to Socket.IO format
        if (path === "/ws" && request.headers.get("Upgrade") === "websocket") {
          // Generate session ID for socket.io
          const sessionId = generateBase64id();

          // Extract the headers for a new request
          const headers = new Headers();
          for (const [key, value] of Object.entries(request.headers)) {
            headers.set(key, value);
          }

          // Forward to the engine actor following the demo pattern
          // Using a string URL to avoid type issues
          const response = await stub.fetch(
            `https://eioServer.internal/socket.io/?eio_sid=${sessionId}`,
            {
              method: request.method,
              headers: headers,
            },
          );

          return createCorsResponse(response, corsHeaders);
        }

        // For regular Socket.IO requests, handle potential type issues
        const headers = new Headers();
        for (const [key, value] of request.headers.entries()) {
          headers.set(key, value);
        }

        // Forward with proper handling for body
        const requestInit: any = {
          method: request.method,
          headers: headers,
        };

        // Only include body for POST/PUT etc.
        if (
          request.method !== "GET" &&
          request.method !== "HEAD" &&
          request.body
        ) {
          const bodyText = await request.clone().text();
          if (bodyText) {
            requestInit.body = bodyText;
          }
        }

        const response = await stub.fetch(url.toString(), requestInit);
        return createCorsResponse(response, corsHeaders);
      } catch (error: any) {
        logger.error("Error forwarding Socket.IO request:", error);
        return new Response(`Error: ${error.message}`, {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    // Handle broadcasting to rooms
    if (path === "/broadcast") {
      try {
        const { room, message } = (await request.json()) as {
          room: string;
          message: any;
        };

        // Forward to socket.io implementation
        if (!this.socketActor) {
          return new Response("Socket.IO not available", {
            status: 503,
            headers: corsHeaders,
          });
        }

        const doId = this.socketActor.idFromName("singleton");
        const stub = this.socketActor.get(doId);

        // Forward the broadcast request
        const response = await stub.fetch(
          "https://internal/internal/broadcast",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              room,
              event: message.event,
              data: message.data,
            }),
          },
        );

        return createCorsResponse(response, corsHeaders);
      } catch (error: any) {
        logger.error("Error in broadcast:", error);
        return new Response(`Error: ${error.message}`, {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    // Handle direct client messaging
    if (path === "/send") {
      try {
        const { clientId, message } = (await request.json()) as {
          clientId: string;
          message: any;
        };

        // Forward to socket.io implementation
        if (!this.socketActor) {
          return new Response("Socket.IO not available", {
            status: 503,
            headers: corsHeaders,
          });
        }

        const doId = this.socketActor.idFromName("singleton");
        const stub = this.socketActor.get(doId);

        // Forward the direct message request
        const response = await stub.fetch("https://internal/internal/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            event: message.event,
            data: message.data,
          }),
        });

        return createCorsResponse(response, corsHeaders);
      } catch (error: any) {
        logger.error("Error in send:", error);
        return new Response(`Error: ${error.message}`, {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    // Not found
    return new Response("Not Found", {
      status: 404,
      headers: corsHeaders,
    });
  }
}
