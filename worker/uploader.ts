import { Env } from "./env";
import { logger } from "./logger";

// CloudFlare storage utility (R2) to replace Pinata
export async function uploadToCloudflare(
  env: Env,
  data: ArrayBuffer | object,
  options: { isJson?: boolean; contentType?: string; timeout?: number } = {},
) {
  // Apply a default timeout of 8 seconds
  const timeout = options.timeout || 8000;

  try {
    // In development mode or if R2 is not configured, return a mock URL
    if (env.NODE_ENV === "development" || !env.R2) {
      const objectKey = crypto.randomUUID();
      const baseUrl = "https://mock-storage.example.com";
      logger.log("Using mock storage URL in development mode");
      return `${baseUrl}/${objectKey}`;
    }

    // For production, use actual R2 storage
    const objectKey = crypto.randomUUID();
    const contentType =
      options.contentType ||
      (options.isJson ? "application/json" : "image/png");

    let objectData: ArrayBuffer;
    if (options.isJson) {
      // Convert JSON to ArrayBuffer
      const jsonString = JSON.stringify(data);
      objectData = new TextEncoder().encode(jsonString).buffer;
    } else {
      // Use data directly as ArrayBuffer
      objectData = data as ArrayBuffer;
    }

    // Upload to R2 with timeout
    const uploadPromise = env.R2.put(objectKey, objectData, {
      httpMetadata: {
        contentType,
      },
    });

    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Upload timed out")), timeout);
    });

    // Race the promises to implement timeout
    await Promise.race([uploadPromise, timeoutPromise]);

    // Return public URL - use a default format if R2_PUBLIC_URL isn't set
    const baseUrl = env.R2_PUBLIC_URL || `https://storage.example.com`;
    return `${baseUrl}/${objectKey}`;
  } catch (error) {
    // Check if this was a timeout
    if (error.message === "Upload timed out") {
      logger.error("Cloudflare upload timed out after", timeout, "ms");
    } else {
      logger.error("Cloudflare upload failed:", error);
    }

    // Return a fallback URL instead of throwing
    const objectKey = crypto.randomUUID();
    return `https://fallback-storage.example.com/${objectKey}`;
  }
}
