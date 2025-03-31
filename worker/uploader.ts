import { Env } from "./env";
import { logger } from "./logger";
import fs from "node:fs";
import path from "node:path";

// Store file mapping in a local cache for development
const _fileCache: { [key: string]: string } = {};

// Log uploaded files to an in-memory cache only
function logUploadedFile(env: Env, objectKey: string, publicUrl: string) {
  try {
    if (env.NODE_ENV !== "development") return;

    // Add to in-memory cache
    _fileCache[objectKey] = publicUrl;

    // Skip filesystem operations in Cloudflare Workers environment
    logger.log(`Logged R2 file to memory cache: ${objectKey} -> ${publicUrl}`);
  } catch (error) {
    logger.warn("Error logging uploaded file:", error);
  }
}

// Get all logged files
export function getUploadedFiles(): { [key: string]: string } {
  return { ..._fileCache };
}

// CloudFlare storage utility (R2) to replace Pinata
export async function uploadToCloudflare(
  env: Env,
  data: ArrayBuffer | object,
  options: {
    isJson?: boolean;
    contentType?: string;
    timeout?: number;
    filename?: string;
  } = {},
) {
  // Apply a default timeout of 15 seconds
  const timeout = options.timeout || 15000;

  // Generate a random UUID for uniqueness
  const randomId = crypto.randomUUID();

  // If filename is provided, use it to create a more meaningful object key
  let objectKey = randomId;
  if (options.filename) {
    // Sanitize filename - remove any potentially problematic characters
    const sanitizedFilename = options.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    // Create a key that includes both the UUID (for uniqueness) and the filename (for identification)
    objectKey = `${randomId}-${sanitizedFilename}`;
  }

  // Set the appropriate content type
  const contentType =
    options.contentType || (options.isJson ? "application/json" : "image/jpeg");

  logger.log(
    `Using content type ${contentType} for upload, filename: ${options.filename || "none"}`,
  );

  // Check if we're running in local development via Miniflare
  const isLocalDev =
    typeof process !== "undefined" && process.env.NODE_ENV === "development";

  try {
    // For development and testing, use a local URL when R2 is available via Miniflare
    if (isLocalDev) {
      // We're in local development mode with Miniflare
      const localDevBaseUrl = "http://localhost:8787/api/image";

      // Prepare data for upload
      let objectData: ArrayBuffer;
      if (options.isJson) {
        // Convert JSON to ArrayBuffer for storage
        const jsonString = JSON.stringify(data);
        objectData = new TextEncoder().encode(jsonString).buffer as ArrayBuffer;
      } else if (data instanceof ArrayBuffer) {
        // Use data directly if it's already an ArrayBuffer
        objectData = data;
      } else if (
        data instanceof Uint8Array ||
        data instanceof Uint8ClampedArray
      ) {
        // Handle typed arrays
        objectData = data.buffer as ArrayBuffer;
      } else {
        // Fallback for other object types
        const jsonString = JSON.stringify(data);
        objectData = new TextEncoder().encode(jsonString).buffer as ArrayBuffer;
      }

      // Upload to the local R2 store
      if (env.R2) {
        await env.R2.put(objectKey, objectData, {
          httpMetadata: { contentType },
          customMetadata: {
            publicAccess: "true",
            originalFilename: options.filename || "",
            localDev: "true",
          },
        });
      }

      // Generate local dev URL that uses our image endpoint
      const localUrl = `${localDevBaseUrl}/${objectKey}`;
      logger.log(`Successfully uploaded to local R2 (Miniflare): ${localUrl}`);

      // Log the file URL for debugging
      logUploadedFile(env, objectKey, localUrl);

      return localUrl;
    }

    // Prepare data for upload
    let objectData: ArrayBuffer;
    if (options.isJson) {
      // Convert JSON to ArrayBuffer for storage
      const jsonString = JSON.stringify(data);
      objectData = new TextEncoder().encode(jsonString).buffer as ArrayBuffer;
    } else if (data instanceof ArrayBuffer) {
      // Use data directly if it's already an ArrayBuffer
      objectData = data;
    } else if (
      data instanceof Uint8Array ||
      data instanceof Uint8ClampedArray
    ) {
      // Handle typed arrays
      objectData = data.buffer as ArrayBuffer;
    } else {
      // Fallback for other object types
      const jsonString = JSON.stringify(data);
      objectData = new TextEncoder().encode(jsonString).buffer as ArrayBuffer;
    }

    try {
      // Create R2 upload and timeout promises
      const uploadPromise = new Promise<void>((resolve, reject) => {
        // Check if R2 is available
        if (!env.R2) {
          reject(new Error("R2 is not available"));
          return;
        }

        // Perform the upload
        env.R2.put(objectKey, objectData, {
          httpMetadata: { contentType },
          customMetadata: {
            publicAccess: "true",
            originalFilename: options.filename || "",
          },
        })
          .then(() => resolve())
          .catch((e) => reject(e));
      });

      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error("Upload timed out")), timeout);
      });

      // Race the promises to implement timeout
      await Promise.race([uploadPromise, timeoutPromise]);

      // Format the public URL correctly - make sure R2_PUBLIC_URL is properly set
      // e.g., 'https://pub-XXXX.r2.dev' or your custom domain
      let baseUrl = env.R2_PUBLIC_URL;

      // Ensure baseUrl doesn't have a trailing slash
      if (baseUrl && baseUrl.endsWith("/")) {
        baseUrl = baseUrl.slice(0, -1);
      }

      if (!baseUrl) {
        logger.warn(
          "R2_PUBLIC_URL environment variable is not set. Using default URL format.",
        );
        baseUrl = "https://example.r2.dev"; // This won't work, proper config needed
      }

      // Ensure proper path formatting - don't URL encode here as R2 handles this
      const publicUrl = `${baseUrl}/${objectKey}`;

      // Log file in development mode
      logUploadedFile(env, objectKey, publicUrl);

      logger.log(`Successfully uploaded to R2: ${publicUrl}`);
      return publicUrl;
    } catch (r2Error) {
      // Handle specific R2 errors
      logger.error("Cloudflare R2 upload failed:", r2Error);

      // Return a fallback URL
      const fallbackUrl = `${env.R2_PUBLIC_URL || "https://fallback-storage.example.com"}/${objectKey}`;
      logger.log(`Using fallback URL: ${fallbackUrl}`);

      // Still log the fallback URL
      logUploadedFile(env, objectKey, fallbackUrl);

      return fallbackUrl;
    }
  } catch (error) {
    // Log detailed error information
    if (error instanceof Error && error.message === "Upload timed out") {
      logger.error(`Cloudflare R2 upload timed out after ${timeout}ms`);
    } else {
      logger.error("Error in uploadToCloudflare:", error);
    }

    // Return a fallback URL
    const fallbackUrl = `${env.R2_PUBLIC_URL || "https://fallback-storage.example.com"}/${objectKey}`;
    logger.log(`Using fallback URL: ${fallbackUrl}`);

    // Log even fallback URLs from errors
    logUploadedFile(env, objectKey, fallbackUrl);

    return fallbackUrl;
  }
}
