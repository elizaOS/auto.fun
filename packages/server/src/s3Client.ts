import { S3Client, CreateBucketCommand, HeadBucketCommand, NotFound } from "@aws-sdk/client-s3";
import { logger } from "./util";

// --- Configuration Constants ---
const PUBLIC_STORAGE_BASE_URL = process.env.PUBLIC_STORAGE_BASE_URL || "https://storage.auto.fun";
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
 * Initializes and returns the shared S3 client instance (MinIO or S3 compatible),
 * bucket name, and public base URL.
 * Prioritizes MinIO if MINIO_ENDPOINT is set.
 */
export async function getS3Client(): Promise<{ client: S3Client, bucketName: string, publicBaseUrl: string }> {
    if (isInitialized && s3ClientInstance && resolvedBucketName && resolvedPublicBaseUrl) {
        return { client: s3ClientInstance, bucketName: resolvedBucketName, publicBaseUrl: resolvedPublicBaseUrl };
    }

    if (isInitialized) {
        throw new Error("S3 Client was marked initialized but instance/details are missing.");
    }

    isInitialized = true;

    // Read all potential config vars
    const minioEndpointEnv = process.env.MINIO_ENDPOINT;
    const s3EndpointEnv = process.env.S3_STORAGE_ENDPOINT; // Reverted user change here
    const s3AccessKeyIdEnv = process.env.S3_ACCESS_KEY_ID;
    const s3SecretAccessKeyEnv = process.env.S3_SECRET_ACCESS_KEY;
    const s3BucketNameEnv = process.env.S3_BUCKET_NAME;

    try {
        // --- Priority 1: Use MinIO if MINIO_ENDPOINT is explicitly set ---
        if (minioEndpointEnv) {
            logger.log(`[S3 Client Setup] Using MinIO based on MINIO_ENDPOINT environment variable: ${minioEndpointEnv}`);
            const minioAccessKey = process.env.MINIO_ACCESS_KEY || DEFAULT_MINIO_ACCESS_KEY;
            const minioSecretKey = process.env.MINIO_SECRET_KEY || DEFAULT_MINIO_SECRET_KEY;
            const minioBucket = process.env.MINIO_BUCKET_NAME || DEFAULT_MINIO_BUCKET;

            s3ClientInstance = new S3Client({
                endpoint: minioEndpointEnv,
                region: DEFAULT_MINIO_REGION,
                credentials: { accessKeyId: minioAccessKey, secretAccessKey: minioSecretKey },
                forcePathStyle: true, // IMPORTANT for MinIO
            });
            isUsingMinio = true;
            resolvedBucketName = minioBucket;
            resolvedPublicBaseUrl = `${minioEndpointEnv}/${resolvedBucketName}`; // Use the env var endpoint
            logger.log(`[S3 Client Setup] MinIO Client initialized. Endpoint: ${minioEndpointEnv}, Bucket: ${resolvedBucketName}`);

            await ensureMinioBucketExists(s3ClientInstance, resolvedBucketName);

        }
        // --- Priority 2: Use Generic S3 if all S3_* vars are set (and MINIO_ENDPOINT wasn't) ---
        else if (s3EndpointEnv && s3AccessKeyIdEnv && s3SecretAccessKeyEnv && s3BucketNameEnv) {
            logger.log(`[S3 Client Setup] Using S3 Compatible Storage based on S3_* environment variables. Endpoint: ${s3EndpointEnv}`);
            s3ClientInstance = new S3Client({
                region: "auto", // May need adjustment for non-R2
                endpoint: s3EndpointEnv,
                credentials: { accessKeyId: s3AccessKeyIdEnv, secretAccessKey: s3SecretAccessKeyEnv },
            });
            isUsingMinio = false;
            resolvedBucketName = s3BucketNameEnv;

            // Determine public base URL
            if (s3EndpointEnv.includes('r2.cloudflarestorage.com')) {
                resolvedPublicBaseUrl = PUBLIC_STORAGE_BASE_URL;
                logger.log(`[S3 Client Setup] Detected R2 endpoint, using public base URL: ${resolvedPublicBaseUrl}`);
            } else {
                 // Fallback: Construct base url - consider adding S3_PUBLIC_BASE_URL env var
                 resolvedPublicBaseUrl = `${s3EndpointEnv}/${s3BucketNameEnv}`;
                 logger.warn(`[S3 Client Setup] Using generic S3 endpoint. Constructed public base URL: ${resolvedPublicBaseUrl}. Verify this is correct or set S3_PUBLIC_BASE_URL.`);
            }
            logger.log(`[S3 Client Setup] S3 Compatible Client initialized. Bucket: ${resolvedBucketName}`);

        }
        // --- Priority 3: Fallback to Default MinIO if no specific config found ---
        else {
            logger.warn("[S3 Client Setup] Neither MINIO_ENDPOINT nor all S3_* variables were fully set. Falling back to default MinIO configuration for local development.");
            const defaultMinioEndpoint = DEFAULT_MINIO_ENDPOINT; // Use default constant
            const minioAccessKey = DEFAULT_MINIO_ACCESS_KEY;
            const minioSecretKey = DEFAULT_MINIO_SECRET_KEY;
            const minioBucket = DEFAULT_MINIO_BUCKET;

            s3ClientInstance = new S3Client({
                endpoint: defaultMinioEndpoint,
                region: DEFAULT_MINIO_REGION,
                credentials: { accessKeyId: minioAccessKey, secretAccessKey: minioSecretKey },
                forcePathStyle: true,
            });
            isUsingMinio = true;
            resolvedBucketName = minioBucket;
            resolvedPublicBaseUrl = `${defaultMinioEndpoint}/${resolvedBucketName}`;
            logger.log(`[S3 Client Setup] Default MinIO Client initialized. Endpoint: ${defaultMinioEndpoint}, Bucket: ${resolvedBucketName}`);

            await ensureMinioBucketExists(s3ClientInstance, resolvedBucketName);
        }

        // Final check after configuration attempts
        if (!s3ClientInstance || !resolvedBucketName || !resolvedPublicBaseUrl) {
             throw new Error("S3 client initialization failed unexpectedly after configuration attempt.");
        }

        return { client: s3ClientInstance, bucketName: resolvedBucketName, publicBaseUrl: resolvedPublicBaseUrl };

    } catch (error) {
        isInitialized = false;
        logger.error("[S3 Client Setup] Critical error during S3 client initialization:", error);
        throw error;
    }
} 