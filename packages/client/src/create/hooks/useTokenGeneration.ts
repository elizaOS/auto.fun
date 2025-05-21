import { getAuthToken } from "@/utils/auth";
import { env } from "@/utils/env";
import { useCallback, useState } from "react";
import { ERROR_MESSAGES } from "../consts";
import type {
  GenerateImageResponse,
  GenerateMetadataResponse,
  TokenMetadata,
} from "../types";

interface UseTokenGenerationProps {
  onGenerationComplete?: (metadata: TokenMetadata) => void;
  onError?: (error: string) => void;
  onImageUrlUpdate?: (imageUrl: string, imageFile?: File) => void;
}

export const useTokenGeneration = ({
  onGenerationComplete,
  onError,
  onImageUrlUpdate,
}: UseTokenGenerationProps = {}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generatedMetadata, setGeneratedMetadata] =
    useState<TokenMetadata | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [currentImageFile, setCurrentImageFile] = useState<File | null>(null);

  const generateToken = useCallback(
    async (prompt: string) => {
      try {
        setIsGenerating(true);
        setGenerationProgress(0);
        setCurrentImageUrl(null);
        setCurrentImageFile(null);

        const authToken = getAuthToken();
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (authToken) {
          headers["Authorization"] = `Bearer ${authToken}`;
        }

        setGenerationProgress(25);
        const metadataResponse = await fetch(
          `${env.apiUrl}/api/generation/generate-metadata`,
          {
            method: "POST",
            headers,
            credentials: "include",
            body: JSON.stringify({
              prompt,
              fields: ["name", "symbol", "description", "prompt"],
            }),
          },
        );

        if (!metadataResponse.ok) {
          throw new Error("Failed to generate metadata from prompt");
        }

        const metadataData =
          (await metadataResponse.json()) as GenerateMetadataResponse;
        if (!metadataData.success || !metadataData.metadata) {
          throw new Error("Invalid response from the metadata generation API");
        }

        setGenerationProgress(50);
        const imageResponse = await fetch(
          `${env.apiUrl}/api/generation/generate`,
          {
            method: "POST",
            headers,
            credentials: "include",
            body: JSON.stringify({
              prompt: metadataData.metadata.prompt,
              type: "image",
            }),
          },
        );

        if (!imageResponse.ok) {
          const errorText = await imageResponse.text();
          console.error("Image generation API returned an error:", errorText);
          const backendError = JSON.parse(errorText).error;

          let userErrorMessage = "Failed to generate image for token.";
          if (backendError.includes("NSFW")) {
            userErrorMessage =
              "Your input contains inappropriate content. Please modify and try again.";
          }
          throw new Error(userErrorMessage);
        }

        const imageData = (await imageResponse.json()) as GenerateImageResponse;
        if (!imageData.success || !imageData.mediaUrl) {
          throw new Error("Image generation API returned invalid data");
        }

        try {
          const imageBlob = await fetch(imageData.mediaUrl).then((r) =>
            r.blob(),
          );
          const imageFile = new File([imageBlob], "generated-image.png", {
            type: "image/png",
          });
          setCurrentImageFile(imageFile);

          setCurrentImageUrl(imageData.mediaUrl);
          if (onImageUrlUpdate) {
            onImageUrlUpdate(imageData.mediaUrl, imageFile);
          }
        } catch (error) {
          console.error("Error creating image file:", error);
          setCurrentImageUrl(imageData.mediaUrl);
          if (onImageUrlUpdate) {
            onImageUrlUpdate(imageData.mediaUrl);
          }
        }

        setGenerationProgress(75);
        const finalMetadata: TokenMetadata = {
          name: metadataData.metadata.name,
          symbol: metadataData.metadata.symbol,
          description: metadataData.metadata.description,
          initialSol: 0,
          links: {
            twitter: "",
            telegram: "",
            farcaster: "",
            website: "",
            discord: "",
          },
          imageBase64: null,
          tokenMint: "",
          decimals: 9,
          supply: 1000000000000000,
          freezeAuthority: "",
          mintAuthority: "",
        };

        setGenerationProgress(100);
        setGeneratedMetadata(finalMetadata);
        if (onGenerationComplete) {
          onGenerationComplete(finalMetadata);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : ERROR_MESSAGES.UNKNOWN_ERROR;
        if (onError) {
          onError(errorMessage);
        }
      } finally {
        setIsGenerating(false);
      }
    },
    [onGenerationComplete, onError, onImageUrlUpdate],
  );

  const resetGeneration = useCallback(() => {
    setGeneratedMetadata(null);
    setGenerationProgress(0);
    setCurrentImageUrl(null);
    setCurrentImageFile(null);
  }, []);

  return {
    isGenerating,
    generationProgress,
    generatedMetadata,
    currentImageUrl,
    currentImageFile,
    generateToken,
    resetGeneration,
  };
};
