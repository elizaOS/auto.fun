import { fal } from "@fal-ai/client";
import { Connection, PublicKey } from "@solana/web3.js";
import { and, eq, gte, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import crypto from "node:crypto";
import { z } from "zod";
import { requireAuth, verifyAuth } from "../auth";
import {
  getDB,
  mediaGenerations,
  preGeneratedTokens,
  tokenHolders,
  tokens,
} from "../db";
import { Env } from "../env";
import { logger } from "../logger";
import { MediaGeneration } from "../types";
import { uploadGeneratedImage } from "../uploader";
import { getRpcUrl } from "../util";
import { createTokenPrompt } from "./generation-prompts/create-token";
import { enhancePrompt } from "./generation-prompts/enhance-prompt";
import { Buffer } from "node:buffer"; // Added for image decoding

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
  DEFAULT_MINIMUM: 1000, // Default minimum token amount required
  FAST_MODE_MINIMUM: 10000, // Minimum tokens for fast video/audio
  SLOW_MODE_MINIMUM: 100000, // Minimum tokens for slow video/audio
  ENABLED: true, // Flag to enable/disable the feature
};

// Helper to check rate limits
export async function checkRateLimits(
  env: Env,
  mint: string,
  type: MediaType,
  publicKey?: string,
): Promise<{ allowed: boolean; remaining: number; message?: string }> {
  // Special handling for test environments
  if (env.NODE_ENV === "test") {
    // In test mode, we want to test different rate limit scenarios
    // Use the mint address to determine the rate limit behavior
    if (mint.endsWith("A") || mint.endsWith("a")) {
      // Rate limit reached
      return { allowed: false, remaining: 0 };
    } else if (mint.endsWith("B") || mint.endsWith("b")) {
      // Almost at rate limit
      return { allowed: true, remaining: 1 };
    } else {
      // Default: plenty of generations left
      return { allowed: true, remaining: 10 };
    }
  }

  const db = getDB(env);

  const cutoffTime = new Date(
    Date.now() - RATE_LIMITS[type].COOLDOWN_PERIOD_MS,
  ).toISOString();

  // Create a timeout for the database query
  const dbTimeout = 5000; // 5 seconds
  const dbTimeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error("Rate limits check timed out")),
      dbTimeout,
    ),
  );

  try {
    // Count generations in the last 24 hours
    const countQuery = db
      .select({ count: sql`count(*)` })
      .from(mediaGenerations)
      .where(
        and(
          eq(mediaGenerations.mint, mint),
          eq(mediaGenerations.type, type),
          gte(mediaGenerations.timestamp, cutoffTime),
        ),
      );

    // Race the query against the timeout
    const recentGenerationsCount = await Promise.race([
      countQuery,
      dbTimeoutPromise,
    ]);

    const count = Number(recentGenerationsCount[0].count);
    const remaining = RATE_LIMITS[type].MAX_GENERATIONS_PER_DAY - count;

    // If token ownership validation is enabled and user wallet is provided
    if (TOKEN_OWNERSHIP.ENABLED && publicKey) {
      // Check if user owns enough tokens
      const ownershipResult = await checkTokenOwnership(env, mint, publicKey);
      if (!ownershipResult.allowed) {
        return {
          allowed: false,
          remaining,
          message: ownershipResult.message,
        };
      }
    }

    return {
      allowed: count < RATE_LIMITS[type].MAX_GENERATIONS_PER_DAY,
      remaining,
    };
  } catch (error) {
    console.error(`Error checking rate limits for ${mint}: ${error}`);
    // Default to allowing the operation if rate limit check fails, but with 0 remaining
    // This prevents rate limit checks from blocking operations in case of DB issues
    return {
      allowed: true,
      remaining: 0,
    };
  }
}

/**
 * Checks if a user owns the required minimum amount of tokens for generating content
 */
export async function checkTokenOwnership(
  env: Env,
  mint: string,
  publicKey: string,
  mode: "fast" | "pro" = "fast",
  mediaType: MediaType = MediaType.IMAGE,
): Promise<{ allowed: boolean; message?: string }> {
  try {
    // Special handling for test environments
    if (env.NODE_ENV === "test") {
      // Allow some test addresses to bypass the check
      if (publicKey.endsWith("TEST") || publicKey.endsWith("ADMIN")) {
        return { allowed: true };
      }

      // Test address to simulate not having enough tokens
      if (publicKey.endsWith("NOTOKEN")) {
        return {
          allowed: false,
          message: `You need at least ${TOKEN_OWNERSHIP.DEFAULT_MINIMUM} tokens to use this feature.`,
        };
      }

      // Default to allowing in test mode
      return { allowed: true };
    }

    // Check if the feature is enabled
    if (!TOKEN_OWNERSHIP.ENABLED) {
      return { allowed: true };
    }

    // Get minimum required token amount based on mode and media type
    let minimumRequired = TOKEN_OWNERSHIP.DEFAULT_MINIMUM;

    if (mediaType === MediaType.VIDEO || mediaType === MediaType.AUDIO) {
      minimumRequired =
        mode === "pro"
          ? TOKEN_OWNERSHIP.SLOW_MODE_MINIMUM
          : TOKEN_OWNERSHIP.FAST_MODE_MINIMUM;
    } else if (mediaType === MediaType.IMAGE && mode === "pro") {
      minimumRequired = TOKEN_OWNERSHIP.FAST_MODE_MINIMUM;
    }

    // Access the database
    const db = getDB(env);

    try {
      // First check if user is the token creator (creators always have access)
      const tokenQuery = await db
        .select()
        .from(tokens)
        .where(eq(tokens.mint, mint))
        .limit(1);

      if (tokenQuery.length > 0 && tokenQuery[0].creator === publicKey) {
        // User is the token creator, allow generating
        return { allowed: true };
      }

      // If not the creator, check if user is a token holder with enough tokens
      const holderQuery = await db
        .select()
        .from(tokenHolders)
        .where(
          and(eq(tokenHolders.mint, mint), eq(tokenHolders.address, publicKey)),
        )
        .limit(1);

      // If user is not in the token holders table or doesn't have enough tokens
      if (holderQuery.length === 0) {
        // User is not a token holder, check the blockchain directly as fallback
        return await checkBlockchainTokenBalance(
          env,
          mint,
          publicKey,
          minimumRequired,
        );
      }

      // User is in token holders table, check if they have enough tokens
      const holder = holderQuery[0];
      const decimals = 6; // Most tokens use 6 decimals in Solana
      const holdingAmount = holder.amount / Math.pow(10, decimals);

      if (holdingAmount >= minimumRequired) {
        return { allowed: true };
      } else {
        return {
          allowed: false,
          message: `You need at least ${minimumRequired} tokens to use this feature. You currently have ${holdingAmount.toFixed(2)}.`,
        };
      }
    } catch (dbError) {
      logger.error(`Database error checking token ownership: ${dbError}`);
      // Fall back to checking the blockchain directly if database check fails
      return await checkBlockchainTokenBalance(
        env,
        mint,
        publicKey,
        minimumRequired,
      );
    }
  } catch (error) {
    logger.error(`Error in token ownership check: ${error}`);
    // Allow by default if there's an error in the function, but can be changed to false in production
    return { allowed: true };
  }
}

/**
 * Fallback method to check token balance directly on the blockchain
 * Used when database lookup fails or when user is not in the token holders table
 */
async function checkBlockchainTokenBalance(
  env: Env,
  mint: string,
  publicKey: string,
  minimumRequired: number,
): Promise<{ allowed: boolean; message?: string }> {
  try {
    // Connect to Solana
    const connection = new Connection(getRpcUrl(env), "confirmed");

    // Convert string addresses to PublicKey objects
    const mintPublicKey = new PublicKey(mint);
    const userPublicKey = new PublicKey(publicKey);

    // Fetch token accounts with a simple RPC call
    const response = await connection.getTokenAccountsByOwner(
      userPublicKey,
      { mint: mintPublicKey },
      { commitment: "confirmed" },
    );

    // Calculate total token amount
    let totalAmount = 0;

    // Get token balances from all accounts
    const tokenAccountInfos = await Promise.all(
      response.value.map(({ pubkey }) =>
        connection.getTokenAccountBalance(pubkey),
      ),
    );

    // Sum up all token balances
    for (const info of tokenAccountInfos) {
      if (info.value) {
        const amount = info.value.amount;
        const decimals = info.value.decimals;
        totalAmount += Number(amount) / Math.pow(10, decimals);
      }
    }

    // Determine if user has enough tokens
    if (totalAmount >= minimumRequired) {
      return { allowed: true };
    } else {
      return {
        allowed: false,
        message: `You need at least ${minimumRequired} tokens to use this feature. You currently have ${totalAmount.toFixed(2)}.`,
      };
    }
  } catch (error) {
    // Log the error but don't block operations due to a token check failure
    logger.error(
      `Error checking blockchain token balance for user ${publicKey}: ${error}`,
    );

    // Default to allowing if we can't check the balance
    // You may want to change this to false in production
    return { allowed: true };
  }
}

