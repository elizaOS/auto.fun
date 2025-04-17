// TODO: Rewrite as chat instead of generation

import { useWallet } from "@solana/wallet-adapter-react";
import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import Button from "../button";
import { useTokenBalance } from "@/hooks/use-token-balance";

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

// Storage keys for Twitter auth
const STORAGE_KEY = "twitter-oauth-token";
const PENDING_SHARE_KEY = "pending-twitter-share";
const OAUTH_REDIRECT_ORIGIN_KEY = "OAUTH_REDIRECT_ORIGIN"; // Key for storing the original path

// Types for Twitter authentication
type TwitterCredentials = {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

type PendingShare = {
  // Store pieces needed to regenerate text
  imageData: string;
  tokenName: string;
  tokenSymbol: string;
};

// --- Expected API Response Types ---
interface TokenInfoResponse {
  name: string;
  symbol: string;
  // Add other expected fields if needed
}

export default function CommunityTab() {
  type ICommunityTabs = "Image" | "Video" | "Audio";
  const [communityTab, setCommunityTab] = useState<ICommunityTabs>("Image");
  const [userPrompt, setUserPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<
    "idle" | "processing" | "processed" | "failed"
  >("idle");
  const { publicKey } = useWallet();
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [twitterCredentials, setTwitterCredentials] =
    useState<TwitterCredentials | null>(null);

  // Mode selection state
  const [generationMode, setGenerationMode] = useState<"fast" | "pro">("fast");

  // We can keep this for debugging but it's no longer the primary balance source
  // @ts-ignore
  const [manualTokenBalance, setManualTokenBalance] = useState<number | null>(
    null,
  );

  // --- Modal State ---
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [modalShareText, setModalShareText] = useState("");
  const [isPostingTweet, setIsPostingTweet] = useState(false); // Loading state for modal post
  // --- End Modal State ---

  // --- Token Info State ---
  const [tokenInfo, setTokenInfo] = useState<{
    name: string;
    symbol: string;
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

  // Use the proper hook to get token balance AFTER tokenMint is declared
  const { tokenBalance } = useTokenBalance({ tokenId: tokenMint || "" });

  // --- Fetch Real Token Info & Agents ---
  useEffect(() => {
    const fetchTokenData = async () => {
      if (!tokenMint || !API_BASE_URL) {
        setTokenInfo(null);
        return; // Don't fetch if mint is not available
      }

      try {
        // Fetch Token Info
        const infoResponse = await fetch(
          `${API_BASE_URL}/api/token/${tokenMint}`,
        );
        if (!infoResponse.ok) {
          throw new Error(
            `Failed to fetch token info: ${infoResponse.statusText}`,
          );
        }
        const infoData = (await infoResponse.json()) as TokenInfoResponse;
        // TODO: Add validation here (e.g., using Zod)
        setTokenInfo({ name: infoData.name, symbol: infoData.symbol });
      } catch (error) {
        console.error("Error fetching token info:", error);
        setTokenInfo(null);
      }
    };

    fetchTokenData();
  }, [tokenMint]); // Re-fetch when tokenMint changes
  // --- End Fetch Real Token Info & Agents ---

  // Check for Twitter credentials on mount
  useEffect(() => {
    // Don't proceed if we don't have a token mint
    if (!tokenMint) {
      console.warn("No token mint found in URL params");
      return;
    }
    const storedCredentials = localStorage.getItem(STORAGE_KEY);
    if (storedCredentials) {
      try {
        const parsedCredentials = JSON.parse(
          storedCredentials,
        ) as TwitterCredentials;

        // Check if token is expired
        if (parsedCredentials.expiresAt > Date.now()) {
          setTwitterCredentials(parsedCredentials);
        }
      } catch (error) {
        console.error("Failed to parse stored Twitter credentials", error);
        localStorage.removeItem(STORAGE_KEY);
      }
    }

    // In a real implementation, we would fetch token agents from the API
    // fetchTokenAgents(tokenMint);

    // Check for callback from Twitter OAuth
    const urlParams = new URLSearchParams(window.location.search);
    const freshAuth = urlParams.get("fresh_auth") === "true";

    if (freshAuth) {
      // Check if we have a pending share
      const pendingShareData = localStorage.getItem(PENDING_SHARE_KEY);
      if (pendingShareData) {
        try {
          // Parse the stored pieces
          const share = JSON.parse(pendingShareData) as PendingShare;
          const storedCreds = localStorage.getItem(STORAGE_KEY);

          if (storedCreds) {
            const parsedCreds = JSON.parse(storedCreds) as TwitterCredentials;
            setTwitterCredentials(parsedCreds);

            // --- Regenerate Text & Open Modal on Callback ---
            setTimeout(() => {
              // Regenerate the share text using stored pieces
              const regeneratedText = generateShareText(
                { name: share.tokenName, symbol: share.tokenSymbol }, // Use stored token info
              );
              setModalShareText(regeneratedText);

              // Set the image
              setGeneratedImage(share.imageData);

              // Open the modal
              setIsShareModalOpen(true);
            }, 100); // Delay ensures state updates settle
            // --- End Regenerate Text & Open Modal on Callback ---
          } else {
            console.error("No credentials found after authentication");
          }

          // Clean up pending share key
          localStorage.removeItem(PENDING_SHARE_KEY);
        } catch (error) {
          console.error("Failed to process pending share", error);
          setShareError(
            error instanceof Error ? error.message : "Failed to process share",
          );
        }
      }

      // Clean up URL (remove fresh_auth param)
      const currentUrl = new URL(window.location.href);
      if (currentUrl.searchParams.has("fresh_auth")) {
        // Check if param exists before deleting
        currentUrl.searchParams.delete("fresh_auth");
      }
      // Preserve hash/anchor when cleaning up URL
      window.history.replaceState({}, "", currentUrl.pathname + location.hash);
    }
  }, [tokenMint, generatedImage]);

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
    setShareError(null);

    try {
      const tokenMetadata = {
        name: tokenInfo?.name || "Example Token",
        symbol: tokenInfo?.symbol || "XMPL",
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
        headers["Authorization"] = `Bearer ${authToken}`;
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
        if (data.mediaUrl.startsWith("data:")) {
          setGeneratedImage(data.mediaUrl);
        } else {
          // It's a URL, make sure it's absolute
          const fullUrl = data.mediaUrl.startsWith("http")
            ? data.mediaUrl
            : `${env.apiUrl}${data.mediaUrl.startsWith("/") ? "" : "/"}${data.mediaUrl}`;

          setGeneratedImage(fullUrl);
        }

        setProcessingStatus("processed");
        // if (data.remainingGenerations !== undefined) {
        //   toast.success(
        //     `Image generated successfully! You have ${data.remainingGenerations} generations left today.`,
        //   );
        // } else {
        //   toast.success("Image generated successfully!");
        // }
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
    setShareError(null);

    try {
      // In a real implementation, we would fetch the token metadata if not available
      const tokenMetadata = {
        name: tokenInfo?.name || "Example Token",
        symbol: tokenInfo?.symbol || "XMPL",
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
        headers["Authorization"] = `Bearer ${authToken}`;
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

      // Log response status
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
    } finally {
      setIsGenerating(false);
    }
  };

  // --- Tweet Templates & Generator ---
  const tweetTemplates = [
    "Check out this AI image for {TOKEN_NAME} (${TOKEN_SYMBOL})! #AICrypto",
    "I generated this for ${TOKEN_SYMBOL} ({TOKEN_NAME}) using AI! #AIart #Crypto",
    "AI magic for {TOKEN_NAME} (${TOKEN_SYMBOL}). What do you think?",
    "My AI creation for ${TOKEN_SYMBOL}. #TokenArt",
    "Generated with AI for {TOKEN_NAME}!",
    "Vibing with this AI art for ${TOKEN_SYMBOL}.",
    "This is {TOKEN_NAME} (${TOKEN_SYMBOL}) as interpreted by AI.",
    "AI generated image for ${TOKEN_SYMBOL}.",
    "From thought to picture for {TOKEN_NAME}, via AI! #AI #Blockchain",
    "${TOKEN_SYMBOL} AI Generation!",
  ];

  const generateShareText = (
    currentTokenInfo: { name: string; symbol: string } | null,
  ): string => {
    const name = currentTokenInfo?.name || "this token";
    const symbol = currentTokenInfo?.symbol
      ? `$${currentTokenInfo.symbol}`
      : "";

    // Select a random template
    const template =
      tweetTemplates[Math.floor(Math.random() * tweetTemplates.length)];

    // Replace placeholders
    let text = template
      .replace(/{TOKEN_NAME}/g, name)
      .replace(/{TOKEN_SYMBOL}/g, symbol);

    // Basic truncation if needed (Twitter limit is 280)
    if (text.length > 280) {
      // Find last space before limit to avoid cutting words
      const lastSpace = text.lastIndexOf(" ", 277);
      text = text.substring(0, lastSpace > 0 ? lastSpace : 277) + "...";
    }

    return text;
  };
  // --- End Tweet Templates & Generator ---

  // Share on X function
  const shareOnX = useCallback(async () => {
    if (!generatedImage) {
      setShareError("No image to share");
      return;
    }
    // Ensure token info is loaded
    if (!tokenInfo) {
      toast.warn("Token information still loading, please wait a moment.");
      return;
    }

    setIsSharing(true);
    setShareError(null);

    try {
      // --- Generate Dynamic Share Text ---
      const shareText = generateShareText(tokenInfo);
      // --- End Generate Dynamic Share Text ---
      if (twitterCredentials && twitterCredentials.expiresAt > Date.now()) {
        // --- Open Modal Directly ---
        setModalShareText(shareText); // Use generated text
        setIsShareModalOpen(true);
        // --- End Open Modal Directly ---
      } else {
        // Store the pending share and redirect to auth
        const pendingShare: PendingShare = {
          // Store pieces needed to regenerate text later
          imageData: generatedImage,
          tokenName: tokenInfo.name,
          tokenSymbol: tokenInfo.symbol,
        };
        localStorage.setItem(PENDING_SHARE_KEY, JSON.stringify(pendingShare));

        // Store the current path before redirecting
        const currentPath =
          window.location.pathname +
          window.location.search +
          window.location.hash;

        // Add generation anchor if not already present
        const pathWithAnchor =
          currentPath + (currentPath.includes("#") ? "" : "#generation");
        localStorage.setItem(OAUTH_REDIRECT_ORIGIN_KEY, pathWithAnchor);

        // Redirect to OAuth
        const apiUrl = env.apiUrl;
        if (!apiUrl) {
          throw new Error("API URL is not configured");
        }

        window.location.href = `${apiUrl}/api/share/oauth/request_token`;
      }
    } catch (error) {
      console.error("Share failed", error);
      setShareError(error instanceof Error ? error.message : "Share failed");
      toast.error(
        `Share initiation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsSharing(false); // Stop loading state as we are either showing modal or redirecting
    }
  }, [generatedImage, tokenInfo]);

  // Handle Twitter sharing (called FROM the modal or callback)
  const handleShareOnX = async (
    text: string,
    imageData: string,
    creds: TwitterCredentials,
  ) => {
    // This function is now primarily for the actual posting logic
    // It will be called by `confirmAndPostShare`
    try {
      // Double-check if credentials expired
      if (creds.expiresAt < Date.now()) {
        throw new Error(
          "Twitter authentication expired. Please connect again.",
        );
      }

      setShareError(null);
      const mediaId = await uploadImage(imageData, creds.accessToken);
      await postTweet(text, mediaId, creds.accessToken);
      toast.success("Successfully shared to Twitter!");
    } catch (error) {
      console.error("Twitter share failed:", error);
      setShareError(error instanceof Error ? error.message : "Share failed");
      toast.error(
        `Failed to share: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      throw error; // Re-throw to allow the caller to handle loading state
    }
  };

  // --- New function to handle modal confirmation ---
  const confirmAndPostShare = async () => {
    if (!generatedImage || !twitterCredentials) {
      toast.error("Missing image or authentication for sharing.");
      return;
    }

    setIsPostingTweet(true);
    try {
      await handleShareOnX(modalShareText, generatedImage, twitterCredentials);
      setIsShareModalOpen(false); // Close modal on success
    } catch (error) {
      // Error is already handled/logged in handleShareOnX
      // Keep modal open on error
    } finally {
      setIsPostingTweet(false);
    }
  };
  // --- End new function ---

  // Upload image to Twitter
  const uploadImage = async (
    imageData: string,
    accessToken: string,
  ): Promise<string> => {
    try {
      let blob;

      // Convert image data to blob - different handling based on data format
      if (imageData.startsWith("data:")) {
        // It's a data URL, extract the base64 data and convert to blob
        const base64Data = imageData.split(",")[1];
        const byteCharacters = atob(base64Data);
        const byteArrays = [];

        for (let i = 0; i < byteCharacters.length; i += 512) {
          const slice = byteCharacters.slice(i, i + 512);
          const byteNumbers = new Array(slice.length);
          for (let j = 0; j < slice.length; j++) {
            byteNumbers[j] = slice.charCodeAt(j);
          }
          byteArrays.push(new Uint8Array(byteNumbers));
        }

        blob = new Blob(byteArrays, {
          type: imageData.split(";")[0].split(":")[1],
        });
      } else {
        const response = await fetch(imageData);
        blob = await response.blob();
      }

      // Create FormData and append the image
      const formData = new FormData();
      formData.append("media", blob, "share-image.png");
      // Get auth token for the app (separate from Twitter token)
      // const authToken = localStorage.getItem("authToken");

      // Send the upload request
      const uploadResponse = await fetch(`${env.apiUrl}/api/share/tweet`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          // Include wallet auth token if available in a custom header
          // ...(authToken ? { "X-Auth-Token": `Bearer ${authToken}` } : {}),
        },
        body: formData,
        credentials: "include",
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error(
          "Image upload failed with status:",
          uploadResponse.status,
        );
        console.error("Error response body:", errorText);
        // Attempt to parse JSON error if possible
        let detailedError = `Failed to upload image: ${uploadResponse.statusText}`;
        try {
          const jsonError = JSON.parse(errorText);
          if (jsonError.error) {
            detailedError += ` - ${jsonError.error}`;
          }
        } catch (e) {
          // Ignore if not JSON
          detailedError += ` - ${errorText}`;
        }
        throw new Error(detailedError);
      }

      // Parse the response with type
      const responseData = (await uploadResponse.json()) as {
        mediaId: string;
        success?: boolean;
      };

      if (!responseData.mediaId) {
        throw new Error("No media ID received");
      }

      return responseData.mediaId;
    } catch (error) {
      console.error("Error in uploadImage:", error);
      throw error;
    }
  };

  // Post tweet with image
  const postTweet = async (
    text: string,
    mediaId: string,
    accessToken: string,
  ) => {
    try {
      // Get auth token for the app (separate from Twitter token)
      // const authToken = localStorage.getItem("authToken");

      const response = await fetch(`${env.apiUrl}/api/share/tweet`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          // Include wallet auth token if available in a custom header
          // ...(authToken ? { "X-Auth-Token": `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          text,
          mediaId,
        }),
        credentials: "include",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to post tweet: ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error in postTweet:", error);
      throw error;
    }
  };

  // Add download functionality for any media type
  const downloadMedia = useCallback(async () => {
    if (!generatedImage) {
      toast.error("No media to download");
      return;
    }

    try {
      // Convert the URL to a blob
      const response = await fetch(generatedImage);
      const blob = await response.blob();

      // Determine file extension based on media type and content type
      let extension = ".png";
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("video")) {
        extension = ".mp4";
      } else if (contentType?.includes("audio")) {
        extension = ".mp3";
      } else if (contentType === "image/jpeg") {
        extension = ".jpg";
      }

      // Create a URL for the blob
      const blobUrl = window.URL.createObjectURL(blob);

      // Create an anchor element for download
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `generated-${communityTab.toLowerCase()}-${Date.now()}${extension}`;

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
  }, [generatedImage, communityTab]);

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
  const generateAudio = async () => {
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
    setShareError(null);

    try {
      // Get token metadata
      const tokenMetadata = {
        name: tokenInfo?.name || "Example Token",
        symbol: tokenInfo?.symbol || "XMPL",
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
        headers["Authorization"] = `Bearer ${authToken}`;
      }

      // Prepare request body
      const requestBody: any = {
        userPrompt,
        tokenMint,
        tokenMetadata,
        mediaType: "audio",
        mode: "fast", // Audio only has one mode for now
      };

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

      if (!data || typeof data !== "object") {
        throw new Error("Invalid response format");
      }

      if (data.success && data.mediaUrl) {
        // It's a URL, make sure it's absolute
        const fullUrl = data.mediaUrl.startsWith("http")
          ? data.mediaUrl
          : `${env.apiUrl}${data.mediaUrl.startsWith("/") ? "" : "/"}${data.mediaUrl}`;

        setGeneratedImage(fullUrl); // We'll reuse this state for audio too

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
  }, [communityTab]); // Re-run when tab changes

  return (
    <div className="flex flex-col">
      <div className="flex flex-col md:flex-row gap-4">
        {/* Content Area */}
        <div className="flex flex-col grow w-full">
          {/* Main generation controls - consistent across all media types */}
          <div className="flex flex-col gap-4 w-full">
            {/* Controls row - consistent for all media types */}
            <div className="flex items-end py-3">
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
                  <button
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
                  <button
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
            {communityTab === "Video" && (
              <div className="px-4">
                {/* Image upload area for image-to-video */}
                {videoMode === "image" && (
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
                )}
              </div>
            )}

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
                <div className="flex items-center justify-center max-w-[600px] max-h-[600px]">
                  <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#03FF24]"></div>
                </div>
              ) : (
                <>
                  {/* Display area based on media type */}
                  {communityTab === "Audio" &&
                  generatedImage &&
                  processingStatus === "processed" ? (
                    <div className="border border-gray-700 p-4">
                      <audio
                        src={generatedImage}
                        controls
                        className="w-full"
                        autoPlay
                      ></audio>
                    </div>
                  ) : communityTab === "Video" &&
                    generatedImage &&
                    processingStatus === "processed" ? (
                    <div className="border border-gray-700">
                      <video
                        src={generatedImage}
                        controls
                        className="w-full max-h-[500px]"
                        autoPlay
                        loop
                        muted
                      ></video>
                    </div>
                  ) : generatedImage ? (
                    <div
                      className="max-w-[100%] aspect-square w-full"
                      style={{
                        backgroundImage: `url(${generatedImage})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    ></div>
                  ) : null}
                </>
              )}

              {/* Download and share buttons - show for all processed media */}
              {generatedImage && processingStatus === "processed" && (
                <div className="w-full flex items-center justify-between p-2 bg-gradient-to-t from-black/80 to-transparent">
                  {shareError && (
                    <div className="text-red-500 text-sm bg-black/50 p-1 rounded">
                      {shareError}
                    </div>
                  )}
                  <div className="ml-auto flex gap-2">
                    <Button
                      size="small"
                      variant="outline"
                      onClick={downloadMedia}
                      disabled={processingStatus !== "processed"}
                    >
                      Download
                    </Button>
                    <Button
                      size="small"
                      variant="secondary"
                      onClick={shareOnX}
                      disabled={processingStatus !== "processed" || isSharing}
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
      {isShareModalOpen && generatedImage && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-autofun-background-primary p-6 w-full max-w-lg relative text-white font-dm-mono border-4 border-[#2FD345] shadow-xl">
            <button
              onClick={() => setIsShareModalOpen(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-white cursor-pointer"
              aria-label="Close modal"
            >
              <X size={20} />
            </button>
            <h2 className="text-xl font-semibold mb-4 text-[#03FF24]">
              Share on X
            </h2>

            <div className="mb-4 border border-gray-600 overflow-hidden">
              <img
                src={generatedImage}
                alt="Generated content to share"
                className="w-full object-contain bg-gray-700"
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
                onClick={() => setIsShareModalOpen(false)}
                disabled={isPostingTweet}
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
