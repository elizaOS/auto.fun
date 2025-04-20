// WebSocket utilities for handling chunked messages

// Store for reassembling chunked messages
interface ChunkInfo {
  chunks: string[];
  totalChunks: number;
  originalEvent: string;
  receivedChunks: number;
}

// Map to store chunks by their ID and their cleanup timeouts
const chunkStore = new Map<string, ChunkInfo & { timeout?: number }>();

// Timeout for cleaning up stale chunks (5 minutes)
const CHUNK_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Process a WebSocket message, handling chunked messages if needed
 * @param message The raw message from the WebSocket
 * @param onMessage Callback for complete messages
 * @returns true if the message was handled as a chunk, false if it's a regular message
 */
export function processWebSocketMessage(
  message: any,
  onMessage: (event: string, data: any) => void,
): boolean {
  // Check if this is a chunk-related message
  if (!message || !message.event) return false;

  // Handle chunk start message
  if (
    message.event.endsWith("_chunk_start") &&
    message.chunkId &&
    message.totalChunks
  ) {
    // Clear any existing timeout for this chunk ID
    const existingChunkInfo = chunkStore.get(message.chunkId);
    if (existingChunkInfo?.timeout) {
      clearTimeout(existingChunkInfo.timeout);
    }

    // Set a timeout to clean up this chunk data if it's not completed
    const timeout = window.setTimeout(() => {
      console.warn(
        `Cleaning up stale chunk data for message ${message.chunkId}`,
      );
      chunkStore.delete(message.chunkId);
    }, CHUNK_TIMEOUT_MS);

    // Initialize storage for this chunked message
    chunkStore.set(message.chunkId, {
      chunks: new Array(message.totalChunks).fill(""),
      totalChunks: message.totalChunks,
      originalEvent: message.originalEvent,
      receivedChunks: 0,
      timeout,
    });
    return true; // Message handled as chunk
  }

  // Handle chunk data
  if (
    message.event.endsWith("_chunk") &&
    message.chunkId &&
    message.chunkIndex !== undefined
  ) {
    const chunkInfo = chunkStore.get(message.chunkId);
    if (!chunkInfo) {
      console.error(
        `Received chunk for unknown message ID: ${message.chunkId}`,
      );
      return false;
    }

    // Store this chunk
    chunkInfo.chunks[message.chunkIndex] = message.data;
    chunkInfo.receivedChunks++;

    return true; // Message handled as chunk
  }

  // Handle chunk end message
  if (message.event.endsWith("_chunk_end") && message.chunkId) {
    const chunkInfo = chunkStore.get(message.chunkId);
    if (!chunkInfo) {
      console.error(
        `Received end marker for unknown message ID: ${message.chunkId}`,
      );
      return false;
    }

    // Check if we have all chunks
    if (chunkInfo.receivedChunks < chunkInfo.totalChunks) {
      console.warn(
        `Missing chunks for message ${message.chunkId}: ${chunkInfo.receivedChunks}/${chunkInfo.totalChunks}`,
      );
      // We could wait longer, but for now we'll try to process with what we have
    }

    // Combine all chunks
    const completeData = chunkInfo.chunks.join("");

    // Clean up, including the timeout
    const timeout = chunkInfo.timeout;
    if (timeout) {
      clearTimeout(timeout);
    }
    chunkStore.delete(message.chunkId);

    // Parse the data
    let parsedData;
    try {
      parsedData = JSON.parse(completeData);
    } catch (e) {
      console.error(`Failed to parse reassembled chunked message: ${e}`);

      // Try to recover by sending the raw data if parsing fails
      try {
        console.warn("Attempting to recover by passing raw data to handler");
        onMessage(chunkInfo.originalEvent, {
          rawData: completeData,
          parseError: true,
        });
      } catch (recoveryError) {
        console.error("Recovery attempt also failed:", recoveryError);
      }

      return true; // Still mark as handled
    }

    // Call the message handler with the reassembled message
    try {
      onMessage(chunkInfo.originalEvent, parsedData);
    } catch (error) {
      console.error(
        `Error in message handler for event ${chunkInfo.originalEvent}:`,
        error,
      );
    }

    return true; // Message handled as chunk
  }

  // Not a chunk-related message, let the caller handle it
  return false;
}

/**
 * This utility is used to handle large WebSocket messages that have been split into chunks.
 *
 * It's already integrated with the SocketWrapper in src/utils/socket.ts, so you don't need
 * to use it directly in most cases. The SocketWrapper will automatically handle chunked
 * messages and reassemble them before triggering the appropriate event handlers.
 *
 * How it works:
 * 1. When a message is too large (>128KB), the server splits it into chunks
 * 2. The server sends a start message, followed by each chunk, and finally an end message
 * 3. This utility collects all chunks and reassembles them into the original message
 * 4. Once all chunks are received, it parses the data and triggers the original event
 *
 * This allows the application to handle messages of any size without running into
 * WebSocket message size limitations.
 */
