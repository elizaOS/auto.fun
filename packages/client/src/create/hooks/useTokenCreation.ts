import { useCreateToken } from "@/hooks/use-create-token";
import { getAuthToken } from "@/utils/auth";
import { env } from "@/utils/env";
import { Keypair } from "@solana/web3.js";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { FormTab, TokenMetadata } from "../types";
import { uploadImage } from "../utils/uploadImage";

type CreationStage =
  | "initializing"
  | "confirming"
  | "creating"
  | "validating"
  | "finalizing";

interface UseTokenCreationProps {
  publicKey: string | null;
  signTransaction: ((transaction: any) => Promise<any>) | null;
}

interface UseTokenCreationReturn {
  isCreating: boolean;
  creationStep: string;
  creationStage: CreationStage;
  isSubmitting: boolean;
  createToken: (
    tokenMetadata: TokenMetadata,
    mintKeypair: Keypair,
    vanityResult: { publicKey: string; secretKey: Keypair },
    imageFile: File | null,
    currentPreGeneratedTokenId?: string,
    userPrompt?: string,
    activeTab?: FormTab,
  ) => Promise<void>;
}

export const useTokenCreation = ({
  publicKey,
  signTransaction,
}: UseTokenCreationProps): UseTokenCreationReturn => {
  const navigate = useNavigate();
  const { mutateAsync: createTokenOnChainAsync } = useCreateToken();
  const [isCreating, setIsCreating] = useState(false);
  const [creationStep, setCreationStep] = useState("");
  const [creationStage, setCreationStage] =
    useState<CreationStage>("initializing");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createToken = useCallback(
    async (
      tokenMetadata: TokenMetadata,
      mintKeypair: Keypair,
      vanityResult: { publicKey: string; secretKey: Keypair },
      imageFile: File | null,
      currentPreGeneratedTokenId?: string,
      userPrompt?: string,
      activeTab?: FormTab,
    ) => {
      try {
        if (!publicKey) {
          throw new Error("Wallet not connected");
        }

        if (!signTransaction) {
          throw new Error("Wallet doesn't support signing");
        }

        setIsCreating(true);
        setCreationStage("initializing");
        setCreationStep("Preparing token creation...");
        setIsSubmitting(true);

        let media_base64: string | null = null;
        if (imageFile) {
          media_base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64String = reader.result as string;
              if (!base64String.startsWith("data:")) {
                resolve(
                  `data:${imageFile.type};base64,${base64String.split(",")[1]}`,
                );
              } else {
                resolve(base64String);
              }
            };
            reader.readAsDataURL(imageFile);
          });
        }

        let imageUrl = "";
        let metadataUrl = "";

        if (media_base64) {
          try {
            console.log(
              "Uploading with base64 format:",
              media_base64.substring(0, 50) + "...",
            );
            const uploadResult = await uploadImage({
              ...tokenMetadata,
              tokenMint: vanityResult.publicKey,
              imageBase64: media_base64,
            });
            imageUrl = uploadResult.imageUrl;
            metadataUrl = uploadResult.metadataUrl;

            if (!metadataUrl || metadataUrl === "undefined") {
              metadataUrl = env.getMetadataUrl(vanityResult.publicKey);
            }
          } catch (uploadError) {
            console.error("Error uploading image:", uploadError);
            throw new Error("Failed to upload token image");
          }
        } else if (!metadataUrl) {
          metadataUrl = env.getMetadataUrl(vanityResult.publicKey);
        }

        try {
          console.log("Creating token on-chain...");
          setCreationStage("confirming");
          setCreationStep("Waiting for wallet confirmation...");
          setCreationStage("creating");
          setCreationStep("Creating token on-chain...");
          setCreationStage("validating");
          setCreationStep("Validating transaction...");
          const { signature } = await createTokenOnChainAsync({
            tokenMetadata,
            metadataUrl,
            mintKeypair,
          });

          if (!signature) {
            return;
          }

          setCreationStage("finalizing");
          setCreationStep("Finalizing token setup...");

          // Send token creation data to backend with signature
          const authToken = getAuthToken();
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };

          if (authToken) {
            headers["Authorization"] = `Bearer ${authToken}`;
          }

          const createResponse = await fetch(env.apiUrl + "/api/create-token", {
            method: "POST",
            headers,
            credentials: "include",
            body: JSON.stringify({
              tokenMint: vanityResult.publicKey,
              mint: vanityResult.publicKey,
              name: tokenMetadata.name,
              symbol: tokenMetadata.symbol,
              description: tokenMetadata.description,
              twitter: tokenMetadata.links.twitter,
              telegram: tokenMetadata.links.telegram,
              website: tokenMetadata.links.website,
              discord: tokenMetadata.links.discord,
              imageUrl: imageUrl || "",
              metadataUrl: metadataUrl || "",
              signature: signature,
              decimals: tokenMetadata.decimals,
              supply: tokenMetadata.supply,
              freezeAuthority: tokenMetadata.freezeAuthority,
              mintAuthority: tokenMetadata.mintAuthority,
            }),
          });

          if (!createResponse.ok) {
            const errorData = (await createResponse.json()) as {
              error?: string;
            };
            throw new Error(errorData.error || "Failed to create token entry");
          }

          if (currentPreGeneratedTokenId && activeTab === FormTab.AUTO) {
            try {
              const authToken = getAuthToken();
              const headers: Record<string, string> = {
                "Content-Type": "application/json",
              };

              if (authToken) {
                headers["Authorization"] = `Bearer ${authToken}`;
              }

              await fetch(env.apiUrl + "/api/generation/mark-token-used", {
                method: "POST",
                headers,
                credentials: "include",
                body: JSON.stringify({
                  id: currentPreGeneratedTokenId,
                  name: tokenMetadata.name,
                  ticker: tokenMetadata.symbol,
                  concept: userPrompt,
                }),
              });
            } catch (error) {
              console.error(
                "Error marking pre-generated token as used:",
                error,
              );
            }
          }

          if (window.createConfettiFireworks) {
            window.createConfettiFireworks();
          }

          localStorage.removeItem("import_token_data");

          navigate(`/token/${vanityResult.publicKey}`);
        } catch (error) {
          console.error("Error creating token:", error);
          toast.error(
            error instanceof Error
              ? error.message
              : "Failed to create token. Please try again.",
          );
          setIsCreating(false);
          setCreationStep("");
          setCreationStage("initializing");
        } finally {
          setIsSubmitting(false);
        }
      } catch (error) {
        console.error("Error creating token:", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to create token. Please try again.",
        );
        setIsCreating(false);
        setCreationStep("");
        setCreationStage("initializing");
      }
    },
    [publicKey, signTransaction, createTokenOnChainAsync, navigate],
  );

  return {
    isCreating,
    creationStep,
    creationStage,
    isSubmitting,
    createToken,
  };
};
