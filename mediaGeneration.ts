import { Router } from "express";
import { fal } from "@fal-ai/client";
import * as falProxy from "@fal-ai/server-proxy/express";
import { z } from "zod";
import { Token, MediaGeneration, MediaGenerationValidation } from "./schemas";
import { requireAuth } from "./auth";
import { logger } from "./logger";

const router = Router();

fal.config({
  credentials: process.env.FAL_API_KEY,
});

// Enum for media types
export enum MediaType {
  IMAGE = "image",
  VIDEO = "video",
  AUDIO = "audio",
}

router.all(falProxy.route, falProxy.handler);

// Common validation schema for media generation
const MediaGenerationRequestSchema = z.object({
  prompt: z.string().min(1).max(500),
  type: z.nativeEnum(MediaType),
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

// Configure rate limits per media type
const RATE_LIMITS = {
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
async function checkRateLimits(
  mint: string,
  type: MediaType
): Promise<boolean> {
  const token = await Token.findOne({ mint });
  if (!token) {
    throw new Error("Token not found");
  }

  const cutoffTime = new Date(
    Date.now() - RATE_LIMITS[type].COOLDOWN_PERIOD_MS
  );

  // Count generations in the last 24 hours
  const recentGenerationsCount = await MediaGeneration.countDocuments({
    mint,
    type,
    timestamp: { $gte: cutoffTime },
  });

  return recentGenerationsCount < RATE_LIMITS[type].MAX_GENERATIONS_PER_DAY;
}

// Helper to generate media using fal.ai
async function generateMedia(
  data: z.infer<typeof MediaGenerationRequestSchema>
) {
  if (data.type === MediaType.VIDEO) {
    return await fal.subscribe("fal-ai/t2v-turbo", {
      input: {
        prompt: data.prompt,
      },
      logs: true,
      onQueueUpdate: (update) => {
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
        duration_seconds: data.duration_seconds || 10,
        bpm: data.bpm || 120,
        seed: data.seed || Math.floor(Math.random() * 1000000),
      },
      logs: true,
      onQueueUpdate: (update) => {
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
      negative_prompt: data.negative_prompt || "",
      num_inference_steps: data.num_inference_steps || 25,
      seed: data.seed || Math.floor(Math.random() * 1000000),
      guidance_scale: 7.5,
      width: 1024,
      height: 1024,
    },
  });

  // return await fal.subscribe("fal-ai/flux/dev/image-to-image", {
  //   input: {
  //     prompt: data.prompt,
  //     image_url:
  //       "https://gateway.pinata.cloud/ipfs/QmdnugkQ6ZBAG1wiz7YgkkNASB81NCAxm2HEcuKxLQxM26",
  //     // negative_prompt: data.negative_prompt || "",
  //     // num_inference_steps: data.num_inference_steps || 25,
  //     // seed: data.seed || Math.floor(Math.random() * 1000000),
  //     // guidance_scale: 7.5,
  //     // width: 1024,
  //     // height: 1024,
  //   },
  //   logs: true,
  //   onQueueUpdate: (update) => {
  //     if (update.status === "IN_PROGRESS") {
  //       console.log("Video generation progress:", update.logs);
  //     }
  //   },
  // });
}

// Generate media endpoint
router.post("/:mint/generate", async (req, res) => {
  try {
    const mintValidation = z.string().min(32).max(44);
    const mint = mintValidation.parse(req.params.mint);
    const validatedData = MediaGenerationRequestSchema.parse(req.body);

    // Check if user owns the token
    const token = await Token.findOne({ mint });
    if (!token) {
      return res.status(403).json({
        error: "Not authorized to generate media for this token",
      });
    }

    // Check rate limits
    const canGenerate = await checkRateLimits(mint, validatedData.type);
    if (!canGenerate) {
      return res.status(429).json({
        error: "Rate limit exceeded. Please try again later.",
        limit: RATE_LIMITS[validatedData.type].MAX_GENERATIONS_PER_DAY,
        cooldown: RATE_LIMITS[validatedData.type].COOLDOWN_PERIOD_MS,
        message: `You can generate up to ${
          RATE_LIMITS[validatedData.type].MAX_GENERATIONS_PER_DAY
        } ${validatedData.type}s per day`,
      });
    }

    // Generate media
    const result = await generateMedia(validatedData);

    console.log(result);

    // Extract the correct URL based on media type
    const mediaUrl =
      validatedData.type === MediaType.VIDEO
        ? result?.data?.video?.url
        : validatedData.type === MediaType.AUDIO
        ? result?.data?.audio_file?.url
        : result?.data?.images?.[0]?.url;

    if (!mediaUrl) {
      throw new Error("Failed to generate media URL from response");
    }

    // Save generation to database
    const generation = new MediaGeneration({
      mint,
      type: validatedData.type,
      prompt: validatedData.prompt,
      mediaUrl,
      negative_prompt: validatedData.negative_prompt,
      num_inference_steps: validatedData.num_inference_steps,
      seed: validatedData.seed,
      // Video specific metadata
      num_frames: validatedData.num_frames,
      fps: validatedData.fps,
      motion_bucket_id: validatedData.motion_bucket_id,
      duration: validatedData.duration,
      // Audio specific metadata
      duration_seconds: validatedData.duration_seconds,
      bpm: validatedData.bpm,
      creator: req?.user?.publicKey || null,
      timestamp: new Date(),
    });

    await generation.save();

    // Get remaining generations count
    const cutoffTime = new Date(
      Date.now() - RATE_LIMITS[validatedData.type].COOLDOWN_PERIOD_MS
    );
    const recentGenerationsCount = await MediaGeneration.countDocuments({
      mint,
      type: validatedData.type,
      timestamp: { $gte: cutoffTime },
    });

    const remainingGenerations =
      RATE_LIMITS[validatedData.type].MAX_GENERATIONS_PER_DAY -
      recentGenerationsCount;

    res.json({
      success: true,
      result: {
        ...result,
        mediaUrl, // Include the mediaUrl in the response
      },
      remainingGenerations,
      resetTime: new Date(
        Date.now() + RATE_LIMITS[validatedData.type].COOLDOWN_PERIOD_MS
      ),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      logger.error("Error generating media:", error);
      res.status(500).json({ error: error.message });
    }
  }
});

// Get generation history for a token
router.get("/:mint/history", requireAuth, async (req, res) => {
  try {
    const mintValidation = z.string().min(32).max(44);
    const mint = mintValidation.parse(req.params.mint);
    const type = req.query.type as MediaType;

    // Validate media type if provided
    if (type && !Object.values(MediaType).includes(type)) {
      return res.status(400).json({ error: "Invalid media type" });
    }

    // Check if user owns the token
    const token = await Token.findOne({
      mint,
      creator: req.user.publicKey,
    });

    if (!token) {
      return res.status(403).json({
        error: "Not authorized to view generation history for this token",
      });
    }

    const cutoffTime = new Date(
      Date.now() - RATE_LIMITS[type || MediaType.IMAGE].COOLDOWN_PERIOD_MS
    );

    // Build query
    const query: any = {
      mint,
      timestamp: { $gte: cutoffTime },
    };
    if (type) query.type = type;

    // Get recent generations from database
    const recentGenerations = await MediaGeneration.find(query)
      .sort({ timestamp: -1 })
      .lean();

    const recentGenerationsCount = recentGenerations.length;

    res.json({
      generations: recentGenerations,
      total: recentGenerationsCount,
      remaining: type
        ? RATE_LIMITS[type].MAX_GENERATIONS_PER_DAY - recentGenerationsCount
        : {
            [MediaType.IMAGE]:
              RATE_LIMITS[MediaType.IMAGE].MAX_GENERATIONS_PER_DAY -
              recentGenerations.filter((g) => g.type === MediaType.IMAGE)
                .length,
            [MediaType.VIDEO]:
              RATE_LIMITS[MediaType.VIDEO].MAX_GENERATIONS_PER_DAY -
              recentGenerations.filter((g) => g.type === MediaType.VIDEO)
                .length,
            [MediaType.AUDIO]:
              RATE_LIMITS[MediaType.AUDIO].MAX_GENERATIONS_PER_DAY -
              recentGenerations.filter((g) => g.type === MediaType.AUDIO)
                .length,
          },
      resetTime: new Date(
        Date.now() + RATE_LIMITS[type || MediaType.IMAGE].COOLDOWN_PERIOD_MS
      ),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

export default router;