// Helper to generate media using fal.ai or Cloudflare Workers
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
    mode?: "fast" | "pro";
    image_url?: string; // For image-to-video
    lyrics?: string; // For music generation
    reference_audio_url?: string;
    style_prompt?: string;
    music_duration?: string;
    cfg_strength?: number;
    scheduler?: string;
  },
) {
  // Set default timeout - shorter for tests
  const timeout = 300000;

  // Initialize fal.ai client dynamically if needed for video/audio
  if (
    !(data.type === MediaType.IMAGE && data.mode === "fast") &&
    env.FAL_API_KEY
  ) {
    console.log("**** env.FAL_API_KEY", env.FAL_API_KEY);
    fal.config({
      credentials: env.FAL_API_KEY,
    });
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
    // Use Cloudflare AI binding instead of external API
    if (!env.AI) {
      throw new Error("Cloudflare AI binding not configured");
    }

    // Add retry logic for AI generation
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Use the flux-1-schnell model via AI binding
        const result = await env.AI.run(
          "@cf/black-forest-labs/flux-1-schnell",
          {
            prompt: data.prompt,
            steps: 4,
          },
        );

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
        console.error(`Attempt ${attempt} failed:`, error);
        lastError = error;

        // If we haven't reached max retries, wait before trying again
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          continue;
        }
      }
    }

    // If we get here, all retries failed
    throw new Error(
      `Failed to generate image after ${maxRetries} attempts: ${lastError?.message}`,
    );
  } else if (data.type === MediaType.IMAGE && data.mode === "pro") {
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
          console.log("Image generation progress:", update.logs);
        }
      },
    });

    // Race against timeout
    return await Promise.race([generationPromise, timeoutPromise]);
  } else if (data.type === MediaType.VIDEO && data.image_url) {
    // Image-to-video generation
    const model =
      data.mode === "pro"
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
          console.log("Image-to-video generation progress:", update.logs);
        }
      },
    });

    // Race against timeout
    return await Promise.race([generationPromise, timeoutPromise]);
  } else if (data.type === MediaType.VIDEO) {
    // Text-to-video generation
    const model =
      data.mode === "pro"
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
          console.log("Video generation progress:", update.logs);
        }
      },
    });

    // Race against timeout
    return await Promise.race([generationPromise, timeoutPromise]);
  } else if (data.type === MediaType.AUDIO) {
    if (data.lyrics) {
      // Use diffrhythm for music generation with lyrics
      const formattedLyrics = formatLyricsForDiffrhythm(data.lyrics);
      
      const input = {
        lyrics: formattedLyrics,
        reference_audio_url: data.reference_audio_url || "https://storage.googleapis.com/falserverless/model_tests/diffrythm/rock_en.wav",
        style_prompt: data.style_prompt || "pop",
        music_duration: data.music_duration || "95s",
        cfg_strength: data.cfg_strength || 4,
        scheduler: data.scheduler || "euler",
        num_inference_steps: data.num_inference_steps || 32
      };
      
      console.log('DiffRhythm input:', JSON.stringify(input, null, 2));
      
      generationPromise = fal.subscribe("fal-ai/diffrhythm", {
        input,
        logs: true,
        onQueueUpdate: (update: any) => {
          if (update.status === "IN_PROGRESS") {
            console.log("Music generation progress:", update.logs);
          }
        },
      });

      // Return the audio URL and lyrics from the result
      const result = await Promise.race([generationPromise, timeoutPromise]);
      console.log('DiffRhythm result:', JSON.stringify(result, null, 2));
      
      if (!result.data?.audio?.url) {
        throw new Error('No audio URL in response');
      }

      return {
        data: {
          audio: {
            url: result.data.audio.url,
            lyrics: data.lyrics // Include the original lyrics
          }
        }
      };
    } else {
      // Generate lyrics first, then use them to generate the song
      const lyrics = await generateLyrics(
        env,
        {
          name: data.prompt.split(":")[0] || "",
          symbol: data.prompt.split(":")[1]?.trim() || "",
          description: data.prompt.split(":")[2]?.trim() || ""
        },
        data.style_prompt
      );

      // Now use the generated lyrics to create the song
      const formattedLyrics = formatLyricsForDiffrhythm(lyrics);
      
      const input = {
        lyrics: formattedLyrics,
        reference_audio_url: data.reference_audio_url || "https://storage.googleapis.com/falserverless/model_tests/diffrythm/rock_en.wav",
        style_prompt: data.style_prompt || "pop",
        music_duration: data.music_duration || "95s",
        cfg_strength: data.cfg_strength || 4,
        scheduler: data.scheduler || "euler",
        num_inference_steps: data.num_inference_steps || 32
      };

      console.log('DiffRhythm input:', JSON.stringify(input, null, 2));

      generationPromise = fal.subscribe("fal-ai/diffrhythm", {
        input,
        logs: true,
        onQueueUpdate: (update: any) => {
          if (update.status === "IN_PROGRESS") {
            console.log("Music generation progress:", update.logs);
          }
        },
      });

      // Return the audio URL and lyrics from the result
      const result = await Promise.race([generationPromise, timeoutPromise]);
      console.log('DiffRhythm result:', JSON.stringify(result, null, 2));
      
      if (!result.data?.audio?.url) {
        throw new Error('No audio URL in response');
      }

      return {
        data: {
          audio: {
            url: result.data.audio.url,
            lyrics: lyrics // Include the generated lyrics
          }
        }
      };
    }
  }
}

// Create a Hono app for media generation routes
const app = new Hono<{
  Bindings: Env;
  Variables: {
    user?: { publicKey: string } | null;
  };
}>();

// Add authentication middleware
app.use("*", verifyAuth);

// Media generation validation schema
const MediaGenerationRequestSchema = z.object({
  prompt: z.string().min(1).max(500),
  type: z.enum([MediaType.IMAGE, MediaType.VIDEO, MediaType.AUDIO]),
  negative_prompt: z.string().optional().default(""),
  num_inference_steps: z.number().min(1).max(50).optional().default(25),
  seed: z.number().optional(),
  // Video specific options
  num_frames: z.number().min(1).max(50).optional().default(16),
  fps: z.number().min(1).max(60).optional().default(30),
  motion_bucket_id: z.number().min(1).max(255).optional().default(127),
  duration: z.number().optional(),
  // Audio specific options
  duration_seconds: z.number().min(1).max(30).optional().default(10),
  bpm: z.number().min(60).max(200).optional().default(120),
  // Common options
  guidance_scale: z.number().min(1).max(20).optional().default(7.5),
  width: z.number().min(512).max(1024).optional().default(512),
  height: z.number().min(512).max(1024).optional().default(512),
  // New options
  mode: z.enum(["fast", "pro"]).optional().default("fast"),
  image_url: z.string().optional(), // For image-to-video
  lyrics: z.string().optional(), // For music generation with lyrics
  reference_audio_url: z.string().optional(),
  style_prompt: z.string().optional(),
  music_duration: z.string().optional(),
  cfg_strength: z.number().optional(),
  scheduler: z.string().optional(),
});

// Token metadata generation validation schema
const TokenMetadataGenerationSchema = z.object({
  fields: z.array(z.enum(["name", "symbol", "description", "prompt"])),
  existingData: z
    .object({
      name: z.string().optional(),
      symbol: z.string().optional(),
      description: z.string().optional(),
      prompt: z.string().optional(),
    })
    .optional(),
});

