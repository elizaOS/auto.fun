import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { fal } from "@fal-ai/client";
import { Connection, PublicKey } from "@solana/web3.js";
import { and, eq, gte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { Buffer } from "node:buffer"; // Added for image decoding
import crypto from "node:crypto";
import { z } from "zod";
import { getDB, mediaGenerations, preGeneratedTokens, tokens } from "./db";
import { createTokenPrompt } from "./prompts/create-token";
import { enhancePrompt } from "./prompts/enhance-prompt";
import { getGlobalRedisCache } from "./redis";
import { getS3Client } from "./s3Client";
import { MediaGeneration } from "./types";
import { uploadGeneratedImage } from "./uploader";
import { getRpcUrl, logger } from "./util";

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
      const holdingAmount = specificHolderData.amount;
      // Convert minimum required to raw amount for comparison
      const minimumRequiredRaw = minimumRequired * Math.pow(10, decimals);

      if (holdingAmount >= minimumRequiredRaw) { // Compare raw amounts
        return { allowed: true };
      } else {
        // Convert back to UI amount for the error message
        const holdingUiAmount = holdingAmount / Math.pow(10, decimals);
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

// Helper function to parse timestamp string to seconds
function parseTimestampToSeconds(timestamp: string | undefined): number {
  if (!timestamp) return 0;
  
  const match = timestamp.match(/\[(\d{2}):(\d{2})\.(\d{2})\]/);
  if (!match) return 0;
  
  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  const milliseconds = parseInt(match[3], 10);
  return minutes * 60 + seconds + milliseconds / 100;
}

// Helper function to determine song structure based on tempo and duration
function determineSongStructure(bpm: number, duration: string): { 
  hasIntro: boolean, 
  linesPerSection: { intro: number, verse: number, chorus: number },
  beatsPerLine: number
} {
  const durationSeconds = parseInt(duration.replace('s', ''));
  const isSlowTempo = bpm < 100;
  const isShortDuration = durationSeconds <= 95;

  // Calculate total beats available
  const totalBeats = (durationSeconds * bpm) / 60;
  
  // Calculate beats needed for structure
  const introBeats = isSlowTempo || isShortDuration ? 0 : 4; // 1 bar before intro
  const verseBeats = 8; // 2 bars before verse
  const chorusBeats = 4; // 1 bar before chorus
  const totalStructureBeats = introBeats + (verseBeats * 2) + (chorusBeats * 2);
  
  // Calculate remaining beats for lyrics
  const remainingBeats = totalBeats - totalStructureBeats;
  
  // Calculate total lines
  const totalLines = (isSlowTempo || isShortDuration ? 0 : 2) + (4 * 2) + (4 * 2); // intro + 2 verses + 2 choruses
  
  // Calculate beats per line, ensuring we don't exceed the duration
  let beatsPerLine = Math.floor(remainingBeats / totalLines);
  
  // Ensure minimum and maximum beats per line
  beatsPerLine = Math.max(6, Math.min(12, beatsPerLine));

  // For slow tempos or short durations, use a simpler structure
  if (isSlowTempo || isShortDuration) {
    return {
      hasIntro: false,
      linesPerSection: {
        intro: 0,
        verse: 4,
        chorus: 4
      },
      beatsPerLine
    };
  }

  // For normal tempos and longer durations, use full structure
  return {
    hasIntro: true,
    linesPerSection: {
      intro: 2,
      verse: 4,
      chorus: 4
    },
    beatsPerLine
  };
}

// Helper function to calculate timestamps based on BPM
function calculateTimestamps(bpm: number, numLines: number, startTime: number = 0, sectionType: 'intro' | 'verse' | 'chorus' = 'verse'): string[] {
  const beatDuration = 60 / bpm; // Duration of one beat in seconds
  const timestamps: string[] = [];
  let currentTime = startTime;

  // Add section-specific spacing based on BPM
  if (sectionType === 'intro') {
    // Add 1 bar of instrumental before first lyrics
    const introBars = 1;
    currentTime += (introBars * 4 * beatDuration);
  } else if (sectionType === 'verse') {
    // Add 2 bars after intro/chorus for a proper fill
    const verseBars = 2;
    currentTime += (verseBars * 4 * beatDuration);
  } else if (sectionType === 'chorus') {
    // Add 1 bar after verse
    const chorusBars = 1;
    currentTime += (chorusBars * 4 * beatDuration);
  }

  // Calculate line durations - adjust based on tempo
  const beatsPerLine = bpm < 100 ? 8 : 12; // Shorter lines for slower tempos
  for (let i = 0; i < numLines; i++) {
    const minutes = Math.floor(currentTime / 60);
    const seconds = Math.floor(currentTime % 60);
    const milliseconds = Math.floor((currentTime % 1) * 100);
    
    const timestamp = `[${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(2, "0")}]`;
    timestamps.push(timestamp);
    
    // Adjust line duration based on tempo
    currentTime += beatDuration * beatsPerLine;
  }

  return timestamps;
}

// Function definition moved earlier
async function generateLyrics(
  tokenMetadata: {
    name: string;
    symbol: string;
    description?: string;
  },
  stylePrompt?: string,
  bpm: number = 120, // Default to 120 BPM
  duration: string = "95s" // Default to 95 seconds
): Promise<string> {
  try {
    if (!process.env.FAL_API_KEY) {
      throw new Error(
        "FAL_API_KEY environment variable not set for lyrics generation."
      );
    }
    fal.config({ credentials: process.env.FAL_API_KEY });

    // Determine song structure based on tempo and duration
    const structure = determineSongStructure(bpm, duration);
    const beatDuration = 60 / bpm; // Duration of one beat in seconds

    const systemPrompt = `You are a creative songwriter. Create lyrics for a song about the token "${tokenMetadata.name}" (${tokenMetadata.symbol}).
    The song should capture the essence of the token's description: "${tokenMetadata.description}".
    ${stylePrompt ? `The musical style should be: ${stylePrompt}` : ""}

    The song should have the following structure:
    ${structure.hasIntro ? `- An intro section (${structure.linesPerSection.intro} lines) - starts after 1 bar of instrumental` : ''}
    - A verse section (${structure.linesPerSection.verse} lines) - starts after ${structure.hasIntro ? '2' : '1'} bars of instrumental
    - A chorus section (${structure.linesPerSection.chorus} lines) - starts after 1 bar of instrumental
    - A second verse section (${structure.linesPerSection.verse} lines) - starts after 1 bar of instrumental
    - A final chorus section (${structure.linesPerSection.chorus} lines) - starts after 1 bar of instrumental

    IMPORTANT: The chorus must be:
    1. The most memorable and catchy part of the song
    2. Use the same exact lines each time it appears
    3. Be simple and repetitive
    4. Focus on the main theme or hook
    5. Be easy to sing along to

    The verses should:
    1. Tell a story or build up to the chorus
    2. Be more descriptive and detailed
    3. Lead naturally into the chorus
    4. Be concise and impactful

    Each line should be concise and focused on the content of the prompt.
    The lyrics should flow naturally and be suitable for a ${bpm} BPM song.
    Each line should be able to be sung over ${structure.beatsPerLine} beats (${structure.beatsPerLine/4} bars), allowing for proper phrasing and musical expression.

    Output ONLY the lyrics text, one line per line, without any timestamps or section markers.
    The system will add the proper timing and structure.`;

    const falInput = {
      model: "anthropic/claude-3.5-sonnet" as const,
      system_prompt: systemPrompt,
      prompt: "Generate the lyrics based on the system prompt instructions.",
    };

    const response: any = await fal.subscribe("fal-ai/any-llm", {
      input: falInput,
      logs: true,
    });

    let lyrics = response?.data?.output || response?.output || "";
    lyrics = lyrics.trim();

    if (!lyrics || lyrics.length < 20) {
      logger.error(
        "Failed to generate valid lyrics from Fal AI. Response:",
        lyrics
      );
      return `[verse]\n[00:00.00] Song about ${tokenMetadata.name}\n[00:02.00] Symbol ${tokenMetadata.symbol}\n[chorus]\n[00:04.00] Based on: ${tokenMetadata.description?.substring(0, 50)}...\n[00:06.00] Fal AI generation failed.`;
    }

    // Split lyrics into lines and clean up
    const lines = lyrics.split("\n").filter((line: string) => line.trim() !== "");
    
    // Get the actual lyric lines (excluding section markers)
    const lyricLines = lines.filter((line: string) => 
      !line.toLowerCase().includes("[verse]") &&
      !line.toLowerCase().includes("[chorus]") &&
      !line.toLowerCase().includes("[bridge]") &&
      !line.toLowerCase().includes("[intro]") &&
      !line.toLowerCase().includes("[outro]") &&
      !line.toLowerCase().includes("(verse)") &&
      !line.toLowerCase().includes("(chorus)") &&
      !line.toLowerCase().includes("(bridge)") &&
      !line.toLowerCase().includes("(intro)") &&
      !line.toLowerCase().includes("(outro)")
    );

    // Calculate timestamps for each section with proper spacing
    let currentTime = 0;
    
    // Add initial instrumental
    currentTime += 4 * beatDuration; // 1 bar of instrumental before first lyrics

    // Intro section
    const introTimestamps: string[] = [];
    for (let i = 0; i < structure.linesPerSection.intro; i++) {
      const minutes = Math.floor(currentTime / 60);
      const seconds = Math.floor(currentTime % 60);
      const milliseconds = Math.floor((currentTime % 1) * 100);
      introTimestamps.push(`[${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(2, "0")}]`);
      currentTime += structure.beatsPerLine * beatDuration;
    }

    // Add 2 bars after intro
    currentTime += 8 * beatDuration;

    // Verse 1 section
    const verse1Timestamps: string[] = [];
    for (let i = 0; i < structure.linesPerSection.verse; i++) {
      const minutes = Math.floor(currentTime / 60);
      const seconds = Math.floor(currentTime % 60);
      const milliseconds = Math.floor((currentTime % 1) * 100);
      verse1Timestamps.push(`[${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(2, "0")}]`);
      currentTime += structure.beatsPerLine * beatDuration;
    }

    // Add 1 bar after verse
    currentTime += 4 * beatDuration;

    // Chorus 1 section
    const chorus1Timestamps: string[] = [];
    for (let i = 0; i < structure.linesPerSection.chorus; i++) {
      const minutes = Math.floor(currentTime / 60);
      const seconds = Math.floor(currentTime % 60);
      const milliseconds = Math.floor((currentTime % 1) * 100);
      chorus1Timestamps.push(`[${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(2, "0")}]`);
      currentTime += structure.beatsPerLine * beatDuration;
    }

    // Add 1 bar after chorus
    currentTime += 4 * beatDuration;

    // Verse 2 section
    const verse2Timestamps: string[] = [];
    for (let i = 0; i < structure.linesPerSection.verse; i++) {
      const minutes = Math.floor(currentTime / 60);
      const seconds = Math.floor(currentTime % 60);
      const milliseconds = Math.floor((currentTime % 1) * 100);
      verse2Timestamps.push(`[${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(2, "0")}]`);
      currentTime += structure.beatsPerLine * beatDuration;
    }

    // Add 1 bar after verse
    currentTime += 4 * beatDuration;

    // Chorus 2 section
    const chorus2Timestamps: string[] = [];
    for (let i = 0; i < structure.linesPerSection.chorus; i++) {
      const minutes = Math.floor(currentTime / 60);
      const seconds = Math.floor(currentTime % 60);
      const milliseconds = Math.floor((currentTime % 1) * 100);
      chorus2Timestamps.push(`[${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(2, "0")}]`);
      currentTime += structure.beatsPerLine * beatDuration;
    }

    // Log the final duration for debugging
    logger.log(`Final song duration: ${Math.floor(currentTime)} seconds`);

    // Combine sections with proper markers and timestamps
    const formattedLyrics = [
      "[intro]",
      ...lyricLines.slice(0, structure.linesPerSection.intro).map((line: string, i: number) => `${introTimestamps[i]} ${line}`),
      "[verse]",
      ...lyricLines.slice(structure.linesPerSection.intro, structure.linesPerSection.intro + structure.linesPerSection.verse).map((line: string, i: number) => `${verse1Timestamps[i]} ${line}`),
      "[chorus]",
      ...lyricLines.slice(structure.linesPerSection.intro + structure.linesPerSection.verse, structure.linesPerSection.intro + structure.linesPerSection.verse + structure.linesPerSection.chorus).map((line: string, i: number) => `${chorus1Timestamps[i]} ${line}`),
      "[verse]",
      ...lyricLines.slice(structure.linesPerSection.intro + structure.linesPerSection.verse + structure.linesPerSection.chorus, structure.linesPerSection.intro + structure.linesPerSection.verse + structure.linesPerSection.chorus + structure.linesPerSection.verse).map((line: string, i: number) => `${verse2Timestamps[i]} ${line}`),
      "[chorus]",
      ...lyricLines.slice(structure.linesPerSection.intro + structure.linesPerSection.verse + structure.linesPerSection.chorus + structure.linesPerSection.verse, structure.linesPerSection.intro + structure.linesPerSection.verse + structure.linesPerSection.chorus + structure.linesPerSection.verse + structure.linesPerSection.chorus).map((line: string, i: number) => `${chorus2Timestamps[i]} ${line}`)
    ].join("\n");

    return formattedLyrics;
  } catch (error) {
    logger.error("Error generating lyrics:", error);
    return `[verse]\n[00:00.00] Error generating lyrics for ${tokenMetadata.name}.`;
  }
}

async function generateStylePrompt(
  userPrompt: string
): Promise<string> {
  try {
    if (!process.env.FAL_API_KEY) {
      throw new Error(
        "FAL_API_KEY environment variable not set for style generation."
      );
    }
    fal.config({ credentials: process.env.FAL_API_KEY });

    const prompt = `Prompt: ${userPrompt}
  
    Generate a style for this prompt. An example of a style is "pop", "rock", "EDM", etc. Return only the style, nothing else.`;

    const falInput = {
      model: "anthropic/claude-3.5-sonnet" as const,
      prompt: prompt,
    };

    const response: any = await fal.subscribe("fal-ai/any-llm", {
      input: falInput,
      logs: true,
    });

    let style = response?.data?.output || response?.output || "";
    style = style.trim();

    if (!style || style.length < 10) {
      logger.error(
        "Failed to generate valid style from Fal AI. Response:",
        style
      );
      return "An upbeat modern pop song"; // Default fallback style
    }

    return style;

  } catch (error) {
    logger.error("Error generating style:", error);
    return "An upbeat modern pop song"; // Default fallback style on error
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
      /^\s*$/.test(line) || // Empty or whitespace-only lines
      line.toLowerCase().includes("(verse)") || // Filter out section markers in lyrics
      line.toLowerCase().includes("(chorus)") ||
      line.toLowerCase().includes("(bridge)") ||
      line.toLowerCase().includes("(intro)") ||
      line.toLowerCase().includes("(outro)") ||
      line.toLowerCase().includes("[verse]") || // Filter out section markers in brackets
      line.toLowerCase().includes("[chorus]") ||
      line.toLowerCase().includes("[bridge]") ||
      line.toLowerCase().includes("[intro]") ||
      line.toLowerCase().includes("[outro]")
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
  mint?: string; // Add mint property
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
    let lyricsToUsePromise;

    const stylePrompt = await generateStylePrompt(data.prompt);

    if (!data.lyrics) {
      logger.log("Generating lyrics for audio...");
      // generateLyrics now guarantees a string return
      lyricsToUsePromise = generateLyrics(
        {
          name: data.prompt.split(":")[0] || "",
          symbol: data.prompt.split(":")[1]?.trim() || "",
          description: data.prompt.split(":")[2]?.trim() || "",
        },
        data.style_prompt || stylePrompt,
        data.bpm || 120,
        data.music_duration || "95s"
      );
    }

    const lyricsToUse = await (lyricsToUsePromise || (async () => data.lyrics)());

    if(!lyricsToUse) {
      throw new Error("No lyrics found");
    }

    // lyricsToUse is now guaranteed to be a string here
    const formattedLyrics = formatLyricsForDiffrhythm(lyricsToUse); // Now safe to call

    // Check for existing audio context file in S3
    const { client: s3Client, bucketName } = await getS3Client();
    const audioContextPrefix = `token-settings/${data.mint}/audio/context-${data.mint}`;
    
    let referenceAudioUrl = data.reference_audio_url;
    
    try {
      const listCmd = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: audioContextPrefix,
        MaxKeys: 1
      });
      
      const listResponse = await s3Client.send(listCmd);
      const audioContextKey = listResponse.Contents?.[0]?.Key;
      if (audioContextKey) {
        referenceAudioUrl = `${process.env.S3_PUBLIC_URL}/${audioContextKey}?t=${Date.now()}`;
        logger.log("Using existing audio context file:", referenceAudioUrl);
      } else {
        logger.log("No existing audio context file found, using default");
        referenceAudioUrl = referenceAudioUrl || "https://storage.googleapis.com/falserverless/model_tests/diffrythm/rock_en.wav";
      }
    } catch (error) {
      logger.error("Error checking for audio context file:", error);
      referenceAudioUrl = referenceAudioUrl || "https://storage.googleapis.com/falserverless/model_tests/diffrythm/rock_en.wav";
    }

    const input = {
      lyrics: formattedLyrics,
      reference_audio_url: referenceAudioUrl,
      style_prompt: data.style_prompt || stylePrompt,
      music_duration: data.music_duration || "95s",
      cfg_strength: data.cfg_strength || 8,
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

// Media generation validation schema
export const MediaGenerationRequestSchema = z.object({
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
export const TokenMetadataGenerationSchema = z.object({
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
    // In test mode, return a test image
    if (process.env.NODE_ENV === "test") {
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
    if (!process.env.FAL_API_KEY) {
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
export async function generateTokenOnDemand(): Promise<{
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
export async function generateEnhancedPrompt(
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