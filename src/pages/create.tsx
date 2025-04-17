import CoinDrop from "@/components/coindrop";
import { EmptyState } from "@/components/empty-state";
import useAuthentication from "@/hooks/use-authentication";
import { useCreateToken } from "@/hooks/use-create-token";
import { useSolBalance } from "@/hooks/use-token-balance";
import { HomepageTokenSchema } from "@/hooks/use-tokens";
import { getAuthToken } from "@/utils/auth";
import { env, isDevnet } from "@/utils/env";
import { getSocket } from "@/utils/socket";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "react-toastify";
import { Icons } from "../components/icons";
import { TokenMetadata } from "../types/form.type";
// Import the worker using Vite's ?worker syntax
import InlineVanityWorker from "@/workers/vanityWorker?worker&inline"; // Added import

const MAX_INITIAL_SOL = isDevnet ? 2.8 : 28;
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

// Vanity Generator Types (Copied from testing.tsx)
type VanityResult = {
  publicKey: string;
  secretKey: Keypair; // Store the Keypair object directly
};
type WorkerMessage =
  | {
      type: "found";
      workerId: number;
      publicKey: string;
      secretKey: number[]; // Worker sends array
      validated: boolean;
    }
  | { type: "progress"; workerId: number; count: number }
  | { type: "error"; workerId: number; error: string };

// Base58 characters
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]+$/;

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
              className="mt-4 text-[#03FF24] px-4 py-2 font-bold transition-colors"
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
                      onChange={(e) => onTickerChange(e.target.value)}
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

  // Create minimal metadata if none provided
  const basicMetadata = {
    name: metadata.name,
    symbol: metadata.symbol,
    description: metadata.description || `${metadata.name} token`,
    image: "pending", // Will be updated with actual URL
    external_url: metadata.links.website || "",
    properties: {
      files: [{ type: "image/png", uri: "pending" }],
      category: "image",
      creators: [{ address: metadata.mintAuthority, share: 100 }],
    },
  };

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

  const result = (await response.json()) as UploadResponse;

  // Verify metadata URL exists, if not create a fallback
  if (!result.metadataUrl || result.metadataUrl === "undefined") {
    console.warn("No metadata URL returned from server, using fallback URL");

    // Generate a fallback URL using the mint address or a UUID
    result.metadataUrl = `https://metadata.auto.fun/${metadata.tokenMint || crypto.randomUUID()}.json`;
  }

  return result;
};

const waitForTokenCreation = async (mint: string, timeout = 80_000) => {
  return new Promise<void>((resolve, reject) => {
    const socket = getSocket();

    const newTokenListener = (token: unknown) => {
      const { mint: newMint } = HomepageTokenSchema.parse(token);
      if (newMint === mint) {
        clearTimeout(timerId);
        socket.off("newToken", newTokenListener);
        resolve();
      }
    };

    socket.emit("subscribeGlobal");
    socket.on("newToken", newTokenListener);

    const timerId = setTimeout(() => {
      socket.off("newToken", newTokenListener);
      reject(new Error("Token creation timed out"));
    }, timeout);
  });
};