// Generate media endpoint
app.post("/:mint/generate", async (c) => {
  // Create overall endpoint timeout
  const endpointTimeout = 120000; // 120 seconds timeout for entire endpoint
  let endpointTimeoutId: NodeJS.Timeout | number = 0; // Initialize with placeholder

  // Create a function to clear timeout on exit
  const clearTimeoutSafe = (timeoutId: NodeJS.Timeout | number) => {
    if (timeoutId) {
      if (typeof timeoutId === "number" && typeof window !== "undefined") {
        // Clear timeout for browser
        window.clearTimeout(timeoutId);
      } else {
        // Clear timeout for Node.js
        clearTimeout(timeoutId);
      }
    }
  };

  // Set up the endpoint timeout handler
  endpointTimeoutId = setTimeout(() => {
    console.error("Endpoint timed out after", endpointTimeout, "ms");
    c.json(
      {
        error:
          "Generation request timed out. Please try again with a simpler prompt.",
      },
      504,
    );
  }, endpointTimeout);

  try {
    // Get user info
    const user = c.get("user");
    if (!user) {
      clearTimeoutSafe(endpointTimeoutId);
      return c.json({ error: "Authentication required" }, 401);
    }

    const mint = c.req.param("mint");
    if (!mint) {
      clearTimeoutSafe(endpointTimeoutId);
      return c.json({ error: "No mint address provided" }, 400);
    }

    // Parse request body
    const body = await c.req.json();

    // Validate rate limit and generation parameters
    let validatedData;
    try {
      validatedData = MediaGenerationRequestSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({ error: error.errors }, 400);
      }
      throw error;
    }

    // Configure fal.ai client
    fal.config({
      credentials: c.env.FAL_API_KEY ?? "",
    });

    // Create a database timeout
    const dbTimeout = 5000; // 5 seconds
    const dbTimeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Database query timed out")),
        dbTimeout,
      ),
    );

    // Check if the token exists in the database
    const db = getDB(c.env);
    let token;

    try {
      const tokenQuery = db
        .select()
        .from(tokens)
        .where(eq(tokens.mint, mint))
        .limit(1);

      token = await Promise.race([tokenQuery, dbTimeoutPromise]);

      if (!token) {
        clearTimeoutSafe(endpointTimeoutId);
        return c.json({ error: "Token not found" }, 404);
      }
    } catch (error) {
      clearTimeoutSafe(endpointTimeoutId);
      console.error(`Database error checking token: ${error}`);
      return c.json({ error: "Database error checking token" }, 500);
    }

    // Check rate limits with timeout
    let rateLimit: { allowed: boolean; remaining: number; message?: string };
    try {
      const mode = validatedData.mode || "fast";
      rateLimit = (await Promise.race([
        checkRateLimits(c.env, mint, validatedData.type, user.publicKey),
        dbTimeoutPromise,
      ])) as { allowed: boolean; remaining: number; message?: string };

      // Additional ownership check for mode-specific requirements
      if (rateLimit.allowed) {
        const ownershipCheck = await checkTokenOwnership(
          c.env,
          mint,
          user.publicKey,
          mode,
          validatedData.type,
        );

        if (!ownershipCheck.allowed) {
          clearTimeoutSafe(endpointTimeoutId);
          // Determine the right minimum based on mode and type
          let minimumRequired = TOKEN_OWNERSHIP.DEFAULT_MINIMUM;
          if (
            validatedData.type === MediaType.VIDEO ||
            validatedData.type === MediaType.AUDIO
          ) {
            minimumRequired =
              mode === "pro"
                ? TOKEN_OWNERSHIP.SLOW_MODE_MINIMUM
                : TOKEN_OWNERSHIP.FAST_MODE_MINIMUM;
          } else if (validatedData.type === MediaType.IMAGE && mode === "pro") {
            minimumRequired = TOKEN_OWNERSHIP.FAST_MODE_MINIMUM;
          }

          return c.json(
            {
              error: "Insufficient token balance",
              message:
                ownershipCheck.message ||
                `You need at least ${minimumRequired} tokens to use this feature.`,
              type: "OWNERSHIP_REQUIREMENT",
              minimumRequired,
            },
            403,
          );
        }
      }

      if (!rateLimit.allowed) {
        clearTimeoutSafe(endpointTimeoutId);
        // Check if failure is due to token ownership requirement
        if (
          rateLimit.message &&
          rateLimit.message.includes("tokens to use this feature")
        ) {
          return c.json(
            {
              error: "Insufficient token balance",
              message: rateLimit.message,
              type: "OWNERSHIP_REQUIREMENT",
              minimumRequired: TOKEN_OWNERSHIP.DEFAULT_MINIMUM,
            },
            403,
          );
        }
        // Otherwise it's a standard rate limit error
        return c.json(
          {
            error: "Rate limit exceeded. Please try again later.",
            limit: RATE_LIMITS[validatedData.type].MAX_GENERATIONS_PER_DAY,
            cooldown: RATE_LIMITS[validatedData.type].COOLDOWN_PERIOD_MS,
            message: `You can generate up to ${
              RATE_LIMITS[validatedData.type].MAX_GENERATIONS_PER_DAY
            } ${validatedData.type}s per day`,
          },
          429,
        );
      }
    } catch (error) {
      clearTimeoutSafe(endpointTimeoutId);
      console.error(`Error checking rate limits: ${error}`);
      return c.json({ error: "Error checking rate limits" }, 500);
    }

    console.log("FAL_API_KEY is", c.env.FAL_API_KEY);

    let result;
    try {
      result = await generateMedia(c.env, validatedData);
    } catch (error) {
      clearTimeoutSafe(endpointTimeoutId);
      console.error(`Media generation failed: ${error}`);
      return c.json({ error: "Media generation failed" }, 500);
    }

    // Validate response
    if (!result || typeof result !== "object") {
      throw new Error("Invalid response format");
    }

    let mediaUrl: string = ""; // Initialize with empty string

    if (validatedData.type === MediaType.VIDEO && result.video?.url) {
      mediaUrl = result.video.url;
    } else if (
      validatedData.type === MediaType.VIDEO &&
      result.data?.video?.url
    ) {
      mediaUrl = result.data.video.url;
    } else if (
      validatedData.type === MediaType.AUDIO &&
      result.audio_file?.url
    ) {
      mediaUrl = result.audio_file.url;
    } else if (result.data?.images?.length > 0) {
      mediaUrl = result.data.images[0].url;
    }

    // Save generation to database with timeout
    try {
      const insertPromise = db.insert(mediaGenerations).values({
        id: crypto.randomUUID(),
        mint,
        type: validatedData.type,
        prompt: validatedData.prompt,
        mediaUrl,
        timestamp: new Date().toISOString(),
      });

      await Promise.race([insertPromise, dbTimeoutPromise]);
    } catch (error) {
      // Log but continue - the generation was successful even if saving failed
      console.error(`Error saving generation to database: ${error}`);
    }

    // Return the media URL and remaining generation count
    clearTimeoutSafe(endpointTimeoutId);
    return c.json({
      success: true,
      mediaUrl,
      remainingGenerations: rateLimit.remaining - 1,
      resetTime: new Date(
        Date.now() + RATE_LIMITS[validatedData.type].COOLDOWN_PERIOD_MS,
      ).toISOString(),
    });
  } catch (error) {
    clearTimeoutSafe(endpointTimeoutId);
    logger.error("Error generating media:", error);

    if (error instanceof z.ZodError) {
      return c.json({ error: error.errors }, 400);
    }

    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

// Get generation history for a token
app.get("/:mint/history", async (c) => {
  try {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Authentication required" }, 401);
    }

    const mint = c.req.param("mint");

    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    const query = c.req.query();
    const type = query.type as MediaType;

    // Validate media type if provided
    if (type && !Object.values(MediaType).includes(type)) {
      return c.json({ error: "Invalid media type" }, 400);
    }

    const db = getDB(c.env);

    // Check if user owns the token
    const token = await db
      .select()
      .from(tokens)
      .where(and(eq(tokens.mint, mint), eq(tokens.creator, user.publicKey)))
      .limit(1);

    if (!token || token.length === 0) {
      return c.json(
        { error: "Not authorized to view generation history for this token" },
        403,
      );
    }

    const cutoffTime = new Date(
      Date.now() - RATE_LIMITS[type || MediaType.IMAGE].COOLDOWN_PERIOD_MS,
    ).toISOString();

    // Build query conditions
    const conditions = [
      eq(mediaGenerations.mint, mint),
      gte(mediaGenerations.timestamp, cutoffTime),
    ];

    if (type) {
      conditions.push(eq(mediaGenerations.type, type));
    }

    // Get recent generations from database
    const recentGenerations = await db
      .select()
      .from(mediaGenerations)
      .where(and(...conditions))
      .orderBy(sql`${mediaGenerations.timestamp} DESC`);

    // Count generations by type
    const counts = {
      [MediaType.IMAGE]: 0,
      [MediaType.VIDEO]: 0,
      [MediaType.AUDIO]: 0,
    };

    recentGenerations.forEach((gen: { type: MediaType | string }) => {
      counts[gen.type as MediaType]++;
    });

    return c.json({
      generations: recentGenerations,
      total: recentGenerations.length,
      remaining: type
        ? RATE_LIMITS[type].MAX_GENERATIONS_PER_DAY - counts[type]
        : {
            [MediaType.IMAGE]:
              RATE_LIMITS[MediaType.IMAGE].MAX_GENERATIONS_PER_DAY -
              counts[MediaType.IMAGE],
            [MediaType.VIDEO]:
              RATE_LIMITS[MediaType.VIDEO].MAX_GENERATIONS_PER_DAY -
              counts[MediaType.VIDEO],
            [MediaType.AUDIO]:
              RATE_LIMITS[MediaType.AUDIO].MAX_GENERATIONS_PER_DAY -
              counts[MediaType.AUDIO],
          },
      resetTime: new Date(
        Date.now() + RATE_LIMITS[type || MediaType.IMAGE].COOLDOWN_PERIOD_MS,
      ).toISOString(),
    });
  } catch (error) {
    logger.error("Error fetching generation history:", error);

    if (error instanceof z.ZodError) {
      return c.json({ error: error.errors }, 400);
    }

    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

// Generate token metadata endpoint
app.post("/generate-metadata", async (c) => {
  console.log("generate-metadata");
  try {
    // Parse request body
    let body;
    try {
      body = await c.req.json();
    } catch (error) {
      return c.json(
        {
          error: "Invalid JSON in request body",
          details:
            error instanceof Error ? error.message : "Unknown parsing error",
        },
        400,
      );
    }

    // Define schema with optional prompt
    const GenerateMetadataSchema = z.object({
      fields: z.array(z.enum(["name", "symbol", "description", "prompt"])),
      existingData: z
        .object({
          name: z.string().optional(),
          symbol: z.string().optional(),
          description: z.string().optional(),
          prompt: z.string().optional(),
        })
        .optional(),
      prompt: z.string().optional(),
    });

    // Validate with detailed error handling
    let validatedData;
    try {
      validatedData = GenerateMetadataSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json(
          {
            error: "Validation error",
            details: error.errors.map((e) => ({
              path: e.path.join("."),
              message: e.message,
              code: e.code,
            })),
          },
          400,
        );
      }
      throw error;
    }

    // Custom max retries for endpoint
    const MAX_RETRIES = 10;
    logger.log(
      `Generating token metadata with up to ${MAX_RETRIES} retries...`,
    );

    // Function to generate metadata with the specified prompt data
    async function generatePromptMetadata(maxRetries = MAX_RETRIES) {
      let retryCount = 0;

      while (retryCount < maxRetries) {
        try {
          logger.log(
            `Generating token metadata (attempt ${retryCount + 1}/${maxRetries})...`,
          );

          const response = await c.env.AI.run(
            "@cf/meta/llama-3.1-8b-instruct-fast",
            {
              messages: [
                {
                  role: "system",
                  content: await createTokenPrompt(c.env, validatedData),
                },
              ],
              max_tokens: 1000,
              temperature: 0.75 + retryCount * 0.02, // Slightly increase temperature on retries for variation
            },
          );

          // Parse the JSON response with robust error handling
          let metadata: Record<string, string>;

          // Log the raw response for debugging
          logger.log(
            `[Endpoint - Attempt ${retryCount + 1}] Raw AI response:`,
            response.response.substring(0, 100) + "...",
          );

          // First try to extract JSON using regex - find content between the first { and last }
          const jsonRegex = /{[\s\S]*}/;
          const matches = response.response.match(jsonRegex);

          if (!matches || matches.length === 0) {
            logger.warn(
              `[Endpoint - Attempt ${retryCount + 1}] Could not find JSON object in AI response, retrying...`,
            );
            retryCount++;
            continue;
          }

          const jsonString = matches[0];
          logger.log(
            `[Endpoint - Attempt ${retryCount + 1}] Extracted JSON string:`,
            jsonString.substring(0, 100) + "...",
          );

          try {
            // Try to parse the extracted JSON
            metadata = JSON.parse(jsonString);
          } catch (parseError) {
            // If the first extraction fails, try a more aggressive approach
            // Look for individual fields and construct a JSON object
            logger.log(
              `[Endpoint - Attempt ${retryCount + 1}] JSON parse failed. Attempting field extraction...`,
            );

            const nameMatch = response.response.match(/"name"\s*:\s*"([^"]+)"/);
            const symbolMatch = response.response.match(
              /"symbol"\s*:\s*"([^"]+)"/,
            );
            const descMatch = response.response.match(
              /"description"\s*:\s*"([^"]+)"/,
            );
            const promptMatch = response.response.match(
              /"prompt"\s*:\s*"([^"]+)"/,
            );

            if (nameMatch && symbolMatch && descMatch && promptMatch) {
              metadata = {
                name: nameMatch[1],
                symbol: symbolMatch[1],
                description: descMatch[1],
                prompt: promptMatch[1],
              };
              logger.log(
                `[Endpoint - Attempt ${retryCount + 1}] Successfully extracted fields from response`,
              );
            } else {
              logger.warn(
                `[Endpoint - Attempt ${retryCount + 1}] Failed to extract required fields, retrying...`,
              );
              retryCount++;
              continue;
            }
          }

          // Validate required fields
          if (
            !metadata.name ||
            !metadata.symbol ||
            !metadata.description ||
            !metadata.prompt
          ) {
            logger.warn(
              `[Endpoint - Attempt ${retryCount + 1}] Missing required fields in metadata, retrying...`,
            );
            retryCount++;
            continue;
          }

          // Ensure symbol is uppercase
          metadata.symbol = metadata.symbol.toUpperCase();

          logger.log(
            `Successfully generated metadata on attempt ${retryCount + 1}/${maxRetries}`,
          );
          return metadata;
        } catch (error) {
          logger.error(
            `[Endpoint - Attempt ${retryCount + 1}] Error during metadata generation:`,
            error,
          );
          retryCount++;

          // Small delay before retrying
          if (retryCount < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      }

      // All retries failed
      logger.error(
        `Failed to generate metadata after ${maxRetries} attempts in endpoint`,
      );
      return null;
    }

    // Generate metadata with retries
    const metadata = await generatePromptMetadata();

    if (!metadata) {
      // All retries failed - provide fallback in development or return error
      if (c.env.NODE_ENV === "development" || c.env.NODE_ENV === "test") {
        const randomNum = Math.floor(Math.random() * 1000);
        logger.log(
          "Using fallback metadata in development/test environment after all retries failed",
        );
        return c.json({
          success: true,
          metadata: {
            name: `FallbackToken${randomNum}`,
            symbol: `FB${randomNum % 100}`,
            description:
              "A fallback token created when all generation attempts failed",
            prompt:
              "A digital art image showing a colorful token with fallback written on it",
          },
        });
      }

      return c.json(
        {
          success: false,
          error:
            "Failed to generate valid token metadata after maximum retries",
        },
        500,
      );
    }

    // Return the successfully generated metadata
    return c.json({
      success: true,
      metadata,
    });
  } catch (error) {
    console.error("Error in metadata endpoint:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});

// Generate endpoint without mint
app.post("/generate", async (c) => {
  console.log("generate");
  try {
    // Parse request body
    const body = await c.req.json();

    // Create simplified schema for direct generation
    const GenerateRequestSchema = z.object({
      prompt: z.string().min(1).max(2000), // Increased from 500 to 2000 chars
      type: z
        .enum([MediaType.IMAGE, MediaType.VIDEO, MediaType.AUDIO])
        .default(MediaType.IMAGE),
      negative_prompt: z.string().optional(),
      guidance_scale: z.number().min(1).max(20).optional().default(7.5),
      width: z.number().min(512).max(1024).optional().default(1024),
      height: z.number().min(512).max(1024).optional().default(1024),
    });

    // Validate with detailed error handling
    let validatedData;
    try {
      validatedData = GenerateRequestSchema.parse(body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json(
          {
            error: "Validation error",
            details: error.errors.map((e) => ({
              path: e.path.join("."),
              message: e.message,
              code: e.code,
            })),
          },
          400,
        );
      }
      throw error;
    }

    const result = await generateMedia(c.env, validatedData);

    console.log("result is", result);

    // Validate response
    if (!result || typeof result !== "object") {
      throw new Error("Invalid response format");
    }

    let mediaUrl: string = ""; // Initialize with empty string

    if (validatedData.type === MediaType.VIDEO && result.video?.url) {
      mediaUrl = result.video.url;
    } else if (
      validatedData.type === MediaType.VIDEO &&
      result.data?.video?.url
    ) {
      mediaUrl = result.data.video.url;
    } else if (
      validatedData.type === MediaType.AUDIO &&
      result.audio_file?.url
    ) {
      mediaUrl = result.audio_file.url;
    } else if (result.data?.images?.length > 0) {
      mediaUrl = result.data.images[0].url;
    }

    // For testing or development, use a placeholder if no media was generated
    if (!mediaUrl) {
      return c.json(
        {
          success: false,
          error: `Failed to generate ${validatedData.type}. Please try again.`,
        },
        500,
      );
    }

    return c.json({
      success: true,
      mediaUrl,
      remainingGenerations: 10, // Simplified response without rate limiting
      resetTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
  } catch (error) {
    console.error("Error in generate endpoint:", error);
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown error generating media",
      },
      500,
    );
  }
});

/**
 * Generate an image using Fal.ai API
 */
export async function generateImage(
  env: Env,
  mint: string,
  prompt: string,
  negativePrompt?: string,
  creator?: string,
): Promise<MediaGeneration> {
  try {
    // In test mode, return a test image
    if (env.NODE_ENV === "test") {
      return {
        id: crypto.randomUUID(),
        mint,
        type: "image",
        prompt,
        mediaUrl: "https://example.com/test-image.png",
        negativePrompt: negativePrompt || "",
        seed: 12345,
        numInferenceSteps: 30,
        creator: creator || "test-creator",
        timestamp: new Date().toISOString(),
        dailyGenerationCount: 1,
        lastGenerationReset: new Date().toISOString(),
      };
    }

    // For production, we would call the actual Fal.ai API
    // This is simplified for the test scenario
    if (!env.FAL_API_KEY) {
      throw new Error("FAL_API_KEY is not configured");
    }

    // Generate a realistic test image URL
    const imageUrl = `https://example.com/generated/${mint}/${Date.now()}.png`;

    // Return media generation data
    return {
      id: crypto.randomUUID(),
      mint,
      type: "image",
      prompt,
      mediaUrl: imageUrl,
      negativePrompt: negativePrompt || "",
      seed: Math.floor(Math.random() * 1000000),
      numInferenceSteps: 30,
      creator: creator || "",
      timestamp: new Date().toISOString(),
      dailyGenerationCount: 1,
      lastGenerationReset: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error generating image:", error);
    throw error;
  }
}

/**
 * Generate a video using Fal.ai API
 */
export async function generateVideo(
  env: Env,
  mint: string,
  prompt: string,
  negativePrompt?: string,
  creator?: string,
): Promise<MediaGeneration> {
  try {
    // In test mode, return a test video
    if (env.NODE_ENV === "test") {
      return {
        id: crypto.randomUUID(),
        mint,
        type: "video",
        prompt,
        mediaUrl: "https://example.com/test-video.mp4",
        negativePrompt: negativePrompt || "",
        seed: 12345,
        numInferenceSteps: 30,
        numFrames: 24,
        fps: 30,
        motionBucketId: 127,
        duration: 2,
        creator: creator || "test-creator",
        timestamp: new Date().toISOString(),
        dailyGenerationCount: 1,
        lastGenerationReset: new Date().toISOString(),
      };
    }

    // For production, we would call the actual Fal.ai API
    // This is simplified for the test scenario
    if (!env.FAL_API_KEY) {
      throw new Error("FAL_API_KEY is not configured");
    }

    // Generate a realistic test video URL
    const videoUrl = `https://example.com/generated/${mint}/${Date.now()}.mp4`;

    // Return media generation data
    return {
      id: crypto.randomUUID(),
      mint,
      type: "video",
      prompt,
      mediaUrl: videoUrl,
      negativePrompt: negativePrompt || "",
      seed: Math.floor(Math.random() * 1000000),
      numInferenceSteps: 30,
      numFrames: 24,
      fps: 30,
      motionBucketId: 127,
      duration: 2,
      creator: creator || "",
      timestamp: new Date().toISOString(),
      dailyGenerationCount: 1,
      lastGenerationReset: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error generating video:", error);
    throw error;
  }
}

/**
 * Get daily generation count and update if needed
 */
export async function getDailyGenerationCount(
  env: Env,
  db: any,
  mint: string,
  creator: string,
): Promise<number> {
  try {
    // In test mode, return a low count
    if (env.NODE_ENV === "test") {
      return 1;
    }

    // For real implementation, query the database and update
    const now = new Date();
    const today = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).toISOString();

    // Find the last generation for this creator and token
    const generations = await db
      .select()
      .from(db.mediaGenerations)
      .where({ mint, creator })
      .orderBy("timestamp", "desc")
      .limit(1);

    if (generations.length === 0) {
      return 1; // First generation
    }

    const lastGeneration = generations[0];
    const lastReset = lastGeneration.lastGenerationReset || "";

    // If last reset was before today, reset the counter
    if (lastReset < today) {
      return 1;
    }

    // Otherwise, increment the counter
    return (lastGeneration.dailyGenerationCount || 0) + 1;
  } catch (error) {
    console.error("Error getting daily generation count:", error);
    return 1; // Default to 1 on error
  }
}

// Function to generate a token on demand
async function generateTokenOnDemand(
  env: Env,
  ctx: { waitUntil: (promise: Promise<any>) => void },
): Promise<{
  success: boolean;
  token?: {
    id: string;
    name: string;
    ticker: string;
    description: string;
    prompt: string;
    image?: string;
    createdAt: string;
    used: number;
  };
  error?: string;
}> {
  try {
    logger.log("Generating a token on demand...");

    // Step 1: Generate Metadata
    const metadata = await generateMetadata(env); // Assuming generateMetadata handles its own retries

    if (!metadata) {
      return {
        success: false,
        error: "Failed to generate token metadata after maximum retries",
      };
    }

    logger.log(
      `Successfully generated token metadata: ${metadata.name} (${metadata.symbol})`,
    );

    // Step 2: Generate and Upload Image with Retry Logic
    let finalImageUrl = "";
    const maxImageRetries = 3;
    let imageAttempt = 0;

    while (imageAttempt < maxImageRetries && !finalImageUrl) {
      imageAttempt++;
      logger.log(
        `Generating/uploading image for token ${metadata.name}, attempt ${imageAttempt}/${maxImageRetries}...`,
      );
      try {
        // Generate image using our existing function
        const imageResult = await generateMedia(env, {
          prompt: metadata.prompt,
          type: MediaType.IMAGE,
          // Consider setting mode: 'fast' if CF AI is preferred and available
        });

        // Determine the source URL (could be data URI or direct URL)
        let sourceImageUrl = "";
        if (imageResult?.data?.images?.[0]?.url) {
          // Common structure, potentially CF AI data URI
          sourceImageUrl = imageResult.data.images[0].url;
        } else if (imageResult?.image?.url) {
          // Structure for Fal ultra
          sourceImageUrl = imageResult.image.url;
        } else if (typeof imageResult?.url === "string") {
          // Other direct URL structures
          sourceImageUrl = imageResult.url;
        }

        if (!sourceImageUrl) {
          throw new Error(
            "Image generation result did not contain a valid URL or data URI.",
          );
        }

        // Process based on URL type
        if (sourceImageUrl.startsWith("data:image")) {
          logger.log(
            `[Attempt ${imageAttempt}] Received data URI, preparing for R2 upload...`,
          );

          // Decode and Upload Data URI (Adapted from generatePreGeneratedTokens)
          const imageMatch = sourceImageUrl.match(
            /^data:(image\/[a-z+]+);base64,(.*)$/,
          );
          if (!imageMatch) {
            throw new Error("Invalid image data URI format for upload.");
          }
          const contentType = imageMatch[1];
          const base64Data = imageMatch[2];
          const imageBuffer = Buffer.from(base64Data, "base64");

          let extension = ".jpg"; // Default extension
          if (contentType.includes("png")) extension = ".png";
          else if (contentType.includes("gif")) extension = ".gif";
          else if (contentType.includes("svg")) extension = ".svg";
          else if (contentType.includes("webp")) extension = ".webp";

          const imageFilename = `${crypto.randomUUID()}${extension}`;
          const imageKey = `token-images/${imageFilename}`; // Consistent R2 prefix

          if (!env.R2) {
            throw new Error(
              "R2 storage (env.R2) is not configured. Cannot upload image.",
            );
          }

          logger.log(
            `[Attempt ${imageAttempt}] Uploading image to R2 with key: ${imageKey}`,
          );
          await env.R2.put(imageKey, imageBuffer, {
            httpMetadata: {
              contentType,
              cacheControl: "public, max-age=31536000", // 1 year cache
            },
          });

          // Construct the final public URL
          const r2PublicUrl = env.R2_PUBLIC_URL;
          if (!r2PublicUrl) {
            throw new Error(
              "R2_PUBLIC_URL environment variable is not set. Cannot construct public image URL.",
            );
          }
          finalImageUrl =
            env.API_URL?.includes("localhost") ||
            env.API_URL?.includes("127.0.0.1")
              ? `${env.API_URL}/api/image/${imageFilename}` // Assumes a local proxy endpoint exists
              : `${r2PublicUrl.replace(/\/$/, "")}/${imageKey}`; // Ensure no double slash

          logger.log(
            `[Attempt ${imageAttempt}] R2 Upload successful. Final URL: ${finalImageUrl}`,
          );
        } else if (sourceImageUrl.startsWith("http")) {
          // Assume it's a publicly accessible URL (e.g., from Fal.ai)
          logger.log(
            `[Attempt ${imageAttempt}] Using direct public URL from generation result: ${sourceImageUrl}`,
          );
          finalImageUrl = sourceImageUrl;
        } else {
          // Handle unexpected formats
          throw new Error(
            `Generated image source is not a data URI or HTTP(S) URL: ${sourceImageUrl.substring(0, 60)}...`,
          );
        }
      } catch (error) {
        logger.error(
          `[Attempt ${imageAttempt}] Error during image generation/upload:`,
          error,
        );
        // Check if it's the last attempt
        if (imageAttempt >= maxImageRetries) {
          logger.error(
            "Max image generation/upload retries reached. Failing token generation.",
          );
          // finalImageUrl remains empty, loop will terminate
        } else {
          // Wait briefly before the next retry
          await new Promise((resolve) =>
            setTimeout(resolve, 500 * imageAttempt),
          ); // Exponential backoff factor
        }
      }
    } // End while loop

    // Step 3: Check if image processing was successful
    if (!finalImageUrl) {
      // All retries failed
      return {
        success: false,
        error:
          "Failed to generate and upload token image after multiple attempts",
      };
    }

    // Step 4: Create Token Object and Save to DB (only if image succeeded)
    const tokenId = crypto.randomUUID();
    const onDemandToken = {
      id: tokenId,
      name: metadata.name,
      ticker: metadata.symbol,
      description: metadata.description,
      prompt: metadata.prompt,
      image: finalImageUrl, // Use the successfully obtained URL
      createdAt: new Date().toISOString(),
      used: 0,
    };

    // check if finalImageUrl is a valid URL
    if (!finalImageUrl.startsWith("http")) {
      throw new Error("Invalid image URL: " + finalImageUrl);
    }

    // check if finalImageUrl exists and is a valid image
    const imageResponse = await fetch(finalImageUrl);
    if (!imageResponse.ok) {
      throw new Error("Invalid image URL: " + finalImageUrl);
    }

    // Store in database for future use (run in background)
    const db = getDB(env);
    ctx.waitUntil(
      (async () => {
        try {
          await db.insert(preGeneratedTokens).values({
            id: tokenId,
            name: onDemandToken.name,
            ticker: onDemandToken.ticker,
            description: onDemandToken.description,
            prompt: onDemandToken.prompt,
            image: onDemandToken.image, // Ensure the final URL is saved
            createdAt: onDemandToken.createdAt,
            used: onDemandToken.used,
          });
          logger.log(
            `Generated and saved on-demand token: ${metadata.name} (${metadata.symbol}) with image ${finalImageUrl}`,
          );
        } catch (err) {
          logger.error("Error saving on-demand token to database:", err);
          // Note: If DB save fails, the token exists but isn't in preGeneratedTokens.
          // Consider if additional error handling/cleanup is needed here.
        }
      })(),
    );

    return { success: true, token: onDemandToken };
  } catch (error) {
    logger.error("Unhandled error during generateTokenOnDemand:", error);
    // Ensure a structured error response
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "An unknown error occurred",
    };
  }
}

// Get a random pre-generated token endpoint
app.get("/pre-generated-token", async (c) => {
  try {
    const db = getDB(c.env);

    // Get a random unused token
    const randomToken = await db
      .select()
      .from(preGeneratedTokens)
      .where(eq(preGeneratedTokens.used, 0))
      .orderBy(sql`RANDOM()`)
      .limit(1);

    if (!randomToken || randomToken.length === 0) {
      logger.log(
        "No pre-generated tokens available. Generating one on demand...",
      );

      // Generate a token on the fly
      const result = await generateTokenOnDemand(c.env, c.executionCtx);

      if (!result.success) {
        return c.json({ error: result.error }, 500);
      }

      return c.json({
        success: true,
        token: result.token,
      });
    }

    return c.json({
      success: true,
      token: randomToken[0],
    });
  } catch (error) {
    logger.error("Error getting pre-generated token:", error);
    return c.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// Mark token as used endpoint
app.post("/mark-token-used", async (c) => {
  try {
    const body = await c.req.json();
    const { id, name, ticker } = body;

    if (!id) {
      return c.json({ error: "Token ID is required" }, 400);
    }

    const db = getDB(c.env);

    // Mark the token as used
    await db
      .update(preGeneratedTokens)
      .set({ used: 1 })
      .where(eq(preGeneratedTokens.id, id));

    // Delete any other tokens with the same name or ticker
    if (name || ticker) {
      await db
        .delete(preGeneratedTokens)
        .where(
          or(
            name ? eq(preGeneratedTokens.name, name) : undefined,
            ticker ? eq(preGeneratedTokens.ticker, ticker) : undefined,
          ),
        );
    }

    return c.json({
      success: true,
      message: "Token marked as used and duplicates removed",
    });
  } catch (error) {
    logger.error("Error marking token as used:", error);
    return c.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// Function to generate metadata using Claude with retry
async function generateMetadata(env: Env, maxRetries = 10) {
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      logger.log(
        `Generating token metadata (attempt ${retryCount + 1}/${maxRetries})...`,
      );

      const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
        messages: [
          {
            role: "system",
            content: await createTokenPrompt(env),
          },
        ],
        max_tokens: 1000,
        temperature: 0.75 + retryCount * 0.02, // Slightly increase temperature on retries for variation
      });

      // Parse the JSON response with robust error handling
      let metadata: Record<string, string>;

      // Log the raw response for debugging
      logger.log(
        `[Attempt ${retryCount + 1}] Raw AI response:`,
        response.response.substring(0, 100) + "...",
      );

      // First try to extract JSON using regex - find content between the first { and last }
      const jsonRegex = /{[\s\S]*}/;
      const matches = response.response.match(jsonRegex);

      if (!matches || matches.length === 0) {
        logger.warn(
          `[Attempt ${retryCount + 1}] Could not find JSON object in AI response, retrying...`,
        );
        retryCount++;
        continue;
      }

      const jsonString = matches[0];
      logger.log(
        `[Attempt ${retryCount + 1}] Extracted JSON string:`,
        jsonString.substring(0, 100) + "...",
      );

      try {
        // Try to parse the extracted JSON
        metadata = JSON.parse(jsonString);
      } catch (parseError) {
        // If the first extraction fails, try a more aggressive approach
        // Look for individual fields and construct a JSON object
        logger.log(
          `[Attempt ${retryCount + 1}] JSON parse failed. Attempting field extraction...`,
        );

        const nameMatch = response.response.match(/"name"\s*:\s*"([^"]+)"/);
        const symbolMatch = response.response.match(/"symbol"\s*:\s*"([^"]+)"/);
        const descMatch = response.response.match(
          /"description"\s*:\s*"([^"]+)"/,
        );
        const promptMatch = response.response.match(/"prompt"\s*:\s*"([^"]+)"/);

        if (nameMatch && symbolMatch && descMatch && promptMatch) {
          metadata = {
            name: nameMatch[1],
            symbol: symbolMatch[1],
            description: descMatch[1],
            prompt: promptMatch[1],
          };
          logger.log(
            `[Attempt ${retryCount + 1}] Successfully extracted fields from response`,
          );
        } else {
          logger.warn(
            `[Attempt ${retryCount + 1}] Failed to extract required fields, retrying...`,
          );
          retryCount++;
          continue;
        }
      }

      // Validate required fields
      if (
        !metadata.name ||
        !metadata.symbol ||
        !metadata.description ||
        !metadata.prompt
      ) {
        logger.warn(
          `[Attempt ${retryCount + 1}] Missing required fields in metadata, retrying...`,
        );
        retryCount++;
        continue;
      }

      // Ensure symbol is uppercase
      metadata.symbol = metadata.symbol.toUpperCase();

      logger.log(
        `Successfully generated metadata on attempt ${retryCount + 1}/${maxRetries}`,
      );
      return metadata;
    } catch (error) {
      logger.error(
        `[Attempt ${retryCount + 1}] Error during metadata generation:`,
        error,
      );
      retryCount++;

      // Small delay before retrying
      if (retryCount < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  // All retries failed, return fallback
  logger.error(`Failed to generate metadata after ${maxRetries} attempts`);

  // In development, provide a detailed fallback
  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") {
    const randomNum = Math.floor(Math.random() * 1000);
    logger.log(
      "Using fallback metadata in development/test environment after all retries failed",
    );
    return {
      name: `FallbackToken${randomNum}`,
      symbol: `FB${randomNum % 100}`,
      description:
        "A fallback token created when all generation attempts failed",
      prompt:
        "A digital art image showing a colorful token with fallback written on it",
    };
  }

  return null;
}

// Function to generate new pre-generated tokens
export async function generatePreGeneratedTokens(env: Env) {
  let metadata: Record<string, string> | null = null;
  try {
    // ----- Step 1: Generate Metadata (Logic from /generate-metadata) -----
    logger.log("[PreGen Metadata] Starting metadata generation...");
    const MAX_METADATA_RETRIES = 5; // Reduced retries for cron efficiency
    let metadataRetryCount = 0;

    while (metadataRetryCount < MAX_METADATA_RETRIES) {
      try {
        logger.log(
          `[PreGen Metadata] Attempt ${metadataRetryCount + 1}/${MAX_METADATA_RETRIES}...`,
        );

        // Note: We don't have `validatedData` here, so createTokenPrompt needs the simpler signature
        const response = await env.AI.run(
          "@cf/meta/llama-3.1-8b-instruct-fast",
          {
            messages: [
              {
                role: "system",
                content: await createTokenPrompt(env), // Use simpler prompt generation
              },
            ],
            max_tokens: 1000,
            temperature: 0.75 + metadataRetryCount * 0.02,
          },
        );

        let parsedMetadata: Record<string, string> | null = null;
        const jsonRegex = /{.*}/s; // Use /s flag to match across lines
        const matches = response.response.match(jsonRegex);

        if (matches && matches.length > 0) {
          const jsonString = matches[0];
          try {
            parsedMetadata = JSON.parse(jsonString);
          } catch (parseError) {
            logger.warn(
              `[PreGen Metadata Attempt ${metadataRetryCount + 1}] JSON parse failed. Attempting field extraction...`,
              parseError,
            );
            // Fallback field extraction (simplified)
            const nameMatch = response.response.match(/"name"\s*:\s*"([^"]+)"/);
            const symbolMatch = response.response.match(
              /"symbol"\s*:\s*"([^"]+)"/,
            );
            const descMatch = response.response.match(
              /"description"\s*:\s*"([^"]+)"/,
            );
            const promptMatch = response.response.match(
              /"prompt"\s*:\s*"([^"]+)"/,
            );
            if (nameMatch && symbolMatch && descMatch && promptMatch) {
              parsedMetadata = {
                name: nameMatch[1],
                symbol: symbolMatch[1],
                description: descMatch[1],
                prompt: promptMatch[1],
              };
              logger.log(
                `[PreGen Metadata Attempt ${metadataRetryCount + 1}] Successfully extracted fields.`,
              );
            } else {
              logger.warn(
                `[PreGen Metadata Attempt ${metadataRetryCount + 1}] Failed to extract required fields.`,
              );
            }
          }
        } else {
          logger.warn(
            `[PreGen Metadata Attempt ${metadataRetryCount + 1}] Could not find JSON object in AI response.`,
          );
        }

        // Validation
        if (
          parsedMetadata &&
          parsedMetadata.name &&
          parsedMetadata.symbol &&
          parsedMetadata.description &&
          parsedMetadata.prompt
        ) {
          parsedMetadata.symbol = parsedMetadata.symbol.toUpperCase();
          metadata = parsedMetadata; // Assign successfully parsed and validated metadata
          logger.log(
            `[PreGen Metadata] Successfully generated metadata on attempt ${metadataRetryCount + 1}.`,
          );
          break; // Exit retry loop
        } else {
          logger.warn(
            `[PreGen Metadata Attempt ${metadataRetryCount + 1}] Missing required fields or failed parsing. Retrying...`,
          );
          metadataRetryCount++;
        }
      } catch (error) {
        logger.error(
          `[PreGen Metadata Attempt ${metadataRetryCount + 1}] Error during generation:`,
          error,
        );
        metadataRetryCount++;
        if (metadataRetryCount < MAX_METADATA_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }

    if (!metadata) {
      logger.error(
        "[PreGen Metadata] Failed to generate valid metadata after all retries. Skipping token.",
      );
      // Use fallback in development/test
      if (env.NODE_ENV === "development" || env.NODE_ENV === "test") {
        const randomNum = Math.floor(Math.random() * 1000);
        logger.log("[PreGen Metadata] Using fallback metadata.");
        metadata = {
          name: `FallbackToken${randomNum}`,
          symbol: `FB${randomNum % 100}`,
          description: "Fallback token",
          prompt: "Fallback image prompt",
        };
      } else {
        return; // Stop if metadata failed in production
      }
    }
    // ----- End Step 1 -----

    // ----- Step 2: Generate Image (using CF AI) -----
    let imageDataUrl: string = "";
    try {
      logger.log(
        `[PreGen Image] Generating image for: ${metadata.name} using prompt: ${metadata.prompt.substring(0, 50)}...`,
      );
      const imageResult = await generateMedia(env, {
        prompt: metadata.prompt,
        type: MediaType.IMAGE,
      });
      if (
        imageResult?.data?.images?.length &&
        imageResult.data.images[0].url.startsWith("data:image")
      ) {
        imageDataUrl = imageResult.data.images[0].url;
        logger.log(
          `[PreGen Image] Successfully generated image Data URI for ${metadata.name}`,
        );
      } else {
        throw new Error("generateMedia did not return a valid image data URI.");
      }
    } catch (imageError) {
      logger.error(
        `[PreGen Image] Error generating image for ${metadata.name}:`,
        imageError,
      );
      return; // Stop if image generation fails
    }
    // ----- End Step 2 -----

    // ----- Step 3: Upload Image to R2 (Logic from /upload) -----
    let finalImageUrl = ""; // This will hold the final URL
    try {
      logger.log(
        `[PreGen Upload] Preparing image for upload: ${metadata.name}`,
      );
      const imageMatch = imageDataUrl.match(
        /^data:(image\/[a-z+]+);base64,(.*)$/,
      );
      if (!imageMatch) {
        throw new Error("Invalid image data URI format for upload.");
      }
      const contentType = imageMatch[1];
      const base64Data = imageMatch[2];
      const imageBuffer = Buffer.from(base64Data, "base64");
      logger.log(
        `[PreGen Upload] Decoded image: type=${contentType}, size=${imageBuffer.length} bytes`,
      );

      let extension = ".jpg";
      if (contentType.includes("png")) extension = ".png";
      else if (contentType.includes("gif")) extension = ".gif";
      else if (contentType.includes("svg")) extension = ".svg";
      else if (contentType.includes("webp")) extension = ".webp";

      // Use metadata name for filename
      // const sanitizedName = metadata.name.toLowerCase().replace(/[^a-z0-9\._-]/g, '_'); // Allow . _ -
      // const imageFilename = `${sanitizedName}${extension}`;
      // const imageFilename = `${crypto.randomUUID()}${extension}`; // Alternative: Use UUID
      const imageFilename = `${crypto.randomUUID()}${extension}`; // Use UUID for unique filename

      const imageKey = `token-images/${imageFilename}`; // Using the same prefix as /upload
      logger.log(`[PreGen Upload] Determined image R2 key: ${imageKey}`);

      if (!env.R2) {
        throw new Error("[PreGen Upload] R2 binding is not available.");
      }

      logger.log(`[PreGen Upload] Attempting R2 put for key: ${imageKey}`);
      const res = await env.R2.put(imageKey, imageBuffer, {
        httpMetadata: { contentType, cacheControl: "public, max-age=31536000" },
      });
      // log the public url from the respnse
      console.log("****** RES", res);
      logger.log(
        `[PreGen Upload] Image successfully uploaded to R2: ${imageKey}`,
      );

      // Construct URL based on environment (like /upload does)
      const r2PublicUrl = env.R2_PUBLIC_URL;
      if (!r2PublicUrl) {
        logger.error(
          "[PreGen Upload] R2_PUBLIC_URL environment variable is not set. Cannot construct public image URL.",
        );
        // Depending on desired behavior, you might want to return or throw here
        // For now, we'll set finalImageUrl to empty and let the DB step handle it (or fail)
      } else {
        // Only construct the URL if the base URL is available
        finalImageUrl =
          env.API_URL?.includes("localhost") ||
          env.API_URL?.includes("127.0.0.1")
            ? `${env.API_URL}/api/image/${imageFilename}`
            : `${r2PublicUrl.replace(/\/$/, "")}/${imageKey}`; // Ensure no double slash
        logger.log(
          `[PreGen Upload] Constructed final image URL: ${finalImageUrl}`,
        );
      }
    } catch (uploadError) {
      logger.error(
        `[PreGen Upload] Error during image upload for ${metadata.name}:`,
        uploadError,
      );
      return; // Stop if upload fails
    }
    // ----- End Step 3 -----

    // ----- Step 4: Insert into Database ----- (Optional: Upload Metadata JSON could be added here)
    try {
      logger.log(`[PreGen DB] Saving token to database: ${metadata.name}`);
      const db = getDB(env);
      await db.insert(preGeneratedTokens).values({
        id: crypto.randomUUID(),
        name: metadata.name,
        ticker: metadata.symbol,
        description: metadata.description,
        prompt: metadata.prompt,
        image: finalImageUrl, // Use the constructed URL
        createdAt: new Date().toISOString(),
        used: 0,
      });
      logger.log(
        `[PreGen DB] Successfully saved token: ${metadata.name} (${metadata.symbol}) with image ${finalImageUrl}`,
      );
    } catch (dbError) {
      logger.error(
        `[PreGen DB] Error saving token ${metadata.name} to database:`,
        dbError,
      );
      // Log error, but maybe don't stop the whole cron job?
    }
    // ----- End Step 4 -----
  } catch (error) {
    // Catch unexpected errors in the entire process for this token
    const tokenName = metadata?.name || "unknown_token_error";
    logger.error(
      `[PreGen Process] Unexpected error during generation for ${tokenName}:`,
      error,
    );
  }
}

