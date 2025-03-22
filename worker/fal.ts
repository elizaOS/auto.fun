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

// Helper to check rate limits
export async function checkRateLimits(
  env: Env,
  mint: string,
  type: MediaType,
): Promise<{ allowed: boolean; remaining: number }> {
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
  falApiKey: string,
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
  },
) {
  try {
    // This is a simple implementation that would need proper fal.ai SDK integration
    // For now, we'll use fetch directly to call the API

    let endpoint;
    let body;

    switch (data.type) {
      case MediaType.VIDEO:
        endpoint = "https://fal.run/fal-ai/t2v-turbo";
        body = {
          prompt: data.prompt,
          negative_prompt: data.negative_prompt || "",
          num_inference_steps: data.num_inference_steps || 25,
          seed: data.seed || Math.floor(Math.random() * 1000000),
          guidance_scale: data.guidance_scale || 7.5,
          width: data.width || 512,
          height: data.height || 512,
          num_frames: data.num_frames || 16,
          fps: data.fps || 8,
          motion_bucket_id: data.motion_bucket_id || 127,
        };
        break;

      case MediaType.AUDIO:
        endpoint = "https://fal.run/fal-ai/stable-audio";
        body = {
          prompt: data.prompt,
          duration_seconds: data.duration_seconds || 10,
          bpm: data.bpm || 120,
          seed: data.seed || Math.floor(Math.random() * 1000000),
        };
        break;

      case MediaType.IMAGE:
      default:
        endpoint = "https://fal.run/fal-ai/flux/dev";
        body = {
          prompt: data.prompt,
          negative_prompt: data.negative_prompt || "",
          num_inference_steps: data.num_inference_steps || 25,
          seed: data.seed || Math.floor(Math.random() * 1000000),
          guidance_scale: data.guidance_scale || 7.5,
          width: data.width || 1024,
          height: data.height || 1024,
        };
        break;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${falApiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Error from fal.ai: ${response.statusText}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    logger.error("Error generating media with fal.ai:", error);
    throw error;
  }
}