// Main Form Component
export const Create = () => {
  // Define things for our page
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthentication();
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [solBalance, setSolBalance] = useState<number>(0);

  useEffect(() => {
    const checkBalance = async () => {
      if (publicKey) {
        const balance = await connection.getBalance(publicKey);
        setSolBalance(balance / LAMPORTS_PER_SOL);
      }
    };
    checkBalance();
  }, [publicKey, connection]);

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

  // --- Vanity Generator State --- (Copied and adapted)
  const [vanitySuffix, setVanitySuffix] = useState("FUN"); // Default FUN
  const [isGeneratingVanity, setIsGeneratingVanity] = useState(false);
  const [vanityResult, setVanityResult] = useState<VanityResult | null>(null);
  const [displayedPublicKey, setDisplayedPublicKey] = useState<string>(
    "--- Generate a vanity address ---",
  ); // Placeholder
  const [suffixError, setSuffixError] = useState<string | null>(null);
  const workersRef = useRef<Worker[]>([]);
  const startTimeRef = useRef<number | null>(null);
  const displayUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Optional: For displaying stats
  // const [totalAttempts, setTotalAttempts] = useState(0);
  // const [generationRate, setGenerationRate] = useState(0);
  // const attemptBatchRef = useRef<number>(0);

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
    initialSol: "0",
    links: {
      twitter: "",
      telegram: "",
      website: "",
      discord: "",
      farcaster: "",
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

  const balance = useSolBalance();

  const maxUserSol = balance ? Math.max(0, Number(balance) - 0.05) : 0;
  // Use the smaller of MAX_INITIAL_SOL or the user's max available SOL
  const maxInputSol = Math.min(MAX_INITIAL_SOL, maxUserSol);

  const insufficientBalance =
    activeTab === FormTab.IMPORT
      ? false
      : Number(buyValue) > Number(balance || 0) - 0.05;

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
    // Reset vanity state when switching tabs
    stopVanityGeneration();
    setVanityResult(null);
    setDisplayedPublicKey("--- Generate a vanity address ---");
    setSuffixError(null);
  }, [activeTab]); // Added stopVanityGeneration

  // Automatically start vanity generation when in non-import tab
  useEffect(() => {
    // Only auto-start if:
    // 1. Not on Import tab
    // 2. Not already generating
    // 3. Don't have a result yet
    // 4. Have a valid suffix (default or user-entered)
    if (
      activeTab !== FormTab.IMPORT &&
      !isGeneratingVanity &&
      !vanityResult &&
      vanitySuffix.trim() &&
      !suffixError
    ) {
      // Short delay to allow UI to render first
      const timeoutId = setTimeout(() => {
        startVanityGeneration();
      }, 500);

      return () => clearTimeout(timeoutId);
    }
    // Note: We're ignoring the linter warnings about dependencies here
  }, [activeTab, isGeneratingVanity, vanityResult, vanitySuffix, suffixError]);

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
          [field]: `${field.charAt(0) + field.slice(1)} is required`,
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
    tokenMetadata: TokenMetadata,
    mintKeypair: Keypair,
    metadataUrl: string,
  ) => {
    try {
      if (!publicKey) {
        throw new Error("Wallet not connected");
      }

      if (!signTransaction) {
        throw new Error("Wallet doesn't support signing");
      }

      // Ensure we have a valid metadata URL
      if (!metadataUrl || metadataUrl === "undefined" || metadataUrl === "") {
        console.warn(
          "No metadata URL provided, generating minimal metadata...",
        );

        // Create minimal metadata and upload it
        const minimalMetadata = {
          name: tokenMetadata.name,
          symbol: tokenMetadata.symbol,
          description: tokenMetadata.description || "",
          image: tokenMetadata.imageBase64 ? "pending" : "",
          external_url: tokenMetadata.links.website || "",
        };

        // Upload minimal metadata
        const uploadResult = await uploadImage(tokenMetadata);
        metadataUrl = uploadResult.metadataUrl;
      }

      console.log("Creating token on-chain with parameters:", {
        name: tokenMetadata.name,
        symbol: tokenMetadata.symbol,
        metadataUrl: metadataUrl,
        mintKeypair: {
          publicKey: mintKeypair.publicKey.toString(),
          secretKeyLength: mintKeypair.secretKey.length,
        },
      });

      // Use the useCreateToken hook to create the token on-chain
      const tx = await createTokenOnChainAsync({
        tokenMetadata,
        metadataUrl,
        mintKeypair,
      });

      // Handle transaction cancellation
      if (!tx) {
        // Trigger the flush animation
        if (window.flushCoins) {
          window.flushCoins();
        }
        return;
      }

      const txId = mintKeypair.publicKey.toString();
      return txId;
    } catch (error) {
      console.error("Error creating token on-chain:", error);

      // Check if it's a deserialization error (0x66 / 102)
      if (
        error instanceof Error &&
        (error.message.includes("custom program error: 0x66") ||
          error.message.includes("InstructionDidNotDeserialize") ||
          error.message.includes("Error Number: 102"))
      ) {
        console.error(
          "Transaction failed due to instruction deserialization error.",
        );
        console.error(
          "This is likely due to parameter mismatch with the on-chain program.",
        );

        // Trigger the flush animation on error
        if (window.flushCoins) {
          window.flushCoins();
        }

        throw new Error(
          "Failed to create token: instruction format mismatch with on-chain program. Please try again or contact support.",
        );
      }

      // Trigger the flush animation on error
      if (window.flushCoins) {
        window.flushCoins();
      }

      throw new Error("Failed to create token on-chain");
    }
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
        promptFunctions.setPrompt(data.metadata.prompt);
      } else {
        console.warn("promptFunctions.setPrompt is not available");
      }

      if (promptFunctions.onPromptChange) {
        promptFunctions.onPromptChange(data.metadata.prompt);
      } else {
        console.warn("promptFunctions.onPromptChange is not available");
      }

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
        console.error("Invalid image data:", imageData);
        throw new Error("Image generation API returned invalid data");
      }

      try {
        const imageBlob = await fetch(imageData.mediaUrl).then((r) => {
          if (!r.ok)
            throw new Error(
              `Failed to fetch image: ${r.status} ${r.statusText}`,
            );
          return r.blob();
        });
        const imageFile = new File([imageBlob], "generated-image.png", {
          type: "image/png",
        });

        // Reset the flag before setting the new image file
        hasCreatedUrlFromImage.current = false;
        setImageFile(imageFile);
        const previewUrl = URL.createObjectURL(imageBlob);
        setCoinDropImageUrl(previewUrl);

        // Update autoForm with the image URL
        setAutoForm((prev) => ({
          ...prev,
          imageUrl: previewUrl,
        }));

        // Directly update the preview in FormImageInput
        if (previewSetterRef.current) {
          previewSetterRef.current(previewUrl);
        } else {
          console.warn("previewSetterRef.current is not available");
        }
      } catch (imageError) {
        console.error("Error processing generated image:", imageError);
        throw new Error("Failed to process the generated image");
      } finally {
        setIsGenerating(false);
        setGeneratingField(null);
      }

      // Set hasGeneratedToken to true after successful generation
      setHasGeneratedToken(true);
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
    return BASE58_REGEX.test(address.trim());
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

  // --- Vanity Generation Functions --- (Copied and adapted)
  const stopVanityGeneration = useCallback(() => {
    if (!isGeneratingVanityRef.current) return; // Use ref to check if actually running
    setIsGeneratingVanity(false); // Set state immediately
    workersRef.current.forEach((worker) => {
      try {
        worker.postMessage("stop"); // Attempt graceful stop
      } catch (e) {
        console.warn("Couldn't send stop message to worker", e);
      }
      // Terminate after a delay, ensures state update propagates
      setTimeout(() => {
        try {
          worker.terminate();
        } catch (e) {
          /* ignore */
        }
      }, 100);
    });
    workersRef.current = [];
    startTimeRef.current = null;
    if (displayUpdateIntervalRef.current) {
      clearInterval(displayUpdateIntervalRef.current);
      displayUpdateIntervalRef.current = null;
    }
  }, []); // Removed isGeneratingVanity and vanityResult dependency

  const startVanityGeneration = useCallback(() => {
    const suffix = vanitySuffix.trim();
    setVanityResult(null); // <-- Add this line to clear the previous result
    setDisplayedPublicKey("Generating..."); // Reset display immediately

    let currentError = null;

    // 1. Validation
    if (!suffix) {
      currentError = "Suffix cannot be empty.";
    } else if (suffix.length > 5) {
      currentError = "Suffix cannot be longer than 5 characters.";
    } else if (!BASE58_REGEX.test(suffix)) {
      currentError = "Suffix contains invalid Base58 characters.";
    }

    // 2. Warnings
    if (!currentError) {
      if (suffix.length === 5) {
        currentError = "Warning: 5-letter suffix may take 24+ hours to find!";
        toast.warn(currentError);
      } else if (suffix.length === 4) {
        currentError = "Note: 4-letter suffix may take some time to find.";
        toast.info(currentError);
      }
    }

    setSuffixError(currentError);
    if (
      currentError &&
      !currentError.startsWith("Warning") &&
      !currentError.startsWith("Note")
    ) {
      return; // Stop if it's a blocking error
    }

    // Stop previous generation if any
    stopVanityGeneration();

    setIsGeneratingVanity(true);

    const numWorkers = navigator.hardwareConcurrency || 4;
    startTimeRef.current = Date.now();
    workersRef.current = [];

    // Start rolling display effect
    const base58Chars =
      "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const generateRandomString = (length: number) => {
      let result = "";
      for (let i = 0; i < length; i++) {
        result += base58Chars.charAt(
          Math.floor(Math.random() * base58Chars.length),
        );
      }
      return result;
    };

    displayUpdateIntervalRef.current = setInterval(() => {
      // Generate a random prefix matching Solana address length minus suffix length
      const prefixLength = 44 - suffix.length;
      const randomPrefix = generateRandomString(prefixLength);
      setDisplayedPublicKey(`${randomPrefix}${suffix}`);
    }, 100); // Update display frequently

    for (let i = 0; i < numWorkers; i++) {
      try {
        const worker = new InlineVanityWorker();
        worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
          // Check generation state *inside* the handler
          if (!isGeneratingVanityRef.current) return;

          const data = event.data;
          switch (data.type) {
            case "found":
              if (data.validated) {
                // Construct Keypair from secret key array
                const secretKeyUint8Array = new Uint8Array(data.secretKey);
                if (secretKeyUint8Array.length !== 64) {
                  console.error(
                    "Worker sent invalid secret key length:",
                    secretKeyUint8Array.length,
                  );
                  // Handle error - maybe try next result? For now, stop.
                  stopVanityGeneration();
                  setSuffixError("Received invalid key from generator.");
                  return;
                }
                const foundKeypair = Keypair.fromSecretKey(secretKeyUint8Array);

                // Double-check the derived public key matches
                if (foundKeypair.publicKey.toString() !== data.publicKey) {
                  console.error(
                    "Public key mismatch between worker and derived key!",
                  );
                  setSuffixError("Key validation mismatch.");
                  stopVanityGeneration(); // Stop on critical error
                  return;
                }

                setVanityResult({
                  publicKey: data.publicKey,
                  secretKey: foundKeypair,
                });
                setDisplayedPublicKey(data.publicKey); // Show final result
                stopVanityGeneration(); // Stop all workers
              } else {
                console.warn(
                  `Worker ${data.workerId} found potential match but validation failed.`,
                );
                // Keep searching
              }
              break;
            case "progress":
              // Optional: Update stats
              // attemptBatchRef.current += data.count;
              break;
            case "error":
              console.error(`Worker ${data.workerId} error: ${data.error}`);
              // Optional: Stop all if one worker fails critically?
              // stopVanityGeneration();
              break;
          }
        };

        worker.onerror = (err: any) => {
          console.error(`Worker ${i} fatal error:`, err);
          setSuffixError(`Worker ${i} failed: ${err.message || "Unknown"}`);
          workersRef.current = workersRef.current.filter((w) => w !== worker);
          if (
            workersRef.current.length === 0 &&
            isGeneratingVanityRef.current
          ) {
            setSuffixError("All vanity generators failed!");
            stopVanityGeneration();
          }
          try {
            worker.terminate();
          } catch (e) {
            /* ignore */
          }
        };

        worker.postMessage({ suffix, workerId: i });
        workersRef.current.push(worker);
      } catch (workerError) {
        console.error(`Failed to create worker ${i}:`, workerError);
        setSuffixError(`Failed to start generator worker ${i}.`);
      }
    }

    if (workersRef.current.length === 0) {
      setSuffixError("Could not start any vanity generator workers.");
      setIsGeneratingVanity(false);
      setDisplayedPublicKey("--- Error starting generator ---");
      if (displayUpdateIntervalRef.current) {
        clearInterval(displayUpdateIntervalRef.current);
        displayUpdateIntervalRef.current = null;
      }
      startTimeRef.current = null;
    }
  }, [vanitySuffix, stopVanityGeneration]); // Removed isGeneratingVanity as we use ref

  // Use a ref for isGeneratingVanity inside callbacks to avoid stale closures
  const isGeneratingVanityRef = useRef(isGeneratingVanity);
  useEffect(() => {
    isGeneratingVanityRef.current = isGeneratingVanity;
  }, [isGeneratingVanity]);

  // submitFormToBackend import
  const submitImportFormToBackend = async () => {
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

          // Check if the current wallet has permission to create this token
          // In dev mode, skip this check and allow any wallet to register
          const isCreatorNow =
            (tokenData.updateAuthority &&
              tokenData.updateAuthority === publicKey.toString()) ||
            (tokenData.creators &&
              tokenData.creators.includes(publicKey.toString()));

          // if (!isCreatorNow) {
          //   throw new Error(
          //     "You need to connect with the token's creator wallet to register it"
          //   );
          // }

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
              imageUrl: tokenData.image || "",
              metadataUrl: tokenData.metadataUri || "",
              creator:
                tokenData.updateAuthority ||
                tokenData.creators ||
                tokenData.mintAuthority ||
                "",
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
    } catch (error) {
      console.error("Error submitting import form:", error);
    } finally {
      setIsSubmitting(false);
    }
  };
  // Submit form to backend
  const submitFormToBackend = async () => {
    try {
      // --- Check for Vanity Keypair --- START
      if (!vanityResult?.publicKey || !vanityResult?.secretKey) {
        toast.error("Please generate a vanity address first.");
        return;
      }
      const mintKeypair = vanityResult.secretKey;
      const tokenMint = vanityResult.publicKey;

      setIsCreating(true);
      setCreationStage("initializing");
      setCreationStep("Preparing token creation...");

      setIsSubmitting(true);

      if (!publicKey) {
        throw new Error("Wallet not connected");
      }

      // Check if we're working with imported token data - ONLY do this check for IMPORT tab
      const storedTokenData = localStorage.getItem("import_token_data");
      if (storedTokenData && activeTab === FormTab.IMPORT) {
        try {
          const tokenData = JSON.parse(storedTokenData);
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

      // --- Fetch Vanity Keypair from Backend --- REMOVED
      // let tokenMint: string; // Defined above from vanityResult
      // let mintKeypair: Keypair; // Defined above from vanityResult
      // try { ... } catch (error) { ... }
      // --- Fetch Vanity Keypair from Backend --- REMOVED

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
        },
        imageBase64: media_base64 || null,
        tokenMint, // Use client-generated mint address
        decimals: 9,
        supply: 1000000000000000,
        freezeAuthority: publicKey?.toBase58() || "",
        mintAuthority: publicKey?.toBase58() || "",
      };

      // First, uploadImage if needed
      let imageUrl = "";
      let metadataUrl = "";

      // Show coin drop with the image we have
      setShowCoinDrop(true);

      if (media_base64) {
        try {
          const uploadResult = await uploadImage({
            ...tokenMetadata,
            tokenMint,
          });
          imageUrl = uploadResult.imageUrl;
          metadataUrl = uploadResult.metadataUrl;

          // Verify metadata URL is valid
          if (!metadataUrl || metadataUrl === "undefined") {
            console.error(
              "Upload succeeded but metadata URL is invalid:",
              metadataUrl,
            );
            // Fallback: generate a unique metadata URL based on mint address
            metadataUrl = `https://metadata.auto.fun/${tokenMint}.json`;
          }

          // Update the coin drop image to use the final uploaded URL
          if (imageUrl) {
            setCoinDropImageUrl(imageUrl);
          }

        } catch (uploadError) {
          console.error("Error uploading image:", uploadError);
          throw new Error("Failed to upload token image");
        }
      } else if (activeTab === FormTab.IMPORT && coinDropImageUrl) {
        // For imported tokens, use the image URL directly
        imageUrl = coinDropImageUrl;

        // Generate a metadata URL if none exists
        if (!metadataUrl) {
          metadataUrl = `https://metadata.auto.fun/${tokenMint}.json`;
          console.log(
            "Using default metadata URL for imported token:",
            metadataUrl,
          );
        }
      } else if (!media_base64 && !metadataUrl) {
        // No image provided, generate minimal metadata URL
        metadataUrl = `https://metadata.auto.fun/${tokenMint}.json`;
      }

      // Double-check that we have a valid metadata URL
      if (!metadataUrl) {
        console.warn("No metadata URL set, using fallback");
        metadataUrl = `https://metadata.auto.fun/${tokenMint}.json`;
      }

      // Create token on-chain
      try {
        console.log("Creating token on-chain...");
        // Pass the client-generated mintKeypair
        await createTokenOnChain(tokenMetadata, mintKeypair, metadataUrl);
      } catch (onChainError) {
        console.error("Error creating token on-chain:", onChainError);

        // Format a user-friendly error message
        let errorMessage = "Failed to create token on-chain";

        if (onChainError instanceof Error) {
          // Handle deserialization errors specially
          if (
            onChainError.message.includes("instruction format mismatch") ||
            onChainError.message.includes("InstructionDidNotDeserialize") ||
            onChainError.message.includes("custom program error: 0x66")
          ) {
            errorMessage =
              "The token creation transaction was rejected by the blockchain. This may be due to a temporary program upgrade. Please try again in a few minutes.";

            // Try again with different parameters
            try {
              // Wait a moment before retrying
              await new Promise((resolve) => setTimeout(resolve, 1000));
              toast.info(
                "Retrying token creation with different parameters...",
              );

              // Modify token metadata for retry
              const retryMetadata = {
                ...tokenMetadata,
                decimals: 9, // Ensure decimals is 9
                supply: 1000000000000000, // Set explicit supply
              };
              // Pass the client-generated mintKeypair again
              await createTokenOnChain(retryMetadata, mintKeypair, metadataUrl);
            } catch (retryError) {
              console.error("Retry also failed:", retryError);
              // Continue to error handling below
              throw new Error(errorMessage);
            }
          } else {
            // Include original error message for other types of errors
            errorMessage = `Failed to create token on-chain: ${onChainError.message}`;
          }
        }

        throw new Error(errorMessage);
      }

      // If we have a pre-generated token ID, mark it as used and remove duplicates
      if (currentPreGeneratedTokenId && activeTab === FormTab.AUTO) {
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
        } catch (error) {
          console.error("Error marking pre-generated token as used:", error);
          // Continue with token creation even if this fails
        }
      }

      await waitForTokenCreation(tokenMint);

      // Trigger confetti to celebrate successful minting
      if (window.createConfettiFireworks) {
        window.createConfettiFireworks();
      }

      // Clear imported token data from localStorage if it exists
      localStorage.removeItem("import_token_data");
      setHasStoredToken(false);

      navigate(`/token/${tokenMint}`); // Use client-generated mint

      // After transaction confirmation
      setCreationStage("confirming");
      setCreationStep("Waiting for wallet confirmation...");

      // After token creation
      setCreationStage("creating");
      setCreationStep("Creating token on-chain...");

      // After token record creation
      setCreationStage("validating");
      setCreationStep("Validating transaction...");

      // After validation
      setCreationStage("finalizing");
      setCreationStep("Finalizing token setup...");
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
      // Ensure coin drop is hidden on error
      setShowCoinDrop(false);
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

    // Validate vanity keypair generation for non-import tabs
    if (activeTab !== FormTab.IMPORT && (!vanityResult || isGeneratingVanity)) {
      toast.error("Please generate and wait for a vanity address.");
      return;
    }

    // Validate SOL balance - skip this check for imported tokens
    if (
      isAuthenticated &&
      insufficientBalance &&
      !(activeTab === FormTab.IMPORT)
    ) {
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
    if (activeTab !== FormTab.IMPORT) {
      await submitFormToBackend();
    } else {
      await submitImportFormToBackend();
    }
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
            if (
              imageUrl.includes("r2.dev") &&
              env.apiUrl?.includes("localhost") &&
              env.apiUrl?.includes("127.0.0.1")
            ) {
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

  // Cleanup vanity workers on component unmount
  useEffect(() => {
    // Store the refs in variables before returning the cleanup function
    const workersToTerminate = workersRef.current;
    const timerToClear = displayUpdateIntervalRef.current;

    return () => {
      workersToTerminate.forEach((worker) => {
        try {
          worker.postMessage("stop");
        } catch (e) {
          /* ignore */
        }
        try {
          worker.terminate();
        } catch (e) {
          /* ignore */
        }
      });
      if (timerToClear) {
        clearInterval(timerToClear);
      }
      // Clear the refs directly - this part is fine
      workersRef.current = [];
      displayUpdateIntervalRef.current = null;
    };
  }, []); // Empty dependency array ensures this runs only on mount and unmount

  const canLaunch = () => {
    if (!publicKey) return false;
    if (activeTab === FormTab.IMPORT) {
      // For import, we just need the form data loaded
      return hasStoredToken && !isImporting;
    }
    // For Auto/Manual, need valid form, generated vanity key, and enough SOL
    const initialSol = parseFloat(form.initialSol) || 0;
    const hasEnoughSol = solBalance >= initialSol + 0.01; // Add buffer for mint cost
    const hasVanityKey = !!vanityResult?.publicKey && !isGeneratingVanity;
    return (
      hasEnoughSol &&
      isFormValid && // Checks name, symbol, desc, initialSol errors
      hasVanityKey &&
      !Object.values(errors).some(
        (error) =>
          error &&
          !["userPrompt", "importAddress", "percentage"].includes(error), // Ignore non-blocking errors
      )
    );
  };

  // Add handler for coin drop cancellation
  const handleCoinDropCancel = useCallback(() => {
    setShowCoinDrop(false);
    setIsSubmitting(false); // Also reset submitting state
    setIsCreating(false); // Reset creating state
    setCreationStage("initializing"); // Reset creation stage
    setCreationStep("");
    // Consider stopping vanity generation if cancelled here?
    // stopVanityGeneration();
  }, []);

  const [isCreating, setIsCreating] = useState(false);
  const [creationStep, setCreationStep] = useState<string>("");
  const [creationStage, setCreationStage] = useState<
    "initializing" | "confirming" | "creating" | "validating" | "finalizing"
  >("initializing");

  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setRotation((prev) => prev + 90);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Add effect to listen for log messages and update state
  useEffect(() => {
    const originalConsoleLog = console.log;
    console.log = (...args) => {
      originalConsoleLog(...args);

      // Check for specific log messages to update state
      const message = args[0];
      if (typeof message === "string") {
        if (message.includes("Token created on-chain successfully")) {
          setCreationStage("validating");
          setCreationStep("Token created successfully, validating...");
        } else if (
          message.includes("Waiting for token creation confirmation")
        ) {
          setCreationStage("validating");
          setCreationStep("Waiting for blockchain confirmation...");
        } else if (message.includes("waiting for creation from token mint")) {
          setCreationStage("validating");
          setCreationStep("Confirming token creation on-chain...");
        } else if (message.includes("Creating token on-chain...")) {
          setCreationStage("creating");
          setCreationStep("Creating token on-chain...");
        }
      }
    };

    return () => {
      console.log = originalConsoleLog;
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center">
      {showCoinDrop && (
        <CoinDrop
          imageUrl={coinDropImageUrl || undefined}
          onCancel={handleCoinDropCancel}
        />
      )}

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
                key={tab} // Added key
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
                  className="w-24 ml-2"
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
                    alt="Generate" // This alt doesn't make sense here
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
                      className="w-32 mb-2"
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
                    className={`p-3 border  mb-4 ${
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
                {/* {hasStoredToken && !importStatus && ( ... )} */}
              </div>
            </div>
          </div>
        )}

        {/* Form Section (Image, Desc, Vanity, Buy, Launch) */}
        {(activeTab === FormTab.MANUAL ||
          (activeTab === FormTab.AUTO && hasGeneratedToken) ||
          (activeTab === FormTab.IMPORT && hasStoredToken)) && (
          <div className="grid gap-4">
            {/* Image & Core Fields */}
            <div className="flex flex-col gap-3">
              {/* Image with overlay inputs */}
              <FormImageInput
                onChange={(file) => {
                  if (activeTab === FormTab.MANUAL) {
                    setImageFile(file);
                    setManualForm((prev) => ({ ...prev, imageFile: file }));
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
                key={`image-input-${activeTab}`} // Force rerender on tab change
              />

              {/* Description Field */}
              {activeTab === FormTab.IMPORT ? (
                <span
                  className={`bg-transparent text-white text-xl font-bold focus:outline-none px-1 py-0.5 mb-4`}
                >
                  {form.description}
                </span>
              ) : (
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
                  onClick={() =>
                    generateAll(
                      promptFunctions.setPrompt,
                      promptFunctions.onPromptChange,
                    )
                  } // Pass prompt fns
                  isLoading={isGenerating && generatingField === "description"}
                />
              )}
            </div>

            {/* Vanity Address Section (Only for Auto/Manual) */}
            {activeTab !== FormTab.IMPORT && (
              <div className="flex flex-col gap-2">
                <label className="text-whitem py-1.5 uppercase text-sm font-medium tracking-wider">
                  Generate Contract Address
                </label>
                {/* Display Area */}
                <div className="font-mono text-xs md:text-lg lg:text-xl break-all min-h-[2.5em] flex items-center justify-center">
                  <span className="mr-2">
                    {isGeneratingVanity ? (
                      <span className="animate-pulse">
                        {displayedPublicKey.slice(0, -vanitySuffix.length)}
                        <strong>
                          {displayedPublicKey.slice(-vanitySuffix.length)}
                        </strong>
                      </span>
                    ) : vanityResult ? (
                      <span className="text-green-400">
                        {displayedPublicKey.slice(0, -vanitySuffix.length)}
                        <strong>
                          {displayedPublicKey.slice(-vanitySuffix.length)}
                        </strong>
                      </span>
                    ) : (
                      <span className="text-neutral-500">
                        {displayedPublicKey.slice(0, -vanitySuffix.length)}
                        <strong>
                          {displayedPublicKey.slice(-vanitySuffix.length)}
                        </strong>
                      </span>
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-2 mx-auto">
                  <input
                    type="text"
                    value={vanitySuffix}
                    onChange={(e) => setVanitySuffix(e.target.value)} // Force uppercase
                    placeholder="FUN"
                    maxLength={5}
                    className={`bg-autofun-background-input w-20 py-1.5 px-2 ${suffixError && !suffixError.startsWith("Warning") && !suffixError.startsWith("Note") ? "border-red-500" : ""} text-white text-center font-mono focus:outline-none focus:border-white disabled:opacity-50`}
                    disabled={isGeneratingVanity}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      stopVanityGeneration(); // Stop existing workers first
                      // Use a small timeout to allow state updates from stop to settle
                      setTimeout(() => {
                        startVanityGeneration(); // Then start with the new suffix
                      }, 50);
                    }}
                  >
                    <img
                      src={
                        isProcessingPrompt
                          ? "/create/generating.svg"
                          : "/create/generateup.svg"
                      }
                      alt="Generate"
                      className="w-24 ml-2"
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
                <p className="mx-auto text-center text-xs text-neutral-500 mt-1">
                  Choose a custom suffix
                  <br />
                  Longer suffixes are slower to generate
                </p>

                {/* Error/Warning Display */}
                {suffixError && (
                  <div
                    className={`text-xs ${suffixError.startsWith("Warning") || suffixError.startsWith("Note") ? "text-yellow-400" : "text-red-500"} mt-1`}
                  >
                    {suffixError}
                  </div>
                )}
              </div>
            )}

            {/* Buy Section (Hide for Import) */}
            {activeTab !== FormTab.IMPORT && (
              <div className="flex flex-col gap-3 justify-end uppercase">
                <div className="flex flex-row gap-3 justify-end uppercase">
                  <span className="text-white text-xl font-medium relative group">
                    Buy
                    <span className="inline-block ml-1 cursor-help">
                      <Icons.Info className="h-4 w-4 text-[#8c8c8c] hover:text-white" />
                      <div className="absolute hidden group-hover:block right-0 bottom-8 p-3 text-xs normal-case bg-black border border-neutral-800 shadow-lg z-10 w-64">
                        {" "}
                        {/* Added width */}
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
                        <div className="border-t border-neutral-800 pt-2 mt-1">
                          <p className="text-neutral-400 text-xs">
                            Maximum supply of 50% can be purchased prior to coin
                            launch
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
                            value = value.substring(0, value.lastIndexOf(".")); // Keep only first decimal
                          }
                          const parts = value.split(".");
                          let wholePart = parts[0] || "0"; // Default to 0 if empty
                          let decimalPart = parts[1] || "";

                          // Limit whole part length (e.g., 2 digits for SOL up to 99)
                          if (
                            wholePart.length >
                            String(Math.floor(MAX_INITIAL_SOL)).length
                          ) {
                            wholePart = wholePart.slice(
                              0,
                              String(Math.floor(MAX_INITIAL_SOL)).length,
                            );
                          }
                          // Limit decimal part length
                          if (decimalPart.length > 2) {
                            // Allow 2 decimal places
                            decimalPart = decimalPart.slice(0, 2);
                          }

                          value = decimalPart
                            ? `${wholePart}.${decimalPart}`
                            : wholePart;

                          // Final numeric check against maxInputSol
                          const numValue = parseFloat(value);
                          if (!isNaN(numValue)) {
                            if (numValue < 0) value = "0";
                            else if (numValue > maxInputSol)
                              value = maxInputSol.toString();
                          } else if (value !== "") {
                            value = "0"; // Reset invalid non-empty strings
                          }

                          handleChange("initialSol", value || "0"); // Ensure it's not empty string for state
                          setBuyValue(value); // Update local buyValue state
                        }}
                        min="0"
                        max={maxInputSol.toString()}
                        step="0.01"
                        className="w-26 pr-10 text-white text-xl font-medium text-right inline border-b border-b-[#424242] focus:outline-none focus:border-white bg-transparent" // Added bg-transparent
                      />

                      <span className="absolute right-0 top-0 bottom-0 flex items-center text-white text-xl font-medium pointer-events-none">
                        {" "}
                        {/* Adjusted positioning */}
                        SOL
                      </span>
                    </div>
                    {/* {solPrice && Number(buyValue) > 0 && ( ... )} */}
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
                  Balance: {solBalance?.toFixed(2) ?? "0.00"} SOL
                  {isAuthenticated && isFormValid && insufficientBalance && (
                    <div className="text-red-500 mt-1">
                      Insufficient SOL balance (need ~0.01 SOL for mint + buy
                      amount)
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

            {/* Launch Button */}
            <div className="flex flex-col items-center gap-3 mt-4">
              {" "}
              {/* Added margin-top */}
              <button
                type="submit"
                className="p-0 transition-colors cursor-pointer disabled:opacity-50 select-none"
                disabled={!canLaunch() || isSubmitting}
              >
                <img
                  src={
                    isSubmitting || isCreating // Show launching if submitting or creating
                      ? "/create/launching.svg"
                      : "/create/launchup.svg"
                  }
                  alt="Launch"
                  className="h-32 mb-4 select-none pointer-events-none" // Removed mouse handlers, handle state via disabled/src
                />
              </button>
              {/* Validation/Auth Messages */}
              {!isAuthenticated ? (
                <p className="text-red-500 text-center text-sm">
                  Please connect your wallet to create a token.
                </p>
              ) : !canLaunch() &&
                !isSubmitting &&
                activeTab !== FormTab.IMPORT ? ( // Show only if not launchable and not submitting
                <p className="text-red-500 text-center text-sm">
                  Please fill required fields, ensure sufficient SOL, and
                  generate a vanity address.
                </p>
              ) : !canLaunch() &&
                !isSubmitting &&
                activeTab === FormTab.IMPORT ? (
                <p className="text-red-500 text-center text-sm">
                  Please load token data via the import field above.
                </p>
              ) : null}
            </div>
          </div>
        )}
      </form>

      {/* Creation Loading Modal */}
      {isCreating && (
        <div className="fixed inset-0 flex items-center justify-center z-[60]">
          <div className="bg-[#1A1A1A]/80 p-6 shadow-lg max-w-md w-full">
            <div className="flex items-center flex-col gap-3">
              <div
                style={{
                  width: "128px",
                  height: "128px",
                  perspective: "1000px",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    position: "relative",
                    transformStyle: "preserve-3d",
                    transition: "transform 0.5s ease",
                    transform: `rotateY(${rotation}deg)`,
                  }}
                >
                  {/* Front face - left half */}
                  <div
                    style={{
                      position: "absolute",
                      width: "100%",
                      height: "100%",
                      backfaceVisibility: "hidden",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      overflow: "hidden",
                      transform: "rotateY(0deg) translateZ(64px)",
                    }}
                  >
                    <img
                      src="/logo_wide.svg"
                      alt="logo front"
                      style={{
                        height: "100%",
                        width: "256px",
                        objectFit: "cover",
                        objectPosition: "-3% 0",
                      }}
                    />
                  </div>

                  {/* Right face - right half */}
                  <div
                    style={{
                      position: "absolute",
                      width: "100%",
                      height: "100%",
                      backfaceVisibility: "hidden",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      overflow: "hidden",
                      transform: "rotateY(90deg) translateZ(64px)",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: "100%",
                        overflow: "hidden",
                        position: "relative",
                      }}
                    >
                      <img
                        src="/logo_wide.svg"
                        alt="logo right"
                        style={{
                          position: "absolute",
                          height: "100%",
                          width: "256px",
                          right: 0,
                          objectFit: "cover",
                          objectPosition: "100% 0",
                        }}
                      />
                    </div>
                  </div>

                  {/* Back face - left half */}
                  <div
                    style={{
                      position: "absolute",
                      width: "100%",
                      height: "100%",
                      backfaceVisibility: "hidden",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      overflow: "hidden",
                      transform: "rotateY(180deg) translateZ(64px)",
                    }}
                  >
                    <img
                      src="/logo_wide.svg"
                      alt="logo back"
                      style={{
                        height: "100%",
                        width: "256px",
                        objectFit: "cover",
                        objectPosition: "-3% 0",
                      }}
                    />
                  </div>

                  {/* Left face - right half */}
                  <div
                    style={{
                      position: "absolute",
                      width: "100%",
                      height: "100%",
                      backfaceVisibility: "hidden",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      overflow: "hidden",
                      transform: "rotateY(270deg) translateZ(64px)",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: "100%",
                        overflow: "hidden",
                        position: "relative",
                      }}
                    >
                      <img
                        src="/logo_wide.svg"
                        alt="logo left"
                        style={{
                          position: "absolute",
                          height: "100%",
                          width: "256px",
                          right: 0,
                          objectFit: "cover",
                          objectPosition: "100% 0",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <p className="font-dm-mono text-base text-autofun-text-secondary">
                {creationStep}
              </p>
              {creationStage === "confirming" && (
                <p className="font-dm-mono text-sm text-autofun-text-secondary/80">
                  Please confirm the transaction in your wallet
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default Create;
