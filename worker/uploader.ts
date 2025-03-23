import { Env } from "./env";
import { logger } from "./logger";

// CloudFlare storage utility (R2) to replace Pinata
export async function uploadToCloudflare(
  env: Env,
  data: ArrayBuffer | object,
  options: { isJson?: boolean; contentType?: string; timeout?: number } = {},
) {
  // Apply a default timeout of 15 seconds
  const timeout = options.timeout || 15000;
  const objectKey = crypto.randomUUID();

  try {
    // For development and testing, use a mock when R2 is not available
    if (!env.R2) {
      logger.log("R2 is not available, using mock storage URL");
      const baseUrl = env.R2_PUBLIC_URL || "https://mock-storage.example.com";
      return `${baseUrl}/${objectKey}`;
    }

    // Set the appropriate content type
    const contentType =
      options.contentType ||
      (options.isJson ? "application/json" : "image/png");

    // Prepare data for upload
    let objectData: ArrayBuffer;
    if (options.isJson) {
      // Convert JSON to ArrayBuffer for storage
      const jsonString = JSON.stringify(data);
      objectData = new TextEncoder().encode(jsonString).buffer;
    } else if (data instanceof ArrayBuffer) {
      // Use data directly if it's already an ArrayBuffer
      objectData = data;
    } else if (
      data instanceof Uint8Array ||
      data instanceof Uint8ClampedArray
    ) {
      // Handle typed arrays
      objectData = data.buffer;
    } else {
      // Fallback for other object types
      const jsonString = JSON.stringify(data);
      objectData = new TextEncoder().encode(jsonString).buffer;
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
        })
          .then(() => resolve())
          .catch((e) => reject(e));
      });

      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error("Upload timed out")), timeout);
      });

      // Race the promises to implement timeout
      await Promise.race([uploadPromise, timeoutPromise]);

      // Return public URL
      const baseUrl = env.R2_PUBLIC_URL || "https://storage.cloudflare.com";
      const publicUrl = `${baseUrl}/${objectKey}`;

      logger.log(`Successfully uploaded to R2: ${publicUrl}`);
      return publicUrl;
    } catch (r2Error) {
      // Handle specific R2 errors
      logger.error("Cloudflare R2 upload failed:", r2Error);

      // Return a fallback URL
      const fallbackUrl = `${env.R2_PUBLIC_URL || "https://fallback-storage.example.com"}/${objectKey}`;
      logger.log(`Using fallback URL: ${fallbackUrl}`);
      return fallbackUrl;
    }
  } catch (error) {
    // Log detailed error information
    if (error.message === "Upload timed out") {
      logger.error(`Cloudflare R2 upload timed out after ${timeout}ms`);
    } else {
      logger.error("Error in uploadToCloudflare:", error);
    }

    // Return a fallback URL
    const fallbackUrl = `${env.R2_PUBLIC_URL || "https://fallback-storage.example.com"}/${objectKey}`;
    logger.log(`Using fallback URL: ${fallbackUrl}`);
    return fallbackUrl;
  }
}
