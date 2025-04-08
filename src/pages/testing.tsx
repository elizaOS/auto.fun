import { env } from "@/utils/env";
import { useCallback, useEffect, useState } from "react";

// Storage keys
const STORAGE_KEY = "twitter-oauth-token";
const PENDING_SHARE_KEY = "pending-twitter-share";

// Types
type Credentials = {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

type PendingShare = {
  text: string;
  imageData: string;
};

export default function TwitterSharePage() {
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [apiUrlStatus, setApiUrlStatus] = useState<"checking" | "ok" | "error">(
    "checking",
  );
  const [tokenStatus, setTokenStatus] = useState<"valid" | "expired" | "none">(
    "none",
  );

  // Check if the API URL is valid
  useEffect(() => {
    const apiUrl = env.apiUrl;
    if (!apiUrl) {
      console.error("VITE_API_URL is not defined in environment variables");
      setApiUrlStatus("error");
      setShareError("Twitter API configuration error: missing API URL");
    } else {
      setApiUrlStatus("ok");
    }
  }, []);

  // Load credentials from localStorage on mount and check token validity
  useEffect(() => {
    const storedCredentials = localStorage.getItem(STORAGE_KEY);
    if (storedCredentials) {
      try {
        const parsedCredentials = JSON.parse(storedCredentials) as Credentials;

        // Check if token is expired
        if (parsedCredentials.expiresAt < Date.now()) {
          console.log("Token has expired, user needs to re-authenticate");
          setTokenStatus("expired");
          // Optionally clear expired credentials
          // localStorage.removeItem(STORAGE_KEY);
        } else {
          setCredentials(parsedCredentials);
          setTokenStatus("valid");
          console.log("Valid Twitter credentials loaded from storage");
        }
      } catch (error) {
        console.error("Failed to parse stored credentials", error);
        localStorage.removeItem(STORAGE_KEY);
      }
    } else {
      console.log("No Twitter credentials found in storage");
    }

    // Check for pending share after callback
    const urlParams = new URLSearchParams(window.location.search);
    const freshAuth = urlParams.get("fresh_auth") === "true";

    if (freshAuth) {
      console.log("Detected fresh authentication, checking for pending share");
      const pendingShare = localStorage.getItem(PENDING_SHARE_KEY);
      if (pendingShare) {
        try {
          const share = JSON.parse(pendingShare) as PendingShare;

          // Process the pending share now that we're authenticated
          const storedCreds = localStorage.getItem(STORAGE_KEY);
          if (storedCreds) {
            const parsedCreds = JSON.parse(storedCreds) as Credentials;
            console.log(
              "Found fresh credentials and pending share, processing share",
            );
            setCredentials(parsedCreds);
            setTokenStatus("valid");
            handleTwitterShare(share.text, share.imageData, parsedCreds);
          } else {
            throw new Error("No credentials found after authentication");
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
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setCredentials(null);
    setTokenStatus("none");
    setShareSuccess(false);
    setShareError(null);
    console.log("User logged out, Twitter credentials cleared");
  }, []);

  // Handle the share button click
  const handleShare = useCallback(async () => {
    // Check API URL status
    if (apiUrlStatus !== "ok") {
      setShareError(
        "Twitter API configuration error. Please check your environment variables.",
      );
      return;
    }

    // Check if token is expired
    if (tokenStatus === "expired" && credentials) {
      setShareError(
        "Your Twitter authorization has expired. Please log in again.",
      );
      logout();
      return;
    }

    setIsSharing(true);
    setShareError(null);
    setShareSuccess(false);

    try {
      // Example image and text for the share
      const dummyImage = await createDummyImage();
      const shareText = "Sharing from my awesome app! #TestShare";

      if (credentials && tokenStatus === "valid") {
        console.log("User has valid credentials, sharing directly");
        // User is already authenticated, share directly
        await handleTwitterShare(shareText, dummyImage, credentials);
      } else {
        console.log(
          "User not authenticated, storing pending share and redirecting to OAuth",
        );
        // Store the pending share and redirect to auth
        const pendingShare: PendingShare = {
          text: shareText,
          imageData: dummyImage,
        };
        localStorage.setItem(PENDING_SHARE_KEY, JSON.stringify(pendingShare));

        // Check for client ID
        const apiUrl = env.apiUrl;
        if (!apiUrl) {
          throw new Error(
            "API URL is not configured. Check your environment variables.",
          );
        }

        // Redirect to OAuth
        console.log(
          "Redirecting to Twitter OAuth:",
          `${apiUrl}/api/share/oauth/request_token`,
        );
        window.location.href = `${apiUrl}/api/share/oauth/request_token`;
      }
    } catch (error) {
      console.error("Share failed", error);
      setShareError(error instanceof Error ? error.message : "Share failed");
    } finally {
      setIsSharing(false);
    }
  }, [credentials, apiUrlStatus, tokenStatus, logout]);

  // Function to handle the Twitter share
  const handleTwitterShare = async (
    text: string,
    imageData: string,
    creds: Credentials,
  ) => {
    try {
      // Double-check if credentials expired
      if (creds.expiresAt < Date.now()) {
        setTokenStatus("expired");
        throw new Error("Twitter authentication expired. Please log in again.");
      }

      console.log("Uploading image to Twitter...");
      setShareError(null);

      try {
        // First upload the image
        const mediaId = await uploadImage(imageData, creds.accessToken);
        console.log("Image uploaded successfully, media ID:", mediaId);

        // Then post the tweet with the image
        console.log("Posting tweet with image...");
        await postTweet(text, mediaId, creds.accessToken);
        console.log("Tweet posted successfully");
        setShareSuccess(true);
      } catch (error) {
        console.error("Twitter share failed:", error);
        setShareError(error instanceof Error ? error.message : "Share failed");
        throw error;
      }
    } catch (error) {
      console.error("Twitter share failed", error);
      setShareError(error instanceof Error ? error.message : "Share failed");
      throw error;
    }
  };

  // Upload image to Twitter
  const uploadImage = async (
    imageData: string,
    accessToken: string,
  ): Promise<string> => {
    console.log(
      "Sending image upload request to:",
      `${env.apiUrl}/api/share/tweet`,
    );

    try {
      // Convert base64/URL to blob
      const response = await fetch(imageData);
      const blob = await response.blob();

      // Create FormData and append the image
      const formData = new FormData();
      formData.append("media", blob, "share-image.png");

      // Send the upload request
      const uploadResponse = await fetch(`${env.apiUrl}/api/share/tweet`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error(
          "Image upload failed with status:",
          uploadResponse.status,
        );
        console.error("Response:", errorText);
        throw new Error(`Failed to upload image: ${errorText}`);
      }

      // Parse the response
      const responseData = (await uploadResponse.json()) as {
        success: boolean;
        mediaId: string;
      };

      if (!responseData.mediaId) {
        console.error("No media ID in response:", responseData);
        throw new Error("No media ID received");
      }

      console.log(
        "Media upload successful, received media ID:",
        responseData.mediaId,
      );
      return responseData.mediaId;
    } catch (error) {
      console.error("Error in uploadImage:", error);
      if (error instanceof Error && error.message.includes("expired")) {
        setTokenStatus("expired");
      }
      throw error;
    }
  };

  // Post tweet with image
  const postTweet = async (
    text: string,
    mediaId: string,
    accessToken: string,
  ) => {
    console.log(
      "Sending tweet post request to:",
      `${env.apiUrl}/api/share/tweet`,
    );
    console.log("With text:", text.substring(0, 30) + "...");
    console.log("And media ID:", mediaId);

    try {
      const response = await fetch(`${env.apiUrl}/api/share/tweet`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          mediaId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Tweet post failed with status:", response.status);
        console.error("Response:", errorText);
        throw new Error(`Failed to post tweet: ${errorText}`);
      }

      const responseData = await response.json();
      console.log("Tweet posted successfully:", responseData);
      return responseData;
    } catch (error) {
      console.error("Error in postTweet:", error);
      if (error instanceof Error && error.message.includes("expired")) {
        setTokenStatus("expired");
      }
      throw error;
    }
  };

  // Create a dummy image for testing
  const createDummyImage = async (): Promise<string> => {
    // Return a base64 encoded dummy image or URL
    // For simplicity, we'll use a placeholder service in this example
    return "https://develop.autofun.pages.dev/example.png";
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-900 text-white">
      <h1 className="text-4xl font-bold mb-8 text-[#00FF04]">
        Twitter Share Demo
      </h1>

      {/* Display image to share */}
      <div className="mb-8 border border-gray-700 rounded-lg overflow-hidden w-full max-w-md">
        <img
          src="https://develop.autofun.pages.dev/example.png"
          alt="Share Preview"
          className="w-full h-auto"
        />
      </div>

      {/* Auth status */}
      {credentials && (
        <div className="mb-4 p-3 bg-gray-800 rounded-lg w-full max-w-md">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-gray-400">Logged in with Twitter ID:</span>
              <span className="font-mono ml-2">{credentials.userId}</span>
              <span className="ml-2 text-xs">
                {tokenStatus === "valid" ? (
                  <span className="text-green-400">✓ Valid</span>
                ) : (
                  <span className="text-red-400">⚠ Expired</span>
                )}
              </span>
            </div>
            <button
              onClick={logout}
              className="text-red-400 hover:text-red-300 px-2 py-1 text-sm"
            >
              Logout
            </button>
          </div>
        </div>
      )}

      {/* API configuration status */}
      {apiUrlStatus === "error" && (
        <div className="mb-4 p-3 bg-red-800/30 border border-red-600 rounded-lg w-full max-w-md text-red-300">
          <p>Twitter API configuration error</p>
          <p className="text-xs mt-1">
            Check that VITE_API_URL is defined in your environment
          </p>
        </div>
      )}

      {/* Share button */}
      <button
        onClick={handleShare}
        disabled={
          isSharing || apiUrlStatus === "error" || tokenStatus === "expired"
        }
        className="bg-[#00FF04] hover:bg-[#00FF04]/80 text-black font-bold py-3 px-6 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSharing
          ? "Sharing..."
          : credentials
            ? "Share on Twitter"
            : "Connect & Share on Twitter"}
      </button>

      {/* Success message */}
      {shareSuccess && (
        <div className="mt-6 p-4 bg-green-800/20 border border-green-600 rounded-lg text-green-400 w-full max-w-md">
          Successfully shared to Twitter!
        </div>
      )}

      {/* Error message */}
      {shareError && (
        <div className="mt-6 p-4 bg-red-800/20 border border-red-600 rounded-lg text-red-400 w-full max-w-md">
          {shareError}
        </div>
      )}

      {/* Debug section */}
      <div className="mt-8 p-4 bg-gray-800 rounded-lg w-full max-w-md text-xs text-gray-400">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-bold">Debug Information</h3>
          <button
            onClick={() => console.log("Current credentials:", credentials)}
            className="px-2 py-1 bg-gray-700 rounded text-xs"
          >
            Log State
          </button>
        </div>
        <div>API URL: {env.apiUrl || "Not set"}</div>
        <div>
          Auth Status: {credentials ? "Authenticated" : "Not authenticated"}
        </div>
        <div>Token Status: {tokenStatus}</div>
        {credentials && (
          <div>
            Token Expires: {new Date(credentials.expiresAt).toLocaleString()}
            {credentials.expiresAt < Date.now() ? " (Expired)" : " (Valid)"}
          </div>
        )}
      </div>
    </div>
  );
}
