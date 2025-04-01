import { fal } from "@fal-ai/client";
import { eq, and, gte, sql } from "drizzle-orm";
import { getDB, mediaGenerations, tokens } from "./db";
import { Env } from "./env";
import { logger } from "./logger";

// Enum for media types
export enum MediaType {
  IMAGE = "image",
  VIDEO = "video",
  AUDIO = "audio",
}

// Configure rate limits per media type
export const RATE_LIMITS = {
  [MediaType.IMAGE]: {
    MAX_GENERATIONS_PER_DAY: 50,
    COOLDOWN_PERIOD_MS: 24 * 60 * 60 * 1000, // 24 hours
  },
  [MediaType.VIDEO]: {
    MAX_GENERATIONS_PER_DAY: 10, // Lower limit for videos
    COOLDOWN_PERIOD_MS: 24 * 60 * 60 * 1000,
  },
  [MediaType.AUDIO]: {
    MAX_GENERATIONS_PER_DAY: 20,
    COOLDOWN_PERIOD_MS: 24 * 60 * 60 * 1000,
  },
};

// Token ownership requirements for generation
export const TOKEN_OWNERSHIP = {
  DEFAULT_MINIMUM: 1000, // Default minimum token amount required for basic image generation
  FAST_MODE_MINIMUM: 10000, // Minimum tokens for fast video/audio or slow image
  SLOW_MODE_MINIMUM: 100000, // Minimum tokens for slow video
  ENABLED: true, // Flag to enable/disable the ownership requirement feature
};

// Helper to check rate limits
export async function checkRateLimits(
  env: Env,
  mint: string,
  type: MediaType,
  publicKey?: string,
): Promise<{ allowed: boolean; remaining: number; message?: string }> {
  const db = getDB(env);

  // Check if token exists
  const token = await db
    .select()
    .from(tokens)
    .where(eq(tokens.mint, mint))
    .limit(1);

  if (!token || token.length === 0) {
    throw new Error("Token not found");
  }

  const cutoffTime = new Date(
    Date.now() - RATE_LIMITS[type].COOLDOWN_PERIOD_MS,
  ).toISOString();

  // Count generations in the last 24 hours
  const countResult = await db
    .select({ count: sql`count(*)` })
    .from(mediaGenerations)
    .where(
      and(
        eq(mediaGenerations.mint, mint),
        eq(mediaGenerations.type, type),
        gte(mediaGenerations.timestamp, cutoffTime),
      ),
    );

  const count = Number(countResult[0]?.count || 0);
  const remaining = Math.max(
    0,
    RATE_LIMITS[type].MAX_GENERATIONS_PER_DAY - count,
  );

  return {
    allowed: count < RATE_LIMITS[type].MAX_GENERATIONS_PER_DAY,
    remaining,
  };
}

