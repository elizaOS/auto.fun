import { Hono } from "hono";
import { Env } from "../env";
import { logger } from "../util";

// Define the router with environment typing
const fileRouter = new Hono<{
  Bindings: Env;
  Variables: {
    user?: { publicKey: string } | null;
  };
}>();

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

    if (!c.env.R2) {
      logger.error("[/metadata/:filename] R2 storage is not configured");
      return c.json({ error: "R2 storage is not available" }, 500);
    }

    // Determine which location to check first based on the temp parameter
    const primaryKey = isTemp
      ? `token-metadata-temp/${filename}`
      : `token-metadata/${filename}`;
    const fallbackKey = isTemp
      ? `token-metadata/${filename}`
      : `token-metadata-temp/${filename}`;

    logger.log(
      `[/metadata/:filename] Checking primary location: ${primaryKey}`,
    );
    let object = await c.env.R2.get(primaryKey);

    // If not found in primary location, check fallback location
    if (!object) {
      logger.log(
        `[/metadata/:filename] Not found in primary location, checking fallback: ${fallbackKey}`,
      );
      object = await c.env.R2.get(fallbackKey);
    }

    if (!object) {
      logger.error(
        `[/metadata/:filename] Metadata not found in either location`,
      );
      return c.json({ error: "Metadata not found" }, 404);
    }

    logger.log(
      `[/metadata/:filename] Found metadata: size=${object.size}, type=${object.httpMetadata?.contentType}`,
    );

    const contentType = object.httpMetadata?.contentType || "application/json";
    const data = await object.text();

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

    if (!c.env.R2) {
      logger.error("[/image/:filename] R2 storage is not available");
      return c.json({ error: "R2 storage is not available" }, 500);
    }

    // Check if this is a special generation image request
    // Format: generation-[mint]-[number].jpg
    const generationMatch = filename.match(
      /^generation-([A-Za-z0-9]{32,44})-([1-9][0-9]*)\.jpg$/,
    );

    let imageKey;
    if (generationMatch) {
      const [_, mint, number] = generationMatch;
      // This is a special request for a generation image
      imageKey = `generations/${mint}/gen-${number}.jpg`;
      logger.log(
        `[/image/:filename] Detected generation image request: ${imageKey}`,
      );
    } else {
      // Regular image request
      imageKey = `token-images/${filename}`;
    }

    logger.log(
      `[/image/:filename] Attempting to get object from R2 key: ${imageKey}`,
    );
    const object = await c.env.R2.get(imageKey);

    if (!object) {
      logger.warn(
        `[/image/:filename] Image not found in R2 for key: ${imageKey}`,
      );

      // DEBUG: List files in the token-images directory to help diagnose issues
      try {
        const prefix = imageKey.split("/")[0] + "/";
        const objects = await c.env.R2.list({
          prefix,
          limit: 10,
        });
        logger.log(
          `[/image/:filename] Files in ${prefix} directory: ${objects.objects.map((o) => o.key).join(", ")}`,
        );
      } catch (listError) {
        logger.error(
          `[/image/:filename] Error listing files in directory: ${listError}`,
        );
      }

      return c.json({ error: "Image not found" }, 404);
    }
    logger.log(
      `[/image/:filename] Found object in R2: size=${object.size}, type=${object.httpMetadata?.contentType}`,
    );

    // Determine appropriate content type
    let contentType = object.httpMetadata?.contentType || "image/jpeg";

    // For JSON files, ensure content type is application/json
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

    const data = await object.arrayBuffer();

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    };

    logger.log(
      `[/image/:filename] Serving ${filename} with type ${contentType}`,
    );
    return new Response(data, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": object.size.toString(),
        "Cache-Control": "public, max-age=31536000",
        ...corsHeaders,
      },
    });
  } catch (error) {
    logger.error(`[/image/:filename] Error serving image ${filename}:`, error);
    return c.json({ error: "Failed to serve image" }, 500);
  }
});

fileRouter.get("/twitter-image/:imageId", async (c) => {
  try {
    // Get the imageId from params
    const imageId = c.req.param("imageId");
    if (!imageId) {
      return c.json({ error: "Image ID parameter is required" }, 400);
    }

    // Ensure R2 is available
    if (!c.env.R2) {
      return c.json({ error: "R2 storage is not available" }, 500);
    }

    // Construct the full storage key
    const imageKey = `twitter-images/${imageId}.jpg`;

    // Fetch the image from R2
    const object = await c.env.R2.get(imageKey);

    if (!object) {
      return c.json({ error: "Twitter profile image not found" }, 404);
    }

    // Get the content type and data
    const contentType = object.httpMetadata?.contentType || "image/jpeg";
    const data = await object.arrayBuffer();

    // Set CORS headers for browser access
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    };

    // Return the image with appropriate headers
    return new Response(data, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": object.size.toString(),
        "Cache-Control": "public, max-age=31536000", // Cache for 1 year
        ...corsHeaders,
      },
    });
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

// Check for generated images on a token by mint address in R2
fileRouter.get("/check-generated-images/:mint", async (c) => {
  try {
    const mint = c.req.param("mint");
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    if (!c.env.R2) {
      logger.error("R2 storage is not available");
      return c.json({ images: [] }, 200); // Return empty list if R2 not available
    }

    // Check for generated images in R2
    const generationImagesPrefix = `generations/${mint}/`;
    logger.log(
      `Checking for generated images with prefix: ${generationImagesPrefix}`,
    );

    // Try to list objects with the given prefix
    try {
      const objects = await c.env.R2.list({
        prefix: generationImagesPrefix,
        limit: 10, // Reasonable limit
      });

      // Extract the filenames from the full paths
      const imageKeys = objects.objects.map((obj) => {
        const parts = obj.key.split("/");
        return parts[parts.length - 1]; // Get just the filename
      });

      logger.log(
        `Found ${imageKeys.length} generated images for token ${mint}`,
      );

      // For security, we don't return the full image keys but just the existence
      // and let the frontend construct URLs based on naming conventions
      return c.json({
        success: true,
        hasImages: imageKeys.length > 0,
        count: imageKeys.length,
        pattern:
          imageKeys.length > 0
            ? `generations/${mint}/gen-[1-${imageKeys.length}].jpg`
            : null,
      });
    } catch (error) {
      logger.error(`Error listing generated images: ${error}`);
      return c.json({
        success: false,
        hasImages: false,
        error: "Failed to list generated images",
      });
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
