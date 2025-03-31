import { useWallet } from "@solana/wallet-adapter-react";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { Badge } from "../ui/badge";
import Button from "../button";
import { env } from "@/utils/env";

// --- API Base URL ---
const API_BASE_URL = env.apiUrl || ""; // Ensure fallback

// Storage keys for Twitter auth
const STORAGE_KEY = "twitter-oauth-token";
const AGENT_INTENT_KEY = "connect_agent_intent";
const OAUTH_REDIRECT_ORIGIN_KEY = "OAUTH_REDIRECT_ORIGIN"; // Key for storing the original path

// Types for Twitter authentication
type TwitterCredentials = {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

interface TokenAgentsResponse {
  agents: TokenAgent[];
  // Add other expected fields if needed
}
// --- End Expected API Response Types ---

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
  const { publicKey } = useWallet();
  const [twitterCredentials, setTwitterCredentials] =
    useState<TwitterCredentials | null>(null);
  const [isConnectingAgent, setIsConnectingAgent] = useState(false);

  // --- Token Agents State ---
  const [tokenAgents, setTokenAgents] = useState<TokenAgent[]>([]);
  const [isAgentsLoading, setIsAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  // --- End Token Agents State ---

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
  }, [urlTokenMint, location.pathname]);

  // Use detected token mint instead of directly from params
  const tokenMint = detectedTokenMint;

  // --- Fetch Real Token Info & Agents ---
  useEffect(() => {
    const fetchTokenData = async () => {
      if (!tokenMint || !API_BASE_URL) {
        console.log("Skipping fetch: No tokenMint or API_BASE_URL");
        setTokenAgents([]);
        return; // Don't fetch if mint is not available
      }

      // Check for Twitter credentials on component mount
      const storedCredentials = localStorage.getItem(STORAGE_KEY);
      if (storedCredentials) {
        try {
          const parsedCredentials = JSON.parse(
            storedCredentials,
          ) as TwitterCredentials;
          if (parsedCredentials.expiresAt > Date.now()) {
            console.log("Found valid Twitter credentials in storage");
            setTwitterCredentials(parsedCredentials);
          } else {
            console.log("Found expired Twitter credentials in storage");
          }
        } catch (e) {
          console.error("Error parsing stored Twitter credentials:", e);
        }
      }

      // Reset states
      setIsAgentsLoading(true);
      setAgentsError(null);

      // No longer fetching token info here, assuming it's handled elsewhere or not needed for agents tab
      /*
      try {
        // Fetch Token Info
        console.log(`Fetching token info for ${tokenMint}...`);
        const infoResponse = await fetch(
          `${API_BASE_URL}/api/token/${tokenMint}`, // Keep existing if needed
        );
        if (!infoResponse.ok) {
          throw new Error(
            `Failed to fetch token info: ${infoResponse.statusText}`,
          );
        }
        // Process info if necessary
      } catch (error) {
        console.error("Error fetching token info:", error);
        // Handle token info error separately if needed
      }
      */

      try {
        // Fetch Token Agents using the new dedicated endpoint
        const fetchUrl = `${API_BASE_URL}/api/token/${tokenMint}/agents`;
        console.log(`Fetching agents from URL: ${fetchUrl}`);
        console.log(
          `Using tokenMint: ${tokenMint}, API_BASE_URL: ${API_BASE_URL}`,
        );

        const agentsResponse = await fetch(fetchUrl);

        // ** ADD Log: Log the raw response text **
        const responseText = await agentsResponse.text();
        console.log("Raw agents response text:", responseText);

        // ** ADD Log: Log status and ok status **
        console.log(
          `Agents response status: ${agentsResponse.status}, ok: ${agentsResponse.ok}`,
        );

        if (!agentsResponse.ok) {
          // Try to get error message from body (use responseText now)
          let errorMsg = `Failed to fetch token agents: ${agentsResponse.statusText}`;
          try {
            const errorBody = JSON.parse(responseText); // Parse the logged text
            if (
              errorBody &&
              typeof errorBody === "object" &&
              "error" in errorBody &&
              typeof (errorBody as any).error === "string"
            ) {
              errorMsg = (errorBody as any).error;
            }
          } catch (e) {
            /* Ignore if body isn't json */
          }
          throw new Error(errorMsg);
        }

        // ** CHANGE: Parse the logged responseText **
        const agentsData = JSON.parse(responseText) as TokenAgentsResponse;

        // Check the parsed data structure
        if (!agentsData || !Array.isArray(agentsData.agents)) {
          console.error(
            "Invalid agents data received after parsing:",
            agentsData,
          );
          throw new Error("Invalid response format when fetching agents.");
        }

        setTokenAgents(agentsData.agents);
        // Log the successfully parsed agents
        console.log("Token agents received and parsed:", agentsData.agents);
      } catch (error) {
        console.error("Error fetching token agents:", error);
        setAgentsError(
          error instanceof Error
            ? error.message
            : "Unknown error fetching agents",
        );
        setTokenAgents([]); // Clear agents on error
      } finally {
        setIsAgentsLoading(false);
      }
    };

    fetchTokenData();
  }, [tokenMint]); // Re-fetch when tokenMint changes
  // --- End Fetch Real Token Info & Agents ---

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
        console.log(
          "Not authenticated, storing intent and redirecting for agent connection.",
        );
        // Store the intent to connect agent and the token mint
        localStorage.setItem(AGENT_INTENT_KEY, tokenMint);

        // Store the current path before redirecting
        const currentPath =
          window.location.pathname +
          window.location.search +
          window.location.hash;
        localStorage.setItem(OAUTH_REDIRECT_ORIGIN_KEY, currentPath);
        console.log("Stored origin path for redirect:", currentPath);

        // Redirect to OAuth
        const apiUrl = env.apiUrl;
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
      // Ensure wallet is connected before proceeding
      if (!publicKey) {
        toast.error("Wallet not connected. Cannot link agent.");
        return;
      }

      // Use the new combined endpoint to connect the Twitter agent directly
      console.log("Connecting Twitter agent with credentials...");
      const response = await fetch(
        `${API_BASE_URL}/api/token/${tokenMint}/connect-twitter-agent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("authToken") || ""}`, // Auth header
          },
          body: JSON.stringify({
            userId: creds.userId,
            accessToken: creds.accessToken,
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Twitter agent connection failed:", errorText);

        try {
          // Try to parse error as JSON
          const errorData = JSON.parse(errorText);

          // Handle conflict specifically (already connected)
          if (response.status === 409 && errorData.agent) {
            console.warn("Agent already exists:", errorData.agent);
            // Add to local state if not already there
            setTokenAgents((prev) =>
              prev.find((a) => a.id === errorData.agent.id)
                ? prev
                : [...prev, errorData.agent as TokenAgent],
            );

            toast.info(
              "This Twitter account is already connected to this token.",
            );
            return;
          }

          throw new Error(errorData.error || "Failed to connect Twitter agent");
        } catch (parseError) {
          // If JSON parsing fails, use the raw text
          throw new Error(errorText || "Failed to connect Twitter agent");
        }
      }

      // Parse the response to get the new agent
      const newAgent = (await response.json()) as TokenAgent;
      console.log("Agent successfully connected:", newAgent);

      // Update local state with the agent
      setTokenAgents((prev) => {
        // Avoid adding duplicates
        if (prev.find((a) => a.id === newAgent.id)) {
          return prev;
        }
        return [...prev, newAgent];
      });

      toast.success("Twitter account successfully connected as an agent!");
    } catch (error) {
      console.error("Failed to connect Twitter agent:", error);
      toast.error(
        `Failed to connect: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };

  // Remove agent function
  // ** CHANGE: Needs agent ID and uses DELETE endpoint **
  const removeAgent = async (agentToRemove: TokenAgent) => {
    if (!agentToRemove.id) {
      toast.error("Cannot remove agent: Missing ID.");
      return;
    }
    if (!tokenMint) {
      toast.error("Cannot remove agent: Missing token mint.");
      return;
    }

    // Optimistic UI update (optional)
    // const previousAgents = tokenAgents;
    // setTokenAgents((prev) => prev.filter((agent) => agent.id !== agentToRemove.id));

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/token/${tokenMint}/agents/${agentToRemove.id}`,
        {
          method: "DELETE",
          headers: {
            // ** ADD Authorization Header **
            Authorization: `Bearer ${localStorage.getItem("authToken") || ""}`, // Example
          },
        },
      );

      if (!response.ok) {
        let errorMsg = `Failed to remove agent: ${response.statusText}`;
        try {
          const errorBody = await response.json();
          if (
            errorBody &&
            typeof errorBody === "object" &&
            "error" in errorBody &&
            typeof (errorBody as any).error === "string"
          ) {
            errorMsg = (errorBody as any).error;
          }
        } catch (e) {
          throw new Error(errorMsg);
        }
      }

      // Update local state on success
      setTokenAgents((prev) =>
        prev.filter((agent) => agent.id !== agentToRemove.id),
      );

      toast.success("Agent removed successfully");
    } catch (error) {
      console.error("Error removing agent:", error);
      toast.error(
        `Failed to remove agent: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      // Rollback optimistic update if used
      // setTokenAgents(previousAgents);
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
        } else {
          toast.error(
            "Twitter credentials not found after authentication. Please try again.",
          );
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
  }, [tokenMint, connectTwitterAgent]); // Add connectTwitterAgent to dependencies

  return (
    <div className="w-full flex-shrink-0 h-fit p-4">
      <h1 className="mb-4 text-xl text-autofun-background-action-highlight font-dm-mono">
        Token Agents
      </h1>

      {isAgentsLoading && (
        <div className="text-center py-4 text-neutral-400">
          Loading agents...
        </div>
      )}
      {agentsError && (
        <div className="text-center py-4 text-red-500">
          Error: {agentsError}
        </div>
      )}

      {!isAgentsLoading && !agentsError && (
        <div className="overflow-y-auto max-h-96">
          {sortedAgents.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-neutral-700">
                  <th className="pb-2 font-semibold">Agent</th>
                  <th className="pb-2 font-semibold">Status</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {sortedAgents.map((agent, index) => (
                  <tr
                    key={agent.id || index}
                    className="border-b border-neutral-800"
                  >
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-2">
                        <img
                          src={agent.twitterImageUrl || "/default-avatar.png"}
                          alt={agent.twitterUserName}
                          className="w-6 h-6 rounded-full"
                        />
                        <span className="truncate">
                          {agent.twitterUserName}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 pr-2">
                      {agent.official ? (
                        <Badge variant="success">Official</Badge>
                      ) : (
                        <Badge variant="default">Community</Badge>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      {publicKey &&
                        agent.ownerAddress === publicKey.toBase58() && (
                          <button
                            // ** CHANGE: Pass the whole agent object **
                            onClick={() => removeAgent(agent)}
                            title="Remove agent"
                            className="text-red-500 hover:text-red-400 p-1"
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
              No agents connected yet.
            </div>
          )}
        </div>
      )}

      <Button
        onClick={connectTwitter}
        disabled={
          isConnectingAgent || !tokenMint || isAgentsLoading || !!agentsError
        }
        className="mx-auto"
        variant="tab"
      >
        {isConnectingAgent ? "Connecting..." : "Connect X account"}
      </Button>
    </div>
  );
}
