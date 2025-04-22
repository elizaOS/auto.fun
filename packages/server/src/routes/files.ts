import { Hono } from "hono";
import { S3Client, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { logger } from "../util";
import { Buffer } from 'node:buffer'; // Ensure Buffer is available

// Define the fixed public base URL for constructing links
const PUBLIC_STORAGE_BASE_URL = "https://621d1008ef1cb024077560dcb94dd126.r2.cloudflarestorage.com/autofun-storage";

// Singleton S3 Client instance
let s3ClientInstance: S3Client | null = null;

// Helper function to create/get S3 client instance using process.env
function getS3Client(): S3Client {
    if (s3ClientInstance) {
        return s3ClientInstance;
    }

    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucketName = process.env.R2_BUCKET_NAME; // Keep bucket name check here for validation

    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
        logger.error("Missing R2 S3 API environment variables. Check R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME.");
        throw new Error("Missing required R2 S3 API environment variables.");
    }
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

    s3ClientInstance = new S3Client({
        region: "auto",
        endpoint: endpoint,
        credentials: {
            accessKeyId: accessKeyId,
            secretAccessKey: secretAccessKey,
        },
    });

    logger.log(`S3 Client initialized for endpoint: ${endpoint}`);
    return s3ClientInstance;
}

// Define the router (Env removed from Bindings as we use process.env)
const fileRouter = new Hono<{ Bindings: {} }>();

fileRouter.get("/metadata/:filename", async (c) => {
  const filename = c.req.param("filename");
  const isTemp = c.req.query("temp") === "true";

  logger.log(
    `[/metadata/:filename] Request received for filename: ${filename}, temp=${isTemp}`,
  );

  try {
    if (!filename || !filename.endsWith(".json")) {
      logger.error("[/metadata/:filename] Invalid filename format:", filename);
      return c.json({ error: "Filename parameter must end with .json" }, 400);
    }

    const s3Client = getS3Client();
    const bucketName = process.env.R2_BUCKET_NAME;
    if (!bucketName) {
        throw new Error("R2_BUCKET_NAME environment variable is not set.");
    }

    // Determine which location to check first based on the temp parameter
    const primaryKey = isTemp
      ? `token-metadata-temp/${filename}`
      : `token-metadata/${filename}`;
    const fallbackKey = isTemp
      ? `token-metadata/${filename}`
      : `token-metadata-temp/${filename}`;

    let objectResponse;
    let objectKey = primaryKey;

    try {
        logger.log(
          `[/metadata/:filename] Checking primary location: ${primaryKey}`,
        );
        const getPrimaryCmd = new GetObjectCommand({ Bucket: bucketName, Key: primaryKey });
        objectResponse = await s3Client.send(getPrimaryCmd);
    } catch (error: any) {
        if (error.name === 'NoSuchKey') {
            logger.log(
                `[/metadata/:filename] Not found in primary location, checking fallback: ${fallbackKey}`,
            );
            objectKey = fallbackKey; // Update key for fallback attempt
            try {
                const getFallbackCmd = new GetObjectCommand({ Bucket: bucketName, Key: fallbackKey });
                objectResponse = await s3Client.send(getFallbackCmd);
            } catch (fallbackError: any) {
                if (fallbackError.name === 'NoSuchKey') {
                    logger.error(
                        `[/metadata/:filename] Metadata not found in either location for ${filename}`,
                    );
                    return c.json({ error: "Metadata not found" }, 404);
                } else {
                     logger.error(`[/metadata/:filename] Error fetching fallback metadata ${fallbackKey}:`, fallbackError);
                     throw fallbackError; // Rethrow unexpected error
                }
            }
        } else {
             logger.error(`[/metadata/:filename] Error fetching primary metadata ${primaryKey}:`, error);
            throw error; // Rethrow unexpected error
        }
    }

    // If we have an objectResponse, process it
    const contentType = objectResponse.ContentType || "application/json";
    const data = await objectResponse.Body?.transformToString(); // Read body stream

    if (data === undefined) {
        logger.error(`[/metadata/:filename] Metadata body stream is empty for ${objectKey}`);
        return c.json({ error: "Failed to read metadata content" }, 500);
    }

    logger.log(
      `[/metadata/:filename] Found metadata: Key=${objectKey}, Size=${objectResponse.ContentLength}, Type=${contentType}`,
    );

    // Set appropriate CORS headers for public access
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": contentType,
      "Cache-Control": isTemp ? "max-age=3600" : "max-age=86400", // Shorter cache for temp metadata
    };

    logger.log(`[/metadata/:filename] Serving metadata: ${filename}`);
    return new Response(data, { headers: corsHeaders });
  } catch (error) {
    logger.error(
      `[/metadata/:filename] Error serving metadata ${filename}:`,
      error,
    );
    return c.json({ error: "Failed to serve metadata JSON" }, 500);
  }
});

