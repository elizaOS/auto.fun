import { useWallet } from "@solana/wallet-adapter-react";
import { LogOut, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { toast } from "react-toastify";
// import { Badge } from "../ui/badge";
import { env } from "@/utils/env";
import Button from "../button";
import { fetchWithAuth } from "@/hooks/use-authentication";
import { IToken } from "@/types";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { shortenAddress } from "@/utils";

// --- API Base URL ---
const API_BASE_URL = env.apiUrl || ""; // Ensure fallback

// Storage keys for Twitter auth
const STORAGE_KEY = "twitter-oauth-token";
const AGENT_INTENT_KEY = "connect_agent_intent";
const OAUTH_REDIRECT_ORIGIN_KEY = "OAUTH_REDIRECT_ORIGIN"; // Key for storing the original path
const MIN_BALANCE_TO_ADD_AGENT = 100000; // 100k tokens

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
  id: string;
  tokenMint: string;
  ownerAddress: string;
  twitterUserId: string;
  twitterUserName: string;
  twitterImageUrl: string;
  official?: boolean;
  createdAt?: number;
}

interface CreatorProfile {
  displayName?: string;
  // Add other fields if needed later
}

interface AgentsSectionProps {
  isCreator: boolean;
  tokenData: IToken;
}

interface AgentsComponentContentProps {
  tokenMint: string;
  isCreator: boolean;
  tokenData: IToken;
}

export default function AgentsSection({ isCreator, tokenData }: AgentsSectionProps) {
  const { mint: urlTokenMint } = useParams<{ mint: string }>();
  const location = useLocation();
  const [detectedTokenMint, setDetectedTokenMint] = useState<string | null>(null);

  useEffect(() => {
    if (urlTokenMint) {
      setDetectedTokenMint(urlTokenMint);
      return;
    }
    const pathMatch = location.pathname.match(/\/token\/([A-Za-z0-9]{32,44})/);
    if (pathMatch && pathMatch[1]) {
      setDetectedTokenMint(pathMatch[1]);
      return;
    }
    // Optional: Handle error state if mint cannot be derived
  }, [urlTokenMint, location.pathname]);

  // Render null or a loading state if tokenMint is not yet available
  if (!detectedTokenMint) {
    return <div className="p-4 text-center text-neutral-400">Loading token address...</div>;
  }

  console.log("sending down tokenData", tokenData)

  // Now that tokenMint is guaranteed to be a string, render the inner component
  return <AgentsComponentContent tokenData={tokenData} tokenMint={detectedTokenMint} isCreator={isCreator} />;
}