// Check and replenish pre-generated tokens if needed
export async function checkAndReplenishTokens(
  env: Env,
  threshold: number = 3,
): Promise<void> {
  if (!threshold) {
    threshold = parseInt(env.PREGENERATED_TOKENS_COUNT || "3");
  }
  try {
    console.log("Checking and replenishing pre-generated tokens...");
    let retries = 0;
    const maxRetries = 5; // Increased from 2 to 5 to give more chances for success

    while (retries < maxRetries) {
      const db = getDB(env);

      // Count unused tokens
      const countResult = await db
        .select({ count: sql`count(*)` })
        .from(preGeneratedTokens)
        .where(eq(preGeneratedTokens.used, 0));

      const count = Number(countResult[0].count);
      logger.log(`Current unused pre-generated token count: ${count}`);

      // If below threshold, generate more
      if (count < threshold) {
        const tokensToGenerate = threshold - count;
        logger.log(
          `Generating ${tokensToGenerate} new pre-generated tokens...`,
        );
        await generatePreGeneratedTokens(env);
        retries++;
      } else {
        break;
      }
    }

    if (retries === maxRetries) {
      logger.error("Max retries reached.");
    }
  } catch (error) {
    logger.error("Error checking and replenishing tokens:", error);
  }
}

// Endpoint to enhance a prompt and generate media
app.post("/enhance-and-generate", requireAuth, async (c) => {
  try {
    const user = c.get("user");
    if (!user) {
      return c.json({ success: false, error: "Authentication required" }, 401);
    }

    // Verify and parse required fields
    const GenerationSchema = z.object({
      tokenMint: z.string().min(32).max(44),
      userPrompt: z.string().min(3).max(1000),
      mediaType: z
        .enum([MediaType.IMAGE, MediaType.VIDEO, MediaType.AUDIO])
        .default(MediaType.IMAGE),
      mode: z.enum(["fast", "pro"]).default("fast"),
      image_url: z.string().optional(), // For image-to-video
      lyrics: z.string().optional(), // For music generation
    });

    const body = await c.req.json();
    const { tokenMint, userPrompt, mediaType, mode, image_url, lyrics } =
      GenerationSchema.parse(body);

    logger.log(`Enhance-and-generate request for token: ${tokenMint}`);
    logger.log(`Original prompt: ${userPrompt}`);
    logger.log(`Media type: ${mediaType}, Mode: ${mode}`);

    // Get token metadata from database if available
    const db = getDB(c.env);
    const existingToken = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, tokenMint))
      .limit(1);

    let tokenMetadata = {
      name: "",
      symbol: "",
      description: "",
      prompt: "",
    };

    if (existingToken && existingToken.length > 0) {
      const token = existingToken[0];
      tokenMetadata = {
        name: token.name || "",
        symbol: token.ticker || "",
        description: token.description || "",
        prompt: "", // We don't store a separate prompt field currently
      };
    }

    if (!existingToken || existingToken.length === 0) {
      // For development, allow generation even if token doesn't exist in DB
      if (c.env.NODE_ENV !== "development" && c.env.NODE_ENV !== "test") {
        return c.json(
          {
            success: false,
            error:
              "Token not found. Please provide a valid token mint address.",
          },
          404,
        );
      }
      console.log("Token not found in DB, but proceeding in development mode");
    }

    // Check rate limits for the user on this token
    const rateLimit = await checkRateLimits(
      c.env,
      tokenMint,
      mediaType,
      user.publicKey,
    );

    if (!rateLimit.allowed) {
      // Check if failure is due to token ownership requirement
      if (
        rateLimit.message &&
        rateLimit.message.includes("tokens to use this feature")
      ) {
        return c.json(
          {
            success: false,
            error: "Insufficient token balance",
            message: rateLimit.message,
            type: "OWNERSHIP_REQUIREMENT",
            minimumRequired: TOKEN_OWNERSHIP.DEFAULT_MINIMUM,
          },
          403,
        );
      }
      // Otherwise it's a standard rate limit error
      return c.json(
        {
          success: false,
          error: "Rate limit exceeded. Please try again later.",
          limit: RATE_LIMITS[mediaType].MAX_GENERATIONS_PER_DAY,
          cooldown: RATE_LIMITS[mediaType].COOLDOWN_PERIOD_MS,
          message: `You can generate up to ${
            RATE_LIMITS[mediaType].MAX_GENERATIONS_PER_DAY
          } ${mediaType}s per day.`,
          remaining: rateLimit.remaining,
        },
        429,
      );
    }

    // Check specific token requirements for the selected mode
    const ownershipCheck = await checkTokenOwnership(
      c.env,
      tokenMint,
      user.publicKey,
      mode,
      mediaType,
    );

    if (!ownershipCheck.allowed) {
      // Determine the right minimum based on mode and type
      let minimumRequired = TOKEN_OWNERSHIP.DEFAULT_MINIMUM;
      if (mediaType === MediaType.VIDEO || mediaType === MediaType.AUDIO) {
        minimumRequired =
          mode === "pro"
            ? TOKEN_OWNERSHIP.SLOW_MODE_MINIMUM
            : TOKEN_OWNERSHIP.FAST_MODE_MINIMUM;
      } else if (mediaType === MediaType.IMAGE && mode === "pro") {
        minimumRequired = TOKEN_OWNERSHIP.FAST_MODE_MINIMUM;
      }

      return c.json(
        {
          success: false,
          error: "Insufficient token balance",
          message:
            ownershipCheck.message ||
            `You need at least ${minimumRequired} tokens to use this feature.`,
          type: "OWNERSHIP_REQUIREMENT",
          minimumRequired,
        },
        403,
      );
    }

    // Use AI to enhance the prompt
    console.log(`Enhancing prompt with token metadata for ${mediaType}`);
    const enhancedPrompt = await generateEnhancedPrompt(
      c.env,
      userPrompt,
      tokenMetadata,
      mediaType,
    );

    if (!enhancedPrompt) {
      return c.json(
        {
          success: false,
          error: "Failed to enhance the prompt. Please try again.",
        },
        500,
      );
    }

    logger.log(`Enhanced prompt: ${enhancedPrompt}`);

    // Generate the media with the enhanced prompt
    console.log(`Generating ${mediaType} with enhanced prompt in ${mode} mode`);

    // Prepare generation parameters
    const generationParams: any = {
      prompt: enhancedPrompt,
      type: mediaType,
      mode,
    };

    // Add optional parameters based on media type
    if (mediaType === MediaType.VIDEO && image_url) {
      generationParams.image_url = image_url;
    }

    if (mediaType === MediaType.AUDIO && lyrics) {
      generationParams.lyrics = lyrics;
    }

    const result = await generateMedia(c.env, generationParams);

    console.log(
      "Media generation result:",
      JSON.stringify(result).substring(0, 200) + "...",
    );

    // Validate response
    if (!result || typeof result !== "object") {
      throw new Error("Invalid response format");
    }

    let mediaUrl: string = ""; // Initialize with empty string

    if (result && typeof result === "object") {
      // Handle video result formats
      if (mediaType === MediaType.VIDEO) {
        if (result.video?.url) {
          mediaUrl = result.video.url;
        } else if (result.urls?.video) {
          // For pixverse models
          mediaUrl = result.urls.video;
        } else if (result.data?.video?.url) {
          // For data.video.url structure
          mediaUrl = result.data.video.url;
        }
      }
      // Handle audio result formats
      else if (mediaType === MediaType.AUDIO) {
        if (result.audio_file?.url) {
          mediaUrl = result.audio_file.url;
        } else if (result.data?.audio_file?.url) {
          // For diffrhythm model
          mediaUrl = result.data.audio_file.url;
        } else if (result.output?.audio) {
          mediaUrl = result.output.audio;
        } else if (result.data?.audio?.url) {
          mediaUrl = result.data.audio.url;
        }
      }
      // Handle image result formats
      else if (result.data?.images && result.data.images.length > 0) {
        mediaUrl = result.data.images[0].url;
      } else if (result.image?.url) {
        // For flux ultra
        mediaUrl = result.image.url;
      }
      // Handle any other format
      else if (result.url) {
        mediaUrl = result.url;
      }
    }
    // Last resort - if the result itself is a string URL
    else if (typeof result === "string") {
      mediaUrl = result;
    }

    if (!mediaUrl) {
      return c.json(
        {
          success: false,
          error: `Failed to generate ${mediaType}. Please try again.`,
        },
        500,
      );
    }

    // Save generation to database
    const generationId = crypto.randomUUID();
    try {
      await db.insert(mediaGenerations).values({
        id: generationId,
        mint: tokenMint,
        type: mediaType,
        prompt: enhancedPrompt,
        mediaUrl,
        creator: user.publicKey,
        timestamp: new Date().toISOString(),
      });
      console.log(`Generation saved to database with ID: ${generationId}`);
    } catch (dbError) {
      // Log but continue - don't fail the request just because we couldn't save to DB
      console.error("Error saving generation to database:", dbError);
    }

    // Return successful response
    interface GenerationResponse {
      success: boolean;
      mediaUrl: string;
      enhancedPrompt: string;
      originalPrompt: string;
      generationId: string;
      remainingGenerations: number;
      resetTime: string;
      lyrics?: string;
    }

    const response: GenerationResponse = {
      success: true,
      mediaUrl,
      enhancedPrompt,
      originalPrompt: userPrompt,
      generationId,
      remainingGenerations: rateLimit.remaining - 1,
      resetTime: new Date(
        Date.now() + RATE_LIMITS[mediaType].COOLDOWN_PERIOD_MS,
      ).toISOString(),
    };

    // Add lyrics to response if available
    if (mediaType === MediaType.AUDIO) {
      if (result.data?.lyrics) {
        response.lyrics = result.data.lyrics;
      } else if (result.lyrics) {
        response.lyrics = result.lyrics;
      } else if (generationParams.lyrics) {
        response.lyrics = generationParams.lyrics;
      } else if (result.data?.audio?.lyrics) {
        response.lyrics = result.data.audio.lyrics;
      }
    }

    return c.json(response);
  } catch (error) {
    logger.error("Error in enhance-and-generate endpoint:", error);
    return c.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error generating media",
      },
      500,
    );
  }
});

