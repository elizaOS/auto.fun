import { useWallet } from "@solana/wallet-adapter-react";
import { X, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import Button from "../button";

// --- API Base URL ---
const API_BASE_URL = import.meta.env.VITE_API_URL || ""; // Ensure fallback

// Additional imports for balance checking
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

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
  type ICommunityTabs = "Image" | "Audio";
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
  
  // Balance checking state
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);
  const [hasEnoughTokens, setHasEnoughTokens] = useState<boolean | null>(null);

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
    console.log("URL params mint:", urlTokenMint);

    // First try from URL params (most reliable)
    if (urlTokenMint) {
      console.log("Using token mint from URL params:", urlTokenMint);
      setDetectedTokenMint(urlTokenMint);
      return;
    }

    // If not in params, try to extract from pathname
    const pathMatch = location.pathname.match(/\/token\/([A-Za-z0-9]{32,44})/);
    if (pathMatch && pathMatch[1]) {
      console.log("Extracted token mint from pathname:", pathMatch[1]);
      setDetectedTokenMint(pathMatch[1]);
      return;
    }

    // If still not found, check if we might be in a token context from parent component
    // This would be implemented in a real app by checking context or props
    console.log("Could not detect token mint from URL or path");

    // For testing, allow image generation with mock token
    if (import.meta.env.DEV) {
      const mockMint = "TokenDevPLACEHOLDERxxxxxxxxxxxxxxxxxxxxx";
      console.log("Using mock token mint for development:", mockMint);
      setDetectedTokenMint(mockMint);
    }
  }, [urlTokenMint, location.pathname]);

  // Use detected token mint instead of directly from params
  const tokenMint = detectedTokenMint;

  // --- Fetch Real Token Info & Agents ---
  useEffect(() => {
    const fetchTokenData = async () => {
      if (!tokenMint || !API_BASE_URL) {
        console.log("Skipping fetch: No tokenMint or API_BASE_URL");
        setTokenInfo(null);
        return; // Don't fetch if mint is not available
      }

      try {
        // Fetch Token Info
        console.log(`Fetching token info for ${tokenMint}...`);
        const infoResponse = await fetch(
          `${API_BASE_URL}/api/token/${tokenMint}`,
        );
        console.log("Token info response:", infoResponse);
        if (!infoResponse.ok) {
          throw new Error(
            `Failed to fetch token info: ${infoResponse.statusText}`,
          );
        }
        const infoData = (await infoResponse.json()) as TokenInfoResponse;
        // TODO: Add validation here (e.g., using Zod)
        setTokenInfo({ name: infoData.name, symbol: infoData.symbol });
        console.log("Token info received:", infoData);
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

    console.log("Checking for Twitter credentials...");
    const storedCredentials = localStorage.getItem(STORAGE_KEY);
    if (storedCredentials) {
      try {
        const parsedCredentials = JSON.parse(
          storedCredentials,
        ) as TwitterCredentials;

        // Check if token is expired
        if (parsedCredentials.expiresAt < Date.now()) {
          console.log(
            "Twitter token has expired, user needs to re-authenticate",
          );
        } else {
          setTwitterCredentials(parsedCredentials);
          console.log("Valid Twitter credentials loaded from storage");
        }
      } catch (error) {
        console.error("Failed to parse stored Twitter credentials", error);
        localStorage.removeItem(STORAGE_KEY);
      }
    } else {
      console.log("No Twitter credentials found in storage");
    }

    // In a real implementation, we would fetch token agents from the API
    // fetchTokenAgents(tokenMint);

    // Check for callback from Twitter OAuth
    const urlParams = new URLSearchParams(window.location.search);
    const freshAuth = urlParams.get("fresh_auth") === "true";

    if (freshAuth) {
      console.log("Detected fresh Twitter authentication");

      // Check if we have a pending share
      const pendingShareData = localStorage.getItem(PENDING_SHARE_KEY);
      if (pendingShareData) {
        try {
          // Parse the stored pieces
          const share = JSON.parse(pendingShareData) as PendingShare;
          const storedCreds = localStorage.getItem(STORAGE_KEY);

          if (storedCreds) {
            const parsedCreds = JSON.parse(storedCreds) as TwitterCredentials;
            console.log("Found fresh credentials and pending share pieces");
            setTwitterCredentials(parsedCreds);

            // --- Regenerate Text & Open Modal on Callback ---
            setTimeout(() => {
              console.log(
                "Regenerating share text and opening modal after authentication",
              );

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
      } else {
        console.log("No pending share found after authentication");
      }

      // Clean up URL (remove fresh_auth param)
      const currentUrl = new URL(window.location.href);
      if (currentUrl.searchParams.has("fresh_auth")) {
        // Check if param exists before deleting
        currentUrl.searchParams.delete("fresh_auth");
      }
      window.history.replaceState({}, "", currentUrl.toString());
    }
  }, [tokenMint, generatedImage]);

  // Fetch token agents (in a real implementation)
  // const fetchTokenAgents = async (mint: string) => {
  //   try {
  //     // In a real implementation, this would be an API call
  //     // const response = await fetch(`${import.meta.env.VITE_API_URL}/api/token/${mint}/agents`);
  //     // if (response.ok) {
  //     //   const agents = await response.json();
  //     //   setTokenAgents(agents);
  //     // }
  //     console.log(`Fetching agents for token ${mint}`);
  //   } catch (error) {
  //     console.error("Error fetching token agents:", error);
  //   }
  // };

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

    setIsGenerating(true);
    setProcessingStatus("processing");
    setGeneratedImage(null); // Clear previous image
    setShareError(null);

    try {
      console.log(
        `Generating image for token ${tokenMint} with prompt: ${userPrompt}`,
      );

      // In a real implementation, we would fetch the token metadata if not available
      // For now, we'll use mock token data or fetch from the page's context
      const tokenMetadata = {
        name: "Example Token", // In reality, would fetch this
        symbol: "XMPL", // In reality, would fetch this
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
      const apiUrl = `${import.meta.env.VITE_API_URL}/api/enhance-and-generate`;
      console.log("Calling API endpoint:", apiUrl);

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
        }),
        credentials: "include", // Important to include credentials for auth cookies
      });

      // Log response status and headers for debugging
      console.log("Response status:", response.status);
      // Headers object doesn't have a standard iterator, so we'll get keys and values manually
      const headerObj: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headerObj[key] = value;
      });
      console.log("Response headers:", headerObj);

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
              const currentAmount = errorData.message?.match(/You currently have ([\d.]+)/)?.[1] || "0";
              
              // Show a more helpful message with a link to buy tokens
              const buyTokensUrl = `/token/${tokenMint}?action=buy`;
              
              toast.error(
                <div>
                  <p>You need at least {minimumRequired} tokens to use this feature.</p>
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
                }
              );
              throw new Error(`Insufficient token balance. You need at least ${minimumRequired} tokens.`);
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
        const textResponse = await response.text();
        console.log("Raw text response:", textResponse);
        throw new Error("Failed to parse server response");
      }

      console.log("API response:", data);

      // Make sure we have the expected fields
      if (!data || typeof data !== "object") {
        throw new Error("Invalid response format");
      }

      if (data.success && data.mediaUrl) {
        // Check if mediaUrl is a data URL or a regular URL
        if (data.mediaUrl.startsWith("data:")) {
          // It's already a data URL, use directly
          setGeneratedImage(data.mediaUrl);
          console.log(
            "Using data URL directly:",
            data.mediaUrl.substring(0, 50) + "...",
          );
        } else {
          // It's a URL, make sure it's absolute
          const fullUrl = data.mediaUrl.startsWith("http")
            ? data.mediaUrl
            : `${import.meta.env.VITE_API_URL}${data.mediaUrl.startsWith("/") ? "" : "/"}${data.mediaUrl}`;

          console.log("Using image URL:", fullUrl);
          setGeneratedImage(fullUrl);
        }

        setProcessingStatus("processed");

        if (data.enhancedPrompt) {
          console.log("Enhanced prompt:", data.enhancedPrompt);
        }

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
    console.log("currentTokenInfo", currentTokenInfo);
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

      console.log(
        "Starting image share process, generated text:",
        shareText.substring(0, 50),
      );
      console.log("Image data type:", typeof generatedImage);

      if (twitterCredentials && twitterCredentials.expiresAt > Date.now()) {
        console.log(
          "User already authenticated with Twitter. Opening share modal...",
        );
        // --- Open Modal Directly ---
        setModalShareText(shareText); // Use generated text
        setIsShareModalOpen(true);
        // --- End Open Modal Directly ---
      } else {
        console.log(
          "User not authenticated with Twitter, storing pending share and origin",
        );
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
        localStorage.setItem(OAUTH_REDIRECT_ORIGIN_KEY, currentPath);
        console.log("Stored origin path for redirect:", currentPath);

        // Redirect to OAuth
        const apiUrl = import.meta.env.VITE_API_URL;
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

      console.log("Processing Twitter share from modal/callback");
      setShareError(null);

      // First upload the image
      console.log("Step 1: Uploading image to Twitter");
      const mediaId = await uploadImage(imageData, creds.accessToken);
      console.log("Image uploaded successfully, media ID:", mediaId);

      // Then post the tweet with the image
      console.log("Step 2: Posting tweet with image");
      await postTweet(text, mediaId, creds.accessToken);
      console.log("Tweet posted successfully");

      // Show success notification
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
      console.log(
        "Uploading image to Twitter with image data type:",
        typeof imageData,
      );
      console.log(
        "Image data starts with:",
        imageData.substring(0, 50) + "...",
      );

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
        console.log("Created blob from data URL, size:", blob.size);
      } else {
        // It's a URL, fetch and convert to blob
        console.log("Fetching image from URL:", imageData);
        const response = await fetch(imageData);
        blob = await response.blob();
        console.log("Fetched image blob, size:", blob.size);
      }

      // Create FormData and append the image
      const formData = new FormData();
      formData.append("media", blob, "share-image.png");

      console.log(
        "Sending image to API:",
        `${import.meta.env.VITE_API_URL}/api/share/tweet`,
      );

      // Send the upload request
      const uploadResponse = await fetch(
        `${import.meta.env.VITE_API_URL}/api/share/tweet`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: formData,
        },
      );

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
      console.log("Posting tweet with text:", text);
      console.log("Using media ID:", mediaId);

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/share/tweet`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text,
            mediaId,
          }),
        },
      );

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

  // Add download functionality
  const downloadImage = useCallback(async () => {
    if (!generatedImage) {
      toast.error("No image to download");
      return;
    }

    try {
      // Convert the image URL to a blob
      const response = await fetch(generatedImage);
      const blob = await response.blob();

      // Create a URL for the blob
      const blobUrl = window.URL.createObjectURL(blob);

      // Create an anchor element for download
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `generated-image-${Date.now()}.png`;

      // Trigger the download
      document.body.appendChild(a);
      a.click();

      // Cleanup
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(a);

      toast.success("Image download started");
    } catch (error) {
      console.error("Error downloading image:", error);
      toast.error("Failed to download image");
    }
  }, [generatedImage]);

  // Add function to check token balance
  const checkTokenBalance = async () => {
    if (!publicKey || !tokenMint) {
      toast.error("Please connect your wallet and navigate to a token page");
      return;
    }

    try {
      setIsCheckingBalance(true);
      
      // Get wallet mode setting from environment
      const userWalletMode = import.meta.env.VITE_USER_WALLET_MODE || "default";
      const isLocalMode = userWalletMode === "local";
      
      console.log(`Checking token balance in ${isLocalMode ? "local" : "standard"} mode`);
      
      // Get stored auth token if available
      const authToken = localStorage.getItem("authToken");
      
      // First try to get balance from API (which uses the database)
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/token/${tokenMint}/check-balance?address=${publicKey.toString()}${isLocalMode ? '&mode=local' : ''}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              ...(authToken ? { "Authorization": `Bearer ${authToken}` } : {})
            },
            credentials: "include",
          }
        );
        
        if (response.ok) {
          const data = await response.json() as { balance?: number };
          if (data.balance !== undefined) {
            const formattedBalance = Number(data.balance);
            setTokenBalance(formattedBalance);
            setHasEnoughTokens(formattedBalance >= 1000);
            return;
          }
        }
      } catch (apiError) {
        console.error("API balance check failed:", apiError);
        // Continue to fallback method if API fails
      }
      
      // Fallback: Check balance on-chain on both networks if in local mode
      // Get network information from environment variables
      const devnetRpcUrl = import.meta.env.VITE_DEVNET_RPC_URL || "https://api.devnet.solana.com";
      const mainnetRpcUrl = import.meta.env.VITE_MAINNET_RPC_URL || "https://api.mainnet-beta.solana.com";
      const defaultRpcUrl = import.meta.env.VITE_RPC_URL || "https://api.devnet.solana.com";
      
      // Decide which networks to check
      const networksToCheck = isLocalMode 
        ? [
            { name: "devnet", url: devnetRpcUrl },
            { name: "mainnet", url: mainnetRpcUrl }
          ] 
        : [{ name: import.meta.env.VITE_SOLANA_NETWORK || "devnet", url: defaultRpcUrl }];
      
      let totalBalance = 0;
      let foundOnNetwork = "";
      
      // Check each network we decided to look at
      for (const network of networksToCheck) {
        try {
          console.log(`Checking token balance on ${network.name} (${network.url})`);
          const connection = new Connection(network.url);
          
          // Get token accounts owned by user for this mint
          const tokenAccounts = await connection.getTokenAccountsByOwner(
            publicKey,
            { mint: new PublicKey(tokenMint) },
            { commitment: "confirmed" }
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
            console.log(`Found balance of ${networkBalance} tokens on ${network.name}`);
            break; // Stop checking other networks
          }
        } catch (networkError) {
          console.error(`Error checking ${network.name}:`, networkError);
        }
      }
      
      setTokenBalance(totalBalance);
      setHasEnoughTokens(totalBalance >= 1000);
      
      // Show appropriate toast message
      if (totalBalance > 0) {
        if (foundOnNetwork) {
          toast.success(`You have ${totalBalance.toFixed(2)} tokens on ${foundOnNetwork}${totalBalance >= 1000 ? ' - enough to generate content!' : ''}`);
        } else {
          toast.success(`You have ${totalBalance.toFixed(2)} tokens${totalBalance >= 1000 ? ' - enough to generate content!' : ''}`);
        }
      } else {
        toast.warning(`You have 0 tokens. You need at least 1,000 to generate content.`);
      }
      
    } catch (error) {
      console.error("Error checking token balance:", error);
      toast.error("Failed to check token balance");
    } finally {
      setIsCheckingBalance(false);
    }
  };

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="flex flex-row">
        <Button
          variant={communityTab === "Image" ? "tab" : "primary"}
          onClick={() => setCommunityTab("Image")}
        >
          Image
        </Button>
        <Button variant={communityTab === "Audio" ? "tab" : "primary"} disabled>
          Audio
        </Button>
      </div>

      <div className="flex flex-row">
        <div className="flex flex-col grow mr-4">
          {communityTab === "Image" ? (
            <>
              <div className="flex flex-col gap-4 w-full flex-grow">
                <div className="flex flex-col md:flex-row gap-4 w-full">
                  <div className="flex flex-col mt-4 w-full">
                    <div className="flex">
                      <input
                        type="text"
                        value={userPrompt}
                        onChange={(e) => setUserPrompt(e.target.value)}
                        placeholder="Enter a concept like 'a halloween token about arnold schwarzenegger'"
                        className="flex-1 my-2 p-0 border-b border-b-[#03FF24] text-white bg-transparent focus:outline-none focus:border-b-white"
                      />
                      <button
                        onClick={generateImage}
                        disabled={isGenerating || !userPrompt.trim()}
                        className="p-0 transition-colors disabled:opacity-50"
                      >
                        <img
                          src={
                            isGenerating
                              ? "/create/generating.svg"
                              : "/create/generateup.svg"
                          }
                          alt="Generate"
                          className="h-14 mb-2"
                          onMouseDown={(e) => {
                            if (!isGenerating) {
                              (e.target as HTMLImageElement).src =
                                "/create/generatedown.svg";
                            }
                          }}
                          onMouseUp={(e) => {
                            if (!isGenerating) {
                              (e.target as HTMLImageElement).src =
                                "/create/generateup.svg";
                            }
                          }}
                          onDragStart={(e) => e.preventDefault()}
                          onMouseOut={(e) => {
                            if (!isGenerating) {
                              (e.target as HTMLImageElement).src =
                                "/create/generateup.svg";
                            }
                          }}
                        />
                      </button>
                    </div>

                    <div className="text-sm text-autofun-text-secondary mb-4">
                      <div className="flex items-center">
                        <p>
                          Note: You need to hold at least 1,000 tokens to generate content. 
                          Token creators can generate content regardless of their token holdings.
                        </p>
                      </div>
                    </div>

                    {/* Token Balance Section */}
                    <div className="flex items-center mb-4 bg-autofun-background-card border border-autofun-stroke-primary p-2 rounded-md">
                      <Wallet className="text-autofun-text-highlight mr-2 size-5" />
                      <div className="flex-1">
                        <span className="text-autofun-text-primary text-sm">
                          {tokenBalance !== null 
                            ? `Your Balance: ${tokenBalance.toFixed(2)} tokens ${
                                hasEnoughTokens 
                                  ? '✅ Eligible to generate' 
                                  : '❌ Need at least 1,000 tokens'
                              }`
                            : 'Check your token balance'}
                        </span>
                      </div>
                      <Button 
                        size="small" 
                        variant="secondary"
                        onClick={checkTokenBalance}
                        disabled={isCheckingBalance || !publicKey}
                      >
                        {isCheckingBalance ? 'Checking...' : 'Check Balance'}
                      </Button>
                    </div>

                    <div className="flex flex-col relative">
                      {processingStatus === "processing" ? (
                        <div className="flex items-center justify-center w-[600px] h-[600px]">
                          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#03FF24]"></div>
                        </div>
                      ) : (
                        <div
                          className="w-[600px] h-[600px]"
                          style={{
                            backgroundImage: `url(${generatedImage})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                          }}
                        ></div>
                      )}

                      <div className="w-full flex items-center justify-between absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                        {shareError && (
                          <div className="text-red-500 text-sm bg-black/50 p-1 rounded">
                            {shareError}
                          </div>
                        )}
                        <div className="ml-auto flex gap-2">
                          <Button
                            size="small"
                            variant="outline"
                            onClick={downloadImage}
                            disabled={processingStatus !== "processed"}
                          >
                            Download
                          </Button>
                          <Button
                            size="small"
                            variant="secondary"
                            onClick={shareOnX}
                            disabled={
                              processingStatus !== "processed" || isSharing
                            }
                          >
                            {isSharing ? "Sharing..." : "Share on X"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : communityTab === "Audio" ? (
            <div>Audio generator page coming soon!</div>
          ) : null}
        </div>
      </div>
      {isShareModalOpen && generatedImage && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-autofun-background-primary p-6 w-full max-w-lg relative text-white font-dm-mono border-4 border-[#2FD345] shadow-xl">
            <button
              onClick={() => setIsShareModalOpen(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-white"
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
