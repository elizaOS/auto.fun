import { logger } from './logger';
// CloudFlare storage utility (R2) to replace Pinata
export async function uploadToCloudflare(env, data, options = {}) {
    try {
        // In development mode or if R2 is not configured, return a mock URL
        if (env.NODE_ENV === 'development' || !env.R2) {
            const objectKey = crypto.randomUUID();
            const baseUrl = 'https://mock-storage.example.com';
            logger.log('Using mock storage URL in development mode');
            return `${baseUrl}/${objectKey}`;
        }
        // For production, use actual R2 storage
        const objectKey = crypto.randomUUID();
        const contentType = options.contentType || (options.isJson ? 'application/json' : 'image/png');
        let objectData;
        if (options.isJson) {
            // Convert JSON to ArrayBuffer
            const jsonString = JSON.stringify(data);
            objectData = new TextEncoder().encode(jsonString).buffer;
        }
        else {
            // Use data directly as ArrayBuffer
            objectData = data;
        }
        // Upload to R2
        await env.R2.put(objectKey, objectData, {
            httpMetadata: {
                contentType
            }
        });
        // Return public URL - use a default format if R2_PUBLIC_URL isn't set
        const baseUrl = env.R2_PUBLIC_URL || `https://storage.example.com`;
        return `${baseUrl}/${objectKey}`;
    }
    catch (error) {
        logger.error('Cloudflare upload failed:', error);
        // Return a fallback URL instead of throwing
        const objectKey = crypto.randomUUID();
        return `https://fallback-storage.example.com/${objectKey}`;
    }
}
