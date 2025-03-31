import { useWallet } from "@solana/wallet-adapter-react";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { Badge } from "../ui/badge";

// --- API Base URL ---
const API_BASE_URL = import.meta.env.VITE_API_URL || ""; // Ensure fallback

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

// --- Expected API Response Types ---
interface TokenInfoResponse {
  name: string;
  symbol: string;
  // Add other expected fields if needed
}

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
        setTokenAgents([]);
        return; // Don't fetch if mint is not available
      }

      // Reset states
      setIsAgentsLoading(true);
      setAgentsError(null);

      try {
        // Fetch Token Info
        console.log(`Fetching token info for ${tokenMint}...`);
        const infoResponse = await fetch(
          `${API_BASE_URL}/api/token/${tokenMint}`,
        );
        if (!infoResponse.ok) {
          throw new Error(
            `Failed to fetch token info: ${infoResponse.statusText}`,
          );
        }
      } catch (error) {
        console.error("Error fetching token info:", error);
        setAgentsError(
          error instanceof Error
            ? error.message
            : "Unknown error fetching token info",
        );
        setTokenAgents([]);
        return;
      }

      try {
        // Fetch Token Agents
        console.log(`Fetching token agents for ${tokenMint}...`);
        const agentsResponse = await fetch(
          `${API_BASE_URL}/api/token/${tokenMint}`,
        );
        if (!agentsResponse.ok) {
          throw new Error(
            `Failed to fetch token agents: ${agentsResponse.statusText}`,
          );
        }
        const agentsData = (await agentsResponse.json()) as TokenAgentsResponse;
        // TODO: Add validation here (e.g., using Zod)
        setTokenAgents(agentsData.agents || []); // Assuming API returns { agents: [...] }
        console.log("Token agents received:", agentsData.agents);
      } catch (error) {
        console.error("Error fetching token agents:", error);
        setAgentsError(
          error instanceof Error
            ? error.message
            : "Unknown error fetching agents",
        );
        setTokenAgents([]);
      } finally {
        setIsAgentsLoading(false);
      }
    };

    fetchTokenData();
  }, [tokenMint]); // Re-fetch when tokenMint changes
  // --- End Fetch Real Token Info & Agents ---

  // Current user address - would be from wallet in real implementation
  const currentUserAddress = publicKey?.toString() || "UserAddress456";

  // In a real implementation, this would be fetched from the API
  const tokenCreatorAddress = "TokenCreatorAddress123";

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
      // Ensure wallet is connected before proceeding
      if (!publicKey) {
        toast.error("Wallet not connected. Cannot link agent.");
        return;
      }

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

      // --- API Call to Add Agent ---
      console.log("Attempting to add agent to database...");
      try {
        const ownerAddress = publicKey.toBase58(); // Use actual public key
        const agentDataForApi = {
          ownerAddress: ownerAddress,
          twitterUserId: data.twitterUserId, // Send ID, backend can format username
          // twitterImageUrl: data.profileImageUrl || "/default-avatar.png", // Optionally send image URL if available from /process endpoint
        };

        const createResponse = await fetch(
          `${API_BASE_URL}/api/token/${tokenMint}/agents`,
          {
            // Use correct endpoint
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              // Add Authorization header if your endpoint requires it
              // "Authorization": `Bearer ${localStorage.getItem("authToken")}`
            },
            body: JSON.stringify(agentDataForApi),
          },
        );

        if (!createResponse.ok) {
          const errorBody = await createResponse.text();
          throw new Error(
            `Failed to add agent to database: ${createResponse.statusText} - ${errorBody}`,
          );
        }

        // Assuming the API returns the newly created agent object
        const newAgentFromApi = (await createResponse.json()) as TokenAgent;
        console.log("Agent successfully added via API:", newAgentFromApi);

        // Update local state with the agent confirmed by the API
        setTokenAgents((prev) => [...prev, newAgentFromApi]);
        toast.success("Twitter account successfully connected as an agent!");
      } catch (apiError) {
        console.error("API Error adding agent:", apiError);
        toast.error(
          `Failed to save agent: ${apiError instanceof Error ? apiError.message : "Unknown API error"}`,
        );
        // Optionally re-throw or handle differently
      }
      // --- End API Call ---
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
                            onClick={() => removeAgent(agent.twitterUserName)}
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

      <div className="flex justify-center">
        <button
          onClick={connectTwitter}
          className="max-w-[350px] bg-[#03FF24] p-3 font-bold border-2 text-black text-[12px] md:text-[15px] hover:bg-[#27b938] transition-colors disabled:opacity-50 disabled:bg-[#333333] disabled:hover:bg-[#333333]"
          disabled={
            isConnectingAgent || !tokenMint || isAgentsLoading || !!agentsError
          }
        >
          {isConnectingAgent ? "Connecting..." : "Connect X account"}
        </button>
      </div>
    </div>
  );
}
