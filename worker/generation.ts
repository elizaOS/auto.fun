import { eq, and, gte } from 'drizzle-orm';
import { getDB, mediaGenerations, tokens } from './db';
import { Env } from './env';
import { fal } from '@fal-ai/client';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { logger } from './logger';
import { verifyAuth } from './middleware';

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
  type: MediaType
): Promise<{ allowed: boolean, remaining: number }> {
  const db = getDB(env);
  
  const cutoffTime = new Date(
    Date.now() - RATE_LIMITS[type].COOLDOWN_PERIOD_MS
  ).toISOString();

  // Count generations in the last 24 hours
  const recentGenerationsCount = await db.select({ count: sql`count(*)` })
    .from(mediaGenerations)
    .where(
      and(
        eq(mediaGenerations.mint, mint),
        eq(mediaGenerations.type, type),
        gte(mediaGenerations.timestamp, cutoffTime)
      )
    );

  const count = Number(recentGenerationsCount[0].count);
  const remaining = RATE_LIMITS[type].MAX_GENERATIONS_PER_DAY - count;
  return { 
    allowed: count < RATE_LIMITS[type].MAX_GENERATIONS_PER_DAY,
    remaining
  };
}

// Helper to generate media using fal.ai
export async function generateMedia(
  falApiKey: string,
  data: {
    prompt: string,
    type: MediaType,
    negative_prompt?: string,
    num_inference_steps?: number,
    seed?: number,
    num_frames?: number,
    fps?: number,
    motion_bucket_id?: number,
    duration?: number,
    duration_seconds?: number,
    bpm?: number,
    guidance_scale?: number,
    width?: number,
    height?: number,
  }
) {
  // Initialize fal.ai client dynamically
  fal.config({
    credentials: falApiKey,
  });

  if (data.type === MediaType.VIDEO) {
    return await fal.subscribe("fal-ai/t2v-turbo", {
      input: {
        prompt: data.prompt,
        num_inference_steps: data.num_inference_steps || 25,
        seed: data.seed || Math.floor(Math.random() * 1000000),
        guidance_scale: data.guidance_scale || 7.5,
        num_frames: data.num_frames || 16,
        // Optional parameters passed if available
        ...(data.width ? { width: data.width } : {}),
        ...(data.height ? { height: data.height } : {}),
        ...(data.fps ? { fps: data.fps } : {}),
        ...(data.motion_bucket_id ? { motion_bucket_id: data.motion_bucket_id } : {}),
      },
      logs: true,
      onQueueUpdate: (update: any) => {
        if (update.status === "IN_PROGRESS") {
          console.log("Video generation progress:", update.logs);
        }
      },
    });
  }

  if (data.type === MediaType.AUDIO) {
    return await fal.subscribe("fal-ai/stable-audio", {
      input: {
        prompt: data.prompt,
        // Optional parameters passed if available
        ...(data.duration_seconds ? { duration: data.duration_seconds } : { duration: 10 }),
      },
      logs: true,
      onQueueUpdate: (update: any) => {
        if (update.status === "IN_PROGRESS") {
          console.log("Audio generation progress:", update.logs);
        }
      },
    });
  }

  // For images
  return await fal.run("fal-ai/flux/dev", {
    input: {
      prompt: data.prompt,
      num_inference_steps: data.num_inference_steps || 25,
      seed: data.seed || Math.floor(Math.random() * 1000000),
      guidance_scale: data.guidance_scale || 7.5,
      // Optional parameters passed if available
      ...(data.width ? { width: data.width } : { width: 1024 }),
      ...(data.height ? { height: data.height } : { height: 1024 }),
      ...(data.negative_prompt ? { negative_prompt: data.negative_prompt } : {}),
    },
  });
}

// Create a Hono app for media generation routes
const app = new Hono<{ 
  Bindings: Env;
  Variables: {
    user?: { publicKey: string } | null;
  }; 
}>();

// Add authentication middleware
app.use('*', verifyAuth);

// Media generation validation schema
const MediaGenerationRequestSchema = z.object({
  prompt: z.string().min(1).max(500),
  type: z.enum([MediaType.IMAGE, MediaType.VIDEO, MediaType.AUDIO]),
  negative_prompt: z.string().optional(),
  num_inference_steps: z.number().min(1).max(50).optional(),
  seed: z.number().optional(),
  // Video specific options
  num_frames: z.number().min(1).max(50).optional(),
  fps: z.number().min(1).max(60).optional(),
  motion_bucket_id: z.number().min(1).max(255).optional(),
  duration: z.number().optional(),
  // Audio specific options
  duration_seconds: z.number().min(1).max(30).optional(),
  bpm: z.number().min(60).max(200).optional(),
  // Common options
  guidance_scale: z.number().min(1).max(20).optional(),
  width: z.number().min(512).max(1024).optional(),
  height: z.number().min(512).max(1024).optional(),
});