fileRouter.get("/image/:filename", async (c) => {
  const filename = c.req.param("filename");
  logger.log(`[/image/:filename] Request received for filename: ${filename}`);
  try {
    if (!filename) {
      logger.warn("[/image/:filename] Filename parameter is missing");
      return c.json({ error: "Filename parameter is required" }, 400);
    }

    const s3Client = getS3Client();
    const bucketName = process.env.R2_BUCKET_NAME;
    if (!bucketName) {
        throw new Error("R2_BUCKET_NAME environment variable is not set.");
    }

    // Check if this is a special generation image request
    const generationMatch = filename.match(
      /^generation-([A-Za-z0-9]{32,44})-([1-9][0-9]*)\.jpg$/,
    );

    let imageKey;
    if (generationMatch) {
      const [_, mint, number] = generationMatch;
      imageKey = `generations/${mint}/gen-${number}.jpg`;
      logger.log(
        `[/image/:filename] Detected generation image request: ${imageKey}`,
      );
    } else {
      imageKey = `token-images/${filename}`;
    }

    try {
        logger.log(
          `[/image/:filename] Attempting to get object from S3 key: ${imageKey}`,
        );
        const getCmd = new GetObjectCommand({ Bucket: bucketName, Key: imageKey });
        const objectResponse = await s3Client.send(getCmd);

        logger.log(
          `[/image/:filename] Found object in S3: Size=${objectResponse.ContentLength}, Type=${objectResponse.ContentType}`,
        );

        // Determine appropriate content type
        let contentType = objectResponse.ContentType || "image/jpeg";

        // Adjust content type based on filename extension if needed (S3 ContentType should be reliable)
        if (filename.endsWith(".json")) {
            contentType = "application/json";
        } else if (filename.endsWith(".png")) {
            contentType = "image/png";
        } else if (filename.endsWith(".gif")) {
            contentType = "image/gif";
        } else if (filename.endsWith(".svg")) {
            contentType = "image/svg+xml";
        } else if (filename.endsWith(".webp")) {
            contentType = "image/webp";
        }

        // Read the body stream into an ArrayBuffer
        const data = await objectResponse.Body?.transformToByteArray();
        if (!data) {
             logger.error(`[/image/:filename] Image body stream is empty for ${imageKey}`);
             return c.json({ error: "Failed to read image content" }, 500);
        }
        const dataBuffer = Buffer.from(data);

        const corsHeaders = {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age": "86400",
        };

        logger.log(
          `[/image/:filename] Serving ${filename} with type ${contentType}`,
        );
        return new Response(dataBuffer, {
          headers: {
            "Content-Type": contentType,
            "Content-Length": objectResponse.ContentLength?.toString() ?? '0',
            "Cache-Control": "public, max-age=31536000",
            ...corsHeaders,
          },
        });

    } catch (error: any) {
        if (error.name === 'NoSuchKey') {
            logger.warn(
                `[/image/:filename] Image not found in S3 for key: ${imageKey}`,
            );

            // DEBUG: List files in the directory to help diagnose issues
            try {
                const prefix = imageKey.substring(0, imageKey.lastIndexOf('/') + 1);
                const listCmd = new ListObjectsV2Command({ Bucket: bucketName, Prefix: prefix, MaxKeys: 10 });
                const listResponse = await s3Client.send(listCmd);
                const keys = listResponse.Contents?.map((o) => o.Key ?? 'unknown-key') ?? []; // Fix implicit any
                logger.log(
                    `[/image/:filename] Files in ${prefix} directory: ${keys.join(", ")}`,
                );
            } catch (listError) {
                logger.error(
                    `[/image/:filename] Error listing files in directory: ${listError}`,
                );
            }

            return c.json({ error: "Image not found" }, 404);
        } else {
            logger.error(`[/image/:filename] Error fetching image ${imageKey} from S3:`, error);
            throw error; // Rethrow unexpected error
        }
    }

  } catch (error) {
    logger.error(`[/image/:filename] Error serving image ${filename}:`, error);
    return c.json({ error: "Failed to serve image" }, 500);
  }
});