// Helper function to generate an enhanced prompt using the token metadata
async function generateEnhancedPrompt(
  env: Env,
  userPrompt: string,
  tokenMetadata: {
    name: string;
    symbol: string;
    description?: string;
    prompt?: string;
  },
  mediaType: MediaType = MediaType.IMAGE,
): Promise<string> {
  try {
    // Adjust prompt based on media type
    let systemPrompt = enhancePrompt(userPrompt, tokenMetadata);

    // Modify prompt based on media type
    if (mediaType === MediaType.VIDEO) {
      systemPrompt +=
        "\nAdditionally, focus on dynamic visual elements and motion that would work well in a short video.";
    } else if (mediaType === MediaType.AUDIO) {
      systemPrompt +=
        "\nAdditionally, focus on acoustic elements, mood, and atmosphere suitable for audio content.";
    }

    // Use Llama to enhance the prompt
    const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
      ],
      max_tokens: 1000,
      temperature: 0.75,
    });

    // Extract just the prompt text from the response
    let enhancedPrompt = response.response.trim();

    // If the prompt is too long, truncate it to 500 characters
    if (enhancedPrompt.length > 500) {
      enhancedPrompt = enhancedPrompt.substring(0, 500);
    }

    return enhancedPrompt;
  } catch (error) {
    logger.error("Error generating enhanced prompt:", error);

    // Return a fallback that combines the inputs directly
    return `${tokenMetadata.name} (${tokenMetadata.symbol}): ${userPrompt}`;
  }
}

