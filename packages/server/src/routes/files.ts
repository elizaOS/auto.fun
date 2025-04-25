import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Hono } from "hono";
import { Buffer } from 'node:buffer'; // Ensure Buffer is available
import { logger } from "../util";
import { getS3Client } from "../s3Client"; // Import shared S3 client function
import { User } from "../db";
import { Socket } from "socket.io";
import { Context } from "hono";

// Define the fixed public base URL for R2
const PUBLIC_S3_STORAGE_BASE_URL_FILES = "https://storage.autofun.tech";
// Define the default local MinIO base URL
const DEFAULT_MINIO_BASE_URL_FILES = "http://localhost:9000";
// Define the default local MinIO bucket
const DEFAULT_MINIO_BUCKET_FILES = "autofun";

// Singleton S3 Client instance
const s3ClientInstance: S3Client | null = null;
const isUsingMinioFiles = false; // Flag for files S3 client

// Helper function to upload to R2/MinIO
async function uploadToStorage(buffer: Buffer, options: { contentType: string, key: string }): Promise<string> {
  // Use the shared S3 client getter
  const { client: s3Client, bucketName, publicBaseUrl } = await getS3Client();

  const putCmd = new PutObjectCommand({
    Bucket: bucketName,
    Key: options.key,
    Body: buffer,
    ContentType: options.contentType,
    // ACL: 'public-read', // ACL might not be needed/supported depending on setup (e.g., MinIO policies)
  });

  try {
    await s3Client.send(putCmd);
    logger.log(`Successfully uploaded to Storage: ${options.key}`);
    const finalPublicUrl = `${publicBaseUrl}/${options.key}`;
    return finalPublicUrl;
  } catch (error) {
    logger.error(`Failed to upload ${options.key} to Storage:`, error);
    throw new Error(`Failed to upload ${options.key}`);
  }
}

// Define the router (Env removed from Bindings as we use process.env)
const fileRouter = new Hono<{ Bindings: {} }>();

// Define context variables for Hono
type Variables = {
  user?: { publicKey: string } | null;
  socket: Socket;
};

// Extend Context type for variables
declare module "hono" {
  interface ContextVariableMap {
    user?: { publicKey: string } | null;
    socket: Socket;
  }
}

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

    // Use the shared S3 client getter
    const { client: s3Client, bucketName } = await getS3Client();

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

    // Define CORS headers early
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    };

    // Use the shared S3 client getter
    const { client: s3Client, bucketName } = await getS3Client();

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
      // Assume standard token image if not a generation request
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

      // corsHeaders defined above

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

        // Attempt fallback to check token-images/ if it was a generation request initially
        if (generationMatch) {
          const fallbackKey = `token-images/${filename.replace(/^generation-([A-Za-z0-9]{32,44})-([1-9][0-9]*)\./, '')}`; // Construct fallback filename
          logger.log(`[/image/:filename] Generation image not found, attempting fallback: ${fallbackKey}`);
          try {
            const fallbackCmd = new GetObjectCommand({ Bucket: bucketName, Key: fallbackKey });
            const fallbackResponse = await s3Client.send(fallbackCmd);
            logger.log(
              `[/image/:filename] Found fallback object in S3: Size=${fallbackResponse.ContentLength}, Type=${fallbackResponse.ContentType}`,
            );
            const fallbackData = await fallbackResponse.Body?.transformToByteArray();
            if (!fallbackData) {
              logger.error(`[/image/:filename] Fallback image body stream is empty for ${fallbackKey}`);
              return c.json({ error: "Failed to read fallback image content" }, 500);
            }
            const fallbackDataBuffer = Buffer.from(fallbackData);
            const fallbackContentType = fallbackResponse.ContentType || "image/jpeg";

            return new Response(fallbackDataBuffer, {
              headers: {
                "Content-Type": fallbackContentType,
                "Content-Length": fallbackResponse.ContentLength?.toString() ?? '0',
                "Cache-Control": "public, max-age=31536000",
                ...corsHeaders, // Defined above
              },
            });

          } catch (fallbackError: any) {
            if (fallbackError.name === 'NoSuchKey') {
              logger.warn(`[/image/:filename] Fallback image also not found: ${fallbackKey}`);
            } else {
              logger.error(`[/image/:filename] Error fetching fallback image ${fallbackKey}:`, fallbackError);
            }
            // If fallback also fails, return 404
            return c.json({ error: "Image not found" }, 404);
          }
        } else {
          // If it wasn't a generation request and not found, return 404 directly
          return c.json({ error: "Image not found" }, 404);
        }

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

    // Use the shared S3 client getter
    const { client: s3Client, bucketName } = await getS3Client();

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

    // Use the shared S3 client getter
    const { client: s3Client, bucketName } = await getS3Client();

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


