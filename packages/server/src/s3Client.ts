import { S3Client, CreateBucketCommand, HeadBucketCommand, NotFound } from "@aws-sdk/client-s3";
import { logger } from "./util";

// --- Configuration Constants ---
const PUBLIC_R2_STORAGE_BASE_URL = "https://storage.autofun.tech";
const DEFAULT_MINIO_ENDPOINT = "http://localhost:9000";
const DEFAULT_MINIO_ACCESS_KEY = 'minio_user';
const DEFAULT_MINIO_SECRET_KEY = 'minio_password';
const DEFAULT_MINIO_BUCKET = "autofun";
const DEFAULT_MINIO_REGION = "us-east-1"; // Default region for MinIO

// --- Singleton Instance Variables ---
let s3ClientInstance: S3Client | null = null;
let isUsingMinio = false;
let resolvedBucketName: string | null = null;
let resolvedPublicBaseUrl: string | null = null;
let isInitialized = false; // Flag to prevent multiple initializations

// --- Initialization and Client Getter Function ---

/**
 * Checks if the default MinIO bucket exists and creates it if not.
 * Should only be called once during MinIO client initialization.
 */
async function ensureMinioBucketExists(client: S3Client, bucketName: string): Promise<void> {
    try {
        logger.log(`[MinIO Check] Checking if bucket '${bucketName}' exists...`);
        await client.send(new HeadBucketCommand({ Bucket: bucketName }));
        logger.log(`[MinIO Check] Bucket '${bucketName}' already exists.`);
    } catch (error: any) {
        // Check if the error is because the bucket doesn't exist
        // Error handling might differ slightly based on SDK version/MinIO version
        // Common indicators: NotFound, NoSuchBucket, status code 404
        if (error.name === 'NotFound' || error.name === 'NoSuchBucket' || error.$metadata?.httpStatusCode === 404) {
            logger.log(`[MinIO Check] Bucket '${bucketName}' not found. Attempting to create...`);
            try {
                await client.send(new CreateBucketCommand({ Bucket: bucketName }));
                logger.log(`[MinIO Check] Successfully created bucket '${bucketName}'.`);
            } catch (createError) {
                logger.error(`[MinIO Check] Failed to create bucket '${bucketName}':`, createError);
                throw new Error(`Failed to create necessary MinIO bucket: ${bucketName}`); // Rethrow critical error
            }
        } else {
            // Unexpected error during HeadBucket check
            logger.error(`[MinIO Check] Error checking for bucket '${bucketName}':`, error);
            throw new Error(`Error checking for MinIO bucket: ${bucketName}`); // Rethrow critical error
        }
    }
}

/**
 * Initializes and returns the shared S3 client instance (R2 or MinIO),
 * bucket name, and public base URL.
 * Includes logic to auto-create the default MinIO bucket if needed.
 */
export async function getS3Client(): Promise<{ client: S3Client, bucketName: string, publicBaseUrl: string }> {
    if (isInitialized && s3ClientInstance && resolvedBucketName && resolvedPublicBaseUrl) {
        return { client: s3ClientInstance, bucketName: resolvedBucketName, publicBaseUrl: resolvedPublicBaseUrl };
    }

    if (isInitialized) {
        // Should not happen if logic is correct, but safety check
        throw new Error("S3 Client was marked initialized but instance/details are missing.");
    }

    // Prevent re-entry during initialization
    isInitialized = true; // Mark as initializing

    const accountId = process.env.S3_ACCOUNT_ID;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    const r2BucketName = process.env.S3_BUCKET_NAME;

    try {
        if (accountId && accessKeyId && secretAccessKey && r2BucketName) {
            // --- Use R2 --- 
            logger.log("[S3 Client Setup] Using R2 Cloudflare Storage based on environment variables.");
            const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
            s3ClientInstance = new S3Client({
                region: "auto",
                endpoint: endpoint,
                credentials: { accessKeyId, secretAccessKey },
            });
            isUsingMinio = false;
            resolvedBucketName = r2BucketName;
            resolvedPublicBaseUrl = PUBLIC_R2_STORAGE_BASE_URL;
            logger.log(`[S3 Client Setup] R2 Client initialized. Endpoint: ${endpoint}, Bucket: ${resolvedBucketName}`);

        } else {
            // --- Use MinIO (Local Default) --- 
            logger.warn("[S3 Client Setup] R2 S3 environment variables not fully set. Falling back to local MinIO defaults.");
            const minioEndpoint = process.env.MINIO_ENDPOINT || DEFAULT_MINIO_ENDPOINT;
            const minioAccessKey = process.env.MINIO_ACCESS_KEY || DEFAULT_MINIO_ACCESS_KEY;
            const minioSecretKey = process.env.MINIO_SECRET_KEY || DEFAULT_MINIO_SECRET_KEY;
            const minioBucket = process.env.MINIO_BUCKET_NAME || DEFAULT_MINIO_BUCKET;

            s3ClientInstance = new S3Client({
                endpoint: minioEndpoint,
                region: DEFAULT_MINIO_REGION,
                credentials: { accessKeyId: minioAccessKey, secretAccessKey: minioSecretKey },
                forcePathStyle: true, // IMPORTANT for MinIO
            });
            isUsingMinio = true;
            resolvedBucketName = minioBucket;
            // For MinIO, the public URL typically includes the bucket name path
            resolvedPublicBaseUrl = `${minioEndpoint}/${resolvedBucketName}`;
            logger.log(`[S3 Client Setup] MinIO Client initialized. Endpoint: ${minioEndpoint}, Bucket: ${resolvedBucketName}`);

            // Ensure the bucket exists on MinIO
            await ensureMinioBucketExists(s3ClientInstance, resolvedBucketName);
        }

        if (!s3ClientInstance || !resolvedBucketName || !resolvedPublicBaseUrl) {
             throw new Error("S3 client initialization failed unexpectedly.");
        }

        return { client: s3ClientInstance, bucketName: resolvedBucketName, publicBaseUrl: resolvedPublicBaseUrl };

    } catch (error) {
        isInitialized = false; // Reset flag on error to allow retry if applicable
        logger.error("[S3 Client Setup] Critical error during S3 client initialization:", error);
        throw error; // Re-throw the error to halt execution if setup fails
    }
} 