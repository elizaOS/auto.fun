import { useWallet } from "@solana/wallet-adapter-react";
import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import Button from "../button";
import { useTokenBalance } from "@/hooks/use-token-balance";
import Loader from "../loader";
import CopyButton from "../copy-button";

// --- API Base URL ---
const API_BASE_URL = env.apiUrl || ""; // Ensure fallback

// Function to get the correct icon path based on the current tab
const getTabIconPath = (
  tabType: "Image" | "Video" | "Audio",
  currentTab: "Image" | "Video" | "Audio",
): string => {
  if (tabType === "Image") {
    return tabType === currentTab
      ? "/token/imageon.svg"
      : "/token/imageoff.svg";
  } else if (tabType === "Video") {
    return tabType === currentTab
      ? "/token/videoon.svg"
      : "/token/videooff.svg";
  } else {
    // Audio tab
    return tabType === currentTab
      ? "/token/musicon.svg"
      : "/token/musicoff.svg";
  }
};

// Additional imports for balance checking
import { env } from "@/utils/env";
import { Connection, PublicKey } from "@solana/web3.js";
import { Tooltip } from "react-tooltip";
import { fetchWithAuth } from "@/hooks/use-authentication";

// Storage keys for Twitter auth
const STORAGE_KEY = "twitter-oauth-token";
const PENDING_SHARE_KEY = "pending-twitter-share";
const OAUTH_REDIRECT_ORIGIN_KEY = "OAUTH_REDIRECT_ORIGIN"; // Key for storing the original path

// Types for Twitter authentication
type TwitterCredentials = {
  userId: string;
  // OAuth 2.0 (kept for potential future use or profile fetching)
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number; // Expiry for OAuth 2.0 token
  // OAuth 1.0a (Required for posting)
  oauth1Token?: string;
  oauth1TokenSecret?: string;
  username?: string;
  profileImageUrl?: string;
  screen_name?: string; // Often returned with OAuth 1.0a
};

type PendingShare = {
  imageData: string;
  tokenName: string;
  tokenSymbol: string;
};

// --- Expected API Response Types ---
interface TokenInfoResponse {
  name: string;
  ticker: string;
  description?: string;
  image?: string;
}

export default function CommunityTab() {
  type ICommunityTabs = "Image" | "Video" | "Audio";
  const [communityTab, setCommunityTab] = useState<ICommunityTabs>("Image");
  const [userPrompt, setUserPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [editableLyrics, setEditableLyrics] = useState<string | null>(null);
  const [isEditingLyrics, setIsEditingLyrics] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<
    "idle" | "processing" | "processed" | "failed"
  >("idle");
  const { publicKey } = useWallet();
  // Remove these older duplicate declarations
  // const [isSharing, setIsSharing] = useState(false);
  // const [shareError, setShareError] = useState<string | null>(null);
  // const [twitterCredentials, setTwitterCredentials] =
  //   useState<TwitterCredentials | null>(null);

  // const [hasGeneratedForToken, setHasGeneratedForToken] = useState(false);

  // Pregenerated images that were generated automatically for this token
  const [additionalImages, setAdditionalImages] = useState<string[]>([]);
  // const [isLoadingAdditionalImages, setIsLoadingAdditionalImages] =
  //   useState(false);
  const [placeholderImage, setPlaceholderImage] = useState<string | null>(null); // Stores URL of the currently displayed placeholder

  // Mode selection state
  const [generationMode, setGenerationMode] = useState<"fast" | "pro">("fast");

  // We can keep this for debugging but it's no longer the primary balance source
  // @ts-ignore
  const [manualTokenBalance, setManualTokenBalance] = useState<number | null>(
    null,
  );

  // --- Token Info State ---
  const [tokenInfo, setTokenInfo] = useState<{
    name: string;
    ticker: string;
    image?: string;
    description?: string;
  } | null>(null);

  // Get token mint from URL params with better fallback logic
  const { mint: urlTokenMint } = useParams<{ mint: string }>();
  const location = useLocation();

  // Extract token mint from URL if not found in params
  const [detectedTokenMint, setDetectedTokenMint] = useState<string | null>(
    null,
  );

  // Effect to detect token mint from various sources
  useEffect(() => {
    // First try from URL params (most reliable)
    if (urlTokenMint) {
      setDetectedTokenMint(urlTokenMint);
      return;
    }

    // If not in params, try to extract from pathname
    const pathMatch = location.pathname.match(/\/token\/([A-Za-z0-9]{32,44})/);
    if (pathMatch && pathMatch[1]) {
      setDetectedTokenMint(pathMatch[1]);
      return;
    }
  }, [urlTokenMint, location.pathname]);

  // Use detected token mint instead of directly from params
  const tokenMint = detectedTokenMint;

  // Fetch pregenerated images for this token
  useEffect(() => {
    const fetchAdditionalImages = async () => {
      if (!tokenMint || !API_BASE_URL) {
        return;
      }

      // setIsLoadingAdditionalImages(true);

      try {
        // Check for generated images in the server's R2 storage
        const response = await fetch(
          `${API_BASE_URL}/api/check-generated-images/${tokenMint}`,
        );

        if (response.ok) {
          const data = (await response.json()) as {
            hasImages?: boolean;
            count?: number;
            pattern?: string;
          };

          if (data.hasImages && data.count && data.count > 0) {
            // Build image URLs based on the pattern, using the API endpoint
            const imageUrls = [];
            const count = Math.min(data.count, 3); // Only use up to 3 images as placeholders
            for (let i = 1; i <= count; i++) {
              // If we're running locally, use the API endpoint
              if (
                API_BASE_URL.includes("localhost") ||
                API_BASE_URL.includes("127.0.0.1")
              ) {
                imageUrls.push(
                  `${API_BASE_URL}/api/image/generation-${tokenMint}-${i}.jpg`,
                );
              } else {
                // Otherwise, use the R2 public URL
                imageUrls.push(
                  `${env.s3PublicUrl}/generations/${tokenMint}/gen-${i}.jpg`,
                );
              }
            }

            setAdditionalImages(imageUrls);
          } else {
            setAdditionalImages([]);
          }
        } else {
          // If the API fails, don't try to guess
          setAdditionalImages([]);
        }
      } catch (error) {
        console.error("Error fetching additional images:", error);
        setAdditionalImages([]);
      } finally {
        // setIsLoadingAdditionalImages(false);
      }
    };

    fetchAdditionalImages();
  }, [tokenMint]);

  // Use the proper hook to get token balance AFTER tokenMint is declared
  const { tokenBalance } = useTokenBalance({ tokenId: tokenMint || "" });

  // --- Fetch Real Token Info & Agents ---
  useEffect(() => {
    const fetchTokenData = async () => {
      if (!tokenMint || !API_BASE_URL) {
        setTokenInfo(null);
        return;
      }

      try {
        const infoResponse = await fetch(
          `${API_BASE_URL}/api/token/${tokenMint}`,
        );
        if (!infoResponse.ok) {
          throw new Error(
            `Failed to fetch token info: ${infoResponse.statusText}`,
          );
        }
        const infoData = (await infoResponse.json()) as TokenInfoResponse;
        console.log("infoData", infoData);
        setTokenInfo(infoData);

        // Set the user prompt to the token's description if available
        if (infoData.description) {
          setUserPrompt(infoData.description);
        }
      } catch (error) {
        console.error("Error fetching token info:", error);
        setTokenInfo(null);
      }
    };

    fetchTokenData();
  }, [tokenMint]);
  // --- End Fetch Real Token Info & Agents ---

  // Check for Twitter credentials on mount
  useEffect(() => {
    if (!tokenMint) return;

    const storedCredentials = localStorage.getItem(STORAGE_KEY);
    if (storedCredentials) {
      try {
        const parsedCreds = JSON.parse(storedCredentials) as TwitterCredentials;
        // Check if *OAuth 1.0a* tokens exist, as they don't expire in the same way
        if (parsedCreds.oauth1Token && parsedCreds.oauth1TokenSecret) {
          console.log("Found valid OAuth 1.0a credentials.");
          setTwitterCredentials(parsedCreds);
        } else {
          console.warn("Stored credentials missing OAuth 1.0a tokens.");
          localStorage.removeItem(STORAGE_KEY); // Remove incomplete creds
        }
      } catch (error) {
        console.error("Failed to parse stored Twitter credentials", error);
        localStorage.removeItem(STORAGE_KEY);
      }
    }

    // Check for callback from Twitter OAuth (handles both 1.0a and 2.0 if needed)
    const urlParams = new URLSearchParams(window.location.search);
    const freshAuth = urlParams.get("fresh_auth") === "true";

    if (freshAuth) {
      const storedCredsAfterAuth = localStorage.getItem(STORAGE_KEY);
      if (storedCredsAfterAuth) {
        const parsedCreds = JSON.parse(
          storedCredsAfterAuth,
        ) as TwitterCredentials;
        setTwitterCredentials(parsedCreds); // Update state with potentially new creds
        console.log("Credentials updated after auth callback.");
      } else {
        console.error("No credentials found in storage after auth callback.");
      }

      // Check if we have a pending share to resume
      const pendingShareData = localStorage.getItem(PENDING_SHARE_KEY);
      if (pendingShareData && storedCredsAfterAuth) {
        // Need creds to proceed
        try {
          const share = JSON.parse(pendingShareData) as PendingShare;
          const creds = JSON.parse(storedCredsAfterAuth) as TwitterCredentials;

          if (creds.oauth1Token && creds.oauth1TokenSecret) {
            // Ensure we have 1.0a tokens now
            // Regenerate text & Open Modal
            setTimeout(() => {
              const regeneratedText = generateShareText({
                name: share.tokenName,
                ticker: share.tokenSymbol,
              });
              setModalShareText(regeneratedText);
              setImageForShareModal(share.imageData);
              setIsShareModalOpen(true);
              console.log("Resuming share via modal after auth.");
            }, 100);
          } else {
            console.error(
              "OAuth 1.0a tokens still missing after callback. Cannot resume share.",
            );
            toast.error(
              "Authentication incomplete. Please try connecting X again.",
            );
          }

          localStorage.removeItem(PENDING_SHARE_KEY);
        } catch (error) {
          console.error("Failed to process pending share", error);
          setShareError("Failed to process share after authentication.");
        }
      }

      // Clean up URL
      const currentUrl = new URL(window.location.href);
      if (currentUrl.searchParams.has("fresh_auth")) {
        currentUrl.searchParams.delete("fresh_auth");
      }
      // Also remove OAuth params if they exist (from 1.0a flow)
      currentUrl.searchParams.delete("oauth_token");
      currentUrl.searchParams.delete("oauth_verifier");
      window.history.replaceState(
        {},
        "",
        currentUrl.pathname + currentUrl.hash,
      );
    }
  }, [tokenMint]);

  // Generate image function
  const generateImage = async () => {
    if (!userPrompt) return;

    // Check if wallet is connected
    if (!publicKey) {
      toast.error("Please connect your wallet to generate images");
      return;
    }

    // Check if we have a token mint
    if (!tokenMint) {
      toast.error(
        "No token found. Please navigate to a token page to generate images",
      );
      return;
    }

    // Check token balance requirements based on mode
    const requiredBalance = generationMode === "pro" ? 10000 : 1000;
    if ((tokenBalance ?? 0) < requiredBalance) {
      toast.error(
        `You need at least ${requiredBalance.toLocaleString()} tokens to generate images in ${generationMode} mode`,
      );
      return;
    }

    setIsGenerating(true);
    setProcessingStatus("processing");
    setGeneratedImage(null); // Clear previous image
    setPlaceholderImage(null); // Clear placeholder when starting generation
    setShareError(null);

    try {
      // In a real implementation, we would fetch the token metadata if not available
      // For now, we'll use mock token data or fetch from the page's context
      const tokenMetadata = {
        name: tokenInfo?.name || "Example Token",
        ticker: tokenInfo?.ticker || "XMPL",
        description: "An example token for demonstration purposes",
        prompt: "A colorful digital token with a unique design",
      };

      // Get the auth token
      const authToken = localStorage.getItem("authToken");
      if (!authToken) {
        console.error("No auth token found");
        // Try to generate without auth token for testing
        toast.warning(
          "No auth token found, trying to generate without authentication",
        );
      }

      // Log API URL to help debug
      const apiUrl = `${env.apiUrl}/api/enhance-and-generate`;

      // Create headers
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Add auth token if available
      if (authToken) {
        try {
          headers["Authorization"] = `Bearer ${JSON.parse(authToken)}`;
        } catch (e) {
          console.error("Failed to parse auth token from localStorage:", e);
          toast.error("Authentication error. Please try logging in again.");
          setIsGenerating(false);
          setProcessingStatus("failed"); // Set status to failed
          return;
        }
      }

      // Call the API endpoint that enhances the prompt and generates an image
      const response = await fetch(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          userPrompt,
          tokenMint,
          tokenMetadata,
          mediaType: "image",
          mode: generationMode,
        }),
        credentials: "include", // Important to include credentials for auth cookies
      });

      // Headers object doesn't have a standard iterator, so we'll get keys and values manually
      const headerObj: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headerObj[key] = value;
      });

      // Handle error responses
      if (!response.ok) {
        let errorMessage = `Failed to generate image (${response.status})`;
        let errorData: any = null;

        try {
          // Attempt to parse error response
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            errorData = await response.json();
            errorMessage = errorData.error || errorMessage;

            // Special handling for token ownership requirement errors
            if (errorData.type === "OWNERSHIP_REQUIREMENT") {
              const minimumRequired = errorData.minimumRequired || 1000;
              const currentAmount =
                errorData.message?.match(/You currently have ([\d.]+)/)?.[1] ||
                "0";

              // Show a more helpful message with a link to buy tokens
              const buyTokensUrl = `/token/${tokenMint}?action=buy`;

              toast.error(
                <div>
                  <p>
                    You need at least {minimumRequired.toLocaleString()} tokens
                    to use this feature.
                  </p>
                  <p>You currently have {currentAmount} tokens.</p>
                  <a
                    href={buyTokensUrl}
                    className="underline text-blue-500 hover:text-blue-700"
                    onClick={(e) => {
                      e.preventDefault();
                      window.location.href = buyTokensUrl;
                    }}
                  >
                    Click here to buy more tokens
                  </a>
                </div>,
                {
                  autoClose: 10000, // Show for 10 seconds
                  closeOnClick: false,
                },
              );
              throw new Error(
                `Insufficient token balance. You need at least ${minimumRequired.toLocaleString()} tokens.`,
              );
            }
          } else {
            // If not JSON, try to get text
            errorMessage = await response.text();
          }
        } catch (e) {
          console.error("Error parsing error response:", e);
        }

        console.error("API error response:", errorData || errorMessage);
        throw new Error(errorMessage);
      }

      // Try to parse the response carefully
      let data: any = null;
      try {
        // Check content type to make sure it's JSON
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          data = await response.json();
        } else {
          throw new Error(`Unexpected content type: ${contentType}`);
        }
      } catch (jsonError) {
        console.error("Error parsing JSON response:", jsonError);
        throw new Error("Failed to parse server response");
      }

      // Make sure we have the expected fields
      if (!data || typeof data !== "object") {
        throw new Error("Invalid response format");
      }

      if (data.success && data.mediaUrl) {
        // Check if mediaUrl is a data URL or a regular URL
        if (data.mediaUrl.startsWith("data:")) {
          // It's already a data URL, use directly
          setGeneratedImage(data.mediaUrl);
        } else {
          // It's a URL, make sure it's absolute
          const fullUrl = data.mediaUrl.startsWith("http")
            ? data.mediaUrl
            : `${env.apiUrl}${data.mediaUrl.startsWith("/") ? "" : "/"}${data.mediaUrl}`;
          setGeneratedImage(fullUrl);
        }

        setProcessingStatus("processed");

        if (data.remainingGenerations !== undefined) {
          toast.success(
            `Image generated successfully! You have ${data.remainingGenerations} generations left today.`,
          );
        } else {
          toast.success("Image generated successfully!");
        }
      } else {
        console.error("Invalid response:", data);
        throw new Error(
          data.error || "Failed to generate image: No media URL returned",
        );
      }
    } catch (error) {
      console.error("Error generating image:", error);
      setProcessingStatus("failed");
      toast.error(
        error instanceof Error ? error.message : "Failed to generate image",
      );
      // Re-set placeholder if generation failed and we have additional images
      if (additionalImages.length > 0 && !placeholderImage) {
        const randomIndex = Math.floor(Math.random() * additionalImages.length);
        setPlaceholderImage(additionalImages[randomIndex]);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Generate video function
  const generateVideo = async (
    isImageToVideo: boolean = false,
    sourceImageUrl: string = "",
  ) => {
    if (!userPrompt && !isImageToVideo) return;

    // Check if wallet is connected
    if (!publicKey) {
      toast.error("Please connect your wallet to generate videos");
      return;
    }

    // Check if we have a token mint
    if (!tokenMint) {
      toast.error(
        "No token found. Please navigate to a token page to generate videos",
      );
      return;
    }

    // Check token balance requirements based on mode
    const requiredBalance = generationMode === "pro" ? 100000 : 10000;
    if ((tokenBalance ?? 0) < requiredBalance) {
      toast.error(
        `You need at least ${requiredBalance.toLocaleString()} tokens to generate videos in ${generationMode} mode`,
      );
      return;
    }

    setIsGenerating(true);
    setProcessingStatus("processing");
    setGeneratedImage(null); // Clear previous media
    setPlaceholderImage(null); // Clear placeholder when starting generation
    setShareError(null);

    try {
      // In a real implementation, we would fetch the token metadata if not available
      const tokenMetadata = {
        name: tokenInfo?.name || "Example Token",
        ticker: tokenInfo?.ticker || "XMPL",
        description: "An example token for demonstration purposes",
        prompt: "A colorful digital token with a unique design",
      };

      // Get the auth token
      const authToken = localStorage.getItem("authToken");
      if (!authToken) {
        console.error("No auth token found");
        toast.warning(
          "No auth token found, trying to generate without authentication",
        );
      }

      // API endpoint
      const apiUrl = `${env.apiUrl}/api/enhance-and-generate`;

      // Create headers
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Add auth token if available
      if (authToken) {
        try {
          headers["Authorization"] = `Bearer ${JSON.parse(authToken)}`;
        } catch (e) {
          console.error("Failed to parse auth token from localStorage:", e);
          toast.error("Authentication error. Please try logging in again.");
          setIsGenerating(false);
          setProcessingStatus("failed"); // Set status to failed
          return;
        }
      }

      // Prepare request body
      const requestBody: any = {
        userPrompt,
        tokenMint,
        tokenMetadata,
        mediaType: "video",
        mode: generationMode,
      };

      // Add image URL for image-to-video if applicable
      if (isImageToVideo && sourceImageUrl) {
        requestBody.image_url = sourceImageUrl;
      }

      // Call the API endpoint
      const response = await fetch(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        credentials: "include",
      });

      const headerObj: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headerObj[key] = value;
      });

      // Handle error responses
      if (!response.ok) {
        let errorMessage = `Failed to generate video (${response.status})`;
        let errorData: any = null;

        try {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            errorData = await response.json();
            errorMessage = errorData.error || errorMessage;

            // Special handling for token ownership requirement errors
            if (errorData.type === "OWNERSHIP_REQUIREMENT") {
              const minimumRequired = errorData.minimumRequired || 10000;
              const currentAmount =
                errorData.message?.match(/You currently have ([\d.]+)/)?.[1] ||
                "0";

              // Show a more helpful message with a link to buy tokens
              const buyTokensUrl = `/token/${tokenMint}?action=buy`;

              toast.error(
                <div>
                  <p>
                    You need at least {minimumRequired.toLocaleString()} tokens
                    to use this feature.
                  </p>
                  <p>You currently have {currentAmount} tokens.</p>
                  <a
                    href={buyTokensUrl}
                    className="underline text-blue-500 hover:text-blue-700"
                    onClick={(e) => {
                      e.preventDefault();
                      window.location.href = buyTokensUrl;
                    }}
                  >
                    Click here to buy more tokens
                  </a>
                </div>,
                {
                  autoClose: 10000,
                  closeOnClick: false,
                },
              );
              throw new Error(
                `Insufficient token balance. You need at least ${minimumRequired.toLocaleString()} tokens.`,
              );
            }
          } else {
            errorMessage = await response.text();
          }
        } catch (e) {
          console.error("Error parsing error response:", e);
        }

        console.error("API error response:", errorData || errorMessage);
        throw new Error(errorMessage);
      }

      // Parse the response
      let data: any = null;
      try {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          data = await response.json();
        } else {
          throw new Error(`Unexpected content type: ${contentType}`);
        }
      } catch (jsonError) {
        console.error("Error parsing JSON response:", jsonError);
        throw new Error("Failed to parse server response");
      }

      // Validate response
      if (!data || typeof data !== "object") {
        throw new Error("Invalid response format");
      }

      if (data.success && data.mediaUrl) {
        // It's a URL, make sure it's absolute
        const fullUrl = data.mediaUrl.startsWith("http")
          ? data.mediaUrl
          : `${env.apiUrl}${data.mediaUrl.startsWith("/") ? "" : "/"}${data.mediaUrl}`;

        setGeneratedImage(fullUrl); // We'll reuse this state for videos too
        setProcessingStatus("processed");

        if (data.remainingGenerations !== undefined) {
          toast.success(
            `Video generated successfully! You have ${data.remainingGenerations} generations left today.`,
          );
        } else {
          toast.success("Video generated successfully!");
        }
      } else {
        console.error("Invalid response:", data);
        throw new Error(
          data.error || "Failed to generate video: No media URL returned",
        );
      }
    } catch (error) {
      console.error("Error generating video:", error);
      setProcessingStatus("failed");
      toast.error(
        error instanceof Error ? error.message : "Failed to generate video",
      );
      // Re-set placeholder if generation failed and we have additional images
      if (additionalImages.length > 0 && !placeholderImage) {
        const randomIndex = Math.floor(Math.random() * additionalImages.length);
        setPlaceholderImage(additionalImages[randomIndex]);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // --- Tweet Templates & Generator ---
  const tweetTemplates = [
    "Hottest project on @autodotfun! {TOKEN_NAME} ({TOKEN_SYMBOL})!",
    "LFG!!! {TOKEN_SYMBOL} ({TOKEN_NAME}) @autodotfun",
    "Let's make magic with {TOKEN_NAME} ({TOKEN_SYMBOL}) @autodotfun",
    "Check out what I created with {TOKEN_NAME} ({TOKEN_SYMBOL}) on @autodotfun!",
    "Just generated some amazing art for {TOKEN_NAME} ({TOKEN_SYMBOL}) @autodotfun",
    "Loving the vibes of {TOKEN_NAME} ({TOKEN_SYMBOL}) on @autodotfun!",
    "Created something special with {TOKEN_NAME} ({TOKEN_SYMBOL}) @autodotfun",
    "This {TOKEN_NAME} ({TOKEN_SYMBOL}) generation on @autodotfun is 🔥",
    "Check out my latest {TOKEN_NAME} ({TOKEN_SYMBOL}) creation @autodotfun",
    "Unleashing creativity with {TOKEN_NAME} ({TOKEN_SYMBOL}) @autodotfun",
    "Art meets blockchain: {TOKEN_NAME} ({TOKEN_SYMBOL}) @autodotfun",
    "Generated pure magic for {TOKEN_NAME} ({TOKEN_SYMBOL}) @autodotfun",
    "Bringing {TOKEN_NAME} ({TOKEN_SYMBOL}) to life on @autodotfun!",
  ];

  const generateShareText = (
    currentTokenInfo: { name: string; ticker: string } | null,
  ): string => {
    const name = currentTokenInfo?.name || "this token";
    const ticker = currentTokenInfo?.ticker
      ? `$${currentTokenInfo.ticker}`
      : "";

    console.log("currentTokenInfo", currentTokenInfo);

    // Select a random template
    const template =
      tweetTemplates[Math.floor(Math.random() * tweetTemplates.length)];

    // Replace placeholders
    let text = template
      .replace(/{TOKEN_NAME}/g, name)
      .replace(/{TOKEN_SYMBOL}/g, ticker);

    // Basic truncation if needed (Twitter limit is 280)
    if (text.length > 280) {
      // Find last space before limit to avoid cutting words
      const lastSpace = text.lastIndexOf(" ", 277);
      text = text.substring(0, lastSpace > 0 ? lastSpace : 277) + "...";
    }

    return text;
  };
  // --- End Tweet Templates & Generator ---

  // State for Twitter sharing & Modal (Keep this set of declarations)
  const [isSharing, setIsSharing] = useState(false); // General sharing process flag
  const [shareError, setShareError] = useState<string | null>(null);
  const [twitterCredentials, setTwitterCredentials] =
    useState<TwitterCredentials | null>(null); // Store full credentials including 1.0a
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [modalShareText, setModalShareText] = useState("");
  const [isPostingTweet, setIsPostingTweet] = useState(false); // Specific loading for modal confirm button
  const [imageForShareModal, setImageForShareModal] = useState<string | null>(
    null,
  );

  // --- shareOnX (Initiates the process) ---
  const shareOnX = useCallback(async () => {
    // Determine which image URL to use
    const imageToShare =
      generatedImage && processingStatus === "processed"
        ? generatedImage
        : placeholderImage && communityTab === "Image"
          ? placeholderImage
          : null;

    if (!imageToShare) {
      toast.error("No image available to share.");
      return;
    }
    if (!tokenInfo) {
      toast.warn("Token info still loading...");
      return;
    }

    setIsSharing(true);
    setShareError(null);

    // Check for valid OAuth 1.0a credentials
    const storedCredentials = localStorage.getItem(STORAGE_KEY);
    let creds: TwitterCredentials | null = null;
    if (storedCredentials) {
      try {
        creds = JSON.parse(storedCredentials);
      } catch {
        /* Ignore parsing error */
      }
    }

    if (creds && creds.oauth1Token && creds.oauth1TokenSecret) {
      // Credentials exist and seem valid -> Open Modal
      const shareText = generateShareText(tokenInfo);
      setModalShareText(shareText);
      setImageForShareModal(imageToShare);
      setIsShareModalOpen(true);
      setIsSharing(false); // Modal is open, general sharing process is paused
      console.log("Valid credentials found, opening share modal.");
    } else {
      // No valid credentials -> Start OAuth 1.0a Flow
      console.log("No valid credentials, redirecting to OAuth 1.0a...");
      const pendingShare: PendingShare = {
        imageData: imageToShare,
        tokenName: tokenInfo.name,
        tokenSymbol: tokenInfo.ticker,
      };
      localStorage.setItem(PENDING_SHARE_KEY, JSON.stringify(pendingShare));
      localStorage.setItem(
        OAUTH_REDIRECT_ORIGIN_KEY,
        window.location.pathname +
          window.location.search +
          window.location.hash,
      );

      const apiUrl = env.apiUrl;
      if (!apiUrl) {
        toast.error("API URL not configured.");
        setIsSharing(false);
        return;
      }
      // Redirect to the backend endpoint that starts OAuth 1.0a
      window.location.href = `${apiUrl}/api/share/oauth/request_token?oauth_version=1.0a`;
      // No need to setIsSharing(false) here as page will redirect
    }
  }, [
    generatedImage,
    placeholderImage,
    tokenInfo,
    processingStatus,
    communityTab,
    // twitterCredentials state is not needed here, we read directly from localStorage
  ]);

  // --- handleShareOnX (Performs the actual API calls) ---
  const handleShareOnX = async (
    text: string,
    imageDataUrl: string,
    creds: TwitterCredentials, // Expects full creds object now
  ) => {
    if (!creds.oauth1Token || !creds.oauth1TokenSecret) {
      throw new Error(
        "Internal Error: Missing OAuth 1.0a tokens in handleShareOnX.",
      );
    }

    // 1. Upload Media using the backend endpoint
    let media_id_string = "";
    try {
      toast.info("Uploading media to X...");
      const mediaUploadResponse = await fetchWithAuth(
        `${env.apiUrl}/api/share/upload-media`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Pass user's OAuth 1.0a tokens
            "X-Twitter-OAuth-Token": creds.oauth1Token,
            "X-Twitter-OAuth-Token-Secret": creds.oauth1TokenSecret,
          },
          body: JSON.stringify({ image: imageDataUrl }), // Send prepared data URL
        },
      );

      if (!mediaUploadResponse.ok) {
        const error = (await mediaUploadResponse.json()) as { error?: string };
        throw new Error(error?.error || "Failed to upload media to X.");
      }

      const mediaData = (await mediaUploadResponse.json()) as {
        success?: boolean;
        media_id_string?: string;
      };
      if (!mediaData?.success || !mediaData?.media_id_string) {
        throw new Error("Backend did not return a valid media ID.");
      }
      media_id_string = mediaData.media_id_string;
      toast.info("Media uploaded.");
    } catch (uploadError) {
      console.error("Media upload failed:", uploadError);
      throw new Error(
        `Media upload failed: ${uploadError instanceof Error ? uploadError.message : "Unknown error"}`,
      );
    }

    // 2. Create tweet with the media ID
    try {
      toast.info("Posting tweet...");
      const tweetResponse = await fetch(`${env.apiUrl}/api/share/tweet`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Pass user's OAuth 1.0a tokens again for tweeting
          "X-Twitter-OAuth-Token": creds.oauth1Token,
          "X-Twitter-OAuth-Token-Secret": creds.oauth1TokenSecret,
        },
        body: JSON.stringify({
          text: text, // Use the text from the modal
          media_ids: [media_id_string],
        }),
      });

      if (!tweetResponse.ok) {
        const error = (await tweetResponse.json()) as { error?: string };
        throw new Error(error?.error || "Failed to post tweet.");
      }

      const tweet = (await tweetResponse.json()) as {
        success?: boolean;
        tweet?: { data?: { id: string } };
      };
      toast.success("Shared successfully on X!");

      // Open the tweet in a new tab
      if (tweet?.tweet?.data?.id) {
        const username = creds.screen_name || creds.username; // Use screen_name if available
        if (username) {
          window.open(
            `https://twitter.com/${username}/status/${tweet.tweet.data.id}`,
            "_blank",
          );
        }
      }
    } catch (tweetError) {
      console.error("Tweet posting failed:", tweetError);
      throw new Error(
        `Tweet posting failed: ${tweetError instanceof Error ? tweetError.message : "Unknown error"}`,
      );
    }
  };

  // --- confirmAndPostShare (Modal confirmation handler) ---
  const confirmAndPostShare = async () => {
    if (
      !imageForShareModal ||
      !twitterCredentials ||
      !twitterCredentials.oauth1Token ||
      !twitterCredentials.oauth1TokenSecret
    ) {
      toast.error("Cannot share. Missing image or authentication credentials.");
      // Maybe force re-auth?
      localStorage.removeItem(STORAGE_KEY);
      setTwitterCredentials(null);
      setIsShareModalOpen(false);
      setIsSharing(false);
      return;
    }

    setIsPostingTweet(true); // Use the modal-specific loading state
    setShareError(null);
    try {
      // 1. Prepare image data URL (might be needed if modal image is not data url)
      let finalImageDataUrl = imageForShareModal;
      if (!finalImageDataUrl.startsWith("data:")) {
        toast.info("Processing image...");
        const response = await fetch(finalImageDataUrl);
        if (!response.ok) throw new Error("Failed to fetch modal image");
        const blob = await response.blob();
        finalImageDataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        toast.info("Image processed.");
      }

      // 2. Call the unified handler
      await handleShareOnX(
        modalShareText, // Use text from modal state
        finalImageDataUrl, // Use potentially converted data URL
        twitterCredentials, // Pass full credentials object
      );
      setIsShareModalOpen(false); // Close modal on success
      setImageForShareModal(null);
      setModalShareText("");
    } catch (error) {
      // Error is logged and toasted within handleShareOnX
      setShareError(
        error instanceof Error
          ? error.message
          : "An unknown error occurred during sharing.",
      );
      // Keep modal open on error for user to see message/retry
    } finally {
      setIsPostingTweet(false);
      // setIsSharing(false); // Let the main share button handle this if needed?
    }
  };

  // Add download functionality for any media type - uses generated or placeholder
  const downloadMedia = useCallback(async () => {
    // Determine which media URL to use based on current state
    const mediaToDownload =
      generatedImage && processingStatus === "processed" // Generated media takes priority
        ? generatedImage
        : placeholderImage && communityTab === "Image" // Only download placeholder if it's an image and no generated one exists
          ? placeholderImage
          : null;

    if (!mediaToDownload) {
      toast.error("No media available to download");
      return;
    }

    try {
      // Convert the URL to a blob
      const response = await fetch(mediaToDownload);
      if (!response.ok) {
        throw new Error(`Failed to fetch media: ${response.statusText}`);
      }
      const blob = await response.blob();

      // Determine file extension based on media type and content type
      let extension = ".png"; // Default for images
      const contentType = response.headers.get("content-type") || blob.type; // Use blob type as fallback

      if (
        communityTab === "Video" ||
        (contentType && contentType.includes("video"))
      ) {
        extension = ".mp4";
      } else if (
        communityTab === "Audio" ||
        (contentType && contentType.includes("audio"))
      ) {
        extension = ".mp3";
      } else if (contentType === "image/jpeg") {
        extension = ".jpg";
      } else if (contentType === "image/gif") {
        extension = ".gif";
      } else if (contentType === "image/webp") {
        extension = ".webp";
      } // Add more image types if needed

      // Create a URL for the blob
      const blobUrl = window.URL.createObjectURL(blob);

      // Create an anchor element for download
      const a = document.createElement("a");
      a.href = blobUrl;
      // Use token ticker or mint in filename if available
      const filenameBase = tokenInfo?.ticker || tokenMint || "generated";
      a.download = `${filenameBase}-${communityTab.toLowerCase()}-${Date.now()}${extension}`;

      // Trigger the download
      document.body.appendChild(a);
      a.click();

      // Cleanup
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(a);

      toast.success(`${communityTab} download started`);
    } catch (error) {
      console.error(`Error downloading ${communityTab.toLowerCase()}:`, error);
      toast.error(`Failed to download ${communityTab.toLowerCase()}`);
    }
  }, [
    generatedImage,
    placeholderImage,
    communityTab,
    processingStatus,
    tokenInfo?.ticker,
    tokenMint,
  ]);

  // Add function to check token balance
  const checkTokenBalance = async () => {
    if (!publicKey || !tokenMint) {
      return;
    }

    try {
      // Get stored auth token if available
      const authToken = localStorage.getItem("authToken");

      // First try to get balance from API (which uses the database)
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/token/${tokenMint}/check-balance?address=${publicKey.toString()}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            },
            credentials: "include",
          },
        );

        if (response.ok) {
          const data = (await response.json()) as { balance?: number };
          if (data.balance !== undefined) {
            const formattedBalance = Number(data.balance);
            // Store as backup
            setManualTokenBalance(formattedBalance);
            return;
          }
        }
      } catch (apiError) {
        console.error("API balance check failed:", apiError);
        // Continue to fallback method if API fails
      }

      // Decide which networks to check
      const networksToCheck = [
        {
          name: env.solanaNetwork || "devnet",
          url: env.rpcUrl,
        },
      ];

      let totalBalance = 0;
      let foundOnNetwork = "";

      // Check each network we decided to look at
      for (const network of networksToCheck) {
        try {
          const connection = new Connection(network.url);

          // Get token accounts owned by user for this mint
          const tokenAccounts = await connection.getTokenAccountsByOwner(
            publicKey,
            { mint: new PublicKey(tokenMint) },
            { commitment: "confirmed" },
          );

          let networkBalance = 0;

          // Sum up balances from all accounts on this network
          for (const { pubkey } of tokenAccounts.value) {
            const accountInfo = await connection.getTokenAccountBalance(pubkey);
            if (accountInfo.value) {
              const amount = Number(accountInfo.value.amount);
              const decimals = accountInfo.value.decimals;
              networkBalance += amount / Math.pow(10, decimals);
            }
          }

          // If we found a balance on this network
          if (networkBalance > 0) {
            totalBalance = networkBalance; // Use this balance
            foundOnNetwork = network.name;
            break; // Stop checking other networks
          }
        } catch (networkError) {
          console.error(`Error checking ${network.name}:`, networkError);
        }
      }

      setManualTokenBalance(totalBalance);

      // Show appropriate toast message
      if (totalBalance > 0) {
        if (foundOnNetwork) {
          toast.success(
            `You have ${totalBalance.toFixed(2)} tokens on ${foundOnNetwork}${totalBalance >= 1000 ? " - enough to generate content!" : ""}`,
          );
        } else {
          toast.success(
            `You have ${totalBalance.toFixed(2)} tokens${totalBalance >= 1000 ? " - enough to generate content!" : ""}`,
          );
        }
      } else {
        toast.warning(
          `You have 0 tokens. You need at least 1,000 to generate content.`,
        );
      }
    } catch (error) {
      console.error("Error checking token balance:", error);
      toast.error("Failed to check token balance");
    }
  };

  useEffect(() => {
    checkTokenBalance();
  }, [publicKey, tokenMint]);

  // In the component, add these state variables after the existing ones
  const [videoMode, _setVideoMode] = useState<"text" | "image">("text");
  const [selectedImageForVideo, setSelectedImageForVideo] = useState<
    string | null
  >(null);
  const [imageUploadLoading, setImageUploadLoading] = useState(false);

  // Add this function to handle image uploads for image-to-video
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) {
      return;
    }

    try {
      setImageUploadLoading(true);
      const file = e.target.files[0];

      // Convert the file to data URL
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          setSelectedImageForVideo(reader.result);
        }
        setImageUploadLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Error uploading image:", error);
      toast.error("Failed to upload image");
      setImageUploadLoading(false);
    }
  };

  // Add these state variables at the top of the component
  const [audioMode, _setAudioMode] = useState<"music" | "speech">("music");

  // Add this function to handle audio generation
  const generateAudio = async (useExistingLyrics: boolean = false) => {
    if (!userPrompt && audioMode === "speech") return;

    // Check if wallet is connected
    if (!publicKey) {
      toast.error("Please connect your wallet to generate audio");
      return;
    }

    // Check if we have a token mint
    if (!tokenMint) {
      toast.error(
        "No token found. Please navigate to a token page to generate audio",
      );
      return;
    }

    // Check token balance requirements
    // Audio requires at least 10k tokens
    const requiredBalance = 10000;
    if ((tokenBalance ?? 0) < requiredBalance) {
      toast.error(
        `You need at least ${requiredBalance.toLocaleString()} tokens to generate audio`,
      );
      return;
    }

    setIsGenerating(true);
    setProcessingStatus("processing");
    setGeneratedImage(null); // Clear previous media
    setPlaceholderImage(null); // Clear placeholder when starting generation
    setShareError(null);

    try {
      // Get token metadata
      const tokenMetadata = {
        name: tokenInfo?.name || "Example Token",
        ticker: tokenInfo?.ticker || "XMPL",
        description: "An example token for demonstration purposes",
        prompt: "A colorful digital token with a unique design",
      };

      // Get the auth token
      const authToken = localStorage.getItem("authToken");
      if (!authToken) {
        console.error("No auth token found");
        toast.warning(
          "No auth token found, trying to generate without authentication",
        );
      }

      // API endpoint
      const apiUrl = `${env.apiUrl}/api/enhance-and-generate`;
      // Create headers
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Add auth token if available
      if (authToken) {
        try {
          headers["Authorization"] = `Bearer ${JSON.parse(authToken)}`;
        } catch (e) {
          console.error("Failed to parse auth token from localStorage:", e);
          toast.error("Authentication error. Please try logging in again.");
          setIsGenerating(false);
          setProcessingStatus("failed"); // Set status to failed
          return;
        }
      }

      // Prepare request body
      const requestBody: any = {
        userPrompt,
        tokenMint,
        tokenMetadata,
        mediaType: "audio",
        mode: "fast", // Audio only has one mode for now
      };

      // Add lyrics if we're using existing ones
      if (useExistingLyrics && editableLyrics) {
        requestBody.lyrics = editableLyrics;
      }

      // Call the API endpoint
      const response = await fetch(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        credentials: "include",
      });

      const headerObj: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headerObj[key] = value;
      });

      // Handle error responses
      if (!response.ok) {
        let errorMessage = `Failed to generate audio (${response.status})`;
        let errorData: any = null;

        try {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            errorData = await response.json();
            errorMessage = errorData.error || errorMessage;

            // Special handling for token ownership requirement errors
            if (errorData.type === "OWNERSHIP_REQUIREMENT") {
              const minimumRequired = errorData.minimumRequired || 10000;
              const currentAmount =
                errorData.message?.match(/You currently have ([\d.]+)/)?.[1] ||
                "0";

              // Show a more helpful message with a link to buy tokens
              const buyTokensUrl = `/token/${tokenMint}?action=buy`;

              toast.error(
                <div>
                  <p>
                    You need at least {minimumRequired.toLocaleString()} tokens
                    to use this feature.
                  </p>
                  <p>You currently have {currentAmount} tokens.</p>
                  <a
                    href={buyTokensUrl}
                    className="underline text-blue-500 hover:text-blue-700"
                    onClick={(e) => {
                      e.preventDefault();
                      window.location.href = buyTokensUrl;
                    }}
                  >
                    Click here to buy more tokens
                  </a>
                </div>,
                {
                  autoClose: 10000,
                  closeOnClick: false,
                },
              );
              throw new Error(
                `Insufficient token balance. You need at least ${minimumRequired.toLocaleString()} tokens.`,
              );
            }
          } else {
            errorMessage = await response.text();
          }
        } catch (e) {
          console.error("Error parsing error response:", e);
        }

        console.error("API error response:", errorData || errorMessage);
        throw new Error(errorMessage);
      }

      // Parse the response
      let data: any = null;
      try {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          data = await response.json();
        } else {
          throw new Error(`Unexpected content type: ${contentType}`);
        }
      } catch (jsonError) {
        console.error("Error parsing JSON response:", jsonError);
        throw new Error("Failed to parse server response");
      }

      // Validate response
      if (!data || typeof data !== "object") {
        throw new Error("Invalid response format");
      }

      if (data.success && data.mediaUrl) {
        // It's a URL, make sure it's absolute
        const fullUrl = data.mediaUrl.startsWith("http")
          ? data.mediaUrl
          : `${env.apiUrl}${data.mediaUrl.startsWith("/") ? "" : "/"}${data.mediaUrl}`;

        setGeneratedImage(fullUrl); // We'll reuse this state for audio too
        setEditableLyrics(data.lyrics);
        setProcessingStatus("processed");

        if (data.remainingGenerations !== undefined) {
          toast.success(
            `Audio generated successfully! You have ${data.remainingGenerations} generations left today.`,
          );
        } else {
          toast.success("Audio generated successfully!");
        }
      } else {
        console.error("Invalid response:", data);
        throw new Error(
          data.error || "Failed to generate audio: No media URL returned",
        );
      }
    } catch (error) {
      console.error("Error generating audio:", error);
      setProcessingStatus("failed");
      toast.error(
        error instanceof Error ? error.message : "Failed to generate audio",
      );
      // Re-set placeholder if generation failed and we have additional images
      if (additionalImages.length > 0 && !placeholderImage) {
        const randomIndex = Math.floor(Math.random() * additionalImages.length);
        setPlaceholderImage(additionalImages[randomIndex]);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Add an effect to inject media type buttons into header container
  useEffect(() => {
    const headerContainer = document.getElementById("media-selector-container");
    if (!headerContainer) return;

    // Create media type buttons container
    const mediaTypeButtons = document.createElement("div");
    mediaTypeButtons.className = "flex space-x-2 items-center";

    // Add image button
    const imageButton = document.createElement("button");
    imageButton.onclick = () => {
      setCommunityTab("Image");
      setGeneratedImage(null);
      setProcessingStatus("idle");
      // Set the user prompt back to the token's description when switching to Image tab
      if (tokenInfo?.description) {
        setUserPrompt(tokenInfo.description);
      }
      // Re-select placeholder if available
      if (additionalImages.length > 0 && !placeholderImage) {
        const randomIndex = Math.floor(Math.random() * additionalImages.length);
        setPlaceholderImage(additionalImages[randomIndex]);
      }
    };
    imageButton.className = communityTab === "Image" ? "active-tab" : "";

    const imageImg = document.createElement("img");
    imageImg.src = getTabIconPath("Image", communityTab);
    imageImg.alt = "Image";
    imageImg.className = "cursor-pointer h-8 w-auto";

    imageButton.appendChild(imageImg);
    mediaTypeButtons.appendChild(imageButton);

    // Add video button
    const videoButton = document.createElement("button");
    videoButton.onclick = () => {
      setCommunityTab("Video");
      setGeneratedImage(null);
      setProcessingStatus("idle");
      setUserPrompt(""); // Clear input when switching to Video tab
      setPlaceholderImage(null); // Clear placeholder for video/audio
    };
    videoButton.className = communityTab === "Video" ? "active-tab" : "";

    const videoImg = document.createElement("img");
    videoImg.src = getTabIconPath("Video", communityTab);
    videoImg.alt = "Video";
    videoImg.className = "cursor-pointer h-8 w-auto";

    videoButton.appendChild(videoImg);
    mediaTypeButtons.appendChild(videoButton);

    // Add audio button
    const audioButton = document.createElement("button");
    audioButton.onclick = () => {
      setCommunityTab("Audio");
      setGeneratedImage(null);
      setProcessingStatus("idle");
      setUserPrompt(""); // Clear input when switching to Audio tab
      setPlaceholderImage(null); // Clear placeholder for video/audio
    };
    audioButton.className = communityTab === "Audio" ? "active-tab" : "";

    const audioImg = document.createElement("img");
    audioImg.src = getTabIconPath("Audio", communityTab);
    audioImg.alt = "Audio";
    audioImg.className = "cursor-pointer h-8 w-auto";

    audioButton.appendChild(audioImg);
    mediaTypeButtons.appendChild(audioButton);

    // Clear and append to header container
    headerContainer.innerHTML = "";
    headerContainer.appendChild(mediaTypeButtons);

    // Add CSS to document for active tab indication
    if (!document.getElementById("media-tab-styles")) {
      const style = document.createElement("style");
      style.id = "media-tab-styles";
      style.innerHTML = `
        .active-tab {
          position: relative;
        }
        .active-tab::after {
          content: '';
          position: absolute;
          bottom: -4px;
          left: 50%;
          transform: translateX(-50%);
          width: 24px;
          height: 2px;
          background-color: #03FF24;
        }
      `;
      document.head.appendChild(style);
    }

    // Cleanup function to remove the buttons when component unmounts
    return () => {
      if (headerContainer) {
        headerContainer.innerHTML = "";
      }
      const styleElem = document.getElementById("media-tab-styles");
      if (styleElem) {
        styleElem.remove();
      }
    };
  }, [communityTab, additionalImages, tokenInfo?.description]); // Rerun when tab, additional images, or token description changes

  // Sets the placeholder image to randomly select one image, only for Image tab
  useEffect(() => {
    // Only set placeholder if on Image tab, no generated image exists, and we have additional images
    if (
      communityTab === "Image" &&
      !generatedImage &&
      additionalImages.length > 0 &&
      !placeholderImage // Avoid resetting if one is already chosen
    ) {
      // Select a random image from available images instead of always using the first one
      const randomIndex = Math.floor(Math.random() * additionalImages.length);
      const randomImage = additionalImages[randomIndex];

      // Verify the image loads
      const img = new Image();
      img.onload = () => {
        setPlaceholderImage(randomImage);
      };
      img.onerror = () => {
        console.warn(`Placeholder image failed to load: ${randomImage}`);
        // If random image fails, try the others sequentially
        const imageLoaders = additionalImages
          .filter((_, i) => i !== randomIndex) // Skip the one that just failed
          .map((url) => {
            return new Promise<string | null>((resolve) => {
              const imgLoader = new Image();
              imgLoader.onload = () => resolve(url);
              imgLoader.onerror = () => {
                console.warn(`Placeholder image failed to load: ${url}`);
                resolve(null);
              };
              imgLoader.src = url;
            });
          });

        Promise.all(imageLoaders).then((results) => {
          const validImage = results.find((url) => url !== null);
          if (validImage) {
            setPlaceholderImage(validImage as string);
          }
        });
      };
      img.src = randomImage;
    } else if (communityTab !== "Image") {
      // Clear placeholder if not on Image tab
      setPlaceholderImage(null);
    }
  }, [generatedImage, additionalImages, communityTab, tokenInfo?.image]);

  // Determine the image source to display
  const displayImageSource =
    generatedImage || placeholderImage || tokenInfo?.image;

  // Condition to show download/share buttons
  const isProcessing = processingStatus === "processing"; // Explicitly check if it IS processing

  const shouldShowActions =
    // Show if generated media is processed successfully
    (generatedImage && processingStatus === "processed") ||
    // OR Show if placeholder is visible (only on Image tab and not generating)
    (communityTab === "Image" &&
      placeholderImage &&
      !generatedImage &&
      !isProcessing); // Use the negation of the explicit check

  return (
    <div className="flex flex-col">
      <div className="flex flex-col md:flex-row gap-4">
        {/* Content Area */}
        <div className="flex flex-col grow w-full">
          {/* Main generation controls - consistent across all media types */}
          <div className="flex flex-col gap-4 w-full">
            {/* Controls row - consistent for all media types */}
            <div className="flex items-center py-3">
              {/* Input field with dynamic placeholder based on tab */}
              <input
                type="text"
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isGenerating) {
                    if (communityTab === "Image") {
                      generateImage();
                    } else if (communityTab === "Video") {
                      if (videoMode === "text") {
                        generateVideo();
                      } else if (
                        videoMode === "image" &&
                        selectedImageForVideo
                      ) {
                        generateVideo(true, selectedImageForVideo);
                      }
                    } else if (communityTab === "Audio") {
                      generateAudio();
                    }
                  }
                }}
                placeholder={
                  communityTab === "Image"
                    ? "Enter a concept like 'a halloween token about arnold schwarzenegger'"
                    : communityTab === "Video"
                      ? videoMode === "text"
                        ? "Enter a concept for your video"
                        : "Enter a description for your video (optional)"
                      : "Optional: describe the musical style (e.g., 'upbeat electronic with retro synths')"
                }
                className="flex-1 h-10 border-b border-b-[#03FF24] text-white bg-transparent focus:outline-none focus:border-b-white px-2 text-base leading-10"
              />

              {/* Generate button with dynamic behavior based on tab */}
              <button
                onClick={() => {
                  if (communityTab === "Image") {
                    generateImage();
                  } else if (communityTab === "Video") {
                    if (videoMode === "text") {
                      generateVideo();
                    } else if (videoMode === "image" && selectedImageForVideo) {
                      generateVideo(true, selectedImageForVideo);
                    }
                  } else if (communityTab === "Audio") {
                    generateAudio();
                  }
                }}
                disabled={
                  isGenerating ||
                  (communityTab === "Image" &&
                    (!userPrompt.trim() ||
                      (tokenBalance ?? 0) <
                        (generationMode === "pro" ? 10000 : 1000))) ||
                  (communityTab === "Video" &&
                    videoMode === "text" &&
                    (!userPrompt.trim() ||
                      (tokenBalance ?? 0) <
                        (generationMode === "fast" ? 10000 : 100000))) ||
                  (communityTab === "Video" &&
                    videoMode === "image" &&
                    (!selectedImageForVideo ||
                      (tokenBalance ?? 0) <
                        (generationMode === "fast" ? 10000 : 100000))) ||
                  (communityTab === "Audio" && (tokenBalance ?? 0) < 10000)
                }
                className="transition-colors disabled:opacity-50 flex items-center mx-2 h-12 cursor-pointer"
              >
                <img
                  src={
                    isGenerating
                      ? "/create/generating.svg"
                      : "/create/generateup.svg"
                  }
                  alt="Generate"
                  className="h-12 w-auto"
                  onMouseDown={(e) => {
                    if (!isGenerating)
                      (e.target as HTMLImageElement).src =
                        "/create/generatedown.svg";
                  }}
                  onMouseUp={(e) => {
                    if (!isGenerating)
                      (e.target as HTMLImageElement).src =
                        "/create/generateup.svg";
                  }}
                  onDragStart={(e) => e.preventDefault()}
                  onMouseOut={(e) => {
                    if (!isGenerating)
                      (e.target as HTMLImageElement).src =
                        "/create/generateup.svg";
                  }}
                />
              </button>

              {/* Fast/Pro mode buttons - only show for Image and Video */}
              {communityTab !== "Audio" && (
                <div className="flex space-x-1 h-10">
                  <Tooltip anchorSelect="#faston">
                    <span>Fast</span>
                  </Tooltip>
                  <button
                    id="faston"
                    onClick={() => setGenerationMode("fast")}
                    className="cursor-pointer h-10"
                  >
                    <img
                      src={
                        generationMode === "fast"
                          ? "/token/faston.svg"
                          : "/token/fastoff.svg"
                      }
                      alt="Fast mode"
                      className="h-10 w-auto cursor-pointer"
                    />
                  </button>
                  <Tooltip anchorSelect="#promode">
                    <span>Pro</span>
                  </Tooltip>
                  <button
                    id="promode"
                    onClick={() => setGenerationMode("pro")}
                    className="cursor-pointer h-10"
                  >
                    <img
                      src={
                        generationMode === "pro"
                          ? "/token/proon.svg"
                          : "/token/prooff.svg"
                      }
                      alt="Pro mode"
                      className="h-10 w-auto cursor-pointer"
                    />
                  </button>
                </div>
              )}
            </div>

            {/* Video-specific options */}
            {communityTab === "Video" && videoMode === "image" ? (
              <div className="px-4">
                {/* Image upload area for image-to-video */}
                <div className="border-2 border-dashed border-gray-600 p-4 rounded-md mb-4">
                  {selectedImageForVideo ? (
                    <div className="relative">
                      <img
                        src={selectedImageForVideo}
                        alt="Selected image"
                        className="max-w-full max-h-[300px] mx-auto"
                      />
                      <button
                        onClick={() => setSelectedImageForVideo(null)}
                        className="absolute top-2 right-2 bg-black/70 p-1 rounded-full cursor-pointer"
                        title="Remove image"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <label className="cursor-pointer">
                        <div className="mb-2">
                          {imageUploadLoading
                            ? "Uploading..."
                            : "Drop an image here or click to upload"}
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                          disabled={imageUploadLoading}
                        />
                        <div className="text-blue-400 hover:text-blue-300 text-sm">
                          {imageUploadLoading ? (
                            <div className="animate-pulse">Processing...</div>
                          ) : (
                            "Browse files"
                          )}
                        </div>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* Token balance message */}
            {communityTab === "Image" &&
              (tokenBalance ?? 0) <
                (generationMode === "pro" ? 10000 : 1000) && (
                <div className="text-sm text-yellow-500 -mt-2">
                  <p>
                    You need to hold at least{" "}
                    {generationMode === "pro" ? "10,000" : "1,000"} tokens to
                    generate images in {generationMode} mode.
                  </p>
                </div>
              )}

            {communityTab === "Video" &&
              (tokenBalance ?? 0) <
                (generationMode === "fast" ? 10000 : 100000) && (
                <div className="text-sm text-yellow-500 -mt-2">
                  <p>
                    You need to hold at least{" "}
                    {generationMode === "fast" ? "10,000" : "100,000"} tokens to
                    generate videos in {generationMode} mode.
                  </p>
                </div>
              )}

            {communityTab === "Audio" && (tokenBalance ?? 0) < 10000 && (
              <div className="text-sm text-yellow-500 -mt-2">
                <p>
                  You need to hold at least 10,000 tokens to generate audio.
                </p>
              </div>
            )}

            {/* Generated content display area */}
            <div className="flex flex-col relative">
              {processingStatus === "processing" ? (
                // --- Processing Loader ---
                <div className="flex items-center justify-center w-full h-[400px] sm:h-[500px] md:h-[600px]">
                  <div className="flex flex-col items-center">
                    <Loader />
                    <div className="mt-4 text-autofun-text-secondary font-dm-mono">
                      Processing...
                    </div>
                  </div>
                </div>
              ) : communityTab === "Image" ? (
                // --- Image Display ---
                <div className="relative w-full aspect-square bg-black">
                  {isGenerating ? ( // Show loader overlay during generation phase specifically
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/70">
                      <Loader />
                      <div className="mt-4 text-autofun-text-secondary font-dm-mono">
                        Generating your image...
                      </div>
                    </div>
                  ) : null}
                  {displayImageSource ? (
                    <img
                      key={displayImageSource} // Add key to force re-render on source change
                      src={displayImageSource}
                      alt={
                        generatedImage
                          ? "Generated Image"
                          : placeholderImage
                            ? "Pregenerated Image"
                            : tokenInfo?.name || "Token Image"
                      }
                      className={`w-full h-full object-contain ${isGenerating ? "opacity-30" : ""}`} // Dim image when generating loader is shown
                      onError={(e) => {
                        // Handle potential image load errors, maybe show fallback
                        console.error(
                          "Image failed to load:",
                          e.currentTarget.src,
                        );
                        // Optionally set a fallback image or style
                        e.currentTarget.style.display = "none"; // Hide broken image
                        // Maybe show a text error in the parent div
                        const parent = e.currentTarget.parentElement;
                        if (
                          parent &&
                          !parent.querySelector(".image-error-message")
                        ) {
                          const errorDiv = document.createElement("div");
                          errorDiv.className =
                            "absolute inset-0 flex items-center justify-center text-red-500 image-error-message";
                          errorDiv.textContent = "Image failed to load";
                          parent.appendChild(errorDiv);
                        }
                      }}
                    />
                  ) : (
                    // Fallback if no image source is available
                    <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                      No image available
                    </div>
                  )}
                </div>
              ) : communityTab === "Audio" &&
                generatedImage &&
                processingStatus === "processed" ? (
                // --- Audio Player with Album Art and Lyrics ---
                <div className="flex flex-col gap-4 border border-gray-700 p-4 bg-black mb-16">
                  <div className="flex flex-col md:flex-row gap-4">
                    {/* Album Art */}
                    <div className="w-full md:w-1/2 aspect-square">
                      <img
                        src={tokenInfo?.image || "/logo.png"}
                        alt="Album Art"
                        className="w-full h-full object-cover rounded-lg"
                      />
                    </div>

                    {/* Lyrics */}
                    <div className="w-full md:w-1/2 h-[400px] relative">
                      <div className="absolute top-0 right-0 z-10 flex gap-2">
                        {editableLyrics && (
                          <>
                            <CopyButton text={editableLyrics} />
                            <button
                              onClick={() =>
                                setIsEditingLyrics(!isEditingLyrics)
                              }
                              className="p-1 bg-gray-700 rounded hover:bg-gray-600"
                            >
                              {isEditingLyrics ? "Save" : "Edit"}
                            </button>
                            <button
                              onClick={() => generateAudio(true)}
                              className="p-1 bg-gray-700 rounded hover:bg-gray-600"
                              disabled={isGenerating}
                            >
                              Regenerate
                            </button>
                          </>
                        )}
                      </div>
                      <div className="absolute inset-0 overflow-y-auto">
                        {isEditingLyrics ? (
                          <textarea
                            value={editableLyrics || ""}
                            onChange={(e) => setEditableLyrics(e.target.value)}
                            className="w-full h-full p-2 bg-gray-800 text-white font-mono resize-none"
                          />
                        ) : (
                          <div className="text-white font-mono whitespace-pre-line pt-8">
                            {editableLyrics || "No lyrics available"}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Audio Player */}
                  <div className="w-full">
                    <audio
                      src={generatedImage}
                      controls
                      className="w-full"
                      autoPlay
                    >
                      Your browser does not support the audio element.
                    </audio>
                  </div>
                </div>
              ) : communityTab === "Video" &&
                generatedImage &&
                processingStatus === "processed" ? (
                // --- Video Player ---
                <div className="border border-gray-700 bg-black mb-16">
                  <video
                    src={generatedImage}
                    controls
                    className="w-full max-h-[500px]"
                    autoPlay
                    loop
                    muted // Muted for autoplay policy compliance
                  >
                    Your browser does not support the video tag.
                  </video>
                </div>
              ) : (
                // --- Placeholder for Video/Audio before generation ---
                <div className="flex items-center justify-center w-full h-[400px] sm:h-[500px] md:h-[600px] bg-gray-900 text-gray-500">
                  {communityTab === "Video"
                    ? "Generate a video"
                    : "Generate audio"}
                </div>
              )}

              {/* Download and share buttons */}
              {shouldShowActions && (
                <div className="w-full flex items-center justify-between p-2 bg-gradient-to-t from-black/80 to-transparent absolute bottom-0 left-0 right-0">
                  {shareError && (
                    <div className="text-red-500 text-sm bg-black/50 p-1 rounded mr-auto">
                      {shareError}
                    </div>
                  )}
                  <div className="ml-auto flex gap-2">
                    <Button
                      size="small"
                      variant="outline"
                      onClick={downloadMedia}
                      // Disable if processing
                      disabled={isProcessing}
                    >
                      Download
                    </Button>
                    <Button
                      size="small"
                      variant="secondary"
                      onClick={shareOnX}
                      // Disable if already sharing or processing
                      disabled={isSharing || isProcessing}
                    >
                      {isSharing ? "Sharing..." : "Share on X"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* --- Share Modal --- */}
      {isShareModalOpen && imageForShareModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-autofun-background-primary p-6 w-full max-w-lg relative text-white font-dm-mono border-4 border-[#2FD345] shadow-xl">
            <button
              onClick={() => {
                setIsShareModalOpen(false);
                setImageForShareModal(null); // Clear image on close
                setIsSharing(false); // Ensure sharing state is reset if modal is cancelled
              }}
              className="absolute top-3 right-3 text-gray-400 hover:text-white cursor-pointer"
              aria-label="Close modal"
            >
              <X size={20} />
            </button>
            <h2 className="text-xl font-semibold mb-4 text-[#03FF24]">
              Share on X
            </h2>

            {/* Display the image passed to the modal */}
            <div className="mb-4 border border-gray-600 overflow-hidden max-h-[300px] flex justify-center items-center bg-gray-800">
              <img
                src={imageForShareModal}
                alt="Content to share"
                className="w-auto h-auto max-w-full max-h-[300px] object-contain"
              />
            </div>

            <div className="mb-4">
              <label
                htmlFor="shareText"
                className="block text-sm font-medium text-gray-300 mb-1"
              >
                Tweet Text
              </label>
              <textarea
                id="shareText"
                value={modalShareText}
                onChange={(e) => setModalShareText(e.target.value)}
                maxLength={280}
                className="w-full p-2 bg-autofun-background-secondary text-sm border-b border-gray-400 focus:border-white focus:outline-none resize-none"
                placeholder="Edit your tweet text..."
                rows={3} // Give a bit more space
              />
              <p className="text-xs text-gray-400 mt-1 text-right">
                {modalShareText.length} / 280
              </p>
            </div>

            {shareError && (
              <p className="text-red-500 text-sm mb-3">Error: {shareError}</p>
            )}

            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setIsShareModalOpen(false);
                  setImageForShareModal(null); // Clear image on cancel
                  setIsSharing(false); // Ensure sharing state is reset
                }}
                disabled={isPostingTweet} // Disable cancel if posting is in progress
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={confirmAndPostShare}
                disabled={isPostingTweet || !modalShareText.trim()}
              >
                {isPostingTweet ? "Posting..." : "Confirm & Post"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