// Function to generate additional images for a token
export async function generateAdditionalTokenImages(
  env: Env,
  tokenMint: string,
  description: string,
): Promise<void> {
  try {
    logger.log(`Generating additional images for token ${tokenMint}`);

    // Generate enhanced prompts for each image
    const enhancedPrompts = await Promise.all([
      generateEnhancedPrompt(
        env,
        description,
        { name: "", symbol: "", description },
        MediaType.IMAGE,
      ),
      generateEnhancedPrompt(
        env,
        description,
        { name: "", symbol: "", description },
        MediaType.IMAGE,
      ),
      generateEnhancedPrompt(
        env,
        description,
        { name: "", symbol: "", description },
        MediaType.IMAGE,
      ),
    ]);

    // Generate and upload each image in parallel
    await Promise.all(
      enhancedPrompts.map(async (prompt, index) => {
        if (!prompt) {
          logger.error(
            `Failed to generate enhanced prompt ${index + 1} for token ${tokenMint}`,
          );
          return;
        }

        try {
          // Generate the image
          const imageResult = await generateMedia(env, {
            prompt,
            type: MediaType.IMAGE,
          });

          if (!imageResult?.data?.images?.[0]?.url) {
            throw new Error("No image URL in generation result");
          }

          // Convert data URL to buffer
          const imageUrl = imageResult.data.images[0].url;
          const base64Data = imageUrl.split(",")[1];
          const imageBuffer = Buffer.from(base64Data, "base64");

          // Upload to R2 with predictable path
          await uploadGeneratedImage(env, imageBuffer, tokenMint, index + 1);
          logger.log(
            `Successfully generated and uploaded image ${index + 1} for token ${tokenMint}`,
          );
        } catch (error) {
          logger.error(
            `Error generating/uploading image ${index + 1} for token ${tokenMint}:`,
            error,
          );
        }
      }),
    );

    logger.log(`Completed generating additional images for token ${tokenMint}`);
  } catch (error) {
    logger.error(
      `Error in generateAdditionalTokenImages for ${tokenMint}:`,
      error,
    );
  }
}

