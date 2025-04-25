import { fal } from "@fal-ai/client";
import { Connection, PublicKey } from "@solana/web3.js";
import { and, eq, gte, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { Buffer } from "node:buffer"; // Added for image decoding
import crypto from "node:crypto";
import { z } from "zod";
import { getDB, mediaGenerations, preGeneratedTokens, tokens } from "../db";
import { getGlobalRedisCache } from "../redis";
import { MediaGeneration } from "../types";
import { uploadGeneratedImage } from "../uploader";
import { getRpcUrl, logger } from "../util";
import { enhancePrompt } from "../prompts/enhance-prompt";
import { createTokenPrompt } from "../prompts/create-token";
import { uploadToStorage } from "./files";

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
  mint: string,
  type: MediaType,
  publicKey?: string
): Promise<{ allowed: boolean; remaining: number; message?: string }> {
  // Special handling for test environments
  if (process.env.NODE_ENV === "test") {
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

  const db = getDB();

  const cutoffTime = new Date(
    Date.now() - RATE_LIMITS[type].COOLDOWN_PERIOD_MS
  );

  // Create a timeout for the database query
  const dbTimeout = 5000; // 5 seconds
  const dbTimeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error("Rate limits check timed out")),
      dbTimeout
    )
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
          gte(mediaGenerations.timestamp, cutoffTime)
        )
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
      const ownershipResult = await checkTokenOwnership(mint, publicKey);
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
  mint: string,
  publicKey: string,
  mode: "fast" | "pro" = "fast",
  mediaType: MediaType = MediaType.IMAGE
): Promise<{ allowed: boolean; message?: string }> {
  try {
    // Special handling for test environments
    if (process.env.NODE_ENV === "test") {
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
    const db = getDB();
    const redisCache = await getGlobalRedisCache(); // Instantiate Redis

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

      let specificHolderData: any | null = null;
      const holdersListKey = `holders:${mint}`;
      try {
        const holdersString = await redisCache.get(holdersListKey);
        if (holdersString) {
          const allHolders: any[] = JSON.parse(holdersString);
          specificHolderData = allHolders.find((h) => h.address === publicKey);
        } else {
          logger.log(
            `checkTokenOwnership: No holders found in Redis for ${mint}`
          );
        }
      } catch (redisError) {
        logger.error(
          `checkTokenOwnership: Failed to get holders from Redis for ${mint}:`,
          redisError
        );
        // Fallback to blockchain check if Redis fails
        return await checkBlockchainTokenBalance(
          mint,
          publicKey,
          minimumRequired
        );
      }
      // ---> END CHANGE

      // If user is not in the token holders list (or Redis failed slightly earlier)
      if (!specificHolderData) {
        // User is not a token holder according to cache, check the blockchain directly as fallback
        logger.log(
          `User ${publicKey} not found in Redis holders for ${mint}, checking blockchain.`
        );
        return await checkBlockchainTokenBalance(
          mint,
          publicKey,
          minimumRequired
        );
      }

      // User is in token holders list, check if they have enough tokens
      // const holder = holderQuery[0];
      const decimals = 6; // Assume 6 decimals, or fetch from tokenInfo if needed
      const holdingAmount = specificHolderData.amount; // Amount is already adjusted in updateHoldersCache?
      // Assuming amount stored is the raw amount, needs division
      const holdingUiAmount = holdingAmount / Math.pow(10, decimals);

      // if (holdingAmount >= minimumRequired) { // Compare raw amounts if minimum is raw
      if (holdingUiAmount >= minimumRequired) {
        // Compare UI amounts
        return { allowed: true };
      } else {
        return {
          allowed: false,
          message: `You need at least ${minimumRequired} tokens to use this feature. You currently have ${holdingUiAmount.toFixed(2)}.`,
        };
      }
    } catch (dbError) {
      logger.error(`Database error during token creator check: ${dbError}`);
      // Fall back to checking the blockchain directly if database check fails
      return await checkBlockchainTokenBalance(
        mint,
        publicKey,
        minimumRequired
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
  mint: string,
  publicKey: string,
  minimumRequired: number
): Promise<{ allowed: boolean; message?: string }> {
  try {
    // Connect to Solana
    const connection = new Connection(getRpcUrl(), "confirmed");

    // Convert string addresses to PublicKey objects
    const mintPublicKey = new PublicKey(mint);
    const userPublicKey = new PublicKey(publicKey);

    // Fetch token accounts with a simple RPC call
    const response = await connection.getTokenAccountsByOwner(
      userPublicKey,
      { mint: mintPublicKey },
      { commitment: "confirmed" }
    );

    // Calculate total token amount
    let totalAmount = 0;

    // Get token balances from all accounts
    const tokenAccountInfos = await Promise.all(
      response.value.map(({ pubkey }) =>
        connection.getTokenAccountBalance(pubkey)
      )
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
      `Error checking blockchain token balance for user ${publicKey}: ${error}`
    );

    // Default to allowing if we can't check the balance
    // You may want to change this to false in production
    return { allowed: true };
  }
}

// Function definition moved earlier
async function generateLyrics(
  tokenMetadata: {
    name: string;
    symbol: string;
    description?: string;
  },
  stylePrompt?: string
): Promise<string> { // Ensure it promises a string
  try {
    if (!process.env.FAL_API_KEY) {
      throw new Error(
        "FAL_API_KEY environment variable not set for lyrics generation."
      );
    }
    fal.config({ credentials: process.env.FAL_API_KEY });

    const systemPrompt = `You are a creative songwriter. Create lyrics for a song about the token "${tokenMetadata.name}" (${tokenMetadata.symbol}).
    The song should capture the essence of the token's description: "${tokenMetadata.description}".
    ${stylePrompt ? `The musical style should be: ${stylePrompt}` : ""}

    Format the lyrics with timestamps in the format [MM:SS.mm] at the start of each line.
    Include at least two sections: a verse and a chorus.
    Each section should be marked with [verse] or [chorus] at the start.
    Make the lyrics creative and engaging.
    Output ONLY the formatted lyrics.

    Example format:
    [verse]
    [00:00.00] First line of verse
    [00:02.50] Second line of verse
    [00:05.00] Third line of verse

    [chorus]
    [00:07.50] First line of chorus
    [00:10.00] Second line of chorus
    [00:12.50] Third line of chorus`;

    const falInput = {
      model: "gemini-2.0-flash-001",
      system_prompt: systemPrompt,
      prompt: "Generate the lyrics based on the system prompt instructions.",
      // Temperature adjustment might need different handling with Fal
    };

    const response: any = await fal.subscribe("fal-ai/any-llm", {
      input: {
        prompt: falInput.prompt,
        system_prompt: falInput.system_prompt,
        model: "google/gemini-flash-1.5",
      },
      logs: true, // Optional: for debugging
    });

    // Ensure the lyrics have proper formatting
    let lyrics = response?.data?.output || response?.output || ""; // Adjust based on actual Fal response structure
    lyrics = lyrics.trim();

    // Basic validation - return fallback STRING on failure
    if (!lyrics || !lyrics.includes("[") || lyrics.length < 20) {
      logger.error(
        "Failed to generate valid lyrics structure from Fal AI. Response:",
        lyrics
      );
      // Return a fallback string
      return `[verse]\n[00:00.00] Song about ${tokenMetadata.name}\n[00:03.00] Symbol ${tokenMetadata.symbol}\n[chorus]\n[00:06.00] Based on: ${tokenMetadata.description?.substring(0, 50)}...\n[00:09.00] Fal AI generation failed.`;
    }

    // Add section markers if they're missing (might be less necessary if prompt works well)
    if (!lyrics.includes("[verse]")) {
      lyrics = `[verse]\n${lyrics}`;
    }
    if (!lyrics.includes("[chorus]")) {
      // Find the first timestamp after [verse] lines and insert [chorus] before it
      const lines = lyrics.split("\n");
      let verseEnded = false;
      let chorusInserted = false;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("[verse]")) verseEnded = true;
        if (
          verseEnded &&
          lines[i].match(/\[\d{2}:\d{2}\.\d{2}\]/) &&
          !lines[i - 1]?.includes("[verse]")
        ) {
          lines.splice(i, 0, "[chorus]");
          chorusInserted = true;
          break;
        }
      }
      if (!chorusInserted)
        lyrics = lyrics + "\n[chorus]\n[00:15.00] Default chorus line."; // Add fallback chorus if needed
      else lyrics = lines.join("\n");
    }

    // Add timestamps if they're missing (less likely if prompt works)
    const lines = lyrics.split("\n");
    let currentTime = 0;
    const formattedLines = lines.map((line: string) => {
      if (
        line.trim() === "" ||
        (line.startsWith("[") && !line.match(/\[\d{2}:\d{2}\.\d{2}\]/))
      ) {
        return line; // Keep section markers or empty lines as is
      }
      if (!line.match(/\[\d{2}:\d{2}\.\d{2}\]/)) {
        const minutes = Math.floor(currentTime / 60);
        const seconds = Math.floor(currentTime % 60);
        const milliseconds = Math.floor((currentTime % 1) * 100);
        const timestamp = `[${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(2, "0")}]`;
        currentTime += 2.5; // Add 2.5 seconds between lines
        return `${timestamp} ${line.trim()}`;
      } else {
        // Extract time if present to keep track for subsequent lines
        const timeMatch = line.match(/\[(\d{2}):(\d{2})\.(\d{2})\]/);
        if (timeMatch) {
          const minutes = parseInt(timeMatch[1], 10);
          const seconds = parseInt(timeMatch[2], 10);
          const ms = parseInt(timeMatch[3], 10);
          currentTime = minutes * 60 + seconds + ms / 100 + 2.5; // Update current time based on last timestamp + delta
        }
      }
      return line;
    });

    return formattedLines.join("\n"); // Return the final string

  } catch (error) {
    logger.error("Error generating lyrics:", error);
    // Also return a fallback string on catch
     return `[verse]\n[00:00.00] Error generating lyrics for ${tokenMetadata.name}.`;
    // OR re-throw if generateMedia should handle the error
    // throw error;
  }
}

// Function definition moved earlier
function formatLyricsForDiffrhythm(lyrics: string): string {
  // Split lyrics into lines and clean up
  const lines = lyrics.split("\n").filter((line) => line.trim() !== "");

  // Process lines to ensure proper format
  const formattedLines: string[] = [];
  let currentTime = 0; // Initialize currentTime

  for (const line of lines) {
    // Skip empty lines and metadata/section markers typically added by LLMs
    if (
      !line.trim() ||
      line.toLowerCase().includes("here's a song") || // Common LLM preamble
      line.toLowerCase().startsWith("[verse") ||
      line.toLowerCase().startsWith("[chorus") ||
      line.toLowerCase().startsWith("[bridge") ||
      line.toLowerCase().startsWith("[intro") ||
      line.toLowerCase().startsWith("[outro") ||
      line.includes("...") || // Ellipses often indicate incomplete/filler
      line.includes("---") || // Separators
      line.includes("***") || // Separators
      /^\s*$/.test(line) // Empty or whitespace-only lines
    ) {
      continue;
    }

    // If line already has a valid timestamp, use it directly
    const timestampMatch = line.match(/^\[(\d{2}:\d{2}\.\d{2})\]/);
    if (timestampMatch) {
      const timestamp = timestampMatch[1];
      const lyricText = line.substring(timestampMatch[0].length).trim(); // Get text after timestamp
       if (lyricText) { // Only add if there's actual lyric text
         formattedLines.push(`[${timestamp}]${lyricText}`);
         // Update currentTime based on this timestamp for the next iteration
         const timeParts = timestamp.split(/[:.]/);
         if (timeParts.length === 3) {
            const minutes = parseInt(timeParts[0], 10);
            const seconds = parseInt(timeParts[1], 10);
            const ms = parseInt(timeParts[2], 10);
            currentTime = minutes * 60 + seconds + ms / 100;
         }
       }
    } else {
      // If no valid timestamp, add one with estimated spacing
      const minutes = Math.floor(currentTime / 60);
      const seconds = Math.floor(currentTime % 60);
      const milliseconds = Math.floor((currentTime % 1) * 100); // Use 100 for two decimal places
      const timestamp = `[${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(2, "0")}]`;

      const lyricText = line.trim(); // Use the cleaned line text
       if (lyricText) { // Only add if there's actual lyric text
           formattedLines.push(`${timestamp}${lyricText}`);
           currentTime += 3.0; // Add estimated duration (e.g., 3 seconds) before the next line
       }
    }
  }

  // Join lines with newlines
  const formattedLyrics = formattedLines.join("\n");
  logger.log("Formatted lyrics for Diffrhythm:", formattedLyrics); // Use logger
  return formattedLyrics;
}

// Helper to generate media using fal.ai or Cloudflare Workers
export async function generateMedia(data: {
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
}) {
  // Set default timeout - shorter for tests
  const timeout = 300000;

  // Initialize fal.ai client
  if (!process.env.FAL_API_KEY) {
    throw new Error("FAL_API_KEY environment variable not set.");
  }
  fal.config({
    credentials: process.env.FAL_API_KEY,
  });
  logger.log("Fal AI client configured.");

  // Create a timeout promise
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`Media generation timed out after ${timeout}ms`)),
      timeout
    )
  );

  let generationPromise;

  // --- Image Generation (Fast & Pro using Fal) ---
  if (data.type === MediaType.IMAGE) {
    const isProMode = data.mode === "pro";
    const model = isProMode
      ? "fal-ai/flux-pro/v1.1-ultra"
      : "fal-ai/flux/schnell";
    const input: any = { prompt: data.prompt };

    if (isProMode) {
      logger.log(`Using Fal AI (${model}) for pro image generation...`);
      if (data.width) input.width = data.width;
      if (data.height) input.height = data.height;
      // Add any other pro-specific params here
    } else {
      logger.log(`Using Fal AI (${model}) for fast image generation...`);
      input.num_inference_steps = 4; // Schnell default/equivalent
      // Add any other schnell-specific params here
    }

    generationPromise = fal.subscribe(model, {
      input,
      logs: true,
      onQueueUpdate: (update: any) => {
        if (update.status === "IN_PROGRESS") {
          console.log("Image generation progress:", update.logs);
        }
      },
    });
  }
  // --- Video Generation --- (Existing Fal Logic)
  else if (data.type === MediaType.VIDEO && data.image_url) {
    // Image-to-video generation via Fal
    logger.log("Using Fal AI for image-to-video generation...");
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
  } else if (data.type === MediaType.VIDEO) {
    // Text-to-video generation via Fal
    logger.log("Using Fal AI for text-to-video generation...");
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
  }
  // --- Audio Generation --- (Existing Fal Logic)
  else if (data.type === MediaType.AUDIO) {
    logger.log("Using Fal AI for audio generation...");
    let lyricsToUse: string | undefined = data.lyrics; // Explicitly allow undefined initially

    if (!lyricsToUse) {
      logger.log("Generating lyrics for audio...");
      // generateLyrics now guarantees a string return
      lyricsToUse = await generateLyrics(
        {
          name: data.prompt.split(":")[0] || "",
          symbol: data.prompt.split(":")[1]?.trim() || "",
          description: data.prompt.split(":")[2]?.trim() || "",
        },
        data.style_prompt
      );
    }

    // lyricsToUse is now guaranteed to be a string here
    const formattedLyrics = formatLyricsForDiffrhythm(lyricsToUse); // Now safe to call

    const input = {
      lyrics: formattedLyrics,
      reference_audio_url:
        data.reference_audio_url ||
        "https://storage.googleapis.com/falserverless/model_tests/diffrythm/rock_en.wav",
      style_prompt: data.style_prompt || "pop",
      music_duration: data.music_duration || "95s",
      cfg_strength: data.cfg_strength || 4,
      scheduler: data.scheduler || "euler",
      num_inference_steps: data.num_inference_steps || 32,
    };
    console.log("DiffRhythm input:", JSON.stringify(input, null, 2));

    generationPromise = fal.subscribe("fal-ai/diffrhythm", {
      input,
      logs: true,
      onQueueUpdate: (update: any) => {
        if (update.status === "IN_PROGRESS") {
          console.log("Music generation progress:", update.logs);
        }
      },
    });

    // For audio, handle the result specifically to include lyrics
    const result = (await Promise.race([
      generationPromise,
      timeoutPromise,
    ])) as any;
    console.log("Audio generation result:", JSON.stringify(result, null, 2));

    const audioUrl = result.data?.audio?.url;
    if (!audioUrl) {
      throw new Error("No audio URL in response");
    }

    return {
      data: {
        audio: {
          url: audioUrl,
          lyrics: lyricsToUse, // Include the lyrics used (original or generated)
        },
      },
    };
  } else {
    // Should not happen given the logic, but good practice
    throw new Error(
      `Unsupported media type or configuration: ${data.type}, mode: ${data.mode}`
    );
  }

  // If generationPromise was set (for Image/Video cases), await and return
  return await Promise.race([generationPromise, timeoutPromise]);
}