// --- Updated /upload route ---
fileRouter.post("/upload", async (c) => {
  try {
    // Basic auth check - assuming 'user' is set by middleware
    const user = c.get("user");
    // if (!user) { // Uncomment if auth is strictly required
    //   logger.warn("[/upload] Unauthorized attempt.");
    //   return c.json({ error: "Authentication required" }, 401);
    // }

    const body = await c.req.json();
    if (!body.image) {
      logger.warn("[/upload] Request missing image data.");
      return c.json({ error: "Image data (base64) is required" }, 400);
    }
    if (!body.metadata || !body.metadata.name || !body.metadata.symbol) {
      logger.warn("[/upload] Request missing required metadata fields (name, symbol).");
      return c.json({ error: "Metadata (name, symbol) is required" }, 400);
    }

    const matches = body.image.match(/^data:(image\/[A-Za-z-+.]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      logger.warn("[/upload] Invalid image data format (expected data:image/...;base64,...).");
      return c.json({ error: "Invalid image format" }, 400);
    }

    const contentType = matches[1];
    const imageData = matches[2];
    const imageBuffer = Buffer.from(imageData, "base64");

    // Generate filename (e.g., using symbol and timestamp for uniqueness)
    const sanitizedSymbol = body.metadata.symbol.toLowerCase().replace(/[^a-z0-9]/g, "_");
    let extension = ".jpg"; // Default
    if (contentType === "image/png") extension = ".png";
    else if (contentType === "image/gif") extension = ".gif";
    else if (contentType === "image/svg+xml") extension = ".svg";
    else if (contentType === "image/webp") extension = ".webp";
    // Consider using a unique ID instead of timestamp if high concurrency is expected
    const imageFilename = `${sanitizedSymbol}_${Date.now()}${extension}`;
    const imageKey = `token-images/${imageFilename}`;

    // --- Upload Image ---
    logger.log(`[/upload] Uploading image to Storage key: ${imageKey}`);
    const imageUrl = await uploadToStorage(imageBuffer, { contentType, key: imageKey });
    logger.log(`[/upload] Image uploaded successfully: ${imageUrl}`);
    // --- End Image Upload ---

    // --- Upload Metadata ---
    let metadataUrl = "";
    // Ensure the metadata object includes the *actual* uploaded image URL
    const finalMetadata = {
      name: body.metadata.name,
      symbol: body.metadata.symbol,
      description: body.metadata.description,
      image: imageUrl,            //  before socials
      twitter: body.metadata.twitter || "",
      telegram: body.metadata.telegram || "",
      website: body.metadata.website || "",
      discord: body.metadata.discord || "",
      createdOn: "https://auto.fun/"      // appended at the end
    };

    const metadataFilename = `${sanitizedSymbol}_${Date.now()}_metadata.json`;
    const metadataKey = `token-metadata/${metadataFilename}`;
    const metadataBuffer = Buffer.from(JSON.stringify(finalMetadata, null, 2)); // Pretty print JSON

    logger.log(`[/upload] Uploading metadata to Storage key: ${metadataKey}`);
    // Note: We upload metadata directly to Storage here.
    // The client should fetch it via the /metadata/:filename endpoint.
    const directMetadataStorageUrl = await uploadToStorage(metadataBuffer, {
      contentType: 'application/json',
      key: metadataKey
    });
    logger.log(`[/upload] Metadata uploaded successfully (direct Storage URL): ${directMetadataStorageUrl}`);

    // Construct the URL for the client to use to fetch metadata *via the API*
    // This assumes the API is running at a base URL accessible to the client.
    // Use relative path if server and client are on same domain, or absolute if needed.
    const apiUrl = process.env.API_URL || c.req.url.split('/api/')[0]; // Attempt to infer API base URL
    metadataUrl = `${apiUrl}/api/metadata/${metadataFilename}`; // This is the URL the client/programs should use
    logger.log(`[/upload] Constructed metadata URL for client: ${metadataUrl}`);
    // --- End Metadata Upload ---

    return c.json({
      success: true,
      imageUrl: imageUrl,       // Direct public URL to the image on R2
      metadataUrl: metadataUrl  // URL pointing to the /api/metadata/:filename endpoint
    });
  } catch (error) {
    logger.error("[/upload] Error processing upload request:", error);
    return c.json({ error: "Upload failed due to server error" }, 500);
  }
});


// Add a similar endpoint for imported images if needed, reusing uploadToStorage
fileRouter.post("/upload-import-image", async (c) => {
  try {
    const user = c.get("user");
    // if (!user) { ... } // Add auth if needed

    const body = await c.req.json();
    if (!body.imageBase64) {
      return c.json({ error: "Image data (imageBase64) is required" }, 400);
    }

    const matches = body.imageBase64.match(/^data:(image\/[A-Za-z-+.]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return c.json({ error: "Invalid image format" }, 400);
    }

    const contentType = matches[1];
    const imageData = matches[2];
    const imageBuffer = Buffer.from(imageData, "base64");

    // Generate a unique filename for the imported image
    let extension = ".jpg";
    if (contentType === "image/png") extension = ".png";
    else if (contentType === "image/gif") extension = ".gif";
    else if (contentType === "image/svg+xml") extension = ".svg";
    else if (contentType === "image/webp") extension = ".webp";
    const imageFilename = `imported_${Date.now()}${extension}`;
    const imageKey = `token-images/${imageFilename}`; // Store in the same place or separate?

    logger.log(`[/upload-import-image] Uploading imported image to Storage key: ${imageKey}`);
    const imageUrl = await uploadToStorage(imageBuffer, { contentType, key: imageKey });
    logger.log(`[/upload-import-image] Imported image uploaded successfully: ${imageUrl}`);

    return c.json({ success: true, imageUrl: imageUrl });

  } catch (error) {
    logger.error("[/upload-import-image] Error processing imported image upload:", error);
    return c.json({ error: "Imported image upload failed" }, 500);
  }
});

// Add new route for chat image uploads
fileRouter.post("/uploadImage", async (c) => {
  try {
    const body = await c.req.json();
    if (!body.image) {
      logger.warn("[/uploadImage] Request missing image data.");
      return c.json({ error: "Image data (base64) is required" }, 400);
    }
    if (!body.tokenMint || !body.tier) {
      logger.warn("[/uploadImage] Request missing required fields (tokenMint, tier).");
      return c.json({ error: "Token mint and tier are required" }, 400);
    }

    const matches = body.image.match(/^data:(image\/[A-Za-z-+.]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      logger.warn("[/uploadImage] Invalid image data format.");
      return c.json({ error: "Invalid image format" }, 400);
    }

    const contentType = matches[1];
    const imageData = matches[2];
    const imageBuffer = Buffer.from(imageData, "base64");

    const user = c.get("user");
    const walletId = user?.publicKey || "unknown";
    const timestamp = Date.now();
    const extension = contentType.split('/')[1] || 'jpg';
    const imageFilename = `${walletId}-${timestamp}.${extension}`;
    const imageKey = `chat-images/${body.tokenMint}/${body.tier}/${imageFilename}`;

    logger.log(`[/uploadImage] Uploading image to Storage key: ${imageKey}`);
    const imageUrl = await uploadToStorage(imageBuffer, { contentType, key: imageKey });
    logger.log(`[/uploadImage] Image uploaded successfully: ${imageUrl}`);

    const message = {
      id: crypto.randomUUID(),
      author: user?.publicKey,
      tokenMint: body.tokenMint,
      message: body.caption || "", // Store caption in message field
      media: imageUrl, // Store image URL in media field
      parentId: null,
      tier: body.tier,
      timestamp: new Date().toISOString(),
      isOptimistic: false,
      hasLiked: false
    };

    const socket = c.get("socket");
    if (socket && typeof socket.emit === 'function') {
      socket.emit("newChatMessage", message);
    }

    return c.json({ success: true, message });
  } catch (error) {
    logger.error("[/uploadImage] Error processing upload request:", error);
    return c.json({ error: "Upload failed due to server error" }, 500);
  }
});

export default fileRouter;
