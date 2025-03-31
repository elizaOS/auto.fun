import { useWallet } from "@solana/wallet-adapter-react";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import Button from "../button";
import SkeletonImage from "../skeleton-image";
import { Badge } from "../ui/badge";

// Storage keys for Twitter auth
const STORAGE_KEY = "twitter-oauth-token";
const PENDING_SHARE_KEY = "pending-twitter-share";
const AGENT_INTENT_KEY = "connect_agent_intent";

// Types for Twitter authentication
type TwitterCredentials = {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

type PendingShare = {
  text: string;
  imageData: string;
};

interface TokenAgent {
  id?: string;
  tokenMint: string;
  ownerAddress: string;
  twitterUserName: string;
  twitterImageUrl: string;
  official: boolean;
  createdAt?: number;
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
  const [isConnectingAgent, setIsConnectingAgent] = useState(false);

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

  // Mock token agents data - in real implementation, would fetch from API
  const [tokenAgents, setTokenAgents] = useState<TokenAgent[]>([
    {
      id: "1",
      tokenMint: tokenMint || "default-mint",
      ownerAddress: "TokenCreatorAddress123",
      twitterUserName: "@officialTokenAccount",
      twitterImageUrl: "/degen.jpg",
      official: true,
      createdAt: Date.now(),
    },
    {
      id: "2",
      tokenMint: tokenMint || "default-mint",
      ownerAddress: "UserAddress456",
      twitterUserName: "@tokenFan1",
      twitterImageUrl: "/degen.jpg",
      official: false,
      createdAt: Date.now() - 86400000,
    },
    {
      id: "3",
      tokenMint: tokenMint || "default-mint",
      ownerAddress: "UserAddress789",
      twitterUserName: "@tokenSupporter",
      twitterImageUrl: "/degen.jpg",
      official: false,
      createdAt: Date.now() - 172800000,
    },
  ]);

  // Current user address - would be from wallet in real implementation
  const currentUserAddress = publicKey?.toString() || "UserAddress456";

  // In a real implementation, this would be fetched from the API
  const tokenCreatorAddress = "TokenCreatorAddress123";

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
      const pendingShare = localStorage.getItem(PENDING_SHARE_KEY);
      if (pendingShare) {
        try {
          const share = JSON.parse(pendingShare) as PendingShare;
          const storedCreds = localStorage.getItem(STORAGE_KEY);

          if (storedCreds) {
            const parsedCreds = JSON.parse(storedCreds) as TwitterCredentials;
            console.log("Found fresh credentials and pending share");
            setTwitterCredentials(parsedCreds);

            // Use setTimeout to ensure this runs after component is fully mounted
            setTimeout(() => {
              console.log("Processing pending share after authentication");
              handleShareOnX(share.text, share.imageData, parsedCreds);
            }, 100);
          } else {
            console.error("No credentials found after authentication");
          }

          // Clean up
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

      // Clean up URL
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [tokenMint]);

  // Fetch token agents (in a real implementation)
  // const fetchTokenAgents = async (mint: string) => {
  //   try {
  //     // In a real implementation, this would be an API call
  //     // const response = await fetch(`${import.meta.env.VITE_API_URL}/api/tokens/${mint}/agents`);
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

  // Share on X function
  const shareOnX = useCallback(async () => {
    if (!generatedImage) {
      setShareError("No image to share");
      return;
    }

    setIsSharing(true);
    setShareError(null);

    try {
      // Create share text with token info if available
      const shareText = tokenMint
        ? `Check out this AI-generated image for $TOKEN_SYMBOL: ${userPrompt}`
        : `Check out this AI-generated image: ${userPrompt}`;

      console.log(
        "Starting image share process, text:",
        shareText.substring(0, 50),
      );
      console.log("Image data type:", typeof generatedImage);

      if (twitterCredentials && twitterCredentials.expiresAt > Date.now()) {
        console.log("User already authenticated with Twitter");
        // User is already authenticated, share directly
        try {
          // First upload the image
          console.log("Step 1: Uploading image to Twitter");
          const mediaId = await uploadImage(
            generatedImage,
            twitterCredentials.accessToken,
          );
          console.log("Image uploaded successfully, media ID:", mediaId);

          // Then post the tweet with the image
          console.log("Step 2: Posting tweet with image");
          await postTweet(shareText, mediaId, twitterCredentials.accessToken);
          console.log("Tweet posted successfully");

          // Show success notification
          toast.success("Successfully shared to Twitter!");
        } catch (error) {
          console.error("Twitter share failed:", error);
          setShareError(
            error instanceof Error ? error.message : "Share failed",
          );
          toast.error(
            `Failed to share: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      } else {
        console.log(
          "User not authenticated with Twitter, storing pending share",
        );
        // Store the pending share and redirect to auth
        const pendingShare: PendingShare = {
          text: shareText,
          imageData: generatedImage,
        };
        localStorage.setItem(PENDING_SHARE_KEY, JSON.stringify(pendingShare));

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
    } finally {
      setIsSharing(false);
    }
  }, [generatedImage, userPrompt, twitterCredentials, tokenMint]);

  // Handle Twitter sharing
  const handleShareOnX = async (
    text: string,
    imageData: string,
    creds: TwitterCredentials,
  ) => {
    try {
      // Double-check if credentials expired
      if (creds.expiresAt < Date.now()) {
        throw new Error(
          "Twitter authentication expired. Please connect again.",
        );
      }

      console.log("Processing Twitter share from callback");
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
    }
  };

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
        throw new Error(`Failed to upload image: ${errorText}`);
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

  // Connect Twitter function for agent
  const connectTwitter = async () => {
    // Verify we have a token mint
    if (!tokenMint) {
      toast.error("No token mint found, cannot connect agent");
      return;
    }

    try {
      setIsConnectingAgent(true);

      // If we already have credentials, connect the agent
      if (twitterCredentials && twitterCredentials.expiresAt > Date.now()) {
        await connectTwitterAgent(twitterCredentials);
      } else {
        // Store the intent to connect agent and the token mint
        localStorage.setItem(AGENT_INTENT_KEY, tokenMint);

        // Redirect to OAuth
        const apiUrl = import.meta.env.VITE_API_URL;
        if (!apiUrl) {
          throw new Error("API URL is not configured");
        }

        window.location.href = `${apiUrl}/api/share/oauth/request_token`;
      }
    } catch (error) {
      console.error("Error connecting Twitter account:", error);
      toast.error(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsConnectingAgent(false);
    }
  };

  // Connect Twitter agent with credentials
  const connectTwitterAgent = async (creds: TwitterCredentials) => {
    if (!tokenMint) {
      toast.error("No token mint found, cannot connect agent");
      return;
    }

    try {
      // 1. Fetch the user's Twitter profile
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/share/process`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${creds.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userId: creds.userId }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to fetch Twitter profile");
      }

      const data = (await response.json()) as {
        twitterUserId: string;
        tweets?: any[];
      };

      // 2. Check if this Twitter account is already connected to this token
      const existingAgent = tokenAgents.find(
        (agent) =>
          agent.twitterUserName === `@twitter_user_${data.twitterUserId}`,
      );

      if (existingAgent) {
        throw new Error(
          "This Twitter account is already connected to this token",
        );
      }

      // 3. In a real implementation, we would make an API call to create a new agent
      // const createResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/tokens/${tokenMint}/agents`, {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({
      //     ownerAddress: currentUserAddress,
      //     twitterUserName: `@twitter_user_${data.twitterUserId}`,
      //     twitterImageUrl: "/degen.jpg",
      //   }),
      // });

      // For now, we'll just add to our local state
      const newAgent: TokenAgent = {
        id: `agent-${Date.now()}`,
        tokenMint,
        ownerAddress: currentUserAddress,
        twitterUserName: `@twitter_user_${data.twitterUserId}`,
        twitterImageUrl: "/degen.jpg", // Would use the actual profile image
        official: currentUserAddress === tokenCreatorAddress,
        createdAt: Date.now(),
      };

      setTokenAgents((prev) => [...prev, newAgent]);

      toast.success("Twitter account successfully connected as an agent!");
    } catch (error) {
      console.error("Failed to connect Twitter agent:", error);
      toast.error(
        `Failed to connect: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  // Remove agent function
  const removeAgent = async (twitterUserName: string) => {
    try {
      // In a real implementation, we would call an API to remove the agent
      // await fetch(`${import.meta.env.VITE_API_URL}/api/tokens/${tokenMint}/agents/${agentId}`, {
      //   method: "DELETE"
      // });

      // For now, just update local state
      setTokenAgents((prev) =>
        prev.filter((agent) => agent.twitterUserName !== twitterUserName),
      );

      toast.success("Agent removed successfully");
    } catch (error) {
      console.error("Error removing agent:", error);
      toast.error(
        `Failed to remove agent: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  // Sorted agents with officials at the top
  const sortedAgents = [...tokenAgents].sort((a, b) =>
    a.official && !b.official ? -1 : !a.official && b.official ? 1 : 0,
  );

  // Check if the callback is from a connect agent intent
  useEffect(() => {
    const storedMint = localStorage.getItem(AGENT_INTENT_KEY);
    if (!storedMint) return;

    const urlParams = new URLSearchParams(window.location.search);
    const freshAuth = urlParams.get("fresh_auth") === "true";

    if (freshAuth && storedMint) {
      console.log("Processing agent connection after OAuth callback");

      // Make sure the stored mint matches the current page's token mint
      if (storedMint === tokenMint) {
        // Get the Twitter credentials
        const storedCreds = localStorage.getItem(STORAGE_KEY);
        if (storedCreds) {
          try {
            const parsedCreds = JSON.parse(storedCreds) as TwitterCredentials;
            setTwitterCredentials(parsedCreds);

            // Use setTimeout to avoid potential stack issues
            setTimeout(() => {
              console.log("Connecting Twitter agent after authentication");
              connectTwitterAgent(parsedCreds).catch((error) => {
                console.error("Error connecting agent:", error);
                toast.error(
                  `Failed to connect agent: ${error instanceof Error ? error.message : "Unknown error"}`,
                );
              });
            }, 100);
          } catch (error) {
            console.error("Failed to process agent connection", error);
            toast.error(
              `Failed to connect agent: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
          }
        }
      } else {
        toast.warning(
          `Attempted to connect agent to wrong token. Please try again.`,
        );
      }

      // Clean up intent
      localStorage.removeItem(AGENT_INTENT_KEY);

      // Clean up URL
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [tokenMint]);

  // Add debug information to the UI if in development mode
  const debugInfo = import.meta.env.DEV && (
    <div className="text-xs text-gray-500 mt-1">
      Token Mint: {tokenMint || "Not detected"}
      {!tokenMint && (
        <span className="text-yellow-500">
          {" "}
          (Using mock token for development)
        </span>
      )}
    </div>
  );

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
      <div className="flex gap-4">
        {communityTab === "Image" ? (
          <div className="flex flex-col gap-4 w-full">
            <div className="font-dm-mono text-autofun-background-action-highlight text-xl">
              Input
            </div>
            <p className="text-sm text-autofun-text-secondary font-dm-mono max-w-3xl w-fit">
              Create and share an AI-generated image based on your prompt.
            </p>
            {debugInfo}
            <div className="flex flex-col md:flex-row gap-4 w-full">
              <div className="flex flex-col gap-4 w-full grow">
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

                {/* Result section placed directly under the input in the left column */}
                <div className="flex flex-col gap-4 border p-4">
                  <div className="flex items-center gap-2.5">
                    <div className="font-dm-mono text-autofun-background-action-highlight text-xl">
                      Result
                    </div>
                    <div className="flex items-center gap-2.5">
                      {processingStatus === "processing" && (
                        <Badge variant="default">Processing</Badge>
                      )}
                      {processingStatus === "processed" && (
                        <Badge variant="success">Processed</Badge>
                      )}
                      {processingStatus === "failed" && (
                        <Badge variant="destructive">Failed</Badge>
                      )}
                    </div>
                  </div>

                  {processingStatus === "processing" ? (
                    <div className="w-full flex items-center justify-center h-[300px]">
                      <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#03FF24]"></div>
                    </div>
                  ) : (
                    <div className="w-full h-[300px] flex items-center justify-center overflow-hidden">
                      <SkeletonImage
                        src={generatedImage || "/placeholder-image.png"}
                        width={1024}
                        height={1024}
                        alt="generated_image"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}

                  <div className="w-full flex items-center justify-between">
                    {shareError && (
                      <div className="text-red-500 text-sm">{shareError}</div>
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
                        disabled={processingStatus !== "processed" || isSharing}
                      >
                        {isSharing ? "Sharing..." : "Share on X"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-black/20 p-4 space-y-2 w-full md:w-3/6 border h-fit">
                <h1 className="mb-4 text-xl text-autofun-background-action-highlight font-dm-mono">
                  Token Agents
                </h1>
                <div className="overflow-y-auto max-h-64">
                  {sortedAgents.length > 0 ? (
                    <table className="w-full">
                      <thead>
                        <tr className="text-left border-b border-neutral-800">
                          <th className="pb-2">Agent</th>
                          <th className="pb-2">Status</th>
                          <th className="pb-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedAgents.map((agent, index) => (
                          <tr
                            key={index}
                            className="border-b border-neutral-800"
                          >
                            <td className="py-2">
                              <div className="flex items-center gap-2">
                                <img
                                  src={agent.twitterImageUrl}
                                  alt={agent.twitterUserName}
                                  className="w-8 h-8 rounded-full"
                                />
                                <span>{agent.twitterUserName}</span>
                              </div>
                            </td>
                            <td className="py-2">
                              {agent.official ? (
                                <Badge variant="success">Official</Badge>
                              ) : (
                                <Badge variant="default">Community</Badge>
                              )}
                            </td>
                            <td className="py-2 text-right">
                              {agent.ownerAddress === currentUserAddress && (
                                <button
                                  onClick={() =>
                                    removeAgent(agent.twitterUserName)
                                  }
                                  title="Remove agent"
                                  className="text-red-500 hover:text-red-400"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="text-center py-4 text-neutral-400">
                      No agents connected to this token yet
                    </div>
                  )}
                </div>
                <div className="mt-4">
                  <button
                    onClick={connectTwitter}
                    className="bg-[#03FF24] p-3 font-bold border-2 text-black text-[12px] md:text-[15px] hover:bg-[#27b938] transition-colors disabled:opacity-50 disabled:bg-[#333333] disabled:hover:bg-[#333333]"
                    disabled={isConnectingAgent || !tokenMint}
                  >
                    {isConnectingAgent ? "Connecting..." : "Connect X account"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : communityTab === "Audio" ? (
          <div>Audio generator page coming soon!</div>
        ) : null}
      </div>
    </div>
  );
}
