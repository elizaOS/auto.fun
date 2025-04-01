import CoinDrop from "@/components/coindrop";
import { EmptyState } from "@/components/empty-state";
import useAuthentication from "@/hooks/use-authentication";
import { useCreateToken } from "@/hooks/use-create-token";
import { useSolBalance } from "@/hooks/use-token-balance";
import { getAuthToken } from "@/utils/auth";
import { env } from "@/utils/env";
import { useWallet } from "@solana/wallet-adapter-react";
import { Keypair } from "@solana/web3.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "react-toastify";
import { Icons } from "../components/icons";
import { TokenMetadata } from "../types/form.type";

const MAX_INITIAL_SOL = 45;
// Use the token supply and virtual reserves from environment or fallback to defaults
const TOKEN_SUPPLY = Number(env.tokenSupply) || 1000000000000000;
const VIRTUAL_RESERVES = Number(env.virtualReserves) || 2800000000;

// Tab types
enum FormTab {
  AUTO = "auto",
  IMPORT = "import",
  MANUAL = "manual",
}

// LocalStorage key for tab state
const TAB_STATE_KEY = "auto_fun_active_tab";

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

// Define tokenData interface
interface TokenSearchData {
  name?: string;
  symbol?: string;
  description?: string;
  creator?: string;
  creators?: string[];
  image?: string;
  mint: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  discord?: string;
  metadataUri?: string;
  isCreator?: boolean;
  updateAuthority?: string;
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
  onClick,
  isLoading,
  ...props
}: {
  label?: string;
  rightIndicator?: React.ReactNode;
  minRows?: number;
  maxLength?: number;
  onClick?: () => void;
  isLoading?: boolean;
  [key: string]: any;
}) => {
  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex items-center gap-2">
        {isLoading && (
          <div className="w-4 h-4 border-2 border-[#03FF24] border-t-transparent rounded-full animate-spin"></div>
        )}
      </div>
      <div className="relative">
        <textarea
          className="w-full bg-[#0F0F0F] h-[100px] p-3 border border-neutral-800 text-white resize-none"
          style={{ minHeight: `${minRows * 1.5}rem` }}
          maxLength={maxLength}
          {...props}
          onFocus={(e) => {
            // Call the original onFocus if it exists
            if (props.onFocus) props.onFocus(e);
          }}
          onBlur={(e) => {
            // Call the original onBlur if it exists
            if (props.onBlur) props.onBlur(e);
          }}
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
  onChange,
  onPromptChange,
  isGenerating,
  setIsGenerating,
  setGeneratingField,
  onPromptFunctionsChange,
  onPreviewChange,
  imageUrl,
  onDirectPreviewSet,
  activeTab,
  nameValue,
  onNameChange,
  tickerValue,
  onTickerChange,
}: {
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
  activeTab: FormTab;
  nameValue?: string;
  onNameChange?: (value: string) => void;
  tickerValue?: string;
  onTickerChange?: (value: string) => void;
}) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [lastGeneratedImage, setLastGeneratedImage] = useState<string | null>(
    null,
  );
  const promptDebounceRef = useRef<number | null>(null);
  const hasDirectlySetPreview = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [nameInputFocused, setNameInputFocused] = useState(false);
  const [tickerInputFocused, setTickerInputFocused] = useState(false);

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

  // Handle file selection
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        const file = files[0];

        // Check if file is an image
        if (!file.type.startsWith("image/")) {
          toast.error("Please select an image file");
          return;
        }

        // Check file size (limit to 5MB)
        if (file.size > 5 * 1024 * 1024) {
          toast.error(
            "File is too large. Please select an image less than 5MB.",
          );
          return;
        }

        // Create a preview URL
        const previewUrl = URL.createObjectURL(file);
        setPreview(previewUrl);

        // Pass the file to parent
        onChange(file);
      }
    },
    [onChange],
  );

  // Handle drag & drop
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];

        // Check if file is an image
        if (!file.type.startsWith("image/")) {
          toast.error("Please drop an image file");
          return;
        }

        // Check file size (limit to 5MB)
        if (file.size > 5 * 1024 * 1024) {
          toast.error(
            "File is too large. Please select an image less than 5MB.",
          );
          return;
        }

        // Create a preview URL
        const previewUrl = URL.createObjectURL(file);
        setPreview(previewUrl);

        // Pass the file to parent
        onChange(file);
      }
    },
    [onChange],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Trigger file input click
  const triggerFileInput = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  // Remove image
  const handleRemoveImage = useCallback(() => {
    // Only allow removing images in Manual mode
    if (activeTab === FormTab.MANUAL) {
      setPreview(null);
      onChange(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [activeTab, onChange]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (promptDebounceRef.current) {
        window.clearTimeout(promptDebounceRef.current);
      }
    };
  }, []);

  // Don't render anything for IMPORT tab
  if (activeTab === FormTab.IMPORT && !preview && !imageUrl) {
    return null;
  }

  return (
    <div className="flex flex-col w-full">
      {/* Image Preview Area - Square */}
      <div
        className="relative mt-1 aspect-square text-center flex items-center justify-center"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {isGenerating ? (
          <div className="flex flex-col items-center justify-center">
            <div className="w-10 h-10 border-4 border-[#03FF24] border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-white">Generating your image...</p>
            <button
              type="button"
              onClick={handleCancel}
              className="mt-4 text-[#03FF24] px-4 py-2 rounded-lg font-bold transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : preview || imageUrl ? (
          <div className="relative group w-full h-full flex items-center justify-center">
            <img
              src={preview || imageUrl || ""}
              alt="Token preview"
              className="w-full h-full object-contain"
            />

            {/* Image hover overlay with X button - only for Manual mode */}
            {activeTab === FormTab.MANUAL && (
              <button
                type="button"
                onClick={handleRemoveImage}
                className="absolute top-2 right-2 text-white w-12 h-12 rounded-full flex items-center justify-center text-shadow opacity-50 hover:opacity-100 transition-all z-10"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            )}

            {/* Gradient overlays for better text contrast */}
            <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black to-transparent opacity-60 z-[5]"></div>
            <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black to-transparent opacity-60 z-[5]"></div>

            {/* Name overlay - top left */}
            {
              <div className="absolute top-4 left-4 z-10">
                {activeTab === FormTab.IMPORT && (
                  <span
                    className={`bg-transparent text-white text-xl font-bold focus:outline-none px-1 py-0.5`}
                  >
                    {nameValue}
                  </span>
                )}
                {activeTab !== FormTab.IMPORT && (
                  <input
                    type="text"
                    value={nameValue || ""}
                    onChange={(e) =>
                      onNameChange && onNameChange(e.target.value)
                    }
                    placeholder="Token Name"
                    maxLength={128}
                    onFocus={() => setNameInputFocused(true)}
                    onBlur={() => setNameInputFocused(false)}
                    className={`bg-transparent text-white text-xl font-bold border-b-2 ${
                      nameInputFocused ? "border-white" : "border-gray-500"
                    } focus:outline-none px-1 py-0.5 w-[280px] max-w-[95%]`}
                  />
                )}
              </div>
            }

            {/* Ticker overlay - bottom left */}
            {onTickerChange && (
              <div className="absolute bottom-4 left-4 z-10">
                <div className="flex items-center">
                  <span className="text-white text-opacity-80 mr-1">$</span>
                  {activeTab === FormTab.IMPORT && (
                    <span
                      className={`bg-transparent text-white text-xl font-bold focus:outline-none px-1 py-0.5`}
                    >
                      {tickerValue}
                    </span>
                  )}
                  {activeTab !== FormTab.IMPORT && (
                    <input
                      type="text"
                      value={tickerValue || ""}
                      onChange={(e) =>
                        onTickerChange(e.target.value.toUpperCase())
                      }
                      placeholder="TICKER"
                      maxLength={16}
                      onFocus={() => setTickerInputFocused(true)}
                      onBlur={() => setTickerInputFocused(false)}
                      className={`bg-transparent text-white text-lg font-semibold border-b-2 ${
                        tickerInputFocused ? "border-white" : "border-gray-500"
                      } focus:outline-none px-1 py-0.5 max-w-[60%]`}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center w-full h-full">
            {activeTab === FormTab.MANUAL ? (
              // Manual mode - File upload UI
              <div
                className="flex flex-col items-center justify-center w-full h-full cursor-pointer bg-[url(/empty-state-bg.svg)] bg-cover"
                onClick={triggerFileInput}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="p-8 flex flex-col items-center justify-center w-4/5 h-4/5">
                  {/* Placeholder logo when empty */}
                  <EmptyState maxSizeMb={5} />
                </div>
              </div>
            ) : (
              // Auto mode - Prompt text area
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
            )}
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

  // Get auth token from localStorage with quote handling
  const authToken = getAuthToken();

  // Prepare headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const response = await fetch(env.apiUrl + "/api/upload", {
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
    // Specifically handle authentication errors
    if (response.status === 401) {
      throw new Error(
        "Authentication required. Please connect your wallet and try again.",
      );
    }
    throw new Error("Failed to upload image: " + (await response.text()));
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

        // Get auth token from localStorage with quote handling
        const authToken = getAuthToken();

        // Prepare headers
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
        });

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
          // Get auth token from localStorage with quote handling
          const authToken = getAuthToken();

          // Prepare headers
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };

          if (authToken) {
            headers["Authorization"] = `Bearer ${authToken}`;
          }

          const response = await fetch(env.apiUrl + "/api/check-token", {
            method: "POST",
            headers,
            credentials: "include",
            body: JSON.stringify({
              tokenMint: mint,
              imageUrl,
              metadataUrl,
            }),
          });

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
  // Define things for our page
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthentication();
  const { publicKey, signTransaction } = useWallet();

  // State for image upload
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [showCoinDrop, setShowCoinDrop] = useState(false);
  const [coinDropImageUrl, setCoinDropImageUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingField, setGeneratingField] = useState<string | null>(null);
  const [promptFunctions, setPromptFunctions] = useState<{
    setPrompt: ((prompt: string) => void) | null;
    onPromptChange: ((prompt: string) => void) | null;
  }>({ setPrompt: null, onPromptChange: null });
  const { mutateAsync: createTokenOnChainAsync } = useCreateToken();

  // Import-related state
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<{
    type: "success" | "error" | "warning";
    message: string;
  } | null>(null);
  const [hasStoredToken, setHasStoredToken] = useState(false);

  // Tab state - initialize from localStorage or default to AUTO
  const [activeTab, setActiveTab] = useState<FormTab>(() => {
    const savedTab = localStorage.getItem(TAB_STATE_KEY);
    if (savedTab && Object.values(FormTab).includes(savedTab as FormTab)) {
      return savedTab as FormTab;
    }
    return FormTab.AUTO;
  });
  const [userPrompt, setUserPrompt] = useState("");
  const [isProcessingPrompt, setIsProcessingPrompt] = useState(false);

  // Effect to clear import token data if not in import tab
  useEffect(() => {
    if (activeTab !== FormTab.IMPORT) {
      localStorage.removeItem("import_token_data");
      setHasStoredToken(false);
    }
  }, [activeTab]);

  // Effect to check imported token data and wallet authorization when wallet changes
  useEffect(() => {
    if (activeTab === FormTab.IMPORT && publicKey) {
      const storedTokenData = localStorage.getItem("import_token_data");
      if (storedTokenData) {
        try {
          const tokenData = JSON.parse(storedTokenData) as TokenSearchData;

          // Check if the current wallet is authorized to create this token
          // In dev mode, always allow any wallet to register
          const isCreatorWallet =
            tokenData.isCreator !== undefined
              ? tokenData.isCreator
              : (tokenData.updateAuthority &&
                  tokenData.updateAuthority === publicKey.toString()) ||
                (tokenData.creators &&
                  tokenData.creators.includes(publicKey.toString()));

          // Update import status based on wallet authorization
          if (!isCreatorWallet) {
            setImportStatus({
              type: "warning",
              message:
                "Please connect with the token's creator wallet to register it.",
            });
          } else {
            // Success message - different in dev mode if not the creator
            const message =
              "Successfully loaded token data for " + tokenData.name;
            setImportStatus({
              type: "success",
              message,
            });
          }
        } catch (error) {
          console.error("Error parsing stored token data:", error);
        }
      }
    }
  }, [activeTab, publicKey]);

  // Effect to populate form with token data if it exists
  useEffect(() => {
    if (activeTab === FormTab.IMPORT) {
      const storedTokenData = localStorage.getItem("import_token_data");
      if (storedTokenData) {
        try {
          const tokenData = JSON.parse(storedTokenData) as TokenSearchData;
          setHasStoredToken(true);

          // Populate the form with token data
          setForm((prev) => ({
            ...prev,
            name: tokenData.name || tokenData.mint.slice(0, 8),
            symbol: tokenData.symbol || "TOKEN",
            description: tokenData.description || "Imported token",
            links: {
              ...prev.links,
              twitter: tokenData.twitter || "",
              telegram: tokenData.telegram || "",
              website: tokenData.website || "",
              discord: tokenData.discord || "",
            },
          }));

          // Set the image preview if available - use a small timeout to ensure the ref is set
          if (tokenData.image) {
            // Set image URL directly to handle refresh cases
            setCoinDropImageUrl(tokenData.image || null);

            // Use a small timeout to ensure the ref is available after render
            setTimeout(() => {
              if (previewSetterRef.current) {
                previewSetterRef.current(tokenData.image || null);
              }
            }, 100);
          }
        } catch (error) {
          console.error("Error parsing stored token data:", error);
        }
      }
    }
  }, [activeTab]);

  // Simple form state
  const [form, setForm] = useState({
    name: "",
    symbol: "",
    description: "",
    prompt: "",
    initialSol: "2",
    links: {
      twitter: "",
      telegram: "",
      website: "",
      discord: "",
      agentLink: "",
    },
    importAddress: "",
  });

  // Separate state for Auto and Manual modes
  const [autoForm, setAutoForm] = useState({
    name: "",
    symbol: "",
    description: "",
    prompt: "",
    concept: "",
    imageUrl: null as string | null,
  });

  const [manualForm, setManualForm] = useState({
    name: "",
    symbol: "",
    description: "",
    imageFile: null as File | null,
  });

  // Add state to track token ID for deletion when creating
  const [currentPreGeneratedTokenId, setCurrentPreGeneratedTokenId] = useState<
    string | null
  >(null);

  const [buyValue, setBuyValue] = useState(form.initialSol || 0);
  const wallet = useWallet();
  console.log("wallet", wallet);
  const balance = useSolBalance();

  console.log("balance", balance);

  // Calculate max SOL the user can spend (leave 0.05 SOL for transaction fees)
  const maxUserSol = balance ? Math.max(0, balance - 0.05) : 0;
  // Use the smaller of MAX_INITIAL_SOL or the user's max available SOL
  const maxInputSol = Math.min(MAX_INITIAL_SOL, maxUserSol);

  // Calculate dollar value based on SOL price
  // const solValueUsd =
  //   solPrice && buyValue ? (Number(buyValue) * solPrice).toFixed(2) : "0.00";

  console.log("buyValue", buyValue);
  console.log("balance", balance);

  // Log development mode and active tab for debugging
  console.log("VITE_SOLANA_NETWORK:", env.solanaNetwork);
  console.log("Active tab:", activeTab);

  // Skip balance check for imported tokens in development mode
  const insufficientBalance =
    activeTab === FormTab.IMPORT
      ? false
      : Number(buyValue) > Number(balance || 0) - 0.05;

  console.log("Insufficient balance:", insufficientBalance);

  // Show a message in the console for developers when bypassing balance check
  if (activeTab === FormTab.IMPORT) {
    const source =
      env.solanaNetwork === "devnet"
        ? "VITE_SOLANA_NETWORK=devnet"
        : "LOCAL_DEV=true";
    console.log(
      `%c[DEV MODE via ${source}] SOL balance check bypassed for imported tokens in development mode`,
      "color: green; font-weight: bold",
    );
  }

  // Error state
  const [errors, setErrors] = useState({
    name: "",
    symbol: "",
    description: "",
    prompt: "",
    initialSol: "",
    userPrompt: "",
    importAddress: "",
    percentage: "",
  });

  // Store a reference to the FormImageInput's setPreview function
  const previewSetterRef = useRef<((preview: string | null) => void) | null>(
    null,
  );

  // Create ref to track image URL creation to prevent infinite loops
  const hasCreatedUrlFromImage = useRef<boolean>(false);

  // Add state to track if token has been generated in AUTO mode
  const [hasGeneratedToken, setHasGeneratedToken] = useState(false);

  // Update the form from the appropriate mode-specific form when switching tabs
  useEffect(() => {
    if (activeTab === FormTab.AUTO) {
      setForm((prev) => ({
        ...prev,
        name: autoForm.name,
        symbol: autoForm.symbol,
        description: autoForm.description,
        prompt: autoForm.prompt,
      }));

      // Set the image from auto form if available
      if (autoForm.imageUrl && previewSetterRef.current) {
        previewSetterRef.current(autoForm.imageUrl);
        setCoinDropImageUrl(autoForm.imageUrl);
      }
    } else if (activeTab === FormTab.MANUAL) {
      setForm((prev) => ({
        ...prev,
        name: manualForm.name,
        symbol: manualForm.symbol,
        description: manualForm.description,
      }));

      // Set the image file if available
      if (manualForm.imageFile) {
        setImageFile(manualForm.imageFile);
      }
    }
  }, [activeTab]);

  // Update mode-specific state when main form changes
  useEffect(() => {
    if (activeTab === FormTab.AUTO) {
      setAutoForm((prev) => ({
        ...prev,
        name: form.name,
        symbol: form.symbol,
        description: form.description,
        prompt: form.prompt,
      }));
    } else if (activeTab === FormTab.MANUAL) {
      setManualForm((prev) => ({
        ...prev,
        name: form.name,
        symbol: form.symbol,
        description: form.description,
      }));
    }
  }, [form, activeTab]);

  // Keep SOL and percentage values in sync
  useEffect(() => {
    // Update buyValue when form.initialSol changes
    if (form.initialSol !== buyValue.toString()) {
      setBuyValue(form.initialSol);
    }
  }, [form.initialSol]);

  // Handle tab switching
  const handleTabChange = (tab: FormTab) => {
    // Save current form values to appropriate mode-specific state
    if (activeTab === FormTab.AUTO && tab !== FormTab.AUTO) {
      setAutoForm((prev) => ({
        ...prev,
        name: form.name,
        symbol: form.symbol,
        description: form.description,
        prompt: form.prompt,
      }));
    } else if (activeTab === FormTab.MANUAL && tab !== FormTab.MANUAL) {
      setManualForm((prev) => ({
        ...prev,
        name: form.name,
        symbol: form.symbol,
        description: form.description,
        imageFile: imageFile,
      }));
    }

    // When switching to AUTO or MANUAL, clear any imported token data
    if (tab === FormTab.AUTO || tab === FormTab.MANUAL) {
      localStorage.removeItem("import_token_data");
      setHasStoredToken(false);
    }

    // When switching to Manual mode, clear the image regardless of previous tab
    if (tab === FormTab.MANUAL) {
      // Clear the imageFile state
      setImageFile(null);
      // Clear the preview in FormImageInput
      if (previewSetterRef.current) {
        previewSetterRef.current(null);
      }
      setCoinDropImageUrl(null);
    }

    setActiveTab(tab);

    // Save tab to localStorage
    localStorage.setItem(TAB_STATE_KEY, tab);

    // Reset token generation status when switching away from AUTO
    if (tab !== FormTab.AUTO) {
      setHasGeneratedToken(false);
    }

    // Clear errors
    setErrors({
      name: "",
      symbol: "",
      description: "",
      prompt: "",
      initialSol: "",
      userPrompt: "",
      importAddress: "",
      percentage: "",
    });
  };

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

    // Validate initialSol
    if (field === "initialSol" && value) {
      const numValue = parseFloat(value);
      if (numValue < 0 || numValue > MAX_INITIAL_SOL) {
        setErrors((prev) => ({
          ...prev,
          initialSol: `Max initial SOL is ${MAX_INITIAL_SOL}`,
        }));
      } else {
        setErrors((prev) => ({
          ...prev,
          initialSol: "",
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

    // Use the useCreateToken hook to create the token on-chain
    await createTokenOnChainAsync({
      tokenMetadata: _tokenMetadata,
      metadataUrl: _metadataUrl,
      mintKeypair,
    });

    // Return the mint address as transaction ID
    const txId = mintKeypair.publicKey.toString();
    console.log("Token created on-chain with mint address:", txId);
    return txId;
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

      // Get auth token from localStorage with quote handling
      const authToken = getAuthToken();

      // Prepare headers
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      // Step 1: Generate metadata with user's prompt
      console.log("Requesting metadata generation...");
      const response = await fetch(env.apiUrl + "/api/generate-metadata", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          prompt: userPrompt,
          fields: ["name", "symbol", "description", "prompt"],
        }),
      });

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

      // Also update autoForm
      setAutoForm((prev) => ({
        ...prev,
        name: data.metadata.name,
        symbol: data.metadata.symbol,
        description: data.metadata.description,
        prompt: data.metadata.prompt,
        concept: userPrompt,
      }));

      // Set the prompt text so it can be reused
      if (promptFunctions.setPrompt) {
        console.log(
          "Setting promptFunctions.setPrompt with:",
          data.metadata.prompt,
        );
        promptFunctions.setPrompt(data.metadata.prompt);
      } else {
        console.warn("promptFunctions.setPrompt is not available");
      }

      if (promptFunctions.onPromptChange) {
        console.log(
          "Calling promptFunctions.onPromptChange with:",
          data.metadata.prompt,
        );
        promptFunctions.onPromptChange(data.metadata.prompt);
      } else {
        console.warn("promptFunctions.onPromptChange is not available");
      }

      // Step 2: Generate image with the generated prompt
      console.log(
        "Requesting image generation with prompt:",
        data.metadata.prompt,
      );

      // Temporarily set the generating state
      setIsGenerating(true);
      setGeneratingField("prompt");

      const imageResponse = await fetch(env.apiUrl + "/api/generate", {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({
          prompt: data.metadata.prompt,
          type: "image",
        }),
      });

      if (!imageResponse.ok) {
        console.error(
          "Image generation API returned an error:",
          await imageResponse.text(),
        );
        throw new Error("Failed to generate image for token");
      }

      const imageData = (await imageResponse.json()) as GenerateImageResponse;

      if (!imageData.success || !imageData.mediaUrl) {
        console.error("Invalid image data:", imageData);
        throw new Error("Image generation API returned invalid data");
      }

      console.log("Successfully generated image URL:", imageData.mediaUrl);

      // Convert image URL to File object
      try {
        console.log("Fetching image blob from URL");
        const imageBlob = await fetch(imageData.mediaUrl).then((r) => {
          if (!r.ok)
            throw new Error(
              `Failed to fetch image: ${r.status} ${r.statusText}`,
            );
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

        // Update autoForm with the image URL
        setAutoForm((prev) => ({
          ...prev,
          imageUrl: previewUrl,
        }));

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

      // Set hasGeneratedToken to true after successful generation
      setHasGeneratedToken(true);

      console.log(
        "=== Token generation from prompt completed successfully ===",
      );
    } catch (error) {
      console.error("Error generating from prompt:", error);
      // Reset generating state in case of error
      setIsGenerating(false);
      setGeneratingField(null);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to generate token from prompt. Please try again.",
      );
    } finally {
      setIsProcessingPrompt(false);
    }
  }, [
    userPrompt,
    setErrors,
    setIsProcessingPrompt,
    setForm,
    setAutoForm,
    promptFunctions,
    setImageFile,
    setCoinDropImageUrl,
    setIsGenerating,
    setGeneratingField,
    previewSetterRef,
    hasCreatedUrlFromImage,
    createTokenOnChainAsync,
  ]);

  // Import token from address
  const importTokenFromAddress = async () => {
    // Validate the address
    if (!isValidTokenAddress(form.importAddress)) {
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
      // Ensure wallet is connected
      if (!publicKey) {
        throw new Error("Wallet not connected");
      }

      // Get auth token from localStorage with quote handling
      const authToken = getAuthToken();

      // Prepare headers
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      try {
        // Fetch token data from a special search endpoint that can find any token
        const response = await fetch(`${env.apiUrl}/api/search-token`, {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({
            mint: form.importAddress,
            requestor: publicKey ? publicKey.toString() : "",
          }),
        });

        // Check if the request was successful
        if (!response.ok) {
          // First try to parse error from response
          try {
            const errorData = (await response.json()) as { error?: string };
            if (errorData.error) {
              throw new Error(errorData.error);
            }
          } catch (parseError) {
            // If we can't parse the error, show a more friendly message
            if (response.status === 404) {
              throw new Error(
                "The token doesn't exist or doesn't have metadata.",
              );
            } else {
              throw new Error(
                `Server error (${response.status}): Unable to retrieve token data.`,
              );
            }
          }
        }

        const tokenData = (await response.json()) as TokenSearchData;

        // Store token data in localStorage for later use
        localStorage.setItem("import_token_data", JSON.stringify(tokenData));
        setHasStoredToken(true);

        // Populate the form with token data
        setForm((prev) => ({
          ...prev,
          name: tokenData.name || form.importAddress.slice(0, 8),
          symbol: tokenData.symbol || "TOKEN",
          description: tokenData.description || "Imported token",
          links: {
            ...prev.links,
            twitter: tokenData.twitter || "",
            telegram: tokenData.telegram || "",
            website: tokenData.website || "",
            discord: tokenData.discord || "",
          },
        }));

        // Set token image if available
        if (tokenData.image) {
          if (previewSetterRef.current) {
            previewSetterRef.current(tokenData.image);
          }
          setCoinDropImageUrl(tokenData.image);
        }

        // Check if the current wallet is authorized to create this token
        const isCreatorWallet =
          tokenData.isCreator !== undefined
            ? tokenData.isCreator
            : (tokenData.updateAuthority &&
                tokenData.updateAuthority === publicKey.toString()) ||
              (tokenData.creators &&
                tokenData.creators.includes(publicKey.toString()));

        // Success message - ready to register
        const message = !isCreatorWallet
          ? "Development Mode: You can register this token without being the creator wallet."
          : "Token data loaded successfully. You can now register this token.";

        setImportStatus({
          type: "success",
          message,
        });
      } catch (fetchError) {
        console.error("API Error:", fetchError);

        setImportStatus({
          type: "error",
          message:
            fetchError instanceof Error
              ? fetchError.message
              : "Failed to import token",
        });
      }
    } catch (error) {
      console.error("Error importing token:", error);
      setImportStatus({
        type: "error",
        message:
          error instanceof Error ? error.message : "Failed to import token",
      });
    } finally {
      setIsImporting(false);
    }
  };

  // Function to validate a token address (Solana address is 32-44 characters, base58)
  const isValidTokenAddress = (address: string): boolean => {
    if (!address || address.trim().length < 32 || address.trim().length > 44) {
      return false;
    }

    // Check if it's valid base58 (Solana addresses use base58)
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
    return base58Regex.test(address.trim());
  };

  // Handle paste in the import address field
  const handleImportAddressPaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
  ) => {
    const pastedText = e.clipboardData.getData("text");

    if (!isValidTokenAddress(pastedText)) {
      // Prevent default paste if invalid
      e.preventDefault();

      setErrors((prev) => ({
        ...prev,
        importAddress:
          "Invalid token address format. Please check and try again.",
      }));

      return false;
    }

    // Clear any previous errors when pasting valid address
    setErrors((prev) => ({
      ...prev,
      importAddress: "",
    }));

    return true;
  };

  // Check if form is valid
  const isFormValid =
    !!form.name &&
    !!form.symbol &&
    !!form.description &&
    !errors.name &&
    !errors.symbol &&
    !errors.description &&
    !errors.initialSol;

  // Update coinDropImageUrl directly when we have a preview URL
  const handlePreviewChange = useCallback((previewUrl: string | null) => {
    setCoinDropImageUrl(previewUrl);
  }, []);

  // Function to generate all fields
  const generateAll = useCallback(
    async (
      setPrompt?: ((prompt: string) => void) | null,
      onPromptChange?: ((prompt: string) => void) | null,
    ) => {
      try {
        setIsGenerating(true);
        setGeneratingField("name,symbol,description,prompt");

        // Get auth token from localStorage with quote handling
        const authToken = getAuthToken();

        // Prepare headers
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (authToken) {
          headers["Authorization"] = `Bearer ${authToken}`;
        }

        // Get a pre-generated token
        const response = await fetch(env.apiUrl + "/api/pre-generated-token", {
          method: "GET",
          headers,
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Failed to get pre-generated token");
        }

        const data = (await response.json()) as PreGeneratedTokenResponse;
        const { token } = data;

        // Store token ID for later use when creating
        if (token.id) {
          setCurrentPreGeneratedTokenId(token.id);
        }

        // Update forms with generated data
        setForm((prev) => ({
          ...prev,
          name: token.name,
          symbol: token.ticker,
          description: token.description,
          prompt: token.prompt,
        }));

        // Update auto form
        setAutoForm((prev) => ({
          ...prev,
          name: token.name,
          symbol: token.ticker,
          description: token.description,
          prompt: token.prompt,
          concept: token.prompt,
        }));

        // Set user prompt
        setUserPrompt(token.prompt);

        // Set the prompt text so it can be reused
        if (setPrompt) setPrompt(token.prompt);
        if (onPromptChange) onPromptChange(token.prompt);

        // If we have an image URL, use it directly
        if (token.image) {
          // Transform R2 URLs to use local endpoint if needed
          let imageUrl = token.image;
          if (imageUrl.includes("r2.dev")) {
            // Extract the filename from the R2 URL
            const filename = imageUrl.split("/").pop();
            // Use local endpoint instead
            imageUrl = `${env.apiUrl}/api/image/${filename}`;
          }

          const imageBlob = await fetch(imageUrl).then((r) => r.blob());
          const imageFile = new File([imageBlob], "generated-image.png", {
            type: "image/png",
          });
          setImageFile(imageFile);

          // Create a preview URL
          const previewUrl = URL.createObjectURL(imageBlob);
          setCoinDropImageUrl(previewUrl);
          setAutoForm((prev) => ({
            ...prev,
            imageUrl: previewUrl,
          }));

          // Update preview in FormImageInput
          if (previewSetterRef.current) {
            previewSetterRef.current(previewUrl);
          }
        } else {
          // If no image, generate one using the prompt
          const imageResponse = await fetch(env.apiUrl + "/api/generate", {
            method: "POST",
            headers,
            credentials: "include",
            body: JSON.stringify({
              prompt: token.prompt,
              type: "image",
            }),
          });

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

          // Create a preview URL
          const previewUrl = URL.createObjectURL(imageBlob);
          setCoinDropImageUrl(previewUrl);
          setAutoForm((prev) => ({
            ...prev,
            imageUrl: previewUrl,
          }));

          // Update preview in FormImageInput
          if (previewSetterRef.current) {
            previewSetterRef.current(previewUrl);
          }
        }

        // Set token as generated
        setHasGeneratedToken(true);
      } catch (error) {
        console.error("Error generating metadata:", error);
        toast.error(
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

  // Submit form to backend
  const submitFormToBackend = async () => {
    try {
      setIsSubmitting(true);

      // Ensure wallet is connected
      if (!publicKey) {
        throw new Error("Wallet not connected");
      }

      // Check if we're working with imported token data - ONLY do this check for IMPORT tab
      const storedTokenData = localStorage.getItem("import_token_data");
      if (storedTokenData && activeTab === FormTab.IMPORT) {
        try {
          const tokenData = JSON.parse(storedTokenData);

          console.log("Processing imported token:", tokenData);
          console.log("Current wallet:", publicKey?.toString());

          // Check if the current wallet has permission to create this token
          // In dev mode, skip this check and allow any wallet to register
          const isCreatorNow =
            (tokenData.updateAuthority &&
              tokenData.updateAuthority === publicKey.toString()) ||
            (tokenData.creators &&
              tokenData.creators.includes(publicKey.toString()));

          console.log("Creator wallet check result:", isCreatorNow);
          console.log("Token update authority:", tokenData.updateAuthority);
          console.log("Token creators:", tokenData.creators);

          // if (!isCreatorNow) {
          //   throw new Error(
          //     "You need to connect with the token's creator wallet to register it",
          //   );
          // }

          // For imported tokens, create a token entry in the database
          console.log(
            "Creating token entry for imported token:",
            tokenData.mint,
          );

          // Show coin drop animation
          setShowCoinDrop(true);

          // Get auth token from localStorage with quote handling
          const authToken = getAuthToken();

          // Prepare headers
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };

          if (authToken) {
            headers["Authorization"] = `Bearer ${authToken}`;
          }

          // Create token record via API
          const createResponse = await fetch(env.apiUrl + "/api/create-token", {
            method: "POST",
            headers,
            credentials: "include",
            body: JSON.stringify({
              tokenMint: tokenData.mint,
              mint: tokenData.mint,
              name: form.name,
              symbol: form.symbol,
              description: form.description,
              twitter: form.links.twitter,
              telegram: form.links.telegram,
              website: form.links.website,
              discord: form.links.discord,
              agentLink: "",
              imageUrl: tokenData.image || "",
              metadataUrl: tokenData.metadataUri || "",
              // Include the import flag to indicate this is an imported token
              imported: true,
            }),
          });

          if (!createResponse.ok) {
            const errorData = (await createResponse.json()) as {
              error?: string;
            };
            throw new Error(errorData.error || "Failed to create token entry");
          }

          // Clear imported token data from localStorage
          localStorage.removeItem("import_token_data");
          setHasStoredToken(false);

          // Trigger confetti to celebrate successful registration
          if (window.createConfettiFireworks) {
            window.createConfettiFireworks();
          }

          // Redirect to token page
          navigate(`/token/${tokenData.mint}`);
          return;
        } catch (error) {
          console.error("Error handling imported token:", error);
          if (error instanceof Error) {
            throw error; // Re-throw if it's a permission error
          }
        }
      }

      // For AUTO and MANUAL tabs, we proceed with the regular token creation flow
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
        initialSol: parseFloat(form.initialSol) || 0,
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

      // If we have a pre-generated token ID, mark it as used and remove duplicates
      if (currentPreGeneratedTokenId && activeTab === FormTab.AUTO) {
        try {
          console.log(
            "Marking pre-generated token as used:",
            currentPreGeneratedTokenId,
          );

          // Get auth token from localStorage with quote handling
          const authToken = getAuthToken();

          // Prepare headers
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };

          if (authToken) {
            headers["Authorization"] = `Bearer ${authToken}`;
          }

          // Mark the token as used and delete any other tokens with the same name or ticker
          await fetch(env.apiUrl + "/api/mark-token-used", {
            method: "POST",
            headers,
            credentials: "include",
            body: JSON.stringify({
              id: currentPreGeneratedTokenId,
              name: form.name,
              ticker: form.symbol,
              concept: activeTab === FormTab.AUTO ? userPrompt : null,
            }),
          });

          console.log(
            "Successfully marked token as used and removed duplicates",
          );
        } catch (error) {
          console.error("Error marking pre-generated token as used:", error);
          // Continue with token creation even if this fails
        }
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

        // Trigger confetti to celebrate successful minting
        if (window.createConfettiFireworks) {
          window.createConfettiFireworks();
        }
      } catch (waitError) {
        console.error("Error waiting for token creation:", waitError);
        // We still continue to the token page even if this fails
        console.warn("Continuing despite token creation confirmation failure");
      }

      // Clear imported token data from localStorage if it exists
      localStorage.removeItem("import_token_data");
      setHasStoredToken(false);

      // Redirect to token page using the mint public key
      navigate(`/token/${tokenMint}`);
    } catch (error) {
      console.error("Error creating token:", error);
      toast.error(
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

    // Validate SOL balance - skip this check for imported tokens in dev mode
    if (isAuthenticated && insufficientBalance && !(activeTab === FormTab.IMPORT)) {
      newErrors.initialSol =
        "Insufficient SOL balance (need 0.05 SOL for fees)";
      toast.error("You don't have enough SOL to create this token");
    }

    // Check if there are any errors
    if (
      newErrors.name ||
      newErrors.symbol ||
      newErrors.description ||
      newErrors.initialSol
    ) {
      setErrors(newErrors);
      return;
    }

    // Submit form to backend
    await submitFormToBackend();
  };

  // Fetch pre-generated token on mount for Auto mode
  useEffect(() => {
    const loadPreGeneratedToken = async () => {
      if (activeTab === FormTab.AUTO && !hasGeneratedToken) {
        try {
          setIsGenerating(true);
          setGeneratingField("name,symbol,description,prompt");

          // Get auth token from localStorage with quote handling
          const authToken = getAuthToken();

          // Prepare headers
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };

          if (authToken) {
            headers["Authorization"] = `Bearer ${authToken}`;
          }

          // Get a pre-generated token
          const response = await fetch(
            env.apiUrl + "/api/pre-generated-token",
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

          // Store token ID for later use when creating
          if (token.id) {
            setCurrentPreGeneratedTokenId(token.id);
          }

          // Set user prompt with the concept
          setUserPrompt(token.prompt);

          // Update forms with generated data
          setForm((prev) => ({
            ...prev,
            name: token.name,
            symbol: token.ticker,
            description: token.description,
            prompt: token.prompt,
          }));

          setAutoForm((prev) => ({
            ...prev,
            name: token.name,
            symbol: token.ticker,
            description: token.description,
            prompt: token.prompt,
            concept: token.prompt,
          }));

          // Set prompt functions
          if (promptFunctions.setPrompt)
            promptFunctions.setPrompt(token.prompt);
          if (promptFunctions.onPromptChange)
            promptFunctions.onPromptChange(token.prompt);

          // If token has an image, load it
          if (token.image) {
            // Transform R2 URLs to use local endpoint if needed
            let imageUrl = token.image;
            if (imageUrl.includes("r2.dev")) {
              // Extract the filename from the R2 URL
              const filename = imageUrl.split("/").pop();
              // Use local endpoint instead
              imageUrl = `${env.apiUrl}/api/image/${filename}`;
            }

            const imageBlob = await fetch(imageUrl).then((r) => r.blob());
            const imageFile = new File([imageBlob], "pre-generated-image.png", {
              type: "image/png",
            });

            // Set image file
            setImageFile(imageFile);

            // Create preview URL
            const previewUrl = URL.createObjectURL(imageBlob);
            setCoinDropImageUrl(previewUrl);
            setAutoForm((prev) => ({
              ...prev,
              imageUrl: previewUrl,
            }));

            // Update preview in FormImageInput
            if (previewSetterRef.current) {
              previewSetterRef.current(previewUrl);
            }
          }

          // Set the token as generated since we loaded it from pre-generated
          setHasGeneratedToken(true);
        } catch (error) {
          console.error("Error loading pre-generated token:", error);
        } finally {
          setIsGenerating(false);
          setGeneratingField(null);
        }
      }
    };

    loadPreGeneratedToken();
  }, [
    activeTab,
    promptFunctions.setPrompt,
    promptFunctions.onPromptChange,
    hasGeneratedToken,
  ]);

  // When switching tabs, ensure image state is properly separated
  useEffect(() => {
    if (activeTab === FormTab.AUTO) {
      // When switching to Auto, load the auto image
      if (autoForm.imageUrl && previewSetterRef.current) {
        previewSetterRef.current(autoForm.imageUrl);
        setCoinDropImageUrl(autoForm.imageUrl);
      }
    } else if (activeTab === FormTab.MANUAL) {
      // Manual mode should always start clean (image was already cleared in handleTabChange)
      // Only set the image if manualForm has an imageFile from previous Manual session
      if (manualForm.imageFile) {
        const manualImageUrl = URL.createObjectURL(manualForm.imageFile);
        setImageFile(manualForm.imageFile);
        if (previewSetterRef.current) {
          previewSetterRef.current(manualImageUrl);
        }
        setCoinDropImageUrl(manualImageUrl);
      } else {
        // Ensure everything is cleared for Manual mode
        setImageFile(null);
        if (previewSetterRef.current) {
          previewSetterRef.current(null);
        }
        setCoinDropImageUrl(null);
      }
    } else if (activeTab === FormTab.IMPORT && hasStoredToken) {
      // Import tab should only set image from stored token data
      const storedTokenData = localStorage.getItem("import_token_data");
      if (storedTokenData) {
        try {
          const tokenData = JSON.parse(storedTokenData) as TokenSearchData;
          // Set the image if available
          if (tokenData.image && previewSetterRef.current) {
            previewSetterRef.current(tokenData.image);
            setCoinDropImageUrl(tokenData.image);
          }
        } catch (error) {
          console.error("Error parsing stored token data:", error);
        }
      }
    }
  }, [activeTab, autoForm.imageUrl, manualForm.imageFile, hasStoredToken]);

  // Update manualForm when imageFile changes in Manual mode
  useEffect(() => {
    if (activeTab === FormTab.MANUAL && imageFile) {
      setManualForm((prev) => ({
        ...prev,
        imageFile: imageFile,
      }));
    }
  }, [imageFile, activeTab]);

  // Helper function to calculate token amount based on SOL input using bonding curve formula
  const calculateTokensFromSol = (solAmount: number): number => {
    // Convert SOL to lamports
    const lamports = solAmount * 1e9;

    // Using constant product formula: (dx * y) / (x + dx)
    // where x is virtual reserves, y is token supply, dx is input SOL amount
    const tokenAmount =
      (lamports * TOKEN_SUPPLY) / (VIRTUAL_RESERVES + lamports);

    return tokenAmount;
  };

  // Helper function to calculate percentage of total supply for a given token amount
  const calculatePercentage = (tokenAmount: number): number => {
    return (tokenAmount / TOKEN_SUPPLY) * 100;
  };

  // Cleanup object URLs when component unmounts or when URL changes
  useEffect(() => {
    // Store created URLs for cleanup
    const createdUrls: string[] = [];

    return () => {
      // Cleanup any object URLs to prevent memory leaks
      createdUrls.forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, []);

  // Additional cleanup for autoForm.imageUrl when it changes
  useEffect(() => {
    const prevImageUrl = autoForm.imageUrl;

    return () => {
      // Only cleanup URLs that look like object URLs (blob:)
      if (prevImageUrl && prevImageUrl.startsWith("blob:")) {
        URL.revokeObjectURL(prevImageUrl);
      }
    };
  }, [autoForm.imageUrl]);

  return (
    <div className="flex flex-col items-center justify-center">
      {showCoinDrop && <CoinDrop imageUrl={coinDropImageUrl || undefined} />}

      <form
        className="py-4 px-auto w-full max-w-2xl flex font-dm-mono flex-col m-auto gap-1 justify-center"
        onSubmit={handleSubmit}
      >
        {/* Tabs Navigation */}
        <div className="flex items-center md:justify-between flex-col md:flex-row gap-8 mx-auto w-full mb-2">
          <div className="flex shrink-0 items-center gap-4">
            <img
              src="/create/dicelogo.svg"
              alt="Coin Machine"
              className="w-24 h-24"
            />
            <img
              src="/create/coinmachine.svg"
              alt="Coin Machine"
              className="w-48 h-24"
            />
          </div>
          <div className="flex justify-between items-center text-lg w-full shrink">
            {Object.values(FormTab).map((tab, _) => (
              <button
                type="button"
                className={`uppercase font-satoshi font-medium transition-colors duration-200 cursor-pointer select-none ${
                  activeTab === tab
                    ? "border-[#03FF24] text-[#03FF24] font-bold"
                    : "border-transparent text-neutral-400 hover:text-white"
                }`}
                onClick={() => handleTabChange(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Auto Tab Content */}
        {activeTab === FormTab.AUTO && (
          <>
            <div className="flex">
              <input
                type="text"
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                placeholder="Enter a concept like 'a halloween token about arnold schwarzenegger'"
                className="flex-1 truncate my-2 p-0 border-b-2 pb-2.5 border-b-[#03FF24] text-white bg-transparent focus:outline-none focus:border-b-white"
              />
              <button
                type="button"
                onClick={generateFromPrompt}
                disabled={isProcessingPrompt || !userPrompt.trim()}
                className="p-0 transition-colors disabled:opacity-50"
              >
                <img
                  src={
                    isProcessingPrompt
                      ? "/create/generating.svg"
                      : "/create/generateup.svg"
                  }
                  alt="Generate"
                  className="w-40 mb-2"
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
                  onDragStart={(e) => {
                    e.preventDefault();
                    const img = e.target as HTMLImageElement;
                    if (!isProcessingPrompt) {
                      img.src = "/create/generateup.svg";
                    }
                  }}
                  onMouseOut={(e) => {
                    e.preventDefault();
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
          </>
        )}

        {/* Import Tab Content */}
        {activeTab === FormTab.IMPORT && (
          <div>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex flex-row">
                  <input
                    type="text"
                    value={form.importAddress || ""}
                    onChange={(e) =>
                      handleChange("importAddress", e.target.value)
                    }
                    alt="Generate"
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
                    onDragStart={(e) => {
                      e.preventDefault();
                      const img = e.target as HTMLImageElement;
                      if (!isProcessingPrompt) {
                        img.src = "/create/generateup.svg";
                      }
                    }}
                    onMouseOut={(e) => {
                      e.preventDefault();
                      const img = e.target as HTMLImageElement;
                      if (!isProcessingPrompt) {
                        img.src = "/create/generateup.svg";
                      }
                    }}
                    onPaste={handleImportAddressPaste}
                    placeholder="Enter any Solana token address (mint)"
                    className="flex-1 truncate my-2 p-0 border-b-2 pb-2.5 border-b-[#03FF24] text-white bg-transparent focus:outline-none focus:border-b-white"
                  />
                  <button
                    type="button"
                    onClick={importTokenFromAddress}
                    disabled={
                      isImporting ||
                      !form.importAddress?.trim() ||
                      !isValidTokenAddress(form.importAddress)
                    }
                    className="p-0 transition-colors disabled:opacity-50"
                  >
                    <img
                      src={
                        isImporting
                          ? "/create/importing.svg"
                          : "/create/importup.svg"
                      }
                      alt="Import"
                      className="w-40 mb-2"
                      onMouseDown={(e) => {
                        const img = e.target as HTMLImageElement;
                        if (!isImporting) {
                          img.src = "/create/importdown.svg";
                        }
                      }}
                      onMouseUp={(e) => {
                        const img = e.target as HTMLImageElement;
                        if (!isImporting) {
                          img.src = "/create/importup.svg";
                        }
                      }}
                      onDragStart={(e) => {
                        e.preventDefault();
                        const img = e.target as HTMLImageElement;
                        if (!isImporting) {
                          img.src = "/create/importup.svg";
                        }
                      }}
                      onMouseOut={(e) => {
                        e.preventDefault();
                        const img = e.target as HTMLImageElement;
                        if (!isImporting) {
                          img.src = "/create/importup.svg";
                        }
                      }}
                    />
                  </button>
                </div>
                {errors.importAddress && (
                  <div className="text-red-500 text-sm">
                    {errors.importAddress}
                  </div>
                )}

                {/* Enhanced import status with clearer guidance */}
                {importStatus && (
                  <div
                    className={`p-3 border rounded-md mb-4 ${
                      importStatus.type === "error"
                        ? "border-red-500 bg-red-950/20 text-red-400"
                        : importStatus.type === "warning"
                          ? "border-yellow-500 bg-yellow-950/20 text-yellow-400"
                          : "border-green-500 bg-green-950/20 text-[#03FF24]"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      {importStatus.type === "success" ? (
                        <Icons.Check className="w-5 h-5 flex-shrink-0" />
                      ) : importStatus.type === "warning" ? (
                        <Icons.Warning className="w-5 h-5 flex-shrink-0" />
                      ) : (
                        <Icons.XCircle className="w-5 h-5 flex-shrink-0" />
                      )}
                      <span className="font-medium">
                        {importStatus.message}
                      </span>
                    </div>

                    {/* Additional guidance for different status types */}
                    {importStatus.type === "warning" && (
                      <div className="mt-2 ml-7 text-sm text-yellow-300/80">
                        <p>
                          The token details have been loaded below. Please
                          connect with the token's creator wallet to register
                          it.
                        </p>
                        {publicKey && (
                          <p className="mt-1">
                            Current wallet:{" "}
                            <span className="font-mono">
                              {publicKey.toString().slice(0, 4) +
                                "..." +
                                publicKey.toString().slice(-4)}
                            </span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Remove this section as it's redundant with the form below */}
                {hasStoredToken && !importStatus && (
                  <div className="mt-4 p-3 border border-neutral-700 rounded-md bg-black/30">
                    <h3 className="text-white font-medium mb-2">
                      Imported Token Details
                    </h3>
                    <p className="text-neutral-400 text-sm mb-4">
                      These details have been loaded from the token's metadata.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Two-column layout for form fields and image (conditionally shown based on tab) */}
        {(activeTab === FormTab.MANUAL ||
          (activeTab === FormTab.AUTO && hasGeneratedToken) ||
          (activeTab === FormTab.IMPORT && hasStoredToken)) && (
          <div className="grid gap-4">
            {/* Form fields - REMOVE THE NAME AND TICKER INPUTS, KEEP ONLY DESCRIPTION */}
            <div className="flex flex-col gap-3">
              {/* Image with overlay inputs for name/ticker */}
              <FormImageInput
                onChange={(file) => {
                  if (activeTab === FormTab.MANUAL) {
                    setImageFile(file);
                    setManualForm((prev) => ({
                      ...prev,
                      imageFile: file,
                    }));
                  }
                }}
                onPromptChange={handlePromptChange}
                isGenerating={isGenerating && generatingField === "prompt"}
                setIsGenerating={setIsGenerating}
                setGeneratingField={setGeneratingField}
                onPromptFunctionsChange={(setPrompt, onPromptChange) => {
                  setPromptFunctions({ setPrompt, onPromptChange });
                }}
                onPreviewChange={handlePreviewChange}
                imageUrl={
                  activeTab === FormTab.AUTO
                    ? autoForm.imageUrl
                    : activeTab === FormTab.IMPORT && hasStoredToken
                      ? coinDropImageUrl
                      : undefined
                }
                onDirectPreviewSet={(setter) => {
                  previewSetterRef.current = setter;
                }}
                activeTab={activeTab}
                nameValue={form.name}
                onNameChange={(value) => handleChange("name", value)}
                tickerValue={form.symbol}
                onTickerChange={(value) => handleChange("symbol", value)}
                key={`image-input-${activeTab}`} // Force complete rerender on tab change
              />
            </div>

            {activeTab === FormTab.IMPORT && (
              <span
                className={`bg-transparent text-white text-xl font-bold focus:outline-none px-1 py-0.5 mb-4`}
              >
                {form.description}
              </span>
            )}

            {activeTab !== FormTab.IMPORT && (
              <FormTextArea
                value={form.description}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  handleChange("description", e.target.value)
                }
                label="Description"
                minRows={1}
                placeholder="Description"
                maxLength={2000}
                error={errors.description}
                onClick={() => generateAll()}
                isLoading={isGenerating && generatingField === "description"}
              />
            )}

            {/* Hide Buy section when in IMPORT tab */}
            {activeTab !== FormTab.IMPORT && (
              <div className="flex flex-col gap-3 justify-end uppercase">
                <div className="flex flex-row gap-3 justify-end uppercase">
                  <span className="text-white text-xl font-medium relative group">
                    Buy
                    <span className="inline-block ml-1 cursor-help">
                      <Icons.Info className="h-4 w-4 text-[#8c8c8c] hover:text-white" />
                      <div className="absolute hidden group-hover:block right-0 bottom-8 p-3 text-xs normal-case bg-black border border-neutral-800 rounded-md shadow-lg z-10">
                        <p className="text-white mb-2">
                          Choose how much of the token you want to buy on
                          launch:
                        </p>
                        <p className="text-neutral-400 mb-1">
                          • <b>SOL</b>: Amount of SOL to invest
                        </p>
                        <p className="text-neutral-400 mb-2">
                          • <b>%</b>: Percentage of token supply to acquire
                        </p>
                        <div className="border-t border-neutral-800 pt-2 mt-1">
                          <p className="text-neutral-400 text-xs">
                            Total token supply: {TOKEN_SUPPLY.toLocaleString()}{" "}
                            tokens
                          </p>
                          <p className="text-neutral-400 text-xs mt-1">
                            Pricing follows a bonding curve, your percentage
                            increases with more SOL.
                          </p>
                        </div>
                      </div>
                    </span>
                  </span>
                  <div className="flex flex-col items-end">
                    <div className="relative">
                      <input
                        type="number"
                        value={buyValue}
                        onChange={(e) => {
                          let value = e.target.value.replace(" SOL", "");
                          value = value.replace(/[^\d.]/g, "");
                          const decimalCount = (value.match(/\./g) || [])
                            .length;
                          if (decimalCount > 1) {
                            value = value.replace(/\.+$/, "");
                          }
                          const parts = value.split(".");
                          let wholePart = parts[0];
                          let decimalPart = parts[1] || "";
                          if (wholePart.length > 2) {
                            wholePart = wholePart.slice(0, 2);
                          }
                          if (decimalPart.length > 2) {
                            decimalPart = decimalPart.slice(0, 2);
                          }
                          value = decimalPart
                            ? `${wholePart}.${decimalPart}`
                            : wholePart;
                          if (value.length > 5) {
                            value = value.slice(0, 5);
                          }
                          const numValue = parseFloat(value);
                          if (
                            value !== "" &&
                            !isNaN(numValue) &&
                            numValue > maxInputSol
                          ) {
                            value = maxInputSol.toString();
                          }

                          handleChange("initialSol", value);
                          setBuyValue(value);
                        }}
                        min="0"
                        max={maxInputSol.toString()}
                        step="0.01"
                        className="w-26 pr-10 text-white text-xl font-medium text-right inline border-b border-b-[#424242] focus:outline-none focus:border-white"
                      />

                      <span className="absolute right-0 text-white text-xl font-medium">
                        SOL
                      </span>
                    </div>
                    {/* {solPrice && Number(buyValue) > 0 && (
                        <div className="text-right text-xs text-neutral-400 mt-1">
                          ≈ ${solValueUsd} USD
                        </div>
                      )} */}
                  </div>
                </div>
                {parseFloat(buyValue as string) > 0 && (
                  <div className="text-right text-xs text-neutral-400">
                    ≈{" "}
                    {calculatePercentage(
                      calculateTokensFromSol(parseFloat(buyValue as string)),
                    ).toFixed(2)}{" "}
                    % of supply
                  </div>
                )}

                {/* Balance information */}
                <div className="mt-2 text-right text-xs text-neutral-400">
                  {/* Your balance:{" "}
                    {balance?.data?.formattedBalance?.toFixed(2) || "0.00"} SOL */}
                  {isAuthenticated && isFormValid && insufficientBalance && (
                    <div className="text-red-500 mt-1">
                      You don't have enough SOL in your wallet
                    </div>
                  )}
                  {Number(buyValue) === maxInputSol &&
                    maxInputSol < MAX_INITIAL_SOL && (
                      <div className="text-yellow-500 mt-1">
                        Maximum amount based on your balance
                      </div>
                    )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Launch Button - Only shown if form is valid or in appropriate tabs */}
        {(activeTab === FormTab.MANUAL ||
          (activeTab === FormTab.AUTO && hasGeneratedToken) ||
          (activeTab === FormTab.IMPORT && hasStoredToken)) && (
          <div className="flex flex-col items-center gap-3">
            <button
              type="submit"
              className="p-0 transition-colors cursor-pointer disabled:opacity-50 select-none"
              disabled={
                !isFormValid ||
                isSubmitting ||
                !isAuthenticated ||
                insufficientBalance
              }
            >
              <img
                src={
                  isSubmitting
                    ? "/create/launching.svg"
                    : "/create/launchup.svg"
                }
                alt="Launch"
                className="h-32 pr-4 mb-4 select-none pointer-events-none"
                onMouseDown={(e) => {
                  const img = e.target as HTMLImageElement;
                  if (!isSubmitting) {
                    img.src = "/create/launchdown.svg";
                  } else {
                    img.src = "/create/launching.svg";
                  }
                }}
                onMouseUp={(e) => {
                  const img = e.target as HTMLImageElement;
                  img.src = "/create/launchup.svg";
                }}
                onDragStart={(e) => {
                  e.preventDefault();
                  const img = e.target as HTMLImageElement;
                  img.src = "/create/launchup.svg";
                }}
                onMouseOut={(e) => {
                  e.preventDefault();
                  const img = e.target as HTMLImageElement;
                  img.src = "/create/launchup.svg";
                }}
              />
            </button>

            {isAuthenticated && !isFormValid && (
              <p className="text-red-500 text-center text-sm">
                Please fill in all required fields
              </p>
            )}
            {!isAuthenticated && (
              <p className="text-red-500 text-center text-sm">
                Please connect your wallet to create a token
              </p>
            )}
          </div>
        )}
      </form>
    </div>
  );
};

export default Create;
