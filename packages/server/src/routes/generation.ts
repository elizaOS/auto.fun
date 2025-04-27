import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { fal } from "@fal-ai/client";
import { and, eq, gte, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import crypto from "node:crypto";
import { z } from "zod";
import { getDB, mediaGenerations, preGeneratedTokens, tokens } from "../db";
import { checkRateLimits, checkTokenOwnership, generateEnhancedPrompt, generateMedia, generateTokenOnDemand, MediaGenerationRequestSchema, MediaType, RATE_LIMITS, TOKEN_OWNERSHIP } from "../generation";
import { createTokenPrompt } from "../prompts/create-token";
import { getS3Client } from "../s3Client";
import { logger } from "../util";

// Create a Hono app for media generation routes
const app = new Hono<{
  Variables: {
    user?: { publicKey: string } | null;
  };
}>();

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
    const db = getDB();
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
      if (
        process.env.NODE_ENV !== "development" &&
        process.env.NODE_ENV !== "test"
      ) {
        return c.json(
          {
            success: false,
            error:
              "Token not found. Please provide a valid token mint address.",
          },
          404
        );
      }
      console.log("Token not found in DB, but proceeding in development mode");
    }

    // Check rate limits for the user on this token
    const rateLimit = await checkRateLimits(
      tokenMint,
      mediaType,
      user.publicKey
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
          403
        );
      }
      // Otherwise it's a standard rate limit error
      return c.json(
        {
          success: false,
          error: "Rate limit exceeded. Please try again later.",
          limit: RATE_LIMITS[mediaType].MAX_GENERATIONS_PER_DAY,
          cooldown: RATE_LIMITS[mediaType].COOLDOWN_PERIOD_MS,
          message: `You can generate up to ${RATE_LIMITS[mediaType].MAX_GENERATIONS_PER_DAY
            } ${mediaType}s per day.`,
          remaining: rateLimit.remaining,
        },
        429
      );
    }

    // Check specific token requirements for the selected mode
    const ownershipCheck = await checkTokenOwnership(
      tokenMint,
      user.publicKey,
      mode,
      mediaType
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
        403
      );
    }

    // Use AI to enhance the prompt
    console.log(`Enhancing prompt with token metadata for ${mediaType}`);
    // Pass env to generateEnhancedPrompt
    const enhancedPrompt = await generateEnhancedPrompt(
      userPrompt,
      tokenMetadata,
      mediaType
    );

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
    console.log(`Generating ${mediaType} with enhanced prompt in ${mode} mode`);

    // Prepare generation parameters
    const generationParams: any = {
      prompt: enhancedPrompt,
      type: mediaType,
      mode,
      mint: tokenMint // Add mint parameter
    };

    // Add optional parameters based on media type
    if (mediaType === MediaType.VIDEO && image_url) {
      generationParams.image_url = image_url;
    }

    if (mediaType === MediaType.AUDIO && lyrics) {
      generationParams.lyrics = lyrics;
    }

    const result = (await generateMedia(generationParams)) as any;

    console.log(
      "Media generation result:",
      JSON.stringify(result).substring(0, 200) + "..."
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
        Date.now() + RATE_LIMITS[mediaType].COOLDOWN_PERIOD_MS
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
      500
    );
  }
});

// Get generation settings for a token
app.get("/:mint/settings", async (c) => {
  try {
    const mint = c.req.param("mint");

    if (!mint || mint.length < 32 || mint.length > 44) {
      return c.json({ error: "Invalid mint address" }, 400);
    }

    const db = getDB();

    // Get token metadata from database
    const token = await db
      .select()
      .from(tokens)
      .where(eq(tokens.mint, mint))
      .limit(1);

    if (!token || token.length === 0) {
      return c.json({ error: "Token not found" }, 404);
    }

    // Check for audio context file in S3
    const { client: s3Client, bucketName } = await getS3Client();
    const audioContextPrefix = `token-settings/${mint}/audio/context-${mint}`;
    
    try {
      const listCmd = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: audioContextPrefix,
        MaxKeys: 1
      });
      
      const listResponse = await s3Client.send(listCmd);
      const audioContextKey = listResponse.Contents?.[0]?.Key;
      const audioContextUrl = audioContextKey ? `${process.env.S3_PUBLIC_URL}/${audioContextKey}` : null;

      return c.json({
        success: true,
        settings: {
          audioContextUrl,
          tokenName: token[0].name,
          tokenSymbol: token[0].ticker,
          tokenDescription: token[0].description,
        },
      });
    } catch (error) {
      logger.error("Error checking for audio context file:", error);
      return c.json({
        success: true,
        settings: {
          audioContextUrl: null,
          tokenName: token[0].name,
          tokenSymbol: token[0].ticker,
          tokenDescription: token[0].description,
        },
      });
    }
  } catch (error) {
    logger.error("Error fetching generation settings:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500
    );
  }
});

export default app;