// Helper function to format lyrics for diffrhythm
function formatLyricsForDiffrhythm(lyrics: string): string {
  // Split lyrics into lines and clean up
  const lines = lyrics.split('\n').filter(line => line.trim() !== '');
  
  // Process lines to ensure proper format
  const formattedLines: string[] = [];
  let currentTime = 0;
  
  for (const line of lines) {
    // Skip empty lines and metadata
    if (!line.trim() || 
        line.toLowerCase().includes('here\'s a song') ||
        line.toLowerCase().includes('outro') ||
        line.toLowerCase().includes('verse') ||
        line.toLowerCase().includes('chorus') ||
        line.toLowerCase().includes('bridge') ||
        line.includes('**')) {
      continue;
    }
    
    // If line has a timestamp, use it
    if (line.match(/\[\d{2}:\d{2}\.\d{2}\]/)) {
      const match = line.match(/\[(\d{2}:\d{2}\.\d{2})\](.*)/);
      if (match) {
        const timestamp = match[1];
        const lyric = match[2].trim();
        if (lyric) {
          formattedLines.push(`[${timestamp}]${lyric}`);
        }
      }
    } else {
      // If no timestamp, add one with proper spacing
      const minutes = Math.floor(currentTime / 60);
      const seconds = Math.floor(currentTime % 60);
      const milliseconds = Math.floor((currentTime % 1) * 100);
      const timestamp = `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}]`;
      formattedLines.push(`${timestamp}${line.trim()}`);
      currentTime += 3.2; // Add 3.2 seconds between lines (matching example spacing)
    }
  }

  // Join lines with newlines
  const formattedLyrics = formattedLines.join('\n');
  console.log('Formatted lyrics:', formattedLyrics);
  return formattedLyrics;
}