function AgentsComponentContent({ tokenMint, isCreator, tokenData }: AgentsComponentContentProps) {
  console.log("tokenData", tokenData)
  
  const { publicKey } = useWallet();
  const walletAddress = publicKey?.toString();
  const [twitterCredentials, setTwitterCredentials] =
    useState<TwitterCredentials | null>(null);
  const [isConnectingAgent, setIsConnectingAgent] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [componentMounted, setComponentMounted] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // --- Token Agents State ---
  const [tokenAgents, setTokenAgents] = useState<TokenAgent[]>([]);
  const [isAgentsLoading, setIsAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  // --- End Token Agents State ---

  // --- ADD THESE LINES ---
  const [tokenDataError, setTokenDataError] = useState<string | null>(null);
  // --- END ADD ---

  // Creator profile cache
  const [creatorProfiles, setCreatorProfiles] = useState<
    Record<string, CreatorProfile>
  >({});
  const [isFetchingProfiles, setIsFetchingProfiles] = useState(false);

  // --- Eligibility Check (Now safe to call hook) ---
  const { tokenBalance } = useTokenBalance({ tokenId: tokenMint });
  const userHasSufficientBalance = (tokenBalance || 0) >= MIN_BALANCE_TO_ADD_AGENT;
  const isEligibleToAddAgent = userHasSufficientBalance || isCreator;
  const tokenTicker = tokenData?.ticker || "tokens";
  const tokenCreatorAddress = tokenData?.creator;
  // ---

  console.log("isEligibleToAddAgent", isEligibleToAddAgent)

  // Set component as mounted after initial render
  useEffect(() => {
    setComponentMounted(true);
    return () => setComponentMounted(false);
  }, []);

  // --- Fetch Real Token Info & Agents ---
  const fetchData = useCallback(async () => {
    if (!tokenMint || !API_BASE_URL) {
      console.warn("Skipping fetch: No tokenMint or API_BASE_URL");
      setTokenAgents([]);
      setAgentsError(null);
      return;
    }

    // Check for Twitter credentials on component mount
    const storedCredentials = localStorage.getItem(STORAGE_KEY);
    if (storedCredentials) {
      try {
        const parsedCredentials = JSON.parse(
          storedCredentials,
        ) as TwitterCredentials;
        if (parsedCredentials.expiresAt > Date.now()) {
          setTwitterCredentials(parsedCredentials);
        }
      } catch (e) {
        console.error("Error parsing stored Twitter credentials:", e);
      }
    }

    // Reset states
    setIsAgentsLoading(true);
    setAgentsError(null);
    setTokenAgents([]);

      // Fetch both in parallel
      const agentsResponse = await fetch(`${API_BASE_URL}/api/token/${tokenMint}/agents`);


      // Process Agents Response
      if (!agentsResponse.ok) {
        let errorMsg = `Failed to fetch agents: ${agentsResponse.statusText}`;
        try {
          const errorBody = await agentsResponse.json();
          if (errorBody?.error) errorMsg = errorBody.error;
        } catch (e) {}
        throw new Error(errorMsg);
      }
      const agentsData = await agentsResponse.json() as TokenAgentsResponse;
      if (!agentsData || !Array.isArray(agentsData.agents)) {
        throw new Error("Invalid response format for agents.");
      }
      setTokenAgents(agentsData.agents);
      // Fetch profiles after agents data is confirmed
      await fetchCreatorProfiles(agentsData.agents);

      setIsAgentsLoading(false);
  }, [tokenMint]);

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

  const connectTwitterFlow = async () => {
    if (!tokenMint || !walletAddress) {
      toast.error(!walletAddress ? "Please connect wallet." : "Token not loaded.");
      return;
    }
    if (!isEligibleToAddAgent) {
      toast.error(`Hold at least ${MIN_BALANCE_TO_ADD_AGENT.toLocaleString()} ${tokenTicker} or be the creator to add an agent.`);
      return;
    }
    if (!tokenData) {
      toast.error("Token data loading...");
      return;
    }
    setIsConnectingAgent(true);
    if (twitterCredentials && twitterCredentials.expiresAt > Date.now()) {
      await connectTwitterAgent(twitterCredentials);
      return;
    }
    try {
      localStorage.setItem(AGENT_INTENT_KEY, tokenMint);
      const currentPath = window.location.pathname + window.location.hash;
      localStorage.setItem(OAUTH_REDIRECT_ORIGIN_KEY, currentPath);
      window.location.href = `${API_BASE_URL}/api/share/oauth/request_token`;
    } catch (error) {
      console.error("Error initiating Twitter connection:", error);
      toast.error(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
      localStorage.removeItem(AGENT_INTENT_KEY);
      localStorage.removeItem(OAUTH_REDIRECT_ORIGIN_KEY);
      setIsConnectingAgent(false);
    }
  };

  // Connect Twitter agent with credentials
  const connectTwitterAgent = useCallback(
    async (creds: TwitterCredentials) => {
      if (!tokenMint || !walletAddress) {
        toast.error(!walletAddress ? "Wallet not connected." : "Token missing.");
        setIsConnectingAgent(false);
        return;
      }
      if (!isEligibleToAddAgent) {
        toast.error("Not eligible to add agent.");
        setIsConnectingAgent(false);
        return;
      }
      const authToken = localStorage.getItem("authToken");
      if (!authToken) {
        toast.error("Auth token missing. Reconnect wallet.");
        setIsConnectingAgent(false);
        return;
      }
      setIsConnectingAgent(true);
      try {
        const response = await fetchWithAuth(
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
              walletAddress: walletAddress,
              username: creds.username,
              profileImageUrl: creds.profileImageUrl,
            }),
            credentials: "include",
          },
        );
        const responseData = await response.json();
        if (!response.ok) {
          if (response.status === 409) {
            toast.error(responseData.error || "This Twitter account may already be linked to a token.");
          } else if (response.status === 403) {
            toast.error(responseData.error || "Not eligible to add agent.");
          } else {
            throw new Error(responseData.error || `Failed to connect agent (${response.status})`);
          }
          return;
        }
        toast.success("Twitter account successfully connected as an agent!");
        await fetchData();
      } catch (error) {
        console.error("Error connecting Twitter agent:", error);
        toast.error(`Failed to connect agent: ${error instanceof Error ? error.message : "Unknown error"}`);
      } finally {
        setIsConnectingAgent(false);
        if (localStorage.getItem(AGENT_INTENT_KEY) === tokenMint) {
          localStorage.removeItem(AGENT_INTENT_KEY);
          const hash = window.location.hash;
          window.history.replaceState({}, "", window.location.pathname + (hash || ""));
        }
      }
    },
    [tokenMint, walletAddress, isEligibleToAddAgent, tokenData, fetchData],
  );

  // --- NEW: Handler for Switching Account ---
  const handleSwitchAccount = async () => {
    if (isDisconnecting) return; // Prevent double clicks

    console.log("Switching account: Disconnecting local session and re-initiating OAuth.");
    setIsDisconnecting(true); // Indicate activity

    // Disconnect locally first (simplified - reuse disconnectTwitter logic without toast)
    localStorage.removeItem(STORAGE_KEY);
    setTwitterCredentials(null);

    // Re-initiate the OAuth flow
    try {
      localStorage.setItem(AGENT_INTENT_KEY, tokenMint);
      const currentPath = window.location.pathname + window.location.hash;
      localStorage.setItem(OAUTH_REDIRECT_ORIGIN_KEY, currentPath);
      window.location.href = `${API_BASE_URL}/api/share/oauth/request_token`;
      // Redirect will happen, no need to setIsDisconnecting(false) here
    } catch (error) {
      toast.error(`Error starting connection: ${error instanceof Error ? error.message : "Unknown"}`);
      localStorage.removeItem(AGENT_INTENT_KEY);
      localStorage.removeItem(OAUTH_REDIRECT_ORIGIN_KEY);
      setIsDisconnecting(false); // Stop indicator on error before redirect
    }
  };
  // ---

  // Remove agent function
  const removeAgent = async (agentToRemove: TokenAgent) => {
    if (!agentToRemove.id || !tokenMint) return;
    if (walletAddress !== agentToRemove.ownerAddress && !isCreator) {
      toast.error("You do not have permission to remove this agent.");
      return;
    }
    const authToken = localStorage.getItem("authToken");
    if (!authToken) {
      toast.error("Auth token missing. Reconnect wallet.");
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
          if (errorBody?.error) errorMsg = errorBody.error;
        } catch (e) {}
        throw new Error(errorMsg);
      }
      toast.success("Agent removed successfully.");
      setTokenAgents((prev) => prev.filter((a) => a.id !== agentToRemove.id));
    } catch (error) {
      console.error("Error removing agent:", error);
      toast.error(`Failed to remove agent: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  // Sorted agents with officials at the top
  const sortedAgents = [...tokenAgents].sort((a, b) => {
    const aIsOfficial = tokenData && a.ownerAddress === tokenCreatorAddress;
    const bIsOfficial = tokenData && b.ownerAddress === tokenCreatorAddress;
    if (aIsOfficial && !bIsOfficial) return -1;
    if (!aIsOfficial && bIsOfficial) return 1;
    return (a.twitterUserName || "").localeCompare(b.twitterUserName || "");
  });

  // Check if the callback is from a connect agent intent
  useEffect(() => {
    if (!componentMounted || !tokenMint) return;
    const storedIntentMint = localStorage.getItem(AGENT_INTENT_KEY);
    const urlParams = new URLSearchParams(window.location.search);
    const hasAuthParams = urlParams.has("oauth_token") || urlParams.has("code");
    if (storedIntentMint === tokenMint && hasAuthParams) {
      console.log("Processing OAuth callback for agent connection...");
      const storedCreds = localStorage.getItem(STORAGE_KEY);
      if (storedCreds) {
        try {
          const parsedCreds = JSON.parse(storedCreds) as TwitterCredentials;
          if (parsedCreds.expiresAt > Date.now()) {
            const tryConnect = (retries = 5) => {
              if (walletAddress) {
                connectTwitterAgent(parsedCreds);
              } else if (retries > 0) {
                setTimeout(() => tryConnect(retries - 1), 1000);
              } else {
                toast.warn("Wallet connection timed out. Please click 'Connect as agent' again.");
                setIsConnectingAgent(false);
              }
            };
            tryConnect();
          } else {
            toast.error("X credentials expired. Please try again.");
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(AGENT_INTENT_KEY);
          }
        } catch (error) {
          toast.error("Failed to process X credentials. Please try again.");
          localStorage.removeItem(AGENT_INTENT_KEY);
        }
      } else {
        console.warn("OAuth callback detected, credentials not yet found locally.");
        toast.info("Processing X authentication...");
      }
    } else if (storedIntentMint && storedIntentMint !== tokenMint) {
      toast.warning("Redirected from X auth for a different token.");
      localStorage.removeItem(AGENT_INTENT_KEY);
    }
  }, [componentMounted, tokenMint, walletAddress, connectTwitterAgent]);

  // Check if user has a connected agent for this token
  const hasConnectedAgent = tokenAgents.some(
    (agent) => publicKey && agent.ownerAddress === publicKey.toBase58(),
  );

  // --- Fetch Creator Profiles ---
  const fetchProfileData = async (
    address: string,
  ): Promise<CreatorProfile | null> => {
    // Example: Replace with your actual fetch logic
    try {
      // Assume an endpoint /api/profiles/:address exists
      const response = await fetch(`${API_BASE_URL}/api/profiles/${address}`);
      if (!response.ok) return null;
      const data = await response.json();
      return data.profile || { displayName: shortenAddress(address) }; // Return profile or fallback
    } catch (error) {
      console.error(`Failed to fetch profile for ${address}:`, error);
      return null; // Return null on error
    }
  };

  const fetchCreatorProfiles = useCallback(
    async (agents: TokenAgent[]) => {
      if (!agents || agents.length === 0 || isFetchingProfiles) return;

      const uniqueOwnerAddresses = [
        ...new Set(agents.map((a) => a.ownerAddress)),
      ];
      const addressesToFetch = uniqueOwnerAddresses.filter(
        (addr) => !creatorProfiles[addr], // Only fetch if not already cached
      );

      if (addressesToFetch.length === 0) return;

      setIsFetchingProfiles(true);
      console.log("Fetching profiles for:", addressesToFetch);
      try {
        const profilePromises = addressesToFetch.map(fetchProfileData);
        const profiles = await Promise.all(profilePromises);

        const newProfiles: Record<string, CreatorProfile> = {};
        addressesToFetch.forEach((addr, index) => {
          if (profiles[index]) {
            newProfiles[addr] = profiles[index]!;
          } else {
            // Cache a fallback if fetch failed or returned null
            newProfiles[addr] = { displayName: shortenAddress(addr) };
          }
        });

        setCreatorProfiles((prev) => ({ ...prev, ...newProfiles }));
      } catch (error) {
        console.error("Error fetching creator profiles:", error);
      } finally {
        setIsFetchingProfiles(false);
      }
    },
    [creatorProfiles, isFetchingProfiles], // Dependencies for useCallback
  );
  // --- End Fetch Creator Profiles ---

  // Define isCurrentUserAgent here within the inner component's scope
  const isCurrentUserAgent = tokenAgents.some(
    (agent) => agent.twitterUserId === twitterCredentials?.userId
  );

  // --- Render ---
  return (
    <div className="w-full flex-shrink-0 h-fit p-4 flex flex-col gap-4">
      {/* Agent List Display */}
      <div className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold text-autofun-text-primary">
          Registered Agents
        </h3>
        {/* Combined Loading State */}
        {isAgentsLoading && (
           <div className="text-center py-4 text-neutral-400">Loading data...</div>
        )}
        {/* Specific Error for Token Data */}
        {tokenDataError && !isAgentsLoading && (
             <div className="text-center py-4 text-red-500">Error loading token data: {tokenDataError}</div>
        )}
         {/* Specific Error for Agents */}
        {agentsError && !tokenDataError && !isAgentsLoading &&( // Show only if token data didn't also fail
             <div className="text-center py-4 text-red-500">Error loading agents: {agentsError}</div>
        )}
        {/* No Agents Message */}
        {!isAgentsLoading && !agentsError && !tokenDataError && sortedAgents.length === 0 && ( <div className="text-center py-4 text-neutral-400">No agents registered yet.</div> )}
        {/* Agent List Mapping */}
        {!isAgentsLoading && !agentsError && !tokenDataError && sortedAgents.length > 0 && (
          <div className="overflow-y-auto max-h-96 flex flex-col gap-4 pr-2">
            {sortedAgents.map((agent) => {
              const agentIsOfficial = tokenData && agent.ownerAddress === tokenCreatorAddress;
              const canRemove = walletAddress === agent.ownerAddress || isCreator;
              const creatorDisplayName = creatorProfiles[agent.ownerAddress]?.displayName || shortenAddress(agent.ownerAddress);
              return (
                  <div
                  key={agent.id}
                  className={`flex items-center justify-between p-3 rounded border ${
                    agentIsOfficial
                      ? "bg-autofun-accent/10 border-autofun-accent"
                      : "bg-autofun-background-input border-autofun-stroke-primary"
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <img
                      src={agent.twitterImageUrl || "/default-avatar.png"}
                      alt=""
                      className="w-10 h-10 rounded-full flex-shrink-0"
                    />
                    <div className="flex flex-col overflow-hidden">
                      <span className="font-medium text-autofun-text-primary truncate">
                        @{agent.twitterUserName}
                        {agentIsOfficial && (
                          <span className="ml-2 text-xs font-semibold text-autofun-accent border border-autofun-accent px-1.5 py-0.5 rounded">
                            Official
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-autofun-text-secondary truncate">
                        Added by{" "}
                        <Link
                          to={`/profiles/${agent.ownerAddress}`}
                          className="hover:underline hover:text-autofun-accent"
                          title={`View profile`}
                        >
                          {creatorDisplayName}
                        </Link>
                        {isFetchingProfiles && !creatorProfiles[agent.ownerAddress] && ' (Loading...)'}
                      </span>
                    </div>
                  </div>
                  {canRemove && (
                    <button
                      onClick={() => removeAgent(agent)}
                      title="Remove agent"
                      className="cursor-pointer text-red-500 hover:text-red-400 p-1 rounded hover:bg-red-950/20 ml-2 flex-shrink-0"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
               );
            })}
          </div>
        )}
      </div>

      {/* Connection Management Section */}
      <div className="mt-4 border-t border-autofun-stroke-primary pt-4 flex flex-col gap-3">
        <h3 className="text-lg font-semibold text-autofun-text-primary">
          Manage Connection
        </h3>
        {!walletAddress ? ( <p className="text-sm text-center text-neutral-400"> Connect your wallet to manage or add agents. </p> )
         : twitterCredentials ? (
             <div className="flex flex-col gap-3 p-3 bg-autofun-background-input rounded border border-autofun-stroke-primary">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-neutral-200 overflow-hidden">
                          {twitterCredentials.profileImageUrl && ( <img src={twitterCredentials.profileImageUrl} alt="" className="w-6 h-6 rounded-full flex-shrink-0" />)}
                          <span className="border border-[#03FF24] rounded-full w-2 h-2 flex-shrink-0"></span>
                          <span className="truncate"> Connected as @{twitterCredentials.username || "Loading..."} </span>
                      </div>
                      <Button onClick={disconnectTwitter} disabled={isDisconnecting} variant="outline" size="small" className="text-red-500 hover:text-red-400 hover:bg-red-950/20 flex-shrink-0" >
                          <LogOut size={16} className="mr-1" /> {isDisconnecting ? "Disconnecting..." : "Disconnect X"}
                      </Button>
                  </div>
                  {isCurrentUserAgent ? (
                       <Button onClick={handleSwitchAccount} disabled={isDisconnecting} className="mt-2 w-full" variant="secondary" >
                           {isDisconnecting ? 'Preparing...' : 'Add / Switch X Account'}
                       </Button>
                   ) : !isEligibleToAddAgent ? (
                       <p className="text-sm text-center text-yellow-500 mt-2"> Hold {MIN_BALANCE_TO_ADD_AGENT.toLocaleString()} {tokenTicker} or be creator to add agent. </p>
                   ) : (
                       <Button onClick={() => connectTwitterAgent(twitterCredentials)} disabled={isConnectingAgent} className="mt-2 w-full" variant="primary" >
                           {isConnectingAgent ? "Connecting Agent..." : `Connect @${twitterCredentials.username} as Agent`}
                       </Button>
                   )
                  }
              </div>
            )
         : (
               <div className="flex flex-col gap-2 items-center">
                 {!isEligibleToAddAgent ? ( <p className="text-sm text-center text-yellow-500"> Hold {MIN_BALANCE_TO_ADD_AGENT.toLocaleString()} {tokenTicker} or be creator to add agent. </p> )
                 : ( <Button onClick={connectTwitterFlow} disabled={isConnectingAgent} className="w-full" variant="primary" > {isConnectingAgent ? "Connecting..." : "Connect X Account to Add Agent"} </Button> )
                 }
               </div>
            )
        }
      </div>

      {/* Fleek Button (optional - kept from original) */}
       <div className="mt-4">
            <Link
              to="https://fleek.xyz/?referral=autofun"
              aria-label="fleek url"
              target="_blank"
            >
              <Button
                className={`flex flex-col items-center gap-2 w-full mx-auto border-[#03FF24] border-2 h-fit hover:bg-[#03FF24] hover:font-bold ${ ''
                }`}
                style={{
                  transition: "color 0.3s ease", // Add transition for text color
                }}
                variant="outline"
              >
                Create an Eliza agent on
                <div className="relative h-6">
                  <img
                    src="/fleek-logo.svg"
                    alt="Fleek"
                    className="aspect-auto absolute h-full"
                    style={{
                      transition: "opacity 0.3s ease",
                       opacity: 1
                    }}
                  />
                  <img
                    src="/fleek-dark-logo.svg"
                    alt="Fleek Dark"
                    className="aspect-auto h-full"
                    style={{
                      transition: "opacity 0.3s ease",
                      opacity: 0
                    }}
                  />
                </div>
              </Button>
            </Link>
          </div>
    </div>
  );
}
