import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
// Removed Env import as we use process.env now
// import { Env } from "./env";
import { logger } from "./util";
import crypto from "node:crypto"; // Import crypto if not already available globally in the environment
import { Buffer } from "node:buffer"; // Ensure Buffer is available

// Define the fixed public base URL
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
        // Log the missing variables for easier debugging
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


// Store file mapping in a local cache for development
const _fileCache: { [key: string]: string } = {};

// Log uploaded files to an in-memory cache only
function logUploadedFile(objectKey: string, publicUrl: string) {
  try {
    // Use a check for a specific dev environment variable if needed
    const isDevelopment = process.env.NODE_ENV === 'development';
    if (!isDevelopment) return;

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

// CloudFlare storage utility (using S3 interface via process.env)
export async function uploadToCloudflare(
  // Removed env parameter
  data: ArrayBuffer | Buffer | Uint8Array | object,
  options: {
    isJson?: boolean;
    contentType?: string;
    filename?: string;
    metadata?: Record<string, string>; // For custom metadata
    basePath?: string; // Allow specifying base path like 'token-metadata' or 'token-images'
  } = {},
) {

  // Generate a random UUID for uniqueness
  const randomId = crypto.randomUUID();

  // Determine base path
  const basePath = options.basePath ?? (options.isJson ? "token-metadata" : "token-images");


  // If filename is provided, use it to create a more meaningful object key
  let objectKeySuffix = randomId; // Default suffix if no filename
  if (options.filename) {
    // Sanitize filename - remove any potentially problematic characters
    const sanitizedFilename = options.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    // Create a suffix that includes both the UUID (for uniqueness) and the filename (for identification)
    objectKeySuffix = `${randomId}-${sanitizedFilename}`;
  }

  // Combine base path and suffix
  const objectKey = `${basePath}/${objectKeySuffix}`;


  // Set the appropriate content type
  const contentType =
    options.contentType || (options.isJson ? "application/json" : "image/jpeg");

  logger.log(
    `Preparing upload: Key=${objectKey}, ContentType=${contentType}, Filename=${options.filename || "none"}`,
  );


  try {
    // Prepare data for upload (needs to be Buffer or stream for S3)
    let objectData: Buffer | Uint8Array;
    if (options.isJson && !(data instanceof Buffer) && !(data instanceof Uint8Array)) {
      // If JSON flag is set and data is not already binary, stringify
      const jsonString = JSON.stringify(data);
      objectData = Buffer.from(jsonString, 'utf8');
    } else if (data instanceof ArrayBuffer) {
      objectData = Buffer.from(data);
    } else if (data instanceof Uint8Array || Buffer.isBuffer(data)) {
       objectData = data;
    } else {
      // Fallback for non-binary, non-JSON flagged data: attempt stringify
      logger.warn("Data provided to uploadToCloudflare is not ArrayBuffer, Uint8Array, or Buffer, and not flagged as JSON. Attempting JSON stringify fallback.");
      try {
          const jsonString = JSON.stringify(data);
          objectData = Buffer.from(jsonString, 'utf8');
      } catch (stringifyError) {
          logger.error("Failed to stringify fallback data:", stringifyError);
          throw new Error("Unsupported data type for upload and failed to stringify.");
      }
    }

     const s3Client = getS3Client(); // Get client using process.env
     const bucketName = process.env.R2_BUCKET_NAME;
     if (!bucketName) {
         throw new Error("R2_BUCKET_NAME environment variable is not set.");
     }

     const putCommand = new PutObjectCommand({
         Bucket: bucketName,
         Key: objectKey,
         Body: objectData,
         ContentType: contentType,
         // Add Cache-Control or other metadata as needed
         CacheControl: "public, max-age=31536000", // Example: 1 year cache
         Metadata: { // Pass custom metadata here if needed
             publicAccess: "true", // Example custom metadata
             originalFilename: options.filename || "",
             ...(options.metadata || {}) // Include any other custom metadata
         },
     });

     logger.log(`Uploading to S3: Bucket=${bucketName}, Key=${objectKey}`);
     await s3Client.send(putCommand);
     logger.log(`S3 Upload successful for Key: ${objectKey}`);


      // Construct the public URL using the fixed base
      const publicUrl = `${PUBLIC_STORAGE_BASE_URL}/${objectKey}`;

      // Log file in development mode
      logUploadedFile(objectKey, publicUrl);
      logger.log(`Successfully uploaded to R2 (S3 API), Public URL: ${publicUrl}`);

      return publicUrl;

  } catch (error) {
    logger.error(`S3 API upload failed for Key ${objectKey}:`, error);
    throw new Error(`Failed to upload object: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Function to upload a generated image to a predictable path for a token
export async function uploadGeneratedImage(
  // Removed env parameter
  data: ArrayBuffer | Buffer | Uint8Array, // Accept Buffer/Uint8Array directly
  tokenMint: string,
  generationNumber: number,
  options: {
    contentType?: string;
  } = {},
) {

  // Create predictable path based on token mint and generation number
  const objectKey = `generations/${tokenMint}/gen-${generationNumber}.jpg`;

  // Set the appropriate content type
  const contentType = options.contentType || "image/jpeg";

  logger.log(
    `Preparing generated image upload: Key=${objectKey}, ContentType=${contentType}`,
  );

  try {
    // Prepare data for upload
    let objectData: Buffer | Uint8Array;
     if (data instanceof ArrayBuffer) {
        objectData = Buffer.from(data);
     } else if (data instanceof Uint8Array || Buffer.isBuffer(data)) {
        objectData = data;
     } else {
         logger.error("Invalid data type provided to uploadGeneratedImage. Expected ArrayBuffer, Buffer, or Uint8Array.");
         throw new Error("Invalid data type for image upload.");
     }


      const s3Client = getS3Client(); // Get client using process.env
      const bucketName = process.env.R2_BUCKET_NAME;
        if (!bucketName) {
            throw new Error("R2_BUCKET_NAME environment variable is not set.");
        }

      const putCommand = new PutObjectCommand({
          Bucket: bucketName,
          Key: objectKey,
          Body: objectData,
          ContentType: contentType,
          CacheControl: "public, max-age=31536000", // Example: 1 year cache
          Metadata: { // Custom metadata
              publicAccess: "true",
              tokenMint: tokenMint,
              generationNumber: generationNumber.toString(),
          },
      });

      logger.log(`Uploading generated image to S3: Bucket=${bucketName}, Key=${objectKey}`);
      await s3Client.send(putCommand);
      logger.log(`S3 Upload successful for generated image Key: ${objectKey}`);


      // Construct the public URL using the fixed base
      const publicUrl = `${PUBLIC_STORAGE_BASE_URL}/${objectKey}`;

      // Log file in development mode
      logUploadedFile(objectKey, publicUrl);

      logger.log(`Successfully uploaded generated image via S3 API, Public URL: ${publicUrl}`);
      return publicUrl;

  } catch (error) {
    logger.error(`Error in uploadGeneratedImage (S3 API) for Key ${objectKey}:`, error);
    throw new Error(`Failed to upload generated image: ${error instanceof Error ? error.message : String(error)}`);
  }
}
