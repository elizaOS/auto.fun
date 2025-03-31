import { useEffect, useState } from "react";

// Storage keys
const STORAGE_KEY = "twitter-oauth-token";
const OAUTH_REDIRECT_ORIGIN_KEY = "OAUTH_REDIRECT_ORIGIN"; // Key for storing the original path

// Types
type Credentials = {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

// Response type for OAuth callback
type OAuthResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  userId?: string;
};

export default function CallbackPage() {
  const [error, setError] = useState<string | null>(null);

  const [debugInfo, setDebugInfo] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    const fetchAccessToken = async () => {
      // Log query parameters for debugging
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      const error = params.get("error");
      const errorDescription = params.get("error_description");

      console.log("OAuth callback received with params:", {
        code: code ? `${code.substring(0, 10)}...` : null,
        state,
        error,
        errorDescription,
      });

      setDebugInfo({
        code: code ? "Received" : "Missing",
        state: state || "Missing",
        error: error || "None",
        errorDescription: errorDescription || "None",
      });

      // Handle Twitter OAuth error response
      if (error) {
        const errorMsg = errorDescription || error;
        console.error("Twitter OAuth error:", errorMsg);
        setError(`Twitter returned an error: ${errorMsg}`);
        return;
      }

      // Check environment variables
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) {
        console.error("VITE_API_URL is not defined in environment");
        setError(
          "API URL is not configured. Check your environment variables.",
        );
        return;
      }

      setDebugInfo((prev) => ({ ...prev, apiUrl }));

      if (code && state) {
        try {
          console.log(
            "Making callback request to:",
            `${apiUrl}/api/share/oauth/callback`,
          );

          const response = await fetch(
            `${apiUrl}/api/share/oauth/callback?code=${code}&state=${state}`,
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
          console.log("Received OAuth response with token data");

          if (data.access_token && data.refresh_token) {
            console.log("Received valid tokens, storing credentials");
            const credentials: Credentials = {
              userId: data.userId || "default_user",
              accessToken: data.access_token,
              refreshToken: data.refresh_token,
              expiresAt: Date.now() + data.expires_in * 1000,
            };

            localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));

            // Log the credentials we're storing (mask sensitive parts)
            console.log("Stored credentials:", {
              userId: credentials.userId,
              accessToken: credentials.accessToken.substring(0, 10) + "...",
              refreshToken: credentials.refreshToken.substring(0, 5) + "...",
              expiresAt: new Date(credentials.expiresAt).toLocaleString(),
            });

            // --- Dynamic Redirect Logic ---
            // Retrieve the original path, default to root '/' if not found
            const redirectOrigin =
              localStorage.getItem(OAUTH_REDIRECT_ORIGIN_KEY) || "/";
            localStorage.removeItem(OAUTH_REDIRECT_ORIGIN_KEY); // Clean up immediately

            // Construct the final redirect URL, ensuring it's based on the current origin
            // and preserves search params/hash from the stored path if any
            const redirectUrl = new URL(redirectOrigin, window.location.origin);
            redirectUrl.searchParams.set("fresh_auth", "true"); // Add the flag

            console.log(
              `Redirecting to original location: ${redirectUrl.toString()}`,
            );
            window.location.href = redirectUrl.toString(); // Redirect dynamically
            // --- End Dynamic Redirect Logic ---
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
      } else {
        console.error("Missing required code and/or state parameters");
        setError("Missing required OAuth parameters (code and state)");
      }
    };

    fetchAccessToken();
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-900 text-white">
        <h1 className="text-2xl font-bold mb-4">Authentication Error</h1>
        <p className="text-red-500 mb-4">{error}</p>
        <div className="bg-gray-800 p-4 rounded-lg my-4 max-w-lg w-full">
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
            <div className="bg-gray-900 p-2 rounded text-xs font-mono overflow-x-auto">
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
          href="/testing"
          className="text-blue-500 hover:text-blue-400 underline"
        >
          Go back to share page
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-900 text-white">
      <h1 className="text-2xl font-bold mb-4">
        Authenticating with Twitter...
      </h1>
      <div className="w-12 h-12 border-t-2 border-[#00FF04] rounded-full animate-spin"></div>
      <p className="text-gray-400 mt-4 text-sm">
        Processing Twitter authentication response...
      </p>
    </div>
  );
}