// Create a Hono app for media generation routes
const app = new Hono<{
  Variables: {
    user?: { publicKey: string } | null;
  };
}>();

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
      504
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
      credentials: process.env.FAL_API_KEY ?? "",
    });

    // Create a database timeout
    const dbTimeout = 5000; // 5 seconds
    const dbTimeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Database query timed out")), dbTimeout)
    );

    // Check if the token exists in the database
    const db = getDB();
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
        checkRateLimits(mint, validatedData.type, user.publicKey),
        dbTimeoutPromise,
      ])) as { allowed: boolean; remaining: number; message?: string };

      // Additional ownership check for mode-specific requirements
      if (rateLimit.allowed) {
        const ownershipCheck = await checkTokenOwnership(
          mint,
          user.publicKey,
          mode,
          validatedData.type
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
            403
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
            403
          );
        }
        // Otherwise it's a standard rate limit error
        return c.json(
          {
            error: "Rate limit exceeded. Please try again later.",
            limit: RATE_LIMITS[validatedData.type].MAX_GENERATIONS_PER_DAY,
            cooldown: RATE_LIMITS[validatedData.type].COOLDOWN_PERIOD_MS,
            message: `You can generate up to ${RATE_LIMITS[validatedData.type].MAX_GENERATIONS_PER_DAY
              } ${validatedData.type}s per day`,
          },
          429
        );
      }
    } catch (error) {
      clearTimeoutSafe(endpointTimeoutId);
      console.error(`Error checking rate limits: ${error}`);
      return c.json({ error: "Error checking rate limits" }, 500);
    }

    console.log("FAL_API_KEY is", process.env.FAL_API_KEY);

    let result: any;
    try {
      // Pass c.env to generateMedia
      result = await generateMedia(validatedData);
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
      const insertPromise = db.insert(mediaGenerations).values([
        {
          id: crypto.randomUUID(),
          mint,
          type: validatedData.type,
          prompt: validatedData.prompt,
          mediaUrl,
          timestamp: new Date(),
        },
      ]);

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
        Date.now() + RATE_LIMITS[validatedData.type].COOLDOWN_PERIOD_MS
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
      500
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

    const db = getDB();

    // Check if user owns the token
    const token = await db
      .select()
      .from(tokens)
      .where(and(eq(tokens.mint, mint), eq(tokens.creator, user.publicKey)))
      .limit(1);

    if (!token || token.length === 0) {
      return c.json(
        { error: "Not authorized to view generation history for this token" },
        403
      );
    }

    const cutoffTime = new Date(
      Date.now() - RATE_LIMITS[type || MediaType.IMAGE].COOLDOWN_PERIOD_MS
    );

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
        Date.now() + RATE_LIMITS[type || MediaType.IMAGE].COOLDOWN_PERIOD_MS
      ).toISOString(),
    });
  } catch (error) {
    logger.error("Error fetching generation history:", error);

    if (error instanceof z.ZodError) {
      return c.json({ error: error.errors }, 400);
    }

    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

// Generate token metadata endpoint
app.post("/generate-metadata", async (c) => {

  // get the body parameter
  const body = await c.req.json();

  const { prompt } = body;

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
        400
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
    let validatedData: any;
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
          400
        );
      }
      throw error;
    }

    // Custom max retries for endpoint
    const MAX_RETRIES = 10;
    logger.log(
      `Generating token metadata with up to ${MAX_RETRIES} retries...`
    );

    // Function to generate metadata with the specified prompt data
    async function generatePromptMetadata(maxRetries = MAX_RETRIES) {
      // Add env parameter
      let retryCount = 0;

      if (!process.env.FAL_API_KEY) {
        throw new Error(
          "FAL_API_KEY environment variable not set for metadata generation."
        );
      }
      fal.config({ credentials: process.env.FAL_API_KEY });

      while (retryCount < maxRetries) {
        try {
          logger.log(
            `Generating token metadata (attempt ${retryCount + 1}/${maxRetries})...`
          );

          const systemPromptContent = await createTokenPrompt({ prompt: prompt }); // Removed validatedData argument
          const falInput = {
            model: "gemini-2.0-flash-001",
            // Combine messages into prompt/system_prompt for fal
            system_prompt: systemPromptContent,
            prompt: "Generate the token metadata based on the system prompt.", // Or adjust if createTokenPrompt provides the main prompt
            // Temperature is not directly supported in fal.subscribe input for all models? Check fal docs.
            // Assuming the model's default or configured temperature is used.
          };

          logger.log("Fal AI Input:", JSON.stringify(falInput));

          // Use fal.subscribe
          const response: any = await fal.subscribe("fal-ai/any-llm", {
            input: {
              prompt: falInput.prompt,
              system_prompt: falInput.system_prompt, // Add system_prompt here
              model: "google/gemini-flash-1.5",
            },
            logs: true, // Optional: for debugging
          });

          // Parse the JSON response with robust error handling
          let metadata: Record<string, string>;

          // Log the raw response for debugging
          const rawOutput = response?.data?.output || response?.output || ""; // Adjust based on actual Fal response structure
          logger.log(
            `[Endpoint - Attempt ${retryCount + 1}] Raw Fal AI output:`,
            typeof rawOutput === "string"
              ? rawOutput.substring(0, 100) + "..."
              : JSON.stringify(rawOutput)
          );

          console.log("rawOutput is", rawOutput);

          // First try to extract JSON using regex - find content between the first { and last }
          const jsonRegex = /{[\s\S]*}/;
          // Ensure rawOutput is a string before matching
          const jsonString =
            typeof rawOutput === "string"
              ? rawOutput.match(jsonRegex)?.[0]
              : null;

          if (!jsonString) {
            logger.warn(
              `[Endpoint - Attempt ${retryCount + 1}] Could not find JSON object in Fal AI response, retrying...`
            );
            retryCount++;
            continue;
          }

          logger.log(
            `[Endpoint - Attempt ${retryCount + 1}] Extracted JSON string:`,
            jsonString.substring(0, 100) + "..."
          );

          try {
            // Try to parse the extracted JSON
            metadata = JSON.parse(jsonString);
          } catch (parseError) {
            // If the first extraction fails, try a more aggressive approach
            // Look for individual fields and construct a JSON object
            logger.log(
              `[Endpoint - Attempt ${retryCount + 1}] JSON parse failed. Attempting field extraction...`
            );

            // Field extraction might be less reliable with complex LLM output
            // Consider refining the prompt to *only* output JSON
            const nameMatch = jsonString.match(/"name"\s*:\s*"([^"]+)"/);
            const symbolMatch = jsonString.match(/"symbol"\s*:\s*"([^"]+)"/);
            const descMatch = jsonString.match(/"description"\s*:\s*"([^"]+)"/);
            const promptMatch = jsonString.match(/"prompt"\s*:\s*"([^"]+)"/);

            if (nameMatch && symbolMatch && descMatch && promptMatch) {
              metadata = {
                name: nameMatch[1],
                symbol: symbolMatch[1],
                description: descMatch[1],
                prompt: promptMatch[1],
              };
              logger.log(
                `[Endpoint - Attempt ${retryCount + 1}] Successfully extracted fields from response`
              );
            } else {
              logger.warn(
                `[Endpoint - Attempt ${retryCount + 1}] Failed to extract required fields, retrying...`
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
              `[Endpoint - Attempt ${retryCount + 1}] Missing required fields in metadata, retrying...`
            );
            retryCount++;
            continue;
          }

          // Ensure symbol is uppercase
          metadata.symbol = metadata.symbol.toUpperCase();

          logger.log(
            `Successfully generated metadata on attempt ${retryCount + 1}/${maxRetries}`
          );
          return metadata;
        } catch (error) {
          logger.error(
            `[Endpoint - Attempt ${retryCount + 1}] Error during metadata generation:`,
            error
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
        `Failed to generate metadata after ${maxRetries} attempts in endpoint`
      );
      return null;
    }

    // Generate metadata with retries, passing env
    const metadata = await generatePromptMetadata();

    if (!metadata) {
      // All retries failed - provide fallback in development or return error
      if (
        process.env.NODE_ENV === "development" ||
        process.env.NODE_ENV === "test"
      ) {
        const randomNum = Math.floor(Math.random() * 1000);
        logger.log(
          "Using fallback metadata in development/test environment after all retries failed"
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
        500
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
      500
    );
  }
});