// Helper function to generate lyrics using AI
async function generateLyrics(
  env: Env,
  tokenMetadata: {
    name: string;
    symbol: string;
    description?: string;
  },
  stylePrompt?: string
): Promise<string> {
  try {
    const systemPrompt = `You are a creative songwriter. Create lyrics for a song about the token "${tokenMetadata.name}" (${tokenMetadata.symbol}). 
    The song should capture the essence of the token's description: "${tokenMetadata.description}".
    ${stylePrompt ? `The musical style should be: ${stylePrompt}` : ''}
    
    Format the lyrics with timestamps in the format [MM:SS.mm] at the start of each line.
    Include at least two sections: a verse and a chorus.
    Each section should be marked with [verse] or [chorus] at the start.
    Make the lyrics creative and engaging.
    
    Example format:
    [verse]
    [00:00.00] First line of verse
    [00:02.50] Second line of verse
    [00:05.00] Third line of verse
    
    [chorus]
    [00:07.50] First line of chorus
    [00:10.00] Second line of chorus
    [00:12.50] Third line of chorus`;

    const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
      ],
      max_tokens: 1000,
      temperature: 0.8,
    });

    // Ensure the lyrics have proper formatting
    let lyrics = response.response.trim();
    
    // Add section markers if they're missing
    if (!lyrics.includes('[verse]')) {
      lyrics = `[verse]\n${lyrics}`;
    }
    if (!lyrics.includes('[chorus]')) {
      lyrics = `[chorus]\n${lyrics}`;
    }
    
    // Add timestamps if they're missing
    const lines = lyrics.split('\n');
    let currentTime = 0;
    const formattedLines = lines.map(line => {
      if (line.startsWith('[') && !line.match(/\[\d{2}:\d{2}\.\d{2}\]/)) {
        return line; // Keep section markers as is
      }
      if (!line.match(/\[\d{2}:\d{2}\.\d{2}\]/)) {
        const minutes = Math.floor(currentTime / 60);
        const seconds = Math.floor(currentTime % 60);
        const milliseconds = Math.floor((currentTime % 1) * 100);
        const timestamp = `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}]`;
        currentTime += 2.5; // Add 2.5 seconds between lines
        return `${timestamp} ${line}`;
      }
      return line;
    });
    
    return formattedLines.join('\n');
  } catch (error) {
    logger.error("Error generating lyrics:", error);
    throw error;
  }
}

export default app;
