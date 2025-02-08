"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useToken } from "@/utils/tokens";
import { cn } from "@/lib/utils";
import { womboApi } from "@/utils/fetch";

interface GenerationResponse {
  success: boolean;
  result: {
    data: {
      images?: {
        url: string;
        width: number;
        height: number;
        content_type: string;
      }[];
      video?: {
        url: string;
        content_type: string;
        file_name: string;
        file_size: number;
      };
      audio_file?: {
        url: string;
        content_type: string;
        file_name: string;
        file_size: number;
      };
    };
    requestId: string;
    mediaUrl: string;
  };
  remainingGenerations: number;
  resetTime: string;
}

export const FalGenerator = () => {
  const [activeType, setActiveType] = useState<"image" | "video" | "audio">(
    "image",
  );
  const [customPrompt, setCustomPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const params = useParams();
  const tokenId = params.tokenId as string;
  const { data: token } = useToken({ variables: tokenId });

  const generateEnhancedPrompt = (basePrompt: string) => {
    if (!token) return basePrompt;

    const tokenDetails = {
      name: token.name,
      ticker: token.ticker,
      description: token.description,
      marketCap: token.marketCapUSD,
    };

    const tokenContext = `${tokenDetails.name} (${tokenDetails.ticker}) - ${tokenDetails.description}`;

    const styleModifiers = [
      "high quality",
      "detailed",
      "professional",
      activeType === "audio" ? "clear voice" : "modern",
      activeType === "audio" ? "natural sounding" : "digital art",
    ];

    if (
      tokenContext.toLowerCase().includes("ai") ||
      tokenContext.toLowerCase().includes("artificial intelligence")
    ) {
      styleModifiers.push(
        "futuristic",
        "technological",
        "artificial intelligence themed",
      );
    }

    if (
      tokenContext.toLowerCase().includes("game") ||
      tokenContext.toLowerCase().includes("gaming")
    ) {
      styleModifiers.push("game art style", "vibrant", "dynamic");
    }

    if (
      tokenContext.toLowerCase().includes("defi") ||
      tokenContext.toLowerCase().includes("finance")
    ) {
      styleModifiers.push("financial", "business themed", "professional");
    }

    const mediaTypePrefix = {
      image: "Create an image",
      video: "Create a short video",
      audio: "Create an audio narration",
    }[activeType];

    const enhancedPrompt = [
      mediaTypePrefix,
      "representing",
      tokenDetails.name,
      `(${tokenDetails.ticker})`,
      "-",
      basePrompt,
      "featuring",
      tokenDetails.description,
      "in a",
      styleModifiers.join(", "),
      "style",
    ].join(" ");

    return enhancedPrompt.replace(/\s+/g, " ").trim().slice(0, 500);
  };

  const handleGenerate = async () => {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const enhancedPrompt = generateEnhancedPrompt(customPrompt);
      console.log("Enhanced prompt:", enhancedPrompt); // For debugging

      const data = await womboApi.post({
        endpoint: `/media/${tokenId}/generate`,
        body: {
          prompt: enhancedPrompt,
          type: activeType,
        },
      });

      setResult(data as GenerationResponse);
    } catch (error) {
      console.error("Generation failed:", error);
      setError(error instanceof Error ? error.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  const renderResult = () => {
    if (!result?.success) return null;

    const { data } = result.result;

    if (activeType === "image" && data.images?.[0]) {
      const image = data.images[0];
      return (
        <div className="flex flex-col items-center">
          <img
            src={image.url}
            alt={customPrompt || "Generated Image"}
            className="max-w-full rounded"
          />
          <a
            href={image.url}
            download="generated-image.png"
            className="mt-2 inline-block px-4 py-2 bg-blue-500 text-white rounded"
          >
            Download Image
          </a>
        </div>
      );
    } else if (activeType === "video" && data.video) {
      const videoData = data.video;
      return (
        <div className="flex flex-col items-center">
          <video controls src={videoData.url} className="max-w-full">
            <track kind="captions" />
          </video>
          <a
            href={videoData.url}
            download={videoData.file_name}
            className="mt-2 inline-block px-4 py-2 bg-blue-500 text-white rounded"
          >
            Download Video
          </a>
        </div>
      );
    } else if (activeType === "audio" && data.audio_file) {
      const audioData = data.audio_file;
      return (
        <div className="flex flex-col items-center">
          <audio controls src={audioData.url} className="w-full max-w-md">
            Your browser does not support the audio element.
          </audio>
          <a
            href={audioData.url}
            download={audioData.file_name}
            className="mt-2 inline-block px-4 py-2 bg-blue-500 text-white rounded"
          >
            Download Audio
          </a>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-[#171717] border border-[#262626] rounded-xl p-4 md:p-6 mt-6">
      <h2 className="text-white text-xl mb-4">
        Generate ${token?.name} Content
      </h2>
      <div className="flex gap-4 mb-4">
        <button
          type="button"
          className={cn(
            "px-4 py-2 rounded",
            activeType === "image"
              ? "bg-[#22C55E] text-white"
              : "bg-gray-700 text-gray-300",
          )}
          onClick={() => setActiveType("image")}
        >
          Image
        </button>
        <button
          type="button"
          className={cn(
            "px-4 py-2 rounded",
            activeType === "video"
              ? "bg-[#22C55E] text-white"
              : "bg-gray-700 text-gray-300",
          )}
          onClick={() => setActiveType("video")}
        >
          Video
        </button>
        <button
          type="button"
          className={cn(
            "px-4 py-2 rounded",
            activeType === "audio"
              ? "bg-[#22C55E] text-white"
              : "bg-gray-700 text-gray-300",
          )}
          onClick={() => setActiveType("audio")}
        >
          Audio
        </button>
      </div>
      <div>
        {activeType === "image" && (
          <div className="flex flex-col gap-2">
            <label htmlFor="imagePrompt" className="text-white">
              Additional Image Details (optional)
            </label>
            <input
              id="imagePrompt"
              type="text"
              className="bg-[#262626] rounded p-2 text-white"
              placeholder="Add specific details to enhance the image"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
            />
            <p className="text-gray-400 text-sm mt-1">
              The prompt will automatically include token details for context
            </p>
          </div>
        )}
        {activeType === "video" && (
          <div className="flex flex-col gap-2">
            <label htmlFor="videoPrompt" className="text-white">
              Additional Video Details (optional)
            </label>
            <input
              id="videoPrompt"
              type="text"
              className="bg-[#262626] rounded p-2 text-white"
              placeholder="Add specific details to enhance the video"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
            />
            <p className="text-gray-400 text-sm mt-1">
              The prompt will automatically include token details for context
            </p>
          </div>
        )}
        {activeType === "audio" && (
          <div className="flex flex-col gap-2">
            <label htmlFor="audioPrompt" className="text-white">
              Additional Audio Details (optional)
            </label>
            <input
              id="audioPrompt"
              type="text"
              className="bg-[#262626] rounded p-2 text-white"
              placeholder="Add specific details for the audio narration"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
            />
            <p className="text-gray-400 text-sm mt-1">
              The prompt will automatically include token details for narration
            </p>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={handleGenerate}
        className="mt-4 px-4 py-2 bg-[#22C55E] text-white rounded hover:bg-[#1aab45]"
        disabled={loading}
      >
        {loading ? "Generating..." : "Generate"}
      </button>
      {error && <div className="mt-4 text-red-500">Error: {error}</div>}
      {result && (
        <div className="mt-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-white">Result:</h3>
          </div>
          {renderResult()}
        </div>
      )}
    </div>
  );
};