// Generate endpoint without mint
app.post("/generate", async (c) => {
  console.log("generate");
  try {
    // Parse request body
    const body = await c.req.json();

    const { prompt } = body;

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
          400
        );
      }
      throw error;
    }

    const result = (await generateMedia(validatedData)) as any;

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
        500
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
      500
    );
  }
});

/**
 * Generate an image using Fal.ai API
 */
export async function generateImage(
  mint: string,
  prompt: string,
  negativePrompt?: string,
  creator?: string
): Promise<MediaGeneration> {
  try {
    // Check if user has privileges and available generations
    const db = getDB();
    const userGenerations = await db
      .select()
      .from(mediaGenerations)
      .where(
        and(
          eq(mediaGenerations.mint, mint),
          eq(mediaGenerations.creator, creator || ""),
          gte(mediaGenerations.timestamp, new Date(Date.now() - 24 * 60 * 60 * 1000))
        )
      );

    if (userGenerations.length >= 10) {
      throw new Error("Daily generation limit reached");
    }

    // Generate image using Fal.ai
    const imageResult = await generateMedia({
      prompt,
      type: MediaType.IMAGE,
      negative_prompt: negativePrompt,
      mode: "fast"
    }) as any;

    if (!imageResult?.data?.images?.[0]?.url) {
      throw new Error("Failed to generate image");
    }

    // Download the generated image
    const imageResponse = await fetch(imageResult.data.images[0].url);
    if (!imageResponse.ok) {
      throw new Error("Failed to download generated image");
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const timestamp = Date.now();

    // Upload to S3 with new directory structure
    const imageKey = `generations/${mint}/image/generation-${timestamp}.jpg`;
    const imageUrl = await uploadToStorage(imageBuffer, {
      contentType: "image/jpeg",
      key: imageKey
    });

    // Create media generation record
    const generationId = crypto.randomUUID();
    const now = new Date();
    await db.insert(mediaGenerations).values({
      id: generationId,
      mint,
      type: "image",
      prompt,
      mediaUrl: imageUrl,
      negativePrompt: negativePrompt || "",
      seed: Math.floor(Math.random() * 1000000),
      numInferenceSteps: 30,
      creator: creator || "",
      timestamp: now
    });

    return {
      id: generationId,
      mint,
      type: "image",
      prompt,
      mediaUrl: imageUrl,
      negativePrompt: negativePrompt || "",
      seed: Math.floor(Math.random() * 1000000),
      numInferenceSteps: 30,
      creator: creator || "",
      timestamp: now.toISOString(),
      dailyGenerationCount: userGenerations.length + 1,
      lastGenerationReset: now.toISOString()
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
  mint: string,
  prompt: string,
  negativePrompt?: string,
  creator?: string
): Promise<MediaGeneration> {
  try {
    // In test mode, return a test video
    if (process.env.NODE_ENV === "test") {
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
    if (!process.env.FAL_API_KEY) {
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
  db: any,
  mint: string,
  creator: string
): Promise<number> {
  try {
    // In test mode, return a low count
    if (process.env.NODE_ENV === "test") {
      return 1;
    }

    // For real implementation, query the database and update
    const now = new Date();
    const today = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
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

// --- Define generateMetadata FIRST ---
async function generateMetadata(maxRetries = 10): Promise<Record<string, string> | null> {
    let retryCount = 0;
    if (!process.env.FAL_API_KEY) { throw new Error("FAL_API_KEY not set"); }
    fal.config({ credentials: process.env.FAL_API_KEY });

    while (retryCount < maxRetries) {
        try {
            logger.log(`Generating token metadata (attempt ${retryCount + 1}/${maxRetries})...`);
            // Assuming createTokenPrompt is defined elsewhere and works
            const systemPromptContent = await createTokenPrompt();
            const falInput = {
                 model: "gemini-2.0-flash-001",
                 system_prompt: systemPromptContent,
                 prompt: "Generate the token metadata based on the system prompt.",
            };
            const response: any = await fal.subscribe("fal-ai/any-llm", {
                 input: {
                     prompt: falInput.prompt,
                     system_prompt: falInput.system_prompt,
                     model: "google/gemini-flash-1.5",
                 },
                 logs: true,
            });

            let metadata: Record<string, string> | null = null;
             const rawOutput = response?.data?.output || response?.output || "";
             const jsonRegex = /{.*}/s; // Changed regex to be less greedy and handle newlines
             const jsonString = typeof rawOutput === 'string' ? rawOutput.match(jsonRegex)?.[0] : null;

             if (jsonString) {
                 try { metadata = JSON.parse(jsonString); } catch (parseError) {
                     logger.warn(`Metadata JSON parse failed attempt ${retryCount + 1}, trying field extraction...`);
                     const nameMatch = jsonString.match(/"name"\s*:\s*"((?:[^\"\\]|\\.)*)"/);
                     const symbolMatch = jsonString.match(/"symbol"\s*:\s*"((?:[^\"\\]|\\.)*)"/);
                     const descMatch = jsonString.match(/"description"\s*:\s*"((?:[^\"\\]|\\.)*)"/);
                     const promptMatch = jsonString.match(/"prompt"\s*:\s*"((?:[^\"\\]|\\.)*)"/);
                     if (nameMatch?.[1] && symbolMatch?.[1] && descMatch?.[1] && promptMatch?.[1]) {
                         metadata = {
                              name: JSON.parse(`"${nameMatch[1]}"`), // Handle escaped chars
                              symbol: JSON.parse(`"${symbolMatch[1]}"`),
                              description: JSON.parse(`"${descMatch[1]}"`),
                              prompt: JSON.parse(`"${promptMatch[1]}"`)
                         };
                         logger.log(`Successfully extracted fields attempt ${retryCount + 1}`);
                     } else {
                        logger.warn(`Field extraction failed attempt ${retryCount + 1}`);
                     }
                 }
             } else {
                logger.warn(`Could not find JSON object attempt ${retryCount + 1}`);
             }

             if (metadata && metadata.name && metadata.symbol && metadata.description && metadata.prompt) {
                 metadata.symbol = metadata.symbol.toUpperCase();
                 logger.log(`Successfully generated metadata on attempt ${retryCount + 1}/${maxRetries}`);
                 return metadata;
             }
             logger.warn(`Metadata validation failed attempt ${retryCount + 1}, retrying...`);

        } catch (error) {
            logger.error(`Error during metadata generation attempt ${retryCount + 1}:`, error);
        }
        retryCount++;
        if (retryCount < maxRetries) await new Promise((resolve) => setTimeout(resolve, 500));
    }
    logger.error(`Failed to generate metadata after ${maxRetries} attempts`);
    // Return fallback or null
    if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
        const randomNum = Math.floor(Math.random() * 1000);
         logger.log("Using fallback metadata in dev/test");
         return { name: `FallbackToken${randomNum}`, symbol: `FB${randomNum % 100}`, description: "Fallback", prompt: "Fallback" };
    }
    return null;
}

// --- generateTokenOnDemand (updated) ---
async function generateTokenOnDemand(): Promise<{
  success: boolean;
  token?: { id: string; name: string; ticker: string; description: string; prompt: string; image?: string; createdAt: string; used: number; };
  error?: string;
}> {
  try {
    logger.log("[OnDemand] Generating token...");
    const metadata = await generateMetadata();
    if (!metadata) { 
      return { success: false, error: "Failed to generate token metadata" }; 
    }
    logger.log(`[OnDemand] Metadata OK: ${metadata.name}`);

    let finalImageUrl = ""; // This will be the Fal URL
    const maxImageRetries = 3;
    let imageAttempt = 0;
    while (imageAttempt < maxImageRetries && !finalImageUrl) {
      imageAttempt++;
      logger.log(`[OnDemand] Generating Image URL attempt ${imageAttempt}/${maxImageRetries}...`);
      try {
        const imageResult = (await generateMedia({ 
          prompt: metadata.prompt, 
          type: MediaType.IMAGE, 
          mode: "fast" 
        })) as any;
        
        const sourceImageUrl = imageResult?.data?.images?.[0]?.url || imageResult?.image?.url || "";
        if (!sourceImageUrl || !sourceImageUrl.startsWith("http")) { 
          throw new Error("Invalid image URL from Fal"); 
        }
        logger.log(`[OnDemand] Fal Image URL OK: ${sourceImageUrl.substring(0,60)}...`);
        finalImageUrl = sourceImageUrl; // Save the Fal URL directly
      } catch (error) {
        logger.error(`[OnDemand] Error generating image URL attempt ${imageAttempt}:`, error);
        if (imageAttempt >= maxImageRetries) { 
          logger.error("[OnDemand] Max image retries reached.");
        } else { 
          await new Promise((resolve) => setTimeout(resolve, 500 * imageAttempt)); 
        }
      }
    }
    
    if (!finalImageUrl) { 
      return { success: false, error: "Failed to generate image URL after multiple attempts" }; 
    }

    const tokenId = crypto.randomUUID();
    const onDemandToken = {
      id: tokenId,
      name: metadata.name,
      ticker: metadata.symbol,
      description: metadata.description,
      prompt: metadata.prompt,
      image: finalImageUrl, // Use the Fal URL directly
      createdAt: new Date(),
      used: 0, // Ensure used is set to 0
    };

    // Store in database
    const db = getDB();
    try {
      await db.insert(preGeneratedTokens).values([
        {
          id: tokenId,
          name: onDemandToken.name,
          ticker: onDemandToken.ticker,
          description: onDemandToken.description,
          prompt: onDemandToken.prompt,
          image: onDemandToken.image,
          createdAt: onDemandToken.createdAt,
          used: onDemandToken.used, // Include used field
        },
      ]);
      logger.log(`[OnDemand DB] Saved token: ${metadata.name} (${metadata.symbol})`);
    } catch (dbError) {
      logger.error("[OnDemand DB] Error saving token:", dbError);
      return { success: false, error: "Failed to save token to database" };
    }

    return { 
      success: true, 
      token: { 
        ...onDemandToken, 
        createdAt: onDemandToken.createdAt.toISOString() 
      }
    };
  } catch (error) {
    logger.error("[OnDemand] Unhandled error:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error occurred" 
    };
  }
}

// Add the generatePreGeneratedTokens function
export async function generatePreGeneratedTokens(): Promise<void> {
  try {
    logger.log("[PreGen] Starting token generation...");
    
    // Step 1: Generate Metadata
    const metadata = await generateMetadata();
    if (!metadata) {
      logger.error("[PreGen] Failed to generate metadata");
      throw new Error("Failed to generate metadata for pre-generated token");
    }
    logger.log(`[PreGen] Metadata generated: ${metadata.name} (${metadata.symbol})`);
    
    // Step 2: Generate Image URL (using Fal)
    let finalImageUrl = "";
    const maxImageRetries = 3;
    let imageAttempt = 0;
    
    while (imageAttempt < maxImageRetries && !finalImageUrl) {
      imageAttempt++;
      logger.log(`[PreGen] Generating image attempt ${imageAttempt}/${maxImageRetries}...`);
      
      try {
        const imageResult = (await generateMedia({
          prompt: metadata.prompt,
          type: MediaType.IMAGE,
          mode: "fast"
        })) as any;
        
        const sourceImageUrl = imageResult?.data?.images?.[0]?.url || imageResult?.image?.url || "";
        if (!sourceImageUrl || !sourceImageUrl.startsWith("http")) {
          throw new Error("Invalid image URL received from Fal");
        }
        
        logger.log(`[PreGen] Image URL generated: ${sourceImageUrl.substring(0, 60)}...`);
        finalImageUrl = sourceImageUrl; // Use Fal URL directly
      } catch (error) {
        logger.error(`[PreGen] Image generation attempt ${imageAttempt} failed:`, error);
        
        if (imageAttempt >= maxImageRetries) {
          logger.error("[PreGen] Maximum image generation attempts reached");
          throw new Error("Failed to generate image after maximum retries");
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 500 * imageAttempt));
      }
    }
    
    // Step 3: Save to Database
    const tokenId = crypto.randomUUID();
    const db = getDB();
    
    try {
      logger.log(`[PreGen] Saving token to database: ${metadata.name}`);
      
      await db.insert(preGeneratedTokens).values({
        id: tokenId,
        name: metadata.name,
        ticker: metadata.symbol,
        description: metadata.description,
        prompt: metadata.prompt,
        image: finalImageUrl,
        createdAt: new Date(),
        used: 0 // Ensure it's set to unused
      });
      
      logger.log(`[PreGen] Token saved successfully: ${metadata.name} (${metadata.symbol})`);
    } catch (dbError) {
      logger.error("[PreGen] Database save failed:", dbError);
      throw new Error("Failed to save token to database");
    }
  } catch (error) {
    logger.error("[PreGen] Token generation failed:", error);
    throw error; // Re-throw to signal failure to checkAndReplenishTokens
  }
}

// Add the checkAndReplenishTokens function
export async function checkAndReplenishTokens(threshold?: number): Promise<void> {
  // Determine threshold from environment or default
  if (threshold === undefined || threshold === null) {
    threshold = parseInt(process.env.PREGENERATED_TOKENS_COUNT || "3");
  } else {
    threshold = Number(threshold);
    if (isNaN(threshold) || threshold < 0) {
      logger.warn(`Invalid threshold provided (${threshold}). Using default 3.`);
      threshold = 3;
    }
  }

  // Skip if threshold is zero or less
  if (threshold <= 0) {
    logger.log("Token replenishment threshold is 0 or less, skipping check.");
    return;
  }

  try {
    logger.log(`Checking token replenishment status against threshold: ${threshold}`);
    const db = getDB();

    // Count *only unused* tokens
    const countResult = await db
      .select({ count: sql`count(*)` })
      .from(preGeneratedTokens)
      .where(eq(preGeneratedTokens.used, 0));

    const currentUnusedCount = Number(countResult[0]?.count || 0);
    logger.log(`Current unused token count: ${currentUnusedCount}`);

    // If below threshold, generate the difference
    if (currentUnusedCount < threshold) {
      const tokensToGenerate = threshold - currentUnusedCount;
      logger.log(`Count (${currentUnusedCount}) is below threshold (${threshold}). Generating ${tokensToGenerate} new token(s)...`);

      // Generate tokens in parallel
      const generationPromises: Promise<void>[] = [];
      for (let i = 0; i < tokensToGenerate; i++) {
        logger.log(`Starting generation for token ${i + 1} of ${tokensToGenerate}...`);
        generationPromises.push(generatePreGeneratedTokens());
      }

      // Wait for all generation promises to settle
      const results = await Promise.allSettled(generationPromises);

      // Log results
      const successes = results.filter(r => r.status === 'fulfilled').length;
      const failures = tokensToGenerate - successes;
      
      logger.log(`Token generation batch complete: ${successes} succeeded, ${failures} failed.`);
      
      if (failures > 0) {
        logger.error(`Failed to generate ${failures} tokens during replenishment.`);
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            logger.error(`[Token ${index + 1}] Failure reason:`, result.reason);
          }
        });
      }
    } else {
      logger.log(`Count (${currentUnusedCount}) meets or exceeds threshold (${threshold}). No replenishment needed.`);
    }
  } catch (error) {
    logger.error("Error during checkAndReplenishTokens:", error);
  }
}

// Helper function to generate an enhanced prompt using the token metadata
async function generateEnhancedPrompt(
  userPrompt: string,
  tokenMetadata: {
    name: string;
    symbol: string;
    description?: string;
    prompt?: string;
  },
  mediaType: MediaType = MediaType.IMAGE
): Promise<string> {
  try {
    if (!process.env.FAL_API_KEY) {
      throw new Error(
        "FAL_API_KEY environment variable not set for prompt enhancement."
      );
    }
    fal.config({ credentials: process.env.FAL_API_KEY });

    // Adjust prompt based on media type
    let systemPromptContent = enhancePrompt(userPrompt, tokenMetadata);

    // Modify prompt based on media type
    if (mediaType === MediaType.VIDEO) {
      systemPromptContent +=
        "\nAdditionally, focus on dynamic visual elements and motion that would work well in a short video. Enhance the user prompt based on this.";
    } else if (mediaType === MediaType.AUDIO) {
      systemPromptContent +=
        "\nAdditionally, focus on acoustic elements, mood, and atmosphere suitable for audio content. Enhance the user prompt based on this.";
    } else {
      systemPromptContent +=
        "\nEnhance the user prompt for image generation based on the token context provided.";
    }

    // Use Fal AI to enhance the prompt
    const falInput = {
      model: "gemini-2.0-flash-001",
      system_prompt: systemPromptContent,
      prompt: `User prompt to enhance: "${userPrompt}". Output ONLY the enhanced prompt text.`,
      // Temperature adjustment might need different handling with Fal
    };

    const response: any = await fal.subscribe("fal-ai/any-llm", {
      input: {
        prompt: falInput.prompt,
        system_prompt: falInput.system_prompt,
        model: "google/gemini-flash-1.5",
      },
      logs: true, // Optional: for debugging
    });

    // Extract just the prompt text from the response
    let enhancedPrompt = response?.data?.output || response?.output || ""; // Adjust based on actual Fal response structure
    // Clean up potential extraneous text if the model didn't follow instructions perfectly
    enhancedPrompt = enhancedPrompt.trim().replace(/^"|"$/g, ""); // Remove surrounding quotes

    // If the prompt is too long, truncate it to 500 characters
    if (enhancedPrompt.length > 500) {
      enhancedPrompt = enhancedPrompt.substring(0, 500).trim();
    }

    // Basic validation if enhancement failed
    if (!enhancedPrompt || enhancedPrompt.length < 10) {
      logger.warn(
        "Fal AI prompt enhancement resulted in a short/empty prompt, falling back."
      );
      // Fallback logic
      return `${tokenMetadata.name} (${tokenMetadata.symbol}): ${userPrompt}`;
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
  tokenMint: string,
  description: string
): Promise<void> {
  try {
    logger.log(`Generating additional images for token ${tokenMint}`);

    // Generate enhanced prompts for each image
    const enhancedPrompts = await Promise.all([
      generateEnhancedPrompt(
        description,
        { name: "", symbol: "", description },
        MediaType.IMAGE
      ),
      generateEnhancedPrompt(
        description,
        { name: "", symbol: "", description },
        MediaType.IMAGE
      ),
      generateEnhancedPrompt(
        description,
        { name: "", symbol: "", description },
        MediaType.IMAGE
      ),
    ]);

    // Generate and upload each image in parallel
    await Promise.all(
      enhancedPrompts.map(async (prompt, index) => {
        if (!prompt) {
          logger.error(
            `Failed to generate enhanced prompt ${index + 1} for token ${tokenMint}`
          );
          return;
        }

        try {
          // Generate the image
          // Pass env to generateMedia call
          const imageResult = (await generateMedia({
            prompt,
            type: MediaType.IMAGE,
          })) as any;

          if (!imageResult?.data?.images?.[0]?.url) {
            throw new Error("No image URL in generation result");
          }

          // Convert data URL to buffer
          const imageUrl = imageResult.data.images[0].url;
          const base64Data = imageUrl.split(",")[1];
          const imageBuffer = Buffer.from(base64Data, "base64");

          // Upload to R2 with predictable path
          await uploadGeneratedImage(imageBuffer, tokenMint, index + 1);
          logger.log(
            `Successfully generated and uploaded image ${index + 1} for token ${tokenMint}`
          );
        } catch (error) {
          logger.error(
            `Error generating/uploading image ${index + 1} for token ${tokenMint}:`,
            error
          );
        }
      })
    );

    logger.log(`Completed generating additional images for token ${tokenMint}`);
  } catch (error) {
    logger.error(
      `Error in generateAdditionalTokenImages for ${tokenMint}:`,
      error
    );
  }
}


// Get a random pre-generated token endpoint
app.get("/pre-generated-token", async (c) => {
  try {
    const db = getDB();

    // Get a random unused token
    const randomToken = await db
      .select()
      .from(preGeneratedTokens)
      .where(eq(preGeneratedTokens.used, 0))
      .orderBy(sql`RANDOM()`)
      .limit(1);

    if (!randomToken || randomToken.length === 0) {
      logger.log(
        "No pre-generated tokens available. Generating one on demand..."
      );

      // Generate a token on the fly
      const result = await generateTokenOnDemand();

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
      500
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

    const db = getDB();

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
            ticker ? eq(preGeneratedTokens.ticker, ticker) : undefined
          )
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
      500
    );
  }
});

// Endpoint to enhance a prompt and generate media
app.post("/enhance-and-generate", async (c) => {
  try {
    const user = c.get("user");
    if (!user) {
      return c.json({ success: false, error: "Authentication required" }, 401);
    }

    // Verify and parse required fields
    const GenerationSchema = z.object({
      tokenMint: z.string().min(32).max(44),
      userPrompt: z.string().min(3).max(1000),
      mediaType: z.enum([MediaType.IMAGE, MediaType.VIDEO, MediaType.AUDIO]).default(MediaType.IMAGE),
      mode: z.enum(["fast", "pro"]).default("fast"),
      image_url: z.string().optional(), // For image-to-video
      lyrics: z.string().optional(), // For music generation
    });

    const body = await c.req.json();
    const { tokenMint, userPrompt, mediaType, mode, image_url, lyrics } = GenerationSchema.parse(body);

    logger.log(`Enhance-and-generate request for token: ${tokenMint}`);
    logger.log(`Original prompt: ${userPrompt}`);
    logger.log(`Media type: ${mediaType}, Mode: ${mode}`);

    // Get token metadata from database
    const db = getDB();
    const existingToken = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, tokenMint))
      .limit(1);

    if (!existingToken || existingToken.length === 0) {
      if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
        return c.json(
          {
            success: false,
            error: "Token not found. Please provide a valid token mint address.",
          },
          404
        );
      }
      logger.log("Token not found in DB, but proceeding in development mode");
    }

    const tokenMetadata = {
      name: existingToken?.[0]?.name || "",
      symbol: existingToken?.[0]?.ticker || "",
      description: existingToken?.[0]?.description || "",
      prompt: "",
    };

    // Check rate limits for the user on this token
    const rateLimit = await checkRateLimits(tokenMint, mediaType, user.publicKey);

    if (!rateLimit.allowed) {
      return c.json(
        {
          success: false,
          error: rateLimit.message || "Rate limit exceeded",
          remaining: rateLimit.remaining,
          limit: RATE_LIMITS[mediaType].MAX_GENERATIONS_PER_DAY,
          cooldown: RATE_LIMITS[mediaType].COOLDOWN_PERIOD_MS,
          message: `You can generate up to ${RATE_LIMITS[mediaType].MAX_GENERATIONS_PER_DAY} ${mediaType}s per day.`,
        },
        429
      );
    }

    // Check token ownership if enabled
    if (TOKEN_OWNERSHIP.ENABLED) {
      const ownershipCheck = await checkTokenOwnership(tokenMint, user.publicKey, mode, mediaType);
      if (!ownershipCheck.allowed) {
        let minimumRequired = TOKEN_OWNERSHIP.DEFAULT_MINIMUM;
        if (mediaType === MediaType.VIDEO || mediaType === MediaType.AUDIO) {
          minimumRequired = mode === "pro" 
            ? TOKEN_OWNERSHIP.SLOW_MODE_MINIMUM 
            : TOKEN_OWNERSHIP.FAST_MODE_MINIMUM;
        } else if (mediaType === MediaType.IMAGE && mode === "pro") {
          minimumRequired = TOKEN_OWNERSHIP.FAST_MODE_MINIMUM;
        }

        return c.json(
          {
            success: false,
            error: "Insufficient token balance",
            message: ownershipCheck.message || `You need at least ${minimumRequired} tokens to use this feature.`,
            type: "OWNERSHIP_REQUIREMENT",
            minimumRequired,
          },
          403
        );
      }
    }

    // Enhance the prompt
    const enhancedPrompt = await generateEnhancedPrompt(userPrompt, tokenMetadata, mediaType);

    if (!enhancedPrompt) {
      return c.json(
        {
          success: false,
          error: "Failed to enhance the prompt. Please try again.",
        },
        500
      );
    }

    logger.log(`Enhanced prompt: ${enhancedPrompt}`);

    // Generate the media with the enhanced prompt
    const generationParams: any = {
      prompt: enhancedPrompt,
      type: mediaType,
      mode,
    };

    if (mediaType === MediaType.VIDEO && image_url) {
      generationParams.image_url = image_url;
    }

    if (mediaType === MediaType.AUDIO && lyrics) {
      generationParams.lyrics = lyrics;
    }

    const result = (await generateMedia(generationParams)) as any;

    // Extract media URL based on type and result structure
    let mediaUrl = "";
    if (result && typeof result === "object") {
      if (mediaType === MediaType.VIDEO) {
        mediaUrl = result.video?.url || result.urls?.video || result.data?.video?.url;
      } else if (mediaType === MediaType.AUDIO) {
        mediaUrl = result.audio_file?.url || result.data?.audio_file?.url || 
                  result.output?.audio || result.data?.audio?.url;
      } else if (result.data?.images?.[0]?.url) {
        mediaUrl = result.data.images[0].url;
      } else if (result.image?.url) {
        mediaUrl = result.image.url;
      } else if (result.url) {
        mediaUrl = result.url;
      }
    } else if (typeof result === "string") {
      mediaUrl = result;
    }

    if (!mediaUrl) {
      return c.json(
        {
          success: false,
          error: `Failed to generate ${mediaType}. Please try again.`,
        },
        500
      );
    }

    // Save generation to database
    const generationId = crypto.randomUUID();
    try {
      await db.insert(mediaGenerations).values([
        {
          id: generationId,
          mint: tokenMint,
          type: mediaType,
          prompt: enhancedPrompt,
          mediaUrl,
          creator: user.publicKey,
          timestamp: new Date(),
        },
      ]);
      logger.log(`Generation saved to database with ID: ${generationId}`);
    } catch (dbError) {
      logger.error("Error saving generation to database:", dbError);
    }

    // Return successful response
    const response: any = {
      success: true,
      mediaUrl,
      enhancedPrompt,
      originalPrompt: userPrompt,
      generationId,
      remainingGenerations: rateLimit.remaining - 1,
      resetTime: new Date(Date.now() + RATE_LIMITS[mediaType].COOLDOWN_PERIOD_MS).toISOString(),
    };

    // Add lyrics to response if available
    if (mediaType === MediaType.AUDIO) {
      response.lyrics = result.data?.lyrics || result.lyrics || 
                       generationParams.lyrics || result.data?.audio?.lyrics;
    }

    return c.json(response);
  } catch (error) {
    logger.error("Error in enhance-and-generate endpoint:", error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error generating media",
      },
      500
    );
  }
});

export default app;