// Helper to generate media using fal.ai
export async function generateMedia(
  env: Env,
  data: {
    prompt: string;
    type: MediaType;
    negative_prompt?: string;
    num_inference_steps?: number;
    seed?: number;
    num_frames?: number;
    fps?: number;
    motion_bucket_id?: number;
    duration?: number;
    duration_seconds?: number;
    bpm?: number;
    guidance_scale?: number;
    width?: number;
    height?: number;
    mode?: "fast" | "slow";
    image_url?: string; // For image-to-video
    lyrics?: string; // For music generation with lyrics
  },
) {
  // Set default timeout
  const timeout = process.env.NODE_ENV === "test" ? 3000 : 30000;

  // Initialize fal.ai client
  if (env.FAL_API_KEY) {
    fal.config({
      credentials: env.FAL_API_KEY,
    });
  } else {
    throw new Error("FAL_API_KEY is not configured");
  }

  // Create a timeout promise
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`Media generation timed out after ${timeout}ms`)),
      timeout,
    ),
  );

  let generationPromise;

  // Use Cloudflare Worker AI for image generation (fast mode)
  if (data.type === MediaType.IMAGE && (!data.mode || data.mode === "fast")) {
    try {
      // Use Cloudflare AI binding instead of external API
      if (!env.AI) {
        throw new Error("Cloudflare AI binding not configured");
      }

      // Use the flux-1-schnell model via AI binding
      const result = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
        prompt: data.prompt,
        steps: 4,
      });

      // Create data URL from the base64 image
      const dataURI = `data:image/jpeg;base64,${result.image}`;

      // Return in a format compatible with our existing code
      return {
        data: {
          images: [
            {
              url: dataURI,
            },
          ],
        },
      };
    } catch (error) {
      logger.error("Error in Cloudflare image generation:", error);

      // Return a fallback
      const placeholderUrl = `https://placehold.co/600x400?text=${encodeURIComponent(data.prompt)}`;
      return {
        data: {
          images: [{ url: placeholderUrl }],
        },
      };
    }
  } else if (data.type === MediaType.IMAGE && data.mode === "slow") {
    // Use flux-pro ultra for slow high-quality image generation
    generationPromise = fal.subscribe("fal-ai/flux-pro/v1.1-ultra", {
      input: {
        prompt: data.prompt,
        // Optional parameters passed if available
        ...(data.width ? { width: data.width } : {}),
        ...(data.height ? { height: data.height } : {}),
      },
      logs: true,
      onQueueUpdate: (update: any) => {
        if (update.status === "IN_PROGRESS") {
          logger.log("Image generation progress:", update.logs);
        }
      },
    });

    // Race against timeout
    return await Promise.race([generationPromise, timeoutPromise]);
  } else if (data.type === MediaType.VIDEO && data.image_url) {
    // Image-to-video generation
    const model =
      data.mode === "slow"
        ? "fal-ai/pixverse/v4/image-to-video"
        : "fal-ai/pixverse/v4/image-to-video/fast";

    generationPromise = fal.subscribe(model, {
      input: {
        prompt: data.prompt,
        image_url: data.image_url,
      },
      logs: true,
      onQueueUpdate: (update: any) => {
        if (update.status === "IN_PROGRESS") {
          logger.log("Image-to-video generation progress:", update.logs);
        }
      },
    });

    // Race against timeout
    return await Promise.race([generationPromise, timeoutPromise]);
  } else if (data.type === MediaType.VIDEO) {
    // Text-to-video generation
    const model =
      data.mode === "slow"
        ? "fal-ai/pixverse/v4/text-to-video"
        : "fal-ai/pixverse/v4/text-to-video/fast";

    generationPromise = fal.subscribe(model, {
      input: {
        prompt: data.prompt,
        // Optional parameters passed if available
        ...(data.width ? { width: data.width } : {}),
        ...(data.height ? { height: data.height } : {}),
      },
      logs: true,
      onQueueUpdate: (update: any) => {
        if (update.status === "IN_PROGRESS") {
          logger.log("Video generation progress:", update.logs);
        }
      },
    });

    // Race against timeout
    return await Promise.race([generationPromise, timeoutPromise]);
  } else if (data.type === MediaType.AUDIO) {
    if (data.lyrics) {
      // Use diffrhythm for music generation with lyrics
      generationPromise = fal.subscribe("fal-ai/diffrhythm", {
        input: {
          lyrics: data.lyrics,
          reference_audio_url: "https://example.com/reference.mp3", // Default reference URL
        },
        logs: true,
        onQueueUpdate: (update: any) => {
          if (update.status === "IN_PROGRESS") {
            logger.log("Music generation progress:", update.logs);
          }
        },
      });
    } else {
      // Default audio generation
      generationPromise = fal.subscribe("fal-ai/stable-audio", {
        input: {
          prompt: data.prompt,
          // Optional parameters passed if available
          ...(data.duration_seconds
            ? { duration: data.duration_seconds }
            : { duration: 10 }),
        },
        logs: true,
        onQueueUpdate: (update: any) => {
          if (update.status === "IN_PROGRESS") {
            logger.log("Audio generation progress:", update.logs);
          }
        },
      });
    }

    // Race against timeout
    return await Promise.race([generationPromise, timeoutPromise]);
  }
}
