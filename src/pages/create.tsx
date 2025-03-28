import CoinDrop from "@/components/coindrop";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, Keypair } from "@solana/web3.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Icons } from "../components/icons";
import { TokenMetadata } from "../types/form.type";

const MAX_INITIAL_SOL = 45;

// Tab types
enum FormTab {
  AUTO = "auto",
  IMPORT = "import",
  MANUAL = "manual",
}

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

interface GenerateMetadataResponse {
  success: boolean;
  metadata: {
    name: string;
    symbol: string;
    description: string;
    prompt: string;
  };
}

// Form Components
const FormInput = ({
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

const FormTextArea = ({
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
  isGenerating,
  setIsGenerating,
  setGeneratingField,
  onPromptFunctionsChange,
  onPreviewChange,
  imageUrl,
  onDirectPreviewSet,
}: {
  label: string;
  // description: string;
  onChange: (file: File | null) => void;
  onPromptChange: (prompt: string) => void;
  isGenerating: boolean;
  setIsGenerating: (value: boolean) => void;
  setGeneratingField: (value: string | null) => void;
  onPromptFunctionsChange: (
    setPrompt: (prompt: string) => void,
    onPromptChange: (prompt: string) => void,
  ) => void;
  onPreviewChange?: (previewUrl: string | null) => void;
  imageUrl?: string | null;
  onDirectPreviewSet?: (setter: (preview: string | null) => void) => void;
}) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [lastGeneratedImage, setLastGeneratedImage] = useState<string | null>(
    null,
  );
  const promptDebounceRef = useRef<number | null>(null);
  const hasDirectlySetPreview = useRef<boolean>(false);

  // Expose the setPreview function to the parent component
  useEffect(() => {
    if (onDirectPreviewSet) {
      onDirectPreviewSet((preview) => {
        hasDirectlySetPreview.current = true;
        setPreview(preview);
      });
    }
  }, [onDirectPreviewSet]);

  // Update preview from imageUrl prop if provided
  useEffect(() => {
    if (imageUrl && !preview && !hasDirectlySetPreview.current) {
      console.log("Setting preview from imageUrl prop:", imageUrl);
      setPreview(imageUrl);
    }
  }, [imageUrl, preview]);

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

  // Update preview when prompt changes externally
  useEffect(() => {
    // If the prompt changes from outside (via auto-generation), 
    // we should check if we need to update the image preview
    if (prompt && prompt.trim() !== "" && !preview) {
      console.log("Prompt changed externally, checking if we need to update preview");
      // We don't need to do anything here, as the image will be generated through generateFromPrompt
      // and setImageFile will be called, which will update the preview
    }
  }, [prompt, preview]);

  // Pass prompt functions to parent only once on mount
  useEffect(() => {
    onPromptFunctionsChange(setPrompt, onPromptChange);
  }, []); // Empty dependency array since we only want this to run once

  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setPrompt(value);
      debouncedPromptChange(value);
    },
    [debouncedPromptChange],
  );

  const handleCancel = useCallback(() => {
    setIsGenerating(false);
    setGeneratingField(null);
    setPreview(lastGeneratedImage);
    onChange(null);
  }, [lastGeneratedImage, onChange, setIsGenerating, setGeneratingField]);

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
        ) : preview || imageUrl ? (
          <div className="relative group w-full h-full flex items-center justify-center">
            <img
              src={preview || imageUrl || ''}
              alt="Token preview"
              className="w-full h-full object-contain"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center w-full h-full">
            <div className="flex flex-col gap-4 w-full h-full">
              <div className="flex-1 flex flex-col">
                <textarea
                  value={prompt}
                  onChange={handlePromptChange}
                  className="w-full h-full bg-[#0F0F0F] p-3 border border-neutral-800 text-white resize-none"
                  placeholder="Enter a concept like 'a halloween token about arnold schwarzenegger'"
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
  
  // Import-related state
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error' | 'warning', message: string } | null>(null);
  const [hasStoredToken, setHasStoredToken] = useState(false);
  
  // Tab state
  const [activeTab, setActiveTab] = useState<FormTab>(FormTab.AUTO);
  const [userPrompt, setUserPrompt] = useState("");
  const [isProcessingPrompt, setIsProcessingPrompt] = useState(false);

  // Simple form state
  const [form, setForm] = useState({
    name: "",
    symbol: "",
    description: "",
    prompt: "",
    initial_sol: "5",
    links: {
      twitter: "",
      telegram: "",
      website: "",
      discord: "",
      agentLink: "",
    },
    importAddress: "",
  });

  const [buyValue, setBuyValue] = useState(form.initial_sol || 0);

  // Error state
  const [errors, setErrors] = useState({
    name: "",
    symbol: "",
    description: "",
    prompt: "",
    initial_sol: "",
    userPrompt: "",
    importAddress: "",
  });

  // Store a reference to the FormImageInput's setPreview function
  const previewSetterRef = useRef<((preview: string | null) => void) | null>(null);

  // Create ref to track image URL creation to prevent infinite loops
  const hasCreatedUrlFromImage = useRef<boolean>(false);

  // Handle tab switching
  const handleTabChange = (tab: FormTab) => {
    setActiveTab(tab);
  };

  // Generate token based on user prompt
  const generateFromPrompt = useCallback(async () => {
    if (!userPrompt.trim()) {
      setErrors((prev) => ({
        ...prev,
        userPrompt: "Please enter a prompt",
      }));
      return;
    }

    setErrors((prev) => ({
      ...prev,
      userPrompt: "",
    }));

    setIsProcessingPrompt(true);
    console.log("=== Starting token generation process ===");

    try {
      console.log("Generating token from prompt:", userPrompt);
      
      // Get auth token from localStorage
      const authToken = localStorage.getItem("authToken");

      // Prepare headers
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      // Step 1: Generate metadata with user's prompt
      console.log("Requesting metadata generation...");
      const response = await fetch(
        import.meta.env.VITE_API_URL + "/api/generate-metadata",
        {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({
            prompt: userPrompt,
            fields: ["name", "symbol", "description", "prompt"],
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to generate metadata from prompt");
      }

      const data = (await response.json()) as GenerateMetadataResponse;
      
      if (!data.success || !data.metadata) {
        throw new Error("Invalid response from the metadata generation API");
      }
      
      console.log("Successfully generated metadata:", data.metadata);
      
      // Update form with generated data
      console.log("Updating form with generated metadata");
      setForm((prev) => ({
        ...prev,
        name: data.metadata.name,
        symbol: data.metadata.symbol,
        description: data.metadata.description,
        prompt: data.metadata.prompt,
      }));

      // Set the prompt text so it can be reused
      if (promptFunctions.setPrompt) {
        console.log("Setting promptFunctions.setPrompt with:", data.metadata.prompt);
        promptFunctions.setPrompt(data.metadata.prompt);
      } else {
        console.warn("promptFunctions.setPrompt is not available");
      }
      
      if (promptFunctions.onPromptChange) {
        console.log("Calling promptFunctions.onPromptChange with:", data.metadata.prompt);
        promptFunctions.onPromptChange(data.metadata.prompt);
      } else {
        console.warn("promptFunctions.onPromptChange is not available");
      }

      // Step 2: Generate image with the generated prompt
      console.log("Requesting image generation with prompt:", data.metadata.prompt);
      
      // Temporarily set the generating state
      setIsGenerating(true);
      setGeneratingField("prompt");
      
      const imageResponse = await fetch(
        import.meta.env.VITE_API_URL + "/api/generate",
        {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({
            prompt: data.metadata.prompt,
            type: "image",
          }),
        }
      );

      if (!imageResponse.ok) {
        console.error("Image generation API returned an error:", await imageResponse.text());
        throw new Error("Failed to generate image for token");
      }

      const imageData =
        (await imageResponse.json()) as GenerateImageResponse;
      
      
      if (!imageData.success || !imageData.mediaUrl) {
        console.error("Invalid image data:", imageData);
        throw new Error("Image generation API returned invalid data");
      }
      
      console.log("Successfully generated image URL:", imageData.mediaUrl);
      
      // Convert image URL to File object
      try {
        console.log("Fetching image blob from URL");
        const imageBlob = await fetch(imageData.mediaUrl).then((r) => {
          if (!r.ok) throw new Error(`Failed to fetch image: ${r.status} ${r.statusText}`);
          return r.blob();
        });
        
        console.log("Creating File object from blob");
        const imageFile = new File([imageBlob], "generated-image.png", {
          type: "image/png",
        });
        
        console.log("Setting imageFile state");
        // Reset the flag before setting the new image file
        hasCreatedUrlFromImage.current = false;
        setImageFile(imageFile);
        
        // Also create a preview URL for display
        console.log("Creating object URL for display");
        const previewUrl = URL.createObjectURL(imageBlob);
        console.log("Setting coinDropImageUrl:", previewUrl);
        setCoinDropImageUrl(previewUrl);
        
        // Directly update the preview in FormImageInput
        if (previewSetterRef.current) {
          console.log("Directly setting preview in FormImageInput");
          previewSetterRef.current(previewUrl);
        } else {
          console.warn("previewSetterRef.current is not available");
        }
      } catch (imageError) {
        console.error("Error processing generated image:", imageError);
        throw new Error("Failed to process the generated image");
      } finally {
        // Reset generating state
        console.log("Resetting generating state");
        setIsGenerating(false);
        setGeneratingField(null);
      }

      console.log("=== Token generation from prompt completed successfully ===");

    } catch (error) {
      console.error("Error generating from prompt:", error);
      // Reset generating state in case of error
      setIsGenerating(false);
      setGeneratingField(null);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to generate token from prompt. Please try again."
      );
    } finally {
      setIsProcessingPrompt(false);
    }
  }, [
    userPrompt, 
    setErrors, 
    setIsProcessingPrompt, 
    setForm, 
    promptFunctions, 
    setImageFile,
    setCoinDropImageUrl,
    setIsGenerating,
    setGeneratingField,
    previewSetterRef,
    hasCreatedUrlFromImage
  ]);

  // Fetch pre-generated token on mount
  useEffect(() => {
    // We no longer automatically fetch pre-generated tokens in AUTO mode
    // This code is intentionally disabled to prevent auto-loading placeholder data
    // Users will need to click "Generate" or "Reroll" buttons to create tokens
  }, [activeTab, promptFunctions.setPrompt, promptFunctions.onPromptChange]);

  // Auto-generate from default prompt on mount
  useEffect(() => {
    // Don't auto-generate anymore - Only generate when user clicks the button
    // This removes the automatic token generation behavior
    // The generateFromPrompt function will only be called when
    // the user clicks the "Generate" button
  }, [activeTab, generateFromPrompt]);

  // Check for previously imported token data
  useEffect(() => {
    const storedTokenData = localStorage.getItem('import_token_data');
    if (storedTokenData) {
      try {
        const tokenData = JSON.parse(storedTokenData);
        
        // Set flag to indicate we have stored token data
        setHasStoredToken(true);
        
        // If we have a connected wallet now, check if it matches the creator wallet
        if (publicKey && tokenData.needsWalletSwitch) {
          const isCreatorNow = 
            (tokenData.updateAuthority && tokenData.updateAuthority === publicKey.toString()) || 
            (tokenData.creators && tokenData.creators.includes(publicKey.toString()));
          
          // If the wallet now matches a creator, update the status
          if (isCreatorNow) {
            setImportStatus({
              type: 'success',
              message: 'Wallet matched! You can now register this token.',
            });
            
            // Update the token data to reflect the new creator status
            tokenData.isCreator = true;
            tokenData.needsWalletSwitch = false;
            localStorage.setItem('import_token_data', JSON.stringify(tokenData));
          } else {
            // Still not the right wallet
            setImportStatus({
              type: 'warning',
              message: 'You need to connect with the token creator wallet to register this token',
            });
          }
        }
        
        // Populate the form with the stored data
        setForm(prev => ({
          ...prev,
          name: tokenData.name || "",
          symbol: tokenData.symbol || "",
          description: tokenData.description || "",
          importAddress: tokenData.mint || "",
          links: {
            twitter: tokenData.twitter || "",
            telegram: tokenData.telegram || "",
            website: tokenData.website || "",
            discord: tokenData.discord || "",
            agentLink: prev.links.agentLink,
          }
        }));
        
        // If the token has an image, load it
        if (tokenData.image) {
          fetch(tokenData.image)
            .then(r => r.blob())
            .then(blob => {
              const imageFile = new File([blob], "imported-image.png", {
                type: "image/png",
              });
              
              hasCreatedUrlFromImage.current = false;
              setImageFile(imageFile);
              
              const previewUrl = URL.createObjectURL(blob);
              setCoinDropImageUrl(previewUrl);
              
              if (previewSetterRef.current) {
                previewSetterRef.current(previewUrl);
              }
            })
            .catch(err => {
              console.error("Failed to load stored token image:", err);
            });
        }
        
        // Keep the user on their current tab - don't force switching to Manual tab
        
      } catch (error) {
        console.error("Error parsing stored token data:", error);
        localStorage.removeItem('import_token_data');
      }
    }
  }, [publicKey]); // Re-run when wallet changes

  // When imageFile changes, create a temporary URL for CoinDrop (without updating the prompt)
  useEffect(() => {
    if (imageFile && !hasCreatedUrlFromImage.current) {
      console.log("imageFile changed, creating temporary URL for display");
      hasCreatedUrlFromImage.current = true;
      const tempUrl = URL.createObjectURL(imageFile);
      setCoinDropImageUrl(tempUrl);
      
      return () => {
        URL.revokeObjectURL(tempUrl);
        hasCreatedUrlFromImage.current = false;
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

      // Check if we're working with imported token data
      const storedTokenData = localStorage.getItem('import_token_data');
      if (storedTokenData) {
        try {
          const tokenData = JSON.parse(storedTokenData);
          
          // Check if the current wallet has permission to create this token
          const isCreatorNow = 
            (tokenData.updateAuthority && tokenData.updateAuthority === publicKey.toString()) || 
            (tokenData.creators && tokenData.creators.includes(publicKey.toString()));
          
          if (!isCreatorNow) {
            throw new Error("You need to connect with the token's creator wallet to register it");
          }
        } catch (error) {
          console.error("Error checking token ownership:", error);
          if (error instanceof Error) {
            throw error; // Re-throw if it's a permission error
          }
        }
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

      // Clear imported token data from localStorage if it exists
      localStorage.removeItem('import_token_data');
      setHasStoredToken(false);

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

  // Import token from address
  const importTokenFromAddress = async () => {
    // Validate the address
    if (!form.importAddress || form.importAddress.trim().length < 32) {
      setErrors((prev) => ({
        ...prev,
        importAddress: "Please enter a valid token address",
      }));
      return;
    }

    setErrors((prev) => ({
      ...prev,
      importAddress: "",
    }));

    setIsImporting(true);
    setImportStatus(null);

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

      try {
        // Fetch token data from a special search endpoint that can find any token
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/api/search-token`,
          {
            method: "POST",
            headers,
            credentials: "include",
            body: JSON.stringify({
              mint: form.importAddress,
              requestor: publicKey ? publicKey.toString() : ""
            }),
          }
        );

        // Define the expected token data interface
        interface TokenData {
          name?: string;
          symbol?: string;
          description?: string;
          creator?: string;
          creators?: string[];
          image?: string;
          mint: string;
          // Social links might be in metadata extensions
          twitter?: string;
          telegram?: string;
          website?: string;
          discord?: string;
          // Ownership info
          isCreator: boolean;
          updateAuthority?: string;
          needsWalletSwitch?: boolean;
        }

        // Check if the request was successful
        if (!response.ok) {
          // First try to parse error from response
          try {
            const errorData = await response.json() as { error?: string };
            if (errorData.error) {
              throw new Error(errorData.error);
            }
          } catch (parseError) {
            // If we can't parse the error, show a more friendly message
            if (response.status === 404) {
              throw new Error("The token doesn't exist or doesn't have metadata.");
            } else {
              throw new Error(`Server error (${response.status}): Unable to retrieve token data.`);
            }
          }
        }
        
        const tokenData = await response.json() as TokenData;

        // Store token data in localStorage for cross-wallet persistence
        localStorage.setItem('import_token_data', JSON.stringify(tokenData));
        setHasStoredToken(true);
        
        // Update form with token data
        setForm((prev) => ({
          ...prev,
          name: tokenData.name || "",
          symbol: tokenData.symbol || "",
          description: tokenData.description || "",
          links: {
            twitter: tokenData.twitter || "",
            telegram: tokenData.telegram || "",
            website: tokenData.website || "",
            discord: tokenData.discord || "",
            agentLink: prev.links.agentLink,
          },
        }));

        // If token has an image, fetch and set it
        if (tokenData.image) {
          try {
            setImportStatus({
              type: 'success',
              message: 'Token found, loading image...',
            });
            
            const imageBlob = await fetch(tokenData.image).then((r) => {
              if (!r.ok) throw new Error("Failed to fetch image");
              return r.blob();
            });
            
            const imageFile = new File([imageBlob], "imported-image.png", {
              type: "image/png",
            });
            
            // Reset the flag before setting the new image file
            hasCreatedUrlFromImage.current = false;
            setImageFile(imageFile);
            
            // Create a preview URL for display
            const previewUrl = URL.createObjectURL(imageBlob);
            setCoinDropImageUrl(previewUrl);
            
            // Directly update the preview in FormImageInput
            if (previewSetterRef.current) {
              previewSetterRef.current(previewUrl);
            }
          } catch (imageError) {
            console.error("Error loading token image:", imageError);
            setImportStatus({
              type: 'warning',
              message: 'Token imported, but image could not be loaded',
            });
          }
        }

        // Show warning if user needs to switch wallets
        if (tokenData.needsWalletSwitch) {
          setImportStatus({
            type: 'warning',
            message: 'You need to connect with the token creator wallet to register this token',
          });
        } else {
          // Show success message
          setImportStatus({
            type: 'success',
            message: 'Token imported successfully',
          });
          
          // Clear localStorage data since we don't need it anymore
          localStorage.removeItem('import_token_data');
        }
        
        // Keep the user on their current tab - don't force switching to Manual tab
        
      } catch (fetchError) {
        console.error("API Error:", fetchError);
        
        setImportStatus({
          type: 'error',
          message: fetchError instanceof Error 
            ? fetchError.message
            : 'Failed to import token'
        });
      }
      
    } catch (error) {
      console.error("Error importing token:", error);
      setImportStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to import token',
      });
    } finally {
      setIsImporting(false);
    }
  };

  // Function to clear imported token data
  const clearImportedToken = useCallback(() => {
    // Remove from localStorage
    localStorage.removeItem('import_token_data');
    setHasStoredToken(false);
    
    // Reset form
    setForm(prev => ({
      ...prev,
      name: "",
      symbol: "",
      description: "",
      importAddress: "",
      links: {
        twitter: "",
        telegram: "",
        website: "",
        discord: "",
        agentLink: prev.links.agentLink,
      }
    }));
    
    // Clear image
    setImageFile(null);
    setCoinDropImageUrl(null);
    if (previewSetterRef.current) {
      previewSetterRef.current(null);
    }
    
    // Clear status
    setImportStatus(null);
    
    // Switch back to Import tab
    setActiveTab(FormTab.IMPORT);
  }, [setForm, setImageFile, setCoinDropImageUrl, previewSetterRef]);

  return (
    <div className="flex flex-col items-center justify-center">
      {showCoinDrop && <CoinDrop imageUrl={coinDropImageUrl || undefined} />}
      <div className="p-4 w-full max-w-6xl">
        <form
          className="flex font-dm-mono flex-col w-full m-auto gap-4 justify-center"
          onSubmit={handleSubmit}
        >
          {/* Tabs Navigation */}
          <div className="logo flex items-center flex-col md:flex-row gap-8 mx-auto">
            <div className="logo flex items-center gap-4 md:ml-8">
              <img src="/create/dicelogo.svg" alt="Coin Machine" className="w-32 h-32" />
              <img src="/create/coinmachine.svg" alt="Coin Machine" className="w-64 h-32" />
            </div>
            <div className="flex text-lg">
              <button
                type="button"
                className={`mr-6 py-1 border-b-2 font-medium transition-colors ${
                  activeTab === FormTab.AUTO
                    ? "border-[#2fd345] text-[#2fd345] font-bold"
                    : "border-transparent text-neutral-400 hover:text-white"
                }`}
                onClick={() => handleTabChange(FormTab.AUTO)}
              >
                Auto
              </button>
              <button
                type="button"
                className={`mr-6 py-1 border-b-2 font-medium transition-colors ${
                  activeTab === FormTab.MANUAL
                    ? "border-[#2fd345] text-[#2fd345] font-bold"
                    : "border-transparent text-neutral-400 hover:text-white"
                }`}
                onClick={() => handleTabChange(FormTab.MANUAL)}
              >
                Manual
              </button>
              <button
                type="button"
                className={`py-1 border-b-2 font-medium transition-colors ${
                  activeTab === FormTab.IMPORT
                    ? "border-[#2fd345] text-[#2fd345] font-bold"
                    : "border-transparent text-neutral-400 hover:text-white"
                }`}
                onClick={() => handleTabChange(FormTab.IMPORT)}
              >
                Import
              </button>
            </div>
          </div>

          {/* Auto Tab Content */}
          {activeTab === FormTab.AUTO && (
            <div className="mb-6">
              <div className="flex flex-col gap-4">
                <div className="text-lg text-white mb-2">
                  Enter a prompt to generate a token
                </div>
                <div className="flex gap-4">
                  <input
                    type="text"
                    value={userPrompt}
                    onChange={(e) => setUserPrompt(e.target.value)}
                    placeholder="Enter a concept like 'a halloween token about arnold schwarzenegger'"
                    className="flex-1 py-2.5 px-3 border-b border-b-[#2fd345] text-white"
                  />
                  <button
                    type="button"
                    onClick={generateFromPrompt}
                    disabled={isProcessingPrompt || !userPrompt.trim()}
                    className="p-0 transition-colors disabled:opacity-50"
                  >
                      <img 
                        src={isProcessingPrompt ? "/create/generating.svg" : "/create/generateup.svg"}
                        alt="Generate" 
                        className="h-12 w-32"
                        onMouseDown={(e) => {
                          const img = e.target as HTMLImageElement;
                          if (!isProcessingPrompt) {
                            img.src = "/create/generatedown.svg";
                          }
                        }}
                        onMouseUp={(e) => {
                          const img = e.target as HTMLImageElement;
                          if (!isProcessingPrompt) {
                            img.src = "/create/generateup.svg";
                          }
                        }}
                      />
                  </button>
                </div>
                {errors.userPrompt && (
                  <div className="text-red-500 text-sm">{errors.userPrompt}</div>
                )}
                <div className="text-neutral-400 text-sm">
                  This will generate a token based on your prompt. Try concepts like "a cat-themed meme token", "a token about pizza lovers", or "a space exploration crypto"
                </div>
              </div>
            </div>
          )}

          {/* Import Tab Content */}
          {activeTab === FormTab.IMPORT && (
            <div className="mb-6">
              <div className="flex flex-col gap-4">
                <div className="text-lg text-white mb-2">
                  Import an existing token by address
                </div>
                
                <div className="flex flex-col gap-2">
                  <div className="flex gap-4">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={form.importAddress || ""}
                        onChange={(e) => handleChange("importAddress", e.target.value)}
                        placeholder="Enter any Solana token address (mint)"
                        className="w-full bg-[#0F0F0F] py-2.5 pl-3 pr-10 border border-neutral-800 text-white"
                      />
                      {isImporting && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <div className="w-5 h-5 border-2 border-[#2fd345] border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={importTokenFromAddress}
                      disabled={isImporting || !form.importAddress?.trim()}
                      className="bg-[#2fd345] px-6 py-2.5 font-bold text-black hover:bg-[#27b938] transition-colors disabled:opacity-50 disabled:bg-[#333333] disabled:hover:bg-[#333333]"
                    >
                      {isImporting ? "Searching..." : "Search Token"}
                    </button>
                    
                    {hasStoredToken && (
                      <button
                        type="button"
                        onClick={clearImportedToken}
                        className="bg-gray-700 px-6 py-2.5 font-bold text-white hover:bg-gray-600 transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                  {errors.importAddress && (
                    <div className="text-red-500 text-sm">{errors.importAddress}</div>
                  )}
                  {importStatus && (
                    <div className={`flex items-center gap-2 text-sm ${importStatus.type === 'error' ? 'text-red-500' : importStatus.type === 'warning' ? 'text-yellow-500' : 'text-green-500'}`}>
                      {importStatus.type === 'success' ? (
                        <Icons.Check className="w-4 h-4" />
                      ) : importStatus.type === 'warning' ? (
                        <Icons.Warning className="w-4 h-4" />
                      ) : (
                        <Icons.XCircle className="w-4 h-4" />
                      )}
                      {importStatus.message}
                      {importStatus.type === 'warning' && hasStoredToken && (
                        <button
                          type="button"
                          onClick={clearImportedToken}
                          className="ml-2 text-xs underline hover:text-white"
                        >
                          Clear Import
                        </button>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="bg-[#161616] p-5 rounded-md">
                  <div className="flex items-start gap-3">
                    <div className="text-[#2fd345] mt-1">
                      <Icons.Info className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-white text-sm font-bold mb-3">
                        Import and register any token on Solana
                      </p>
                      
                      <p className="text-neutral-300 text-sm mb-3">
                        This tool allows you to:
                      </p>
                      
                      <ul className="text-neutral-400 text-sm list-disc ml-4 space-y-2 mb-3">
                        <li>Search for any token by its mint address</li>
                        <li>View the token's metadata and details</li>
                        <li>Register tokens you have permission to create</li>
                      </ul>
                      
                      <div className="border-t border-neutral-800 pt-3 mt-2">
                        <p className="text-neutral-300 text-sm mb-2">
                          <span className="font-bold text-yellow-500">Important:</span> To register a token, 
                          you must be connected with a wallet that either:
                        </p>
                        <ul className="text-neutral-400 text-sm list-disc ml-4 space-y-1 mb-3">
                          <li>Is the token's update authority</li>
                          <li>Is verified as a token creator</li>
                        </ul>
                        <p className="text-neutral-300 text-xs">
                          If you find a token but don't have permission to register it, you'll need to 
                          switch to the appropriate wallet. Your search results will be preserved.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Two-column layout for form fields and image (shown in all tabs) */}
          <div className="grid gap-4">
            {/* Left column - Form fields */}
            <div className="flex flex-row gap-3">
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
            </div>

            {/* Right column - Image */}
            <div className="flex flex-col gap-3">
              <FormImageInput
                label="Token Image"
                // description="Upload or generate an image for your token"
                onChange={(file) => setImageFile(file)}
                onPromptChange={handlePromptChange}
                isGenerating={isGenerating && generatingField === "prompt"}
                setIsGenerating={setIsGenerating}
                setGeneratingField={setGeneratingField}
                onPromptFunctionsChange={(setPrompt, onPromptChange) => {
                  setPromptFunctions({ setPrompt, onPromptChange });
                }}
                onPreviewChange={handlePreviewChange}
                imageUrl={coinDropImageUrl}
                onDirectPreviewSet={(setter) => {
                  previewSetterRef.current = setter;
                }}
              />
            </div>

            <FormTextArea
                value={form.description}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  handleChange("description", e.target.value)
                }
                label="Description"
                rightIndicator={`${form.description.length}/2000`}
                minRows={2}
                maxLength={2000}
                error={errors.description}
                onClick={() => generateAll()}
                isLoading={isGenerating && generatingField === "description"}
              />
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
                <div className="flex flex-row gap-3 justify-end uppercase">
                      <span className="text-white text-xl font-medium">Buy</span>
                      <div className="relative">
                        <input
                          type="number"
                          value={buyValue}
                          onChange={(e) => {
                            let value = e.target.value.replace(" SOL", "");
                            
                            // Only allow numbers and decimal point
                            value = value.replace(/[^\d.]/g, '');
                            
                            // Ensure only one decimal point
                            const decimalCount = (value.match(/\./g) || []).length;
                            if (decimalCount > 1) {
                              value = value.replace(/\.+$/, '');
                            }
                            
                            // Split into whole and decimal parts
                            const parts = value.split('.');
                            let wholePart = parts[0];
                            let decimalPart = parts[1] || '';
                            
                            // Limit whole part to 2 digits
                            if (wholePart.length > 2) {
                              wholePart = wholePart.slice(0, 2);
                            }
                            
                            // Limit decimal part to 2 digits
                            if (decimalPart.length > 2) {
                              decimalPart = decimalPart.slice(0, 2);
                            }
                            
                            // Reconstruct the value
                            value = decimalPart ? `${wholePart}.${decimalPart}` : wholePart;
                            
                            // Ensure total length is max 5 (including decimal point)
                            if (value.length > 5) {
                              value = value.slice(0, 5);
                            }
                            
                            // Parse the value and check if it's within range
                            const numValue = parseFloat(value);
                            if (value === '' || (numValue >= 0 && numValue <= MAX_INITIAL_SOL)) {
                              handleChange("initial_sol", value);
                              setBuyValue(value);
                            }
                          }}
                          min="0" 
                          max={MAX_INITIAL_SOL}
                          step="0.01"
                          className="w-26 pr-10 text-white text-xl font-medium text-right inline border-b border-b-[#424242] focus:outline-none focus:border-white"
                        />
                        <span className="absolute right-0 text-white text-xl font-medium">
                          SOL
                        </span>
                      </div>
                </div>
              <div className="grid grid-cols-1 gap-x-3 gap-y-6">
                <button
                  type="submit"
                  className="p-0 transition-colors disabled:opacity-50"
                  disabled={!isFormValid || isSubmitting}
                >
                  <img 
                    src={isSubmitting ? "/create/launching.svg" : "/create/launchup.svg"}
                    alt="Launch" 
                    className="h-32 w-72 mx-auto pr-4"
                    onMouseDown={(e) => {
                      const img = e.target as HTMLImageElement;
                      if (!isSubmitting) {
                        img.src = "/create/launchdown.svg";
                      }else {
                        img.src = "/create/launching.svg";
                      }
                    }}
                    onMouseUp={(e) => {
                      const img = e.target as HTMLImageElement;
                      if (!isSubmitting) {
                        img.src = "/create/launchup.svg";
                      } else {
                        img.src = "/create/launchup.svg";
                      }
                    }}
                  />
                </button>
              </div>
            {!isFormValid && (
              <p className="text-red-500 text-center text-sm m-4">
                Please fill in all required fields
              </p>
            )}
        </form>
      </div>
    </div>
  );
};

export default Create;
