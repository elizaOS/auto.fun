import { env } from "@/utils/env";
import { useEffect, useState } from "react";

// Storage keys
const STORAGE_KEY = "twitter-oauth-token";
const OAUTH_REDIRECT_ORIGIN_KEY = "OAUTH_REDIRECT_ORIGIN"; // Key for storing the original path
// const AGENT_INTENT_KEY = "connect_agent_intent"; // For agent connection intent
// const PENDING_SHARE_KEY = "pending-twitter-share"; // For sharing intent

// Types
type Credentials = {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  username?: string; // Add username for display
  profileImageUrl?: string; // Add profile image
  // OAuth 1.0a specific fields
  oauth1Token?: string;
  oauth1TokenSecret?: string;
};

// Response type for OAuth callback
type OAuthResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  userId?: string;
  username?: string;
  profileImageUrl?: string;
  // OAuth 1.0a fields
  oauth1_token?: string;
  oauth1_token_secret?: string;
  user_id?: string;
  screen_name?: string;
};

export default function CallbackPage() {
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    const processCallback = async () => {
      // Check for OAuth 1.0a callback parameters
      const params = new URLSearchParams(window.location.search);
      const oauthToken = params.get("oauth_token");
      const oauthVerifier = params.get("oauth_verifier");

      // Standard OAuth 2.0 parameters
      const code = params.get("code");
      const state = params.get("state");
      const error = params.get("error");
      const errorDescription = params.get("error_description");

      // Log debug info
      setDebugInfo({
        oauthToken: oauthToken || "Missing",
        oauthVerifier: oauthVerifier || "Missing",
        code: code ? "Received" : "Missing",
        state: state || "Missing",
        error: error || "None",
        errorDescription: errorDescription || "None",
        apiUrl: env.apiUrl || "Missing",
        flow: oauthToken ? "OAuth 1.0a" : "OAuth 2.0",
      });

      // Handle Twitter OAuth error response
      if (error) {
        const errorMsg = errorDescription || error;
        console.error("Twitter OAuth error:", errorMsg);
        setError(`Twitter returned an error: ${errorMsg}`);
        return;
      }

      // Handle OAuth 1.0a callback
      if (oauthToken && oauthVerifier) {
        try {
          const response = await fetch(
            `${env.apiUrl}/api/share/oauth1/callback?oauth_token=${oauthToken}&oauth_verifier=${oauthVerifier}`,
            { credentials: "include" },
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error(
              "OAuth 1.0a callback error:",
              errorText,
              "Status:",
              response.status,
            );
            setDebugInfo((prev) => ({
              ...prev,
              responseStatus: response.status.toString(),
              responseError: errorText,
            }));
            throw new Error(
              `OAuth 1.0a authentication failed: ${response.statusText} - ${errorText}`,
            );
          }

          const data = (await response.json()) as OAuthResponse;

          if (data.oauth1_token && data.oauth1_token_secret) {
            // Store OAuth 1.0a credentials
            const credentials: Credentials = {
              userId: data.user_id || data.userId || "default_user",
              // Store both OAuth 2.0 and 1.0a credentials
              accessToken: data.access_token || "", // May not be present in 1.0a
              refreshToken: data.refresh_token || "", // May not be present in 1.0a
              expiresAt: data.expires_in
                ? Date.now() + data.expires_in * 1000
                : Date.now() + 86400000, // 24hr default
              username: data.screen_name || data.username,
              // OAuth 1.0a specific fields
              oauth1Token: data.oauth1_token,
              oauth1TokenSecret: data.oauth1_token_secret,
            };

            localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));

            // Redirect back to original page
            redirectToOrigin();
          } else {
            console.error("No OAuth 1.0a tokens received");
            setDebugInfo((prev) => ({ ...prev, oauth1TokensMissing: "true" }));
            throw new Error("No OAuth 1.0a tokens received");
          }
        } catch (error) {
          console.error("OAuth 1.0a authentication error:", error);
          setError(
            error instanceof Error
              ? error.message
              : "OAuth 1.0a authentication failed",
          );
        }
        return;
      }

      // Handle standard OAuth 2.0 callback
      if (code && state) {
        try {
          const response = await fetch(
            `${env.apiUrl}/api/share/oauth/callback?code=${code}&state=${state}`,
            { credentials: "include" },
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error(
              "Auth callback error response:",
              errorText,
              "Status:",
              response.status,
            );
            setDebugInfo((prev) => ({
              ...prev,
              responseStatus: response.status.toString(),
              responseError: errorText,
            }));
            throw new Error(
              `Authentication failed: ${response.statusText} - ${errorText}`,
            );
          }

          const data = (await response.json()) as OAuthResponse;

          if (data.access_token && data.refresh_token) {
            const credentials: Credentials = {
              userId: data.userId || "default_user",
              accessToken: data.access_token,
              refreshToken: data.refresh_token,
              expiresAt: Date.now() + data.expires_in * 1000,
              username: data.username,
              profileImageUrl: data.profileImageUrl,
            };

            localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
            redirectToOrigin();
          } else {
            console.error("No tokens received from OAuth response");
            setDebugInfo((prev) => ({ ...prev, tokenMissing: "true" }));
            throw new Error("No access token received");
          }
        } catch (error) {
          console.error("Authentication error:", error);
          setError(
            error instanceof Error ? error.message : "Authentication failed",
          );
        }
      } else if (!oauthToken && !oauthVerifier) {
        // Only show this error if neither OAuth flow's parameters are present
        console.error("Missing required OAuth parameters");
        setError("Missing required OAuth parameters");
      }
    };

    // Helper function for redirecting back to origin
    const redirectToOrigin = () => {
      // Retrieve the original path, default to root '/' if not found
      const redirectOrigin =
        localStorage.getItem(OAUTH_REDIRECT_ORIGIN_KEY) || "/";
      localStorage.removeItem(OAUTH_REDIRECT_ORIGIN_KEY); // Clean up immediately

      // Construct the final redirect URL
      const redirectUrl = new URL(redirectOrigin, window.location.origin);
      redirectUrl.searchParams.set("fresh_auth", "true"); // Add the flag

      window.location.href = redirectUrl.toString(); // Redirect dynamically
    };

    processCallback();
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-autofun-background-primary text-white">
        <h1 className="text-2xl font-bold mb-4">Authentication Error</h1>
        <p className="text-red-500 mb-4">{error}</p>
        <div className="bg-autofun-background-secondary p-4 my-4 max-w-lg w-full border border-gray-700">
          <h2 className="text-lg font-semibold mb-2">Debug Information</h2>
          <p className="text-sm text-gray-400 mb-2">Check the following:</p>
          <ul className="list-disc pl-5 text-sm text-gray-300">
            <li>Twitter API credentials in your server environment</li>
            <li>VITE_API_URL is correctly set in your .env file</li>
            <li>Your Twitter Developer App configuration is correct</li>
            <li>Callback URL in Twitter Developer Portal matches your app</li>
          </ul>

          {/* Debug info */}
          <div className="mt-4 border-t border-gray-700 pt-3">
            <h3 className="text-sm font-semibold mb-2 text-gray-400">
              Request Details:
            </h3>
            <div className="bg-autofun-background-primary p-2 rounded text-xs font-mono overflow-x-auto">
              {Object.entries(debugInfo).map(([key, value]) => (
                <div key={key} className="flex">
                  <span className="text-blue-400 w-32">{key}:</span>
                  <span className="text-gray-300">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <a
          href="/"
          className="mt-4 px-4 py-2 bg-[#03FF24] text-black rounded hover:bg-[#02cc1d] font-medium"
        >
          Return to Home
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-autofun-background-primary text-white">
      <h1 className="text-2xl font-bold mb-4">Authenticating with X...</h1>
      <div className="w-12 h-12 border-t-2 border-[#03FF24] rounded-full animate-spin"></div>
      <p className="text-gray-400 mt-4 text-sm">
        Processing authentication response...
      </p>
    </div>
  );
}
