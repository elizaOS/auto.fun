import { useWallet } from "@solana/wallet-adapter-react";
import { Trash2, LogOut } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
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
  username?: string; // Add username to display in UI
  profileImageUrl?: string; // Add profile image URL
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
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [componentMounted, setComponentMounted] = useState(false);

  // --- Token Agents State ---
  const [tokenAgents, setTokenAgents] = useState<TokenAgent[]>([]);
  const [isAgentsLoading, setIsAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  // --- End Token Agents State ---

  // Set component as mounted after initial render
  useEffect(() => {
    setComponentMounted(true);
    return () => setComponentMounted(false);
  }, []);

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

  const disconnectTwitter = async () => {
    try {
      setIsDisconnecting(true);

      // Remove from localStorage
      localStorage.removeItem(STORAGE_KEY);

      // Clear state
      setTwitterCredentials(null);
    } catch (error) {
      toast.error("Failed to disconnect from X");
      console.error("Disconnect error:", error);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const connectTwitter = async () => {
    // Verify we have a token mint
    if (!tokenMint) {
      toast.error("No token mint found, cannot connect agent");
      return;
    }

    // Ensure wallet is connected
    if (!publicKey) {
      toast.error("Please connect your wallet before connecting to X");
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

        // Add agents anchor to the path
        const pathWithAnchor =
          currentPath + (currentPath.includes("#") ? "" : "#agents");
        localStorage.setItem(OAUTH_REDIRECT_ORIGIN_KEY, pathWithAnchor);
        console.log("Stored origin path for redirect:", pathWithAnchor);

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
  const connectTwitterAgent = useCallback(
    async (creds: TwitterCredentials) => {
      if (!tokenMint) {
        toast.error("No token mint found, cannot connect agent");
        return;
      }

      try {
        // Ensure wallet is connected before proceeding
        if (!publicKey) {
          // Check if this is being called from callback - if so, we may need to wait for wallet connection
          const isFromCallback =
            localStorage.getItem(AGENT_INTENT_KEY) === tokenMint;

          if (isFromCallback) {
            // In callback flow, retry after a short delay to allow wallet to connect
            console.log(
              "No wallet connected yet during callback flow, waiting briefly...",
            );
            await new Promise((resolve) => setTimeout(resolve, 500));

            // Check again after delay
            if (!publicKey) {
              console.error(
                "Wallet still not connected after delay. publicKey state:",
                publicKey,
              );
              toast.error(
                "Wallet not connected. Cannot link agent. Please connect your wallet and try again.",
              );
              return;
            }
          } else {
            toast.error("Wallet not connected. Cannot link agent.");
            return;
          }
        }

        // Get the auth token - this is the key issue
        const authToken = localStorage.getItem("authToken");

        if (!authToken) {
          console.error("Auth token missing. Cookies may not be properly set.");
          toast.error(
            "Authentication token missing. Please reconnect your wallet.",
          );
          return;
        }

        console.log("Connecting Twitter agent with credentials:", {
          userId: creds.userId,
          username: creds.username || "unknown",
          tokenMint,
          walletAddress: publicKey.toString(),
          hasAuthToken: !!authToken,
          authTokenStart: authToken.substring(0, 10) + "...",
        });

        // Use the combined endpoint to connect the Twitter agent
        const response = await fetch(
          `${API_BASE_URL}/api/token/${tokenMint}/connect-twitter-agent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({
              userId: creds.userId,
              accessToken: creds.accessToken,
              walletAddress: publicKey.toString(), // Explicitly include wallet address
              username: creds.username, // Include username if available
            }),
            credentials: "include",
          },
        );

        // Log response info for debugging
        console.log(
          `Agent connection response: ${response.status} ${response.statusText}`,
        );

        // Check response status
        if (!response.ok) {
          // Try to get detailed error information
          const errorText = await response.text();
          console.error(
            "Twitter agent connection failed. Response:",
            errorText,
          );

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

            if (errorData.error) {
              // If authentication error, give more specific guidance
              if (response.status === 401) {
                toast.error(
                  "Authentication error. Please reconnect your wallet and try again.",
                );
              } else {
                throw new Error(errorData.error);
              }
              return;
            }
          } catch (parseError) {
            // If JSON parsing fails, use the raw text
            console.error("Error parsing JSON response:", parseError);
          }

          throw new Error(errorText || "Failed to connect Twitter agent");
        }

        console.log("Twitter agent connection successful, parsing response...");

        // Try to parse response as JSON
        let responseData: any; // Use any type to handle various response formats
        try {
          responseData = await response.json();
          console.log("Response data:", responseData);
        } catch (parseError) {
          console.error("Error parsing agent response:", parseError);
          throw new Error("Error parsing server response");
        }

        let newAgent: TokenAgent;

        // Handle different response formats
        if (responseData && responseData.id) {
          // Response is the agent directly
          newAgent = responseData as TokenAgent;
        } else if (
          responseData &&
          responseData.agent &&
          responseData.agent.id
        ) {
          // Response has an agent property
          newAgent = responseData.agent as TokenAgent;
        } else {
          throw new Error("Invalid agent data in server response");
        }

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

        // Refresh the agents list after connection
        setTimeout(() => {
          console.log("Refreshing agents list...");
          // Trigger a re-fetch of agents list
          setIsAgentsLoading(true);

          fetch(`${API_BASE_URL}/api/token/${tokenMint}/agents`)
            .then((response) => response.json())
            .then((data) => {
              const responseData = data as TokenAgentsResponse;
              if (responseData.agents && Array.isArray(responseData.agents)) {
                setTokenAgents(responseData.agents);
                console.log("Agents list refreshed:", responseData.agents);
              }
            })
            .catch((error) => console.error("Error refreshing agents:", error))
            .finally(() => setIsAgentsLoading(false));
        }, 1000);
      } catch (error) {
        console.error("Failed to connect Twitter agent:", error);
        toast.error(
          `Failed to connect: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    },
    [tokenMint, publicKey, API_BASE_URL, setTokenAgents, setIsAgentsLoading],
  );

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

    // Get the auth token - consistent with connect function
    const authToken = localStorage.getItem("authToken");

    if (!authToken) {
      toast.error(
        "Authentication token missing. Please reconnect your wallet.",
      );
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/token/${tokenMint}/agents/${agentToRemove.id}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          credentials: "include",
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
    }
  };

  // Sorted agents with officials at the top
  const sortedAgents = [...tokenAgents].sort((a, b) =>
    a.official && !b.official ? -1 : !a.official && b.official ? 1 : 0,
  );

  // Check if the callback is from a connect agent intent
  useEffect(() => {
    // Wait until component is mounted and we have tokenMint
    if (!componentMounted || !tokenMint) return;

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

            // IMPORTANT: Add a function to handle connection with delayed retries
            const connectWithRetries = async (retriesLeft = 5) => {
              console.log(
                `Connection attempt (${5 - retriesLeft + 1}/5), wallet state:`,
                publicKey ? publicKey.toString() : "not connected",
              );

              // If wallet is connected, attempt connection
              if (publicKey) {
                setIsConnectingAgent(true);

                try {
                  await connectTwitterAgent(parsedCreds);
                  console.log("Agent connection completed from callback");
                  // Clean up intent AFTER successful connection
                  localStorage.removeItem(AGENT_INTENT_KEY);

                  // Clean up URL but preserve hash
                  window.history.replaceState(
                    {},
                    "",
                    window.location.pathname + location.hash,
                  );
                } catch (error) {
                  console.error("Error connecting agent from callback:", error);
                  toast.error(
                    `Failed to connect agent: ${error instanceof Error ? error.message : "Unknown error"}`,
                  );
                  // Still clean up on error
                  localStorage.removeItem(AGENT_INTENT_KEY);
                } finally {
                  setIsConnectingAgent(false);
                }
                return; // Exit the retry function
              }

              // If still no wallet and we have retries left, try again after a delay
              if (retriesLeft > 0) {
                console.log(
                  `Wallet not connected yet, will retry in 1 second (${retriesLeft} attempts left)`,
                );
                setTimeout(() => connectWithRetries(retriesLeft - 1), 1000);
              } else {
                console.log(
                  "Maximum retries reached, wallet still not connected",
                );
                toast.warn(
                  "Your wallet connection wasn't ready. Please click 'Connect as agent' once your wallet is connected.",
                );
                // Don't clear the intent yet, so user can try again
              }
            };

            // Start the connection retry process
            connectWithRetries();
          } catch (error) {
            console.error("Failed to process agent connection", error);
            toast.error(
              `Failed to connect agent: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
            // Clean up on error
            localStorage.removeItem(AGENT_INTENT_KEY);
          }
        } else {
          toast.error(
            "Twitter credentials not found after authentication. Please try again.",
          );
          localStorage.removeItem(AGENT_INTENT_KEY);
        }
      } else {
        toast.warning(
          `Attempted to connect agent to wrong token. Please try again.`,
        );
        localStorage.removeItem(AGENT_INTENT_KEY);
      }
    }
  }, [tokenMint, componentMounted, publicKey]); // connectTwitterAgent is already memoized

  // Check if user has a connected agent for this token
  const hasConnectedAgent = tokenAgents.some(
    (agent) => publicKey && agent.ownerAddress === publicKey.toBase58(),
  );

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

      {/* Twitter Connection Status and Actions */}
      <div className="mt-4 border-t border-neutral-700 pt-4">
        {twitterCredentials && twitterCredentials.expiresAt > Date.now() ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-neutral-200">
                <span className="bg-green-700 rounded-full w-2 h-2"></span>
                <span>
                  Connected to X as @{twitterCredentials.username || "user"}
                </span>
              </div>
              <Button
                onClick={disconnectTwitter}
                disabled={isDisconnecting}
                variant="outline"
                size="small"
                className="!px-2 text-red-500 hover:text-red-400 hover:bg-red-950/20"
              >
                <LogOut size={16} className="mr-1" />
                Disconnect
              </Button>
            </div>

            {!hasConnectedAgent && (
              <Button
                onClick={connectTwitter}
                disabled={
                  isConnectingAgent ||
                  !tokenMint ||
                  isAgentsLoading ||
                  !!agentsError
                }
                className="mx-auto mt-2"
                variant="tab"
              >
                {isConnectingAgent ? "Connecting..." : "Connect as agent"}
              </Button>
            )}
          </div>
        ) : (
          <Button
            onClick={connectTwitter}
            disabled={
              isConnectingAgent ||
              !tokenMint ||
              isAgentsLoading ||
              !!agentsError
            }
            className="mx-auto"
            variant="tab"
          >
            {isConnectingAgent ? "Connecting..." : "Connect X account"}
          </Button>
        )}
      </div>
    </div>
  );
}