// Generate media endpoint
app.post('/:mint/generate', async (c) => {
  try {
    const mint = c.req.param('mint');
    
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: 'Invalid mint address' }, 400);
    }
    
    const body = await c.req.json();
    const validatedData = MediaGenerationRequestSchema.parse(body);
    
    const db = getDB(c.env);
    
    // Verify the token exists
    const token = await db.select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);
    
    if (!token || token.length === 0) {
      return c.json({ error: 'Token not found' }, 404);
    }
    
    // Check rate limits
    const { allowed, remaining } = await checkRateLimits(c.env, mint, validatedData.type);
    if (!allowed) {
      return c.json({
        error: 'Rate limit exceeded. Please try again later.',
        limit: RATE_LIMITS[validatedData.type].MAX_GENERATIONS_PER_DAY,
        cooldown: RATE_LIMITS[validatedData.type].COOLDOWN_PERIOD_MS,
        message: `You can generate up to ${
          RATE_LIMITS[validatedData.type].MAX_GENERATIONS_PER_DAY
        } ${validatedData.type}s per day`
      }, 429);
    }
    
    // Generate media with fal.ai
    if (!c.env.FAL_API_KEY) {
      return c.json({ error: 'Media generation service is not configured' }, 503);
    }
    
    const result = await generateMedia(c.env.FAL_API_KEY, validatedData);
    
    // Extract the appropriate URL based on media type
    let mediaUrl: string;
    
    // Handle different response formats from the fal.ai API
    const typedResult = result as any; // Type casting for safety
    
    if (validatedData.type === MediaType.VIDEO && typedResult.video?.url) {
      mediaUrl = typedResult.video.url;
    } else if (validatedData.type === MediaType.AUDIO && typedResult.audio_file?.url) {
      mediaUrl = typedResult.audio_file.url;
    } else if (typedResult.images && typedResult.images.length > 0 && typedResult.images[0].url) {
      mediaUrl = typedResult.images[0].url;
    } else if (typeof typedResult === 'string') {
      // Fallback if the result is just a URL string
      mediaUrl = typedResult;
    } else {
      // Placeholder for testing
      mediaUrl = `https://placehold.co/600x400?text=${encodeURIComponent(validatedData.prompt)}`;
    }
    
    // Save generation to database
    await db.insert(mediaGenerations).values({
      id: crypto.randomUUID(),
      mint,
      type: validatedData.type,
      prompt: validatedData.prompt,
      mediaUrl,
      negativePrompt: validatedData.negative_prompt,
      numInferenceSteps: validatedData.num_inference_steps,
      seed: validatedData.seed,
      // Video specific metadata
      numFrames: validatedData.num_frames,
      fps: validatedData.fps,
      motionBucketId: validatedData.motion_bucket_id,
      duration: validatedData.duration,
      // Audio specific metadata
      durationSeconds: validatedData.duration_seconds,
      bpm: validatedData.bpm,
      creator: c.get('user')?.publicKey || null,
      timestamp: new Date().toISOString()
    });
    
    // Return the media URL and remaining generation count
    return c.json({
      success: true,
      mediaUrl,
      remainingGenerations: remaining - 1,
      resetTime: new Date(Date.now() + RATE_LIMITS[validatedData.type].COOLDOWN_PERIOD_MS).toISOString()
    });
  } catch (error) {
    logger.error('Error generating media:', error);
    
    if (error instanceof z.ZodError) {
      return c.json({ error: error.errors }, 400);
    }
    
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// Get generation history for a token
app.get('/:mint/history', async (c) => {
  try {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }
    
    const mint = c.req.param('mint');
    
    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: 'Invalid mint address' }, 400);
    }
    
    const query = c.req.query();
    const type = query.type as MediaType;
    
    // Validate media type if provided
    if (type && !Object.values(MediaType).includes(type)) {
      return c.json({ error: 'Invalid media type' }, 400);
    }
    
    const db = getDB(c.env);
    
    // Check if user owns the token
    const token = await db.select()
      .from(tokens)
      .where(
        and(
          eq(tokens.mint, mint),
          eq(tokens.creator, user.publicKey)
        )
      )
      .limit(1);
    
    if (!token || token.length === 0) {
      return c.json({ error: 'Not authorized to view generation history for this token' }, 403);
    }
    
    const cutoffTime = new Date(
      Date.now() - RATE_LIMITS[type || MediaType.IMAGE].COOLDOWN_PERIOD_MS
    ).toISOString();
    
    // Build query conditions
    const conditions = [
      eq(mediaGenerations.mint, mint),
      gte(mediaGenerations.timestamp, cutoffTime)
    ];
    
    if (type) {
      conditions.push(eq(mediaGenerations.type, type));
    }
    
    // Get recent generations from database
    const recentGenerations = await db.select()
      .from(mediaGenerations)
      .where(and(...conditions))
      .orderBy(sql`${mediaGenerations.timestamp} DESC`);
    
    // Count generations by type
    const counts = {
      [MediaType.IMAGE]: 0,
      [MediaType.VIDEO]: 0,
      [MediaType.AUDIO]: 0
    };
    
    recentGenerations.forEach((gen: { type: MediaType }) => {
      counts[gen.type as MediaType]++;
    });
    
    return c.json({
      generations: recentGenerations,
      total: recentGenerations.length,
      remaining: type
        ? RATE_LIMITS[type].MAX_GENERATIONS_PER_DAY - counts[type]
        : {
            [MediaType.IMAGE]: RATE_LIMITS[MediaType.IMAGE].MAX_GENERATIONS_PER_DAY - counts[MediaType.IMAGE],
            [MediaType.VIDEO]: RATE_LIMITS[MediaType.VIDEO].MAX_GENERATIONS_PER_DAY - counts[MediaType.VIDEO],
            [MediaType.AUDIO]: RATE_LIMITS[MediaType.AUDIO].MAX_GENERATIONS_PER_DAY - counts[MediaType.AUDIO],
          },
      resetTime: new Date(
        Date.now() + RATE_LIMITS[type || MediaType.IMAGE].COOLDOWN_PERIOD_MS
      ).toISOString()
    });
  } catch (error) {
    logger.error('Error fetching generation history:', error);
    
    if (error instanceof z.ZodError) {
      return c.json({ error: error.errors }, 400);
    }
    
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

export default app;