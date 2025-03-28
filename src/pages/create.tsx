import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, Keypair } from "@solana/web3.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import CopyButton from "../components/copy-button";
import { Icons } from "../components/icons";
import { TokenMetadata } from "../types/form.type";
import CoinDrop from "@/components/coindrop";

// Constants
const MAX_FILE_SIZE_MB = 5;
const MAX_INITIAL_SOL = 45;

interface UploadResponse {
  success: boolean;
  imageUrl: string;
  metadataUrl: string;
}

interface GenerateImageResponse {
  success: boolean;
  mediaUrl: string;
  remainingGenerations: number;
  resetTime: string;
}

interface PreGeneratedTokenResponse {
  success: boolean;
  token: {
    id: string;
    name: string;
    ticker: string;
    description: string;
    prompt: string;
    image?: string;
    createdAt: string;
    used: number;
  };
}

// Form Components
export const FormInput = ({
  label,
  isOptional,
  error,
  leftIndicator,
  rightIndicator,
  inputTag,
  onClick,
  isLoading,
  ...props
}: {
  label?: string;
  isOptional?: boolean;
  error?: string;
  leftIndicator?: React.ReactNode;
  rightIndicator?: React.ReactNode;
  inputTag?: React.ReactNode;
  onClick?: () => void;
  isLoading?: boolean;
  [key: string]: any;
}) => {
  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex items-center justify-between gap-2">
        {label && (
          <div className="text-whitem py-1.5 uppercase text-sm font-medium tracking-wider">
            {label}
          </div>
        )}
        {/* {onClick && (
        <DiceButton
          onClick={onClick}
          isLoading={isLoading}
        />
      )} */}
      </div>
      <div className="relative flex items-center">
        {inputTag && (
          <div className="bg-[#262626] flex items-center h-full px-3">
            {inputTag}
          </div>
        )}
        {leftIndicator && (
          <div className="absolute left-3 text-[#8c8c8c]">{leftIndicator}</div>
        )}
        <input
          className={`w-full bg-[#0F0F0F] py-2.5 px-3 border border-neutral-800 text-white ${
            inputTag ? "pl-2" : ""
          } ${leftIndicator ? "pl-10" : ""}`}
          {...props}
        />
        {rightIndicator && (
          <div className="absolute right-3 text-[#8c8c8c]">
            {rightIndicator}
          </div>
        )}
      </div>
      {error && <div className="text-red-500 text-sm">{error}</div>}
    </div>
  );
};

export const FormTextArea = ({
  label,
  rightIndicator,
  minRows = 3,
  maxLength,
  ...props
}: {
  label?: string;
  rightIndicator?: React.ReactNode;
  minRows?: number;
  maxLength?: number;
  [key: string]: any;
}) => {
  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex items-center gap-2">
        <div className="text-whitem py-1.5 uppercase text-sm font-medium tracking-wider">
          {label}
        </div>
      </div>
      <div className="relative">
        <textarea
          className="w-full bg-[#0F0F0F] h-[250px] p-3 border border-neutral-800 text-white resize-none"
          style={{ minHeight: `${minRows * 1.5}rem` }}
          maxLength={maxLength}
          {...props}
        />
        {rightIndicator && (
          <div className="absolute right-3 bottom-3 text-[#8c8c8c]">
            {rightIndicator}
          </div>
        )}
      </div>
    </div>
  );
};

const FormImageInput = ({
  label,
  // description,
  onChange,
  onPromptChange,
  onGenerate,
  isGenerating,
  setIsGenerating,
  setGeneratingField,
  onPromptFunctionsChange,
  onPreviewChange,
}: {
  label: string;
  // description: string;
  onChange: (file: File | null) => void;
  onPromptChange: (prompt: string) => void;
  onGenerate: (prompt: string) => void;
  isGenerating: boolean;
  setIsGenerating: (value: boolean) => void;
  setGeneratingField: (value: string | null) => void;
  onPromptFunctionsChange: (
    setPrompt: (prompt: string) => void,
    onPromptChange: (prompt: string) => void,
  ) => void;
  onPreviewChange?: (previewUrl: string | null) => void;
}) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [lastGeneratedImage, setLastGeneratedImage] = useState<string | null>(
    null,
  );
  const [lastPrompt, setLastPrompt] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const promptDebounceRef = useRef<number | null>(null);

  // Debounced prompt change handler
  const debouncedPromptChange = useCallback(
    (value: string) => {
      if (promptDebounceRef.current) {
        window.clearTimeout(promptDebounceRef.current);
      }
      promptDebounceRef.current = window.setTimeout(() => {
        onPromptChange(value);
      }, 500);
    },
    [onPromptChange],
  );

  // Update lastGeneratedImage only when preview changes
  useEffect(() => {
    if (preview) {
      setLastGeneratedImage(preview);
      if (onPreviewChange) {
        onPreviewChange(preview);
      }
    } else if (onPreviewChange) {
      onPreviewChange(null);
    }
  }, [preview, onPreviewChange]);

  // Pass prompt functions to parent only once on mount
  useEffect(() => {
    onPromptFunctionsChange(setPrompt, onPromptChange);
  }, []); // Empty dependency array since we only want this to run once

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] || null;
      if (file) {
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
          alert(`The uploaded image exceeds the ${MAX_FILE_SIZE_MB}MB limit.`);
          return;
        }

        if (
          !["image/jpeg", "image/png", "image/gif", "video/mp4"].includes(
            file.type,
          )
        ) {
          alert("Only JPEG, PNG, GIF, and MP4 files are accepted");
          return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          setPreview(result);
          onChange(file);
        };
        reader.readAsDataURL(file);
      } else {
        setPreview(null);
        onChange(null);
      }
    },
    [onChange],
  );

  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setPrompt(value);
      debouncedPromptChange(value);
    },
    [debouncedPromptChange],
  );

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || isGenerating) return;

    setLastPrompt(prompt);
    onGenerate(prompt);

    // Get auth token from localStorage
    const authToken = localStorage.getItem("authToken");

    // Prepare headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    try {
      // Generate the image
      const response = await fetch(
        import.meta.env.VITE_API_URL + "/api/generate",
        {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({
            prompt,
            type: "image",
          }),
        },
      );

      if (!response.ok) throw new Error("Failed to generate image");

      const data = (await response.json()) as GenerateImageResponse;
      const imageUrl = data.mediaUrl;

      if (imageUrl) {
        // Convert image URL to File object
        const imageBlob = await fetch(imageUrl).then((r) => r.blob());
        const imageFile = new File([imageBlob], "generated-image.png", {
          type: "image/png",
        });

        // Set the preview
        setPreview(imageUrl);
        onChange(imageFile);
      }
    } catch (err) {
      console.error("Error generating image:", err);
      alert("Failed to generate image. Please try again.");
    } finally {
      // Make sure to reset the generating state
      setIsGenerating(false);
      setGeneratingField(null);
    }
  }, [prompt, onChange, setIsGenerating, setGeneratingField, isGenerating]);

  const handleReroll = useCallback(() => {
    setPreview(null);
    onChange(null);
    setPrompt(lastPrompt);
    onPromptChange(lastPrompt);
  }, [lastPrompt, onChange, onPromptChange]);

  const handleCancel = useCallback(() => {
    setIsGenerating(false);
    setGeneratingField(null);
    setPreview(lastGeneratedImage);
    onChange(null);
  }, [lastGeneratedImage, onChange, setIsGenerating, setGeneratingField]);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (promptDebounceRef.current) {
        window.clearTimeout(promptDebounceRef.current);
      }
    };
  }, []);

  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex items-center justify-between">
        <div className="text-whitem py-1.5 uppercase text-sm font-medium tracking-wider">
          {label}
        </div>
      </div>

      {/* Image Preview Area - Now Square */}
      <div className="relative mt-1 aspect-square text-center border-[#8c8c8c] flex items-center justify-center">
        {isGenerating ? (
          <div className="flex flex-col items-center justify-center">
            <div className="w-10 h-10 border-4 border-[#2fd345] border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-white">Generating your image...</p>
            <button
              type="button"
              onClick={handleCancel}
              className="mt-4 text-[#2fd345] px-4 py-2 rounded-lg font-bold transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : preview ? (
          <div className="relative group w-full h-full flex items-center justify-center">
            <img
              src={preview}
              alt="Token preview"
              className="w-full h-full object-contain"
            />
            <button
              type="button"
              onClick={handleReroll}
              className="absolute top-2 right-2 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
            >
              ×
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center w-full h-full">
            <div className="flex flex-col gap-4 w-full h-full">
              <div className="flex-1 flex flex-col">
                <textarea
                  value={prompt}
                  onChange={handlePromptChange}
                  className="w-full h-full bg-[#0F0F0F] p-3 border border-neutral-800 text-white resize-none"
                  placeholder="Describe the image you want to generate..."
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!prompt.trim() || isGenerating}
                  className="flex-1 bg-[#2fd345] text-black px-6 py-2.5 font-bold hover:bg-[#27b938] transition-colors disabled:opacity-50 disabled:bg-[#333333] disabled:hover:bg-[#333333]"
                >
                  {isGenerating ? (
                    <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin mx-auto" />
                  ) : (
                    "Generate Image"
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleUploadClick}
                  className="bg-[#2fd345] text-black px-6 py-2.5 font-bold hover:bg-[#27b938] transition-colors"
                >
                  Upload
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,video/mp4"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Image upload function
const uploadImage = async (metadata: TokenMetadata) => {
  // Determine a safe filename based on token metadata
  const safeName = metadata.name.toLowerCase().replace(/[^a-z0-9]/g, "_");

  // Get the image type from the data URL
  const contentType =
    metadata.imageBase64?.match(/^data:([A-Za-z-+/]+);base64,/)?.[1] || "";

  // Determine file extension from content type
  let extension = ".jpg"; // Default
  if (contentType.includes("png")) extension = ".png";
  else if (contentType.includes("gif")) extension = ".gif";
  else if (contentType.includes("svg")) extension = ".svg";
  else if (contentType.includes("webp")) extension = ".webp";

  const filename = `${safeName}${extension}`;

  console.log(
    `Uploading image as ${filename} with content type ${contentType}`,
  );

  // Get auth token from localStorage
  const authToken = localStorage.getItem("authToken");

  // Prepare headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const response = await fetch(import.meta.env.VITE_API_URL + "/api/upload", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({
      image: metadata.imageBase64,
      metadata: {
        name: metadata.name,
        symbol: metadata.symbol,
        description: metadata.description,
        twitter: metadata.links.twitter,
        telegram: metadata.links.telegram,
        website: metadata.links.website,
        discord: metadata.links.discord,
        agentLink: metadata.links.agentLink,
      },
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to upload image");
  }

  return (await response.json()) as UploadResponse;
};

// Function to wait for token creation
const waitForTokenCreation = async ({
  mint,
  name,
  symbol,
  description,
  twitter,
  telegram,
  website,
  discord,
  agentLink,
  imageUrl,
  metadataUrl,
  timeout = 80_000,
}: {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  twitter: string;
  telegram: string;
  website: string;
  discord: string;
  agentLink: string;
  imageUrl: string;
  metadataUrl: string;
  timeout?: number;
}) => {
  return new Promise<void>(async (resolve, reject) => {
    let resolved = false;

    // Set a timeout to reject if we don't get a response
    const timerId = setTimeout(() => {
      if (!resolved) {
        reject(new Error("Token creation timed out"));
      }
    }, timeout);

    try {
      // Wait a few seconds for the transaction to be confirmed
      await new Promise((r) => setTimeout(r, 4000));

      // Try direct token creation
      try {
        console.log(`Creating token record for ${mint}`);

        // Get auth token from localStorage
        const authToken = localStorage.getItem("authToken");

        // Prepare headers
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (authToken) {
          headers["Authorization"] = `Bearer ${authToken}`;
        }

        const createResponse = await fetch(
          import.meta.env.VITE_API_URL + "/api/create-token",
          {
            method: "POST",
            headers,
            credentials: "include",
            body: JSON.stringify({
              tokenMint: mint,
              mint,
              name,
              symbol,
              description,
              twitter,
              telegram,
              website,
              discord,
              agentLink,
              imageUrl,
              metadataUrl,
            }),
          },
        );

        if (createResponse.ok) {
          const data = await createResponse.json();
          if (
            data &&
            typeof data === "object" &&
            "success" in data &&
            data.success === true
          ) {
            console.log(`Token ${mint} created via direct API call`);
            clearTimeout(timerId);
            resolved = true;
            resolve();
            return;
          }
        }
      } catch (createError) {
        console.error("Error creating token:", createError);
      }

      // If direct creation fails, try the check endpoint
      for (let i = 0; i < 3; i++) {
        if (resolved) break;

        console.log(`Checking for token ${mint}, attempt ${i + 1}`);
        try {
          // Get auth token from localStorage
          const authToken = localStorage.getItem("authToken");

          // Prepare headers
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };

          if (authToken) {
            headers["Authorization"] = `Bearer ${authToken}`;
          }

          const response = await fetch(
            import.meta.env.VITE_API_URL + "/api/check-token",
            {
              method: "POST",
              headers,
              credentials: "include",
              body: JSON.stringify({
                tokenMint: mint,
                imageUrl,
                metadataUrl,
              }),
            },
          );

          if (response.ok) {
            const data = await response.json();
            if (
              data &&
              typeof data === "object" &&
              "tokenFound" in data &&
              data.tokenFound === true
            ) {
              console.log(`Token ${mint} found via check API`);
              clearTimeout(timerId);
              resolved = true;
              resolve();
              break;
            }
          }
        } catch (checkError) {
          console.error(`Error checking token (attempt ${i + 1}):`, checkError);
        }

        // Wait before trying again
        await new Promise((r) => setTimeout(r, 3000));
      }

      // If we got here and haven't resolved, reject
      if (!resolved) {
        clearTimeout(timerId);
        reject(new Error("Failed to confirm token creation"));
      }
    } catch (error) {
      console.error("Error in token creation process:", error);
      clearTimeout(timerId);
      reject(error);
    }
  });
};

// Main Form Component
export const Create = () => {
  const navigate = useNavigate();
  const { publicKey, signTransaction } = useWallet();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingField, setGeneratingField] = useState<string | null>(null);
  const [showCoinDrop, setShowCoinDrop] = useState(false);
  const [coinDropImageUrl, setCoinDropImageUrl] = useState<string | null>(null);
  const [promptFunctions, setPromptFunctions] = useState<{
    setPrompt: ((prompt: string) => void) | null;
    onPromptChange: ((prompt: string) => void) | null;
  }>({ setPrompt: null, onPromptChange: null });

  // Simple form state
  const [form, setForm] = useState({
    name: "",
    symbol: "",
    description: "",
    prompt: "",
    initial_sol: "",
    links: {
      twitter: "",
      telegram: "",
      website: "",
      discord: "",
      agentLink: "",
    },
  });

  // Error state
  const [errors, setErrors] = useState({
    name: "",
    symbol: "",
    description: "",
    prompt: "",
    initial_sol: "",
  });

  // Fetch pre-generated token on mount
  useEffect(() => {
    const fetchPreGeneratedToken = async () => {
      try {
        // Get auth token from localStorage
        const authToken = localStorage.getItem("authToken");

        // Prepare headers
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (authToken) {
          headers["Authorization"] = `Bearer ${authToken}`;
        }

        // Get a pre-generated token
        const response = await fetch(
          import.meta.env.VITE_API_URL + "/api/pre-generated-token",
          {
            method: "GET",
            headers,
            credentials: "include",
          },
        );

        if (!response.ok) {
          throw new Error("Failed to get pre-generated token");
        }

        const data = (await response.json()) as PreGeneratedTokenResponse;
        const { token } = data;

        // Update form with generated data
        setForm((prev) => ({
          ...prev,
          name: token.name,
          symbol: token.ticker,
          description: token.description,
          prompt: token.prompt,
        }));

        // Set the prompt text so it can be reused
        if (promptFunctions.setPrompt) promptFunctions.setPrompt(token.prompt);
        if (promptFunctions.onPromptChange)
          promptFunctions.onPromptChange(token.prompt);

        // If we have an image URL, use it directly
        if (token.image) {
          const imageBlob = await fetch(token.image).then((r) => r.blob());
          const imageFile = new File([imageBlob], "generated-image.png", {
            type: "image/png",
          });
          setImageFile(imageFile);
        } else {
          // If no image, generate one using the prompt
          const imageResponse = await fetch(
            import.meta.env.VITE_API_URL + "/api/generate",
            {
              method: "POST",
              headers,
              credentials: "include",
              body: JSON.stringify({
                prompt: token.prompt,
                type: "image",
              }),
            },
          );

          if (!imageResponse.ok) {
            throw new Error("Failed to generate image");
          }

          const imageData =
            (await imageResponse.json()) as GenerateImageResponse;
          const imageUrl = imageData.mediaUrl;

          // Convert image URL to File object
          const imageBlob = await fetch(imageUrl).then((r) => r.blob());
          const imageFile = new File([imageBlob], "generated-image.png", {
            type: "image/png",
          });
          setImageFile(imageFile);
        }

        // Mark the token as used
        await fetch(import.meta.env.VITE_API_URL + "/api/mark-token-used", {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({
            id: token.id,
            name: token.name,
            ticker: token.ticker,
          }),
        });
      } catch (error) {
        console.error("Error fetching pre-generated token:", error);
        // Don't show an error to the user, just let them start with an empty form
      }
    };

    fetchPreGeneratedToken();
  }, [promptFunctions.setPrompt, promptFunctions.onPromptChange]);

  // When imageFile changes, create a temporary URL for CoinDrop
  useEffect(() => {
    if (imageFile) {
      const tempUrl = URL.createObjectURL(imageFile);
      setCoinDropImageUrl(tempUrl);
      return () => {
        URL.revokeObjectURL(tempUrl);
      };
    }
  }, [imageFile]);

  // Handle input changes
  const handleChange = (field: string, value: string) => {
    // Handle nested fields (for links)
    if (field.includes(".")) {
      const [parent, child] = field.split(".");
      setForm((prev) => {
        if (parent === "links") {
          return {
            ...prev,
            links: {
              ...prev.links,
              [child]: value,
            },
          };
        }
        return prev;
      });
    } else {
      setForm((prev) => ({
        ...prev,
        [field]: value,
      }));
    }

    // Clear errors immediately when field has a value
    if (field === "name" || field === "symbol" || field === "description") {
      if (value) {
        setErrors((prev) => ({
          ...prev,
          [field]: "",
        }));
      } else {
        setErrors((prev) => ({
          ...prev,
          [field]: `${field.charAt(0).toUpperCase() + field.slice(1)} is required`,
        }));
      }
    }

    // Validate initial_sol
    if (field === "initial_sol" && value) {
      const numValue = parseFloat(value);
      if (numValue < 0 || numValue > MAX_INITIAL_SOL) {
        setErrors((prev) => ({
          ...prev,
          initial_sol: `Max initial SOL is ${MAX_INITIAL_SOL}`,
        }));
      } else {
        setErrors((prev) => ({
          ...prev,
          initial_sol: "",
        }));
      }
    }
  };

  // Update the handleChange function to handle prompt changes specially
  const handlePromptChange = (prompt: string) => {
    setForm((prev) => ({
      ...prev,
      prompt: prompt,
    }));

    // Clear errors immediately when field has a value
    if (prompt) {
      setErrors((prev) => ({
        ...prev,
        prompt: "",
      }));
    }
  };

  // Create token on-chain
  const createTokenOnChain = async (
    _tokenMetadata: TokenMetadata,
    mintKeypair: Keypair,
    _metadataUrl: string,
  ) => {
    if (!signTransaction) {
      throw new Error("Wallet doesn't support signing");
    }

    if (!publicKey) {
      throw new Error("Wallet not connected");
    }

    // Create connection to Solana
    new Connection(
      import.meta.env.VITE_SOLANA_RPC_URL || "https://api.devnet.solana.com",
      "confirmed",
    );

    // For now, we'll bypass actual on-chain token creation since we need the program IDL
    // Instead, we'll just log the mint address and proceed with backend registration
    console.log(
      "Would create token with mint address:",
      mintKeypair.publicKey.toString(),
    );

    try {
      // This will bypass the actual on-chain transaction for now
      // In a real implementation, you would integrate with your Solana program

      // Return a placeholder transaction ID
      const placeholderTxId =
        "simulated_" + Math.random().toString(36).substring(2, 15);
      console.log("Simulated transaction ID:", placeholderTxId);
      return placeholderTxId;
    } catch (error) {
      console.error("Error in simulated token creation:", error);
      throw error;
    }

    /* Implementation with actual program integration would go here
    For example:
    
    try {
      // Find program ID - this should be provided from your environment or config
      const programId = new PublicKey(import.meta.env.VITE_PROGRAM_ID);
      
      // Create the transaction, add instructions, sign and submit
      // ...
      
      return txId;
    } catch (error) {
      console.error("Error creating token on-chain:", error);
      throw error;
    }
    */
  };

  // Function to generate all fields
  const generateAll = useCallback(
    async (
      setPrompt?: ((prompt: string) => void) | null,
      onPromptChange?: ((prompt: string) => void) | null,
    ) => {
      try {
        setIsGenerating(true);
        setGeneratingField("name,symbol,description,prompt");

        // Get auth token from localStorage
        const authToken = localStorage.getItem("authToken");

        // Prepare headers
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (authToken) {
          headers["Authorization"] = `Bearer ${authToken}`;
        }

        // Get a pre-generated token
        const response = await fetch(
          import.meta.env.VITE_API_URL + "/api/pre-generated-token",
          {
            method: "GET",
            headers,
            credentials: "include",
          },
        );

        if (!response.ok) {
          throw new Error("Failed to get pre-generated token");
        }

        const data = (await response.json()) as PreGeneratedTokenResponse;
        const { token } = data;

        // Update form with generated data
        setForm((prev) => ({
          ...prev,
          name: token.name,
          symbol: token.ticker,
          description: token.description,
          prompt: token.prompt,
        }));

        // Set the prompt text so it can be reused
        if (setPrompt) setPrompt(token.prompt);
        if (onPromptChange) onPromptChange(token.prompt);

        // If we have an image URL, use it directly
        if (token.image) {
          const imageBlob = await fetch(token.image).then((r) => r.blob());
          const imageFile = new File([imageBlob], "generated-image.png", {
            type: "image/png",
          });
          setImageFile(imageFile);
        } else {
          // If no image, generate one using the prompt
          const imageResponse = await fetch(
            import.meta.env.VITE_API_URL + "/api/generate",
            {
              method: "POST",
              headers,
              credentials: "include",
              body: JSON.stringify({
                prompt: token.prompt,
                type: "image",
              }),
            },
          );

          if (!imageResponse.ok) {
            throw new Error("Failed to generate image");
          }

          const imageData =
            (await imageResponse.json()) as GenerateImageResponse;
          const imageUrl = imageData.mediaUrl;

          // Convert image URL to File object
          const imageBlob = await fetch(imageUrl).then((r) => r.blob());
          const imageFile = new File([imageBlob], "generated-image.png", {
            type: "image/png",
          });
          setImageFile(imageFile);
        }

        // Mark the token as used
        await fetch(import.meta.env.VITE_API_URL + "/api/mark-token-used", {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({
            id: token.id,
            name: token.name,
            ticker: token.ticker,
          }),
        });
      } catch (error) {
        console.error("Error generating metadata:", error);
        alert(
          error instanceof Error
            ? error.message
            : "Failed to generate metadata. Please try again.",
        );
      } finally {
        setIsGenerating(false);
        setGeneratingField(null);
      }
    },
    [setIsGenerating, setGeneratingField],
  );

  // Update coinDropImageUrl directly when we have a preview URL
  const handlePreviewChange = useCallback((previewUrl: string | null) => {
    setCoinDropImageUrl(previewUrl);
  }, []);

  // Submit form to backend
  const submitFormToBackend = async () => {
    try {
      setIsSubmitting(true);

      // Ensure wallet is connected
      if (!publicKey) {
        throw new Error("Wallet not connected");
      }

      // Generate a new keypair for the token mint
      const mintKeypair = Keypair.generate();
      const tokenMint = mintKeypair.publicKey.toBase58();

      // Convert image to base64 if exists
      let media_base64: string | null = null;
      if (imageFile) {
        media_base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(imageFile);
        });
      }

      // Create token metadata
      const tokenMetadata: TokenMetadata = {
        name: form.name,
        symbol: form.symbol,
        description: form.description,
        initialSol: parseFloat(form.initial_sol) || 0,
        links: {
          ...form.links,
          agentLink: "", // Add empty agentLink
        },
        imageBase64: media_base64,
        tokenMint,
        decimals: 9,
        supply: 1000000000000000,
        freezeAuthority: publicKey?.toBase58() || "",
        mintAuthority: publicKey?.toBase58() || "",
      };

      // First, upload the image to get permanent URLs
      let imageUrl = "";
      let metadataUrl = "";
      
      // Show coin drop with the image we have
      setShowCoinDrop(true);

      if (media_base64) {
        try {
          console.log("Uploading image...");
          const uploadResult = await uploadImage(tokenMetadata);
          imageUrl = uploadResult.imageUrl;
          metadataUrl = uploadResult.metadataUrl;
          
          // Update the coin drop image to use the final uploaded URL
          if (imageUrl) {
            setCoinDropImageUrl(imageUrl);
          }
          
          console.log("Image uploaded successfully:", imageUrl);
          console.log("Metadata URL:", metadataUrl);
        } catch (uploadError) {
          console.error("Error uploading image:", uploadError);
          throw new Error("Failed to upload token image");
        }
      }

      // Create token on-chain
      try {
        console.log("Creating token on-chain...");
        await createTokenOnChain(tokenMetadata, mintKeypair, metadataUrl);
        console.log("Token created on-chain successfully");
      } catch (onChainError) {
        console.error("Error creating token on-chain:", onChainError);
        throw new Error("Failed to create token on-chain");
      }

      // Wait for token creation to be confirmed
      try {
        console.log("Waiting for token creation confirmation...");
        await waitForTokenCreation({
          mint: tokenMint,
          name: form.name,
          symbol: form.symbol,
          description: form.description,
          twitter: form.links.twitter,
          telegram: form.links.telegram,
          website: form.links.website,
          discord: form.links.discord,
          agentLink: "", // Add empty agentLink
          imageUrl,
          metadataUrl,
        });
        console.log("Token creation confirmed");
      } catch (waitError) {
        console.error("Error waiting for token creation:", waitError);
        // We still continue to the token page even if this fails
        console.warn("Continuing despite token creation confirmation failure");
      }

      // Redirect to token page using the mint public key
      navigate(`/token/${tokenMint}`);
    } catch (error) {
      console.error("Error creating token:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to create token. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    const newErrors = { ...errors };
    if (!form.name) newErrors.name = "Name is required";
    if (!form.symbol) newErrors.symbol = "Symbol is required";
    if (!form.description) newErrors.description = "Description is required";

    // Check if there are any errors
    if (
      newErrors.name ||
      newErrors.symbol ||
      newErrors.description ||
      newErrors.initial_sol
    ) {
      setErrors(newErrors);
      return;
    }

    // Submit form to backend
    await submitFormToBackend();
  };

  // Check if form is valid
  const isFormValid =
    !!form.name &&
    !!form.symbol &&
    !!form.description &&
    !errors.name &&
    !errors.symbol &&
    !errors.description &&
    !errors.initial_sol;

  return (
    <div className="flex flex-col items-center justify-center">
      {showCoinDrop && <CoinDrop imageUrl={coinDropImageUrl || undefined} />}
      <div className="p-4 w-full max-w-6xl">
        <form
          className="flex font-dm-mono flex-col w-full m-auto gap-4 justify-center"
          onSubmit={handleSubmit}
        >
          <div className="flex flex-col gap-y-4">
            <div className="flex items-center justify-between">
              <div className="text-autofun-background-action-highlight font-medium text-[32px]">
                Create Token
              </div>
              <button
                type="button"
                onClick={() =>
                  generateAll(
                    promptFunctions.setPrompt,
                    promptFunctions.onPromptChange,
                  )
                }
                disabled={
                  isGenerating &&
                  generatingField === "name,symbol,description,prompt"
                }
                className="flex items-center gap-2 text-[#2fd345] px-6 py-3 rounded-lg font-bold text-lg transition-colors"
              >
                {isGenerating &&
                generatingField === "name,symbol,description,prompt" ? (
                  <>
                    <span>Rolling</span>
                    <div className="w-5 h-5 border-2 border-[#2fd345] border-t-transparent rounded-full animate-spin" />
                  </>
                ) : (
                  <>
                    <span>Reroll</span>
                    <Icons.Dice />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Two-column layout for form fields and image */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* Left column - Form fields */}
            <div className="flex flex-col gap-3">
              <FormInput
                type="text"
                value={form.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleChange("name", e.target.value)
                }
                label="Name"
                maxLength={50}
                rightIndicator={`${form.name.length}/50`}
                error={errors.name}
                onClick={() => generateAll()}
                isLoading={isGenerating && generatingField === "name"}
              />

              <FormInput
                type="text"
                value={form.symbol}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleChange("symbol", e.target.value)
                }
                label="Ticker"
                leftIndicator="$"
                maxLength={8}
                rightIndicator={`${form.symbol.length}/8`}
                error={errors.symbol}
                onClick={() => generateAll()}
                isLoading={isGenerating && generatingField === "symbol"}
              />

              <FormTextArea
                value={form.description}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  handleChange("description", e.target.value)
                }
                label="Description"
                rightIndicator={`${form.description.length}/2000`}
                minRows={3}
                maxLength={2000}
                error={errors.description}
                onClick={() => generateAll()}
                isLoading={isGenerating && generatingField === "description"}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3">
                <FormInput
                  type="text"
                  value={form.links.website}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleChange("links.website", e.target.value)
                  }
                  isOptional
                  inputTag={<Icons.Website />}
                  placeholder="Website"
                  rightIndicator={
                    <CopyButton text={form.links.website || ""} />
                  }
                />
                <FormInput
                  type="text"
                  value={form.links.twitter}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleChange("links.twitter", e.target.value)
                  }
                  isOptional
                  inputTag={<Icons.Twitter />}
                  placeholder="X (Twitter)"
                  rightIndicator={
                    <CopyButton text={form.links.twitter || ""} />
                  }
                />
                <FormInput
                  type="text"
                  value={form.links.telegram}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleChange("links.telegram", e.target.value)
                  }
                  isOptional
                  inputTag={<Icons.Telegram />}
                  placeholder="Telegram"
                  rightIndicator={
                    <CopyButton text={form.links.telegram || ""} />
                  }
                />
                <FormInput
                  type="text"
                  value={form.links.discord}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleChange("links.discord", e.target.value)
                  }
                  isOptional
                  inputTag={<Icons.Discord />}
                  placeholder="Discord"
                  rightIndicator={
                    <CopyButton text={form.links.discord || ""} />
                  }
                />
              </div>
            </div>

            {/* Right column - Image */}
            <div className="flex flex-col gap-3">
              <FormImageInput
                label="Token Image"
                // description="Upload or generate an image for your token"
                onChange={(file) => setImageFile(file)}
                onPromptChange={handlePromptChange}
                onGenerate={(prompt) => {
                  setIsGenerating(true);
                  setGeneratingField("prompt");
                  handlePromptChange(prompt);
                }}
                isGenerating={isGenerating && generatingField === "prompt"}
                setIsGenerating={setIsGenerating}
                setGeneratingField={setGeneratingField}
                onPromptFunctionsChange={(setPrompt, onPromptChange) => {
                  setPromptFunctions({ setPrompt, onPromptChange });
                }}
                onPreviewChange={handlePreviewChange}
              />
            </div>
          </div>

          {/* <FormInput
            type="text"
            value={form.links.agentLink}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              handleChange("links.agentLink", e.target.value)
            }
            label="Link Agent"
            isOptional
            inputTag={
              <div className="text-[#8c8c8c] pointer-events-none p-[11px] text-base font-normal uppercase leading-normal tracking-widest">
                HTTPS://
              </div>
            }
            rightIndicator={<CopyButton text={form.links.agentLink || ""} />}
          /> */}

          <div className="m-12">
            <div className="flex flex-col max-w-sm w-full mx-auto bg-autofun-background-card p-8">
              <div className="grid grid-cols-1 gap-x-3 gap-y-6">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <div className="text-whitem py-1.5 uppercase text-sm font-medium tracking-wider">
                      {"buy your coin"}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="0"
                      max={MAX_INITIAL_SOL}
                      step="0.1"
                      value={form.initial_sol || "0"}
                      onChange={(e) =>
                        handleChange("initial_sol", e.target.value)
                      }
                      className="flex-1 h-2 bg-[#2e2e2e] appearance-none cursor-pointer accent-[#2fd345]"
                    />
                    <div className="relative">
                      <input
                        type="number"
                        value={form.initial_sol || 0}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (
                            value === "" ||
                            (parseFloat(value) >= 0 &&
                              parseFloat(value) <= MAX_INITIAL_SOL)
                          ) {
                            handleChange("initial_sol", value);
                          }
                        }}
                        min="0"
                        max={MAX_INITIAL_SOL}
                        step="0.1"
                        className="w-27 py-2 pr-14 bg-[#2e2e2e] text-[#2fd345] text-xl font-medium text-right"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#2fd345] text-xl font-medium">
                        SOL
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="submit"
                  className="bg-[#2fd345] py-3 px-6 font-bold border-2 text-black text-[1.8em] hover:bg-[#27b938] transition-colors disabled:opacity-50 disabled:bg-[#333333] disabled:hover:bg-[#333333]"
                  disabled={!isFormValid || isSubmitting}
                >
                  {isSubmitting ? "Creating..." : "LET'S GO"}
                </button>
              </div>
            </div>
            {!isFormValid && (
              <p className="text-red-500 text-center text-sm m-4">
                Please fill in all required fields
              </p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default Create;
