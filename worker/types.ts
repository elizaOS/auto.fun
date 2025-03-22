/**
 * Media generation types
 */
export interface MediaGeneration {
  id: string;
  mint: string;
  type: string;
  prompt: string;
  mediaUrl: string;
  negativePrompt?: string;
  numInferenceSteps?: number;
  seed?: number;
  // Video specific metadata
  numFrames?: number;
  fps?: number;
  motionBucketId?: number;
  duration?: number;
  // Audio specific metadata
  durationSeconds?: number;
  bpm?: number;
  creator?: string;
  timestamp: string;
  dailyGenerationCount?: number;
  lastGenerationReset?: string;
}
