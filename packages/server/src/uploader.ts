import { Env } from "./env";
import { logger } from "./util";

// Store file mapping in a local cache for development
const _fileCache: { [key: string]: string } = {};

// Log uploaded files to an in-memory cache only
function logUploadedFile(objectKey: string, publicUrl: string) {
  try {
    if (process.env.NODE_ENV !== "development") return;

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
        const objectPath = options.isJson ? "token-metadata" : "token-images";

        // Check if R2 is available
        if (!process.env.R2) {
          reject(new Error("R2 is not available"));
          return;
        }

        // Perform the upload
        process.env.R2.put(objectPath + "/" + objectKey, objectData, {
          httpMetadata: { contentType },
          customMetadata: {
            publicAccess: "true",
            originalFilename: options.filename || "",
          },
        })
          .then(() => {
            resolve();
          })
          .catch((e: any) => {
            reject(e);
          });
      });

      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Upload timed out"));
        }, timeout);
      });

      // Race the promises to implement timeout
      await Promise.race([uploadPromise, timeoutPromise]);

      const apiPath = options.isJson ? "metadata" : "image";
      // Ensure proper path formatting - don't URL encode here as R2 handles this
      const objectPath = options.isJson ? "token-metadata" : "token-images";

      logger.log(
        "uploading to r2",
        process.env.R2_PUBLIC_URL,
        process.env.API_URL,
        process.env.NODE_ENV,
      );
      const publicUrl = process.env.API_URL?.includes("localhost")
        ? `${process.env.API_URL}/api/${apiPath}/${objectKey}`
        : `${process.env.R2_PUBLIC_URL}/${objectPath}/${objectKey}`;

      // Log file in development mode
      logUploadedFile(objectKey, publicUrl);

      logger.log(`Successfully uploaded to R2: ${publicUrl}`);
      return publicUrl;
    } catch (r2Error) {
      // Handle specific R2 errors
      logger.error("Cloudflare R2 upload failed:", r2Error);

      // Return a fallback URL
      const fallbackUrl = `${process.env.R2_PUBLIC_URL || "https://fallback-storage.example.com"}/${objectKey}`;
      logger.log("Using fallback URL:", fallbackUrl);

      // Still log the fallback URL
      logUploadedFile(objectKey, fallbackUrl);

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
    const fallbackUrl = `${process.env.R2_PUBLIC_URL || "https://fallback-storage.example.com"}/${objectKey}`;
    logger.log("Using fallback URL from catch block:", fallbackUrl);

    // Log even fallback URLs from errors
    logUploadedFile(objectKey, fallbackUrl);

    return fallbackUrl;
  }
}

// Function to upload a generated image to a predictable path for a token
export async function uploadGeneratedImage(
  data: ArrayBuffer | object,
  tokenMint: string,
  generationNumber: number,
  options: {
    contentType?: string;
    timeout?: number;
  } = {},
) {
  // Apply a default timeout of 15 seconds
  const timeout = options.timeout || 15000;

  // Create predictable path based on token mint and generation number
  const objectKey = `generations/${tokenMint}/gen-${generationNumber}.jpg`;

  // Set the appropriate content type
  const contentType = options.contentType || "image/jpeg";

  try {
    // Prepare data for upload
    let objectData: ArrayBuffer;
    if (data instanceof ArrayBuffer) {
      objectData = data;
    } else if (
      data instanceof Uint8Array ||
      data instanceof Uint8ClampedArray
    ) {
      objectData = data.buffer as ArrayBuffer;
    } else {
      const jsonString = JSON.stringify(data);
      objectData = new TextEncoder().encode(jsonString).buffer as ArrayBuffer;
    }

    try {
      // Create R2 upload and timeout promises
      const uploadPromise = new Promise<void>((resolve, reject) => {
        if (!env.R2) {
          reject(new Error("R2 is not available"));
          return;
        }

        // Perform the upload
        process.env.R2.put(objectKey, objectData, {
          httpMetadata: {
            contentType,
            cacheControl: "public, max-age=31536000",
          },
          customMetadata: {
            publicAccess: "true",
            tokenMint: tokenMint,
            generationNumber: generationNumber.toString(),
          },
        })
          .then(() => {
            resolve();
          })
          .catch((e: any) => {
            reject(e);
          });
      });

      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Upload timed out"));
        }, timeout);
      });

      // Race the promises to implement timeout
      await Promise.race([uploadPromise, timeoutPromise]);

      // Construct the public URL
      const publicUrl = `${process.env.R2_PUBLIC_URL}/${objectKey}`;

      // Log file in development mode
      logUploadedFile(objectKey, publicUrl);

      logger.log(`Successfully uploaded generated image to R2: ${publicUrl}`);
      return publicUrl;
    } catch (r2Error) {
      logger.error("Cloudflare R2 upload failed:", r2Error);
      throw r2Error;
    }
  } catch (error) {
    logger.error("Error in uploadGeneratedImage:", error);
    throw error;
  }
}