fileRouter.get("/twitter-image/:imageId", async (c) => {
  try {
    const imageId = c.req.param("imageId");
    if (!imageId) {
      return c.json({ error: "Image ID parameter is required" }, 400);
    }

    const s3Client = getS3Client();
    const bucketName = process.env.R2_BUCKET_NAME;
     if (!bucketName) {
        throw new Error("R2_BUCKET_NAME environment variable is not set.");
    }

    // Construct the full storage key
    // Assuming the image was uploaded with .jpg extension
    const imageKey = `twitter-images/${imageId}.jpg`;

    try {
        const getCmd = new GetObjectCommand({ Bucket: bucketName, Key: imageKey });
        const objectResponse = await s3Client.send(getCmd);

        // Get the content type and data
        const contentType = objectResponse.ContentType || "image/jpeg";
        const data = await objectResponse.Body?.transformToByteArray();
        if (!data) {
             logger.error(`[/twitter-image] Image body stream is empty for ${imageKey}`);
             return c.json({ error: "Failed to read Twitter image content" }, 500);
        }
        const dataBuffer = Buffer.from(data);

        // Set CORS headers for browser access
        const corsHeaders = {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age": "86400",
        };

        // Return the image with appropriate headers
        return new Response(dataBuffer, {
          headers: {
            "Content-Type": contentType,
            "Content-Length": objectResponse.ContentLength?.toString() ?? '0',
            "Cache-Control": "public, max-age=31536000", // Cache for 1 year
            ...corsHeaders,
          },
        });
    } catch (error: any) {
         if (error.name === 'NoSuchKey') {
            logger.warn(`[/twitter-image] Twitter image not found in S3 for key: ${imageKey}`);
            return c.json({ error: "Twitter profile image not found" }, 404);
         } else {
             logger.error(`[/twitter-image] Error fetching image ${imageKey} from S3:`, error);
             throw error;
         }
    }

  } catch (error) {
    logger.error("Error serving Twitter profile image:", error);
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to serve Twitter profile image",
      },
      500,
    );
  }
});

// Check for generated images on a token by mint address in R2 (using S3 API)
fileRouter.get("/check-generated-images/:mint", async (c) => {
  try {
    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    const s3Client = getS3Client();
    const bucketName = process.env.R2_BUCKET_NAME;
     if (!bucketName) {
        // Log warning but return success:false instead of throwing 500
        logger.error("R2_BUCKET_NAME environment variable is not set for image check.");
        return c.json({ success: false, hasImages: false, error: "Storage not configured" }, 503);
    }


    // Check for generated images in R2 using S3 ListObjectsV2
    const generationImagesPrefix = `generations/${mint}/`;
    logger.log(
      `Checking for generated images with prefix: ${generationImagesPrefix}`,
    );

    try {
      const listCmd = new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: generationImagesPrefix,
          MaxKeys: 10, // Check for at least one, limit to 10 for performance
      });
      const listResponse = await s3Client.send(listCmd);

      const imageKeys = listResponse.Contents?.map((obj) => obj.Key ?? 'unknown-key') ?? []; // Fix implicit any
      const imageCount = imageKeys.length;
      const hasImages = imageCount > 0;

      logger.log(
        `Found ${imageCount} generated images for token ${mint}`, // Log actual count
      );

      // For security, we don't return the full image keys but just the existence
      // and let the frontend construct URLs based on naming conventions
      return c.json({
        success: true,
        hasImages: hasImages,
        count: imageCount,
        pattern: hasImages ? `generations/${mint}/gen-[1-${imageCount}].jpg` : null,
      });
    } catch (error) {
      logger.error(`Error listing generated images via S3 API: ${error}`);
      // Don't expose internal S3 errors directly
      return c.json({
        success: false,
        hasImages: false,
        error: "Failed to list generated images",
      }, 500);
    }
  } catch (error) {
    logger.error(`Error checking generated images: ${error}`);
    return c.json(
      {
        success: false,
        hasImages: false,
        error: "Server error",
      },
      500,
    );
  }
});

export default fileRouter;
