import { useWallet } from "@solana/wallet-adapter-react";
import { LogOut, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { toast } from "react-toastify";
// import { Badge } from "../ui/badge";
import { env } from "@/utils/env";
import Button from "../button";
import { fetchWithAuth } from "@/hooks/use-authentication";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { IToken } from "@/types";
import { shortenAddress } from "@/utils";
import { getToken } from "@/utils/api";

// --- API Base URL ---
const API_BASE_URL = env.apiUrl || ""; // Ensure fallback

// Storage keys for Twitter auth
const STORAGE_KEY = "twitter-oauth-token";
const AGENT_INTENT_KEY = "connect_agent_intent";
const OAUTH_REDIRECT_ORIGIN_KEY = "OAUTH_REDIRECT_ORIGIN"; // Key for storing the original path
const MIN_BALANCE_TO_ADD_AGENT = 100000;

// Types for Twitter authentication
type TwitterCredentials = {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  username?: string; // Add username to display in UI
  profileImageUrl?: string; // Add profile image URL
};

interface CreatorProfile { displayName?: string; }

interface TokenAgent {
  id: string;
  tokenMint: string;
  ownerAddress: string;
  twitterUserId: string;
  twitterUserName: string;
  twitterImageUrl: string;
  twitterDescription?: string;
  official?: boolean;
  createdAt?: number;
}

interface TokenAgentsResponse {
  agents: TokenAgent[];
  // Add other expected fields if needed
}
// --- End Expected API Response Types ---

export default function AgentsSection({ isCreator: isCreatorProp }: { isCreator: boolean }) {
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

  // --- Internal Token Mint Derivation ---
  const { mint: urlTokenMint } = useParams<{ mint: string }>();
  const location = useLocation();
  const [detectedTokenMint, setDetectedTokenMint] = useState<string | null>(null);
  useEffect(() => {
    if (urlTokenMint) { setDetectedTokenMint(urlTokenMint); return; }
    const pathMatch = location.pathname.match(/\/token\/([A-Za-z0-9]{32,44})/);
    if (pathMatch && pathMatch[1]) { setDetectedTokenMint(pathMatch[1]); return; }
  }, [urlTokenMint, location.pathname]);
  const tokenMint = detectedTokenMint;
  // ---

  // --- Internal Token Data State ---
  const [internalTokenData, setInternalTokenData] = useState<Pick<IToken, 'creator' | 'ticker'> | null>(null);
  // ---

  // Creator profile cache
  const [creatorProfiles, setCreatorProfiles] = useState<Record<string, CreatorProfile>>({});
  const [isFetchingProfiles, setIsFetchingProfiles] = useState(false);

  // --- Eligibility Check ---
  // Type assertion is okay here because fetchData won't run if tokenMint is null
  const { tokenBalance } = useTokenBalance({ tokenId: tokenMint as string });
  const userHasSufficientBalance = (tokenBalance || 0) >= MIN_BALANCE_TO_ADD_AGENT;
  const isEligibleToAddAgent = internalTokenData ? (userHasSufficientBalance || isCreatorProp) : false;
  const tokenTicker = internalTokenData?.ticker || "tokens";
  const tokenCreatorAddress = internalTokenData?.creator;
  // ---

  // --- Fetch Creator Profiles ---
  const fetchProfileData = async (address: string): Promise<CreatorProfile | null> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/${address}`); // Assuming user route is /api/users/:address
      if (!response.ok) return null;
      const data = await response.json();
      // Adjust based on actual profile structure returned by /api/users/:address
      return data.user ? { displayName: data.user.displayName || shortenAddress(address) } : { displayName: shortenAddress(address) };
    } catch (error) {
      console.error(`Failed to fetch profile for ${address}:`, error);
      return null;
    }
  };
  const fetchCreatorProfiles = useCallback(async (agents: TokenAgent[]) => {
    if (!agents || agents.length === 0 || isFetchingProfiles) return;
    const uniqueOwnerAddresses = [...new Set(agents.map((a) => a.ownerAddress))];
    const addressesToFetch = uniqueOwnerAddresses.filter((addr) => !creatorProfiles[addr]);
    if (addressesToFetch.length === 0) return;
    setIsFetchingProfiles(true);
    try {
      const profilePromises = addressesToFetch.map(fetchProfileData);
      const profiles = await Promise.all(profilePromises);
      const newProfiles: Record<string, CreatorProfile> = {};
      addressesToFetch.forEach((addr, index) => {
        newProfiles[addr] = profiles[index] || { displayName: shortenAddress(addr) };
      });
      setCreatorProfiles((prev) => ({ ...prev, ...newProfiles }));
    } catch (error) { console.error("Error fetching creator profiles:", error); }
    finally { setIsFetchingProfiles(false); }
  }, [creatorProfiles, isFetchingProfiles]); // API_BASE_URL is constant, no need to list
  // ---

  // --- Combined Fetch Logic ---
  const fetchData = useCallback(async () => {
    if (!tokenMint) {
      setAgentsError("Token address not found in URL.");
      return;
    }
    setIsAgentsLoading(true);
    setAgentsError(null);
    setTokenAgents([]);
    setInternalTokenData(null);

    try {
      // Use Promise.allSettled to handle potential failure of one fetch
      const [agentsResult, tokenDataResult] = await Promise.allSettled([
        fetch(`${API_BASE_URL}/api/token/${tokenMint}/agents`),
        getToken({ address: tokenMint }) // Assumes getToken handles its own errors gracefully or returns null
      ]);

      let fetchedAgents: TokenAgent[] = [];
      let agentsFetchError: string | null = null;
      let tokenFetchError: string | null = null;

      // Process Agents Response
      if (agentsResult.status === 'fulfilled' && agentsResult.value.ok) {
        const agentsData = await agentsResult.value.json() as TokenAgentsResponse;
        if (agentsData && Array.isArray(agentsData.agents)) {
          fetchedAgents = agentsData.agents;

          // *** ADD LOG HERE ***
          console.log("Received agents data from API:", JSON.stringify(fetchedAgents, null, 2));
          // *** END LOGGING ***

          setTokenAgents(fetchedAgents);
          await fetchCreatorProfiles(fetchedAgents);
        } else {
          agentsFetchError = "Invalid agent response format.";
        }
      } else {
        let errorMsg = `Failed to fetch agents: ${agentsResult.status === 'fulfilled' ? agentsResult.value.statusText : agentsResult.reason}`;
        try { if(agentsResult.status === 'fulfilled') {const body = await agentsResult.value.json(); if (body?.error) errorMsg = body.error;} } catch (e) {}
        agentsFetchError = errorMsg;
      }

      // Process Token Data Response
      if (tokenDataResult.status === 'fulfilled' && tokenDataResult.value) {
        setInternalTokenData({
          creator: tokenDataResult.value.creator,
          ticker: tokenDataResult.value.ticker,
        });
      } else {
        tokenFetchError = `Failed to fetch token details: ${tokenDataResult.status === 'rejected' ? tokenDataResult.reason : "Unknown error"}`;
        console.error(tokenFetchError);
        setInternalTokenData(null); // Ensure it's null on error
      }

      // Combine errors if any occurred
      const combinedError = [agentsFetchError, tokenFetchError].filter(Boolean).join('. ');
      if (combinedError) {
        setAgentsError(combinedError);
      }

    } catch (error) { // Catch unexpected errors during processing
      console.error("Unexpected error fetching data:", error);
      setAgentsError(error instanceof Error ? error.message : "Unknown error fetching data");
      setTokenAgents([]);
      setInternalTokenData(null);
    } finally {
      setIsAgentsLoading(false);
    }
  }, [tokenMint, fetchCreatorProfiles]); // Dependencies

  // Initial Fetch & Credential Check
  useEffect(() => {
    setComponentMounted(true);
    const storedCredentials = localStorage.getItem(STORAGE_KEY);
    if (storedCredentials) {
        try {
            const parsed = JSON.parse(storedCredentials) as TwitterCredentials;
            // *** ADD LOG: Log loaded credentials ***
            console.log("[AgentsSection Mount] Loaded credentials from storage:", JSON.stringify(parsed, null, 2));
            if (parsed.expiresAt > Date.now()) { 
                setTwitterCredentials(parsed); 
            }
            else { localStorage.removeItem(STORAGE_KEY); }
        } catch (e) { localStorage.removeItem(STORAGE_KEY); }
     }
    if(tokenMint) { fetchData(); } // Fetch only if mint is detected
    return () => setComponentMounted(false);
  }, [tokenMint, fetchData]); // Rerun if tokenMint changes
  // ---

  // --- Twitter Actions ---
  const disconnectTwitter = async () => {
    setIsDisconnecting(true);
    localStorage.removeItem(STORAGE_KEY);
    setTwitterCredentials(null);
    toast.success("X account disconnected locally.");
    setIsDisconnecting(false);
  };

  const connectTwitterFlow = async () => {
    if (!tokenMint || !walletAddress) { toast.error(!walletAddress ? "Please connect wallet." : "Token not loaded."); return; }
    if (!internalTokenData) { toast.error("Waiting for token details..."); return; } // Check if token data is loaded
    if (!isEligibleToAddAgent) { toast.error(`Must hold at least ${MIN_BALANCE_TO_ADD_AGENT.toLocaleString()} ${tokenTicker} or be creator...`); return; }
    setIsConnectingAgent(true);
    if (twitterCredentials && twitterCredentials.expiresAt > Date.now()) { await connectTwitterAgent(twitterCredentials); return; }
    try {
      localStorage.setItem(AGENT_INTENT_KEY, tokenMint);
      const currentPath = window.location.pathname + window.location.hash;
      localStorage.setItem(OAUTH_REDIRECT_ORIGIN_KEY, currentPath);
      window.location.href = `${API_BASE_URL}/api/share/oauth/request_token`;
    } catch (error) {
      toast.error(`Error starting connection: ${error instanceof Error ? error.message : "Unknown"}`);
      localStorage.removeItem(AGENT_INTENT_KEY);
      localStorage.removeItem(OAUTH_REDIRECT_ORIGIN_KEY);
      setIsConnectingAgent(false);
    }
  };

  const connectTwitterAgent = useCallback( async (creds: TwitterCredentials) => {
    // *** ADD LOG: Log call start ***
    console.log("[connectTwitterAgent] Called with creds:", creds?.userId);
    if (!internalTokenData) { toast.error("Token data not available."); setIsConnectingAgent(false); return; }
    if (!tokenMint || !walletAddress) { toast.error(!walletAddress ? "Wallet not connected." : "Token missing."); setIsConnectingAgent(false); return; }
    if (!isEligibleToAddAgent) { toast.error("Not eligible."); setIsConnectingAgent(false); return; }
    const authToken = localStorage.getItem("authToken");
    if (!authToken) { toast.error("Auth token missing."); setIsConnectingAgent(false); return; }
    setIsConnectingAgent(true);
    try {
      const response = await fetchWithAuth( `${API_BASE_URL}/api/token/${tokenMint}/connect-twitter-agent`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: creds.userId, accessToken: creds.accessToken, walletAddress: walletAddress, username: creds.username, profileImageUrl: creds.profileImageUrl, }), }, );
      const responseData = await response.json();
      if (!response.ok) {
        if (response.status === 409) { toast.error( responseData.error || "X account already linked.");
        } else if (response.status === 403) { toast.error( responseData.error || "Not eligible.");
        } else { throw new Error( responseData.error || `Connect agent failed (${response.status})`); }
        return;
      }
      toast.success("X account connected as agent!");
      await fetchData(); // Refresh data
    } catch (error) { toast.error(`Failed to connect: ${error instanceof Error ? error.message : "Unknown"}`); }
    finally {
      setIsConnectingAgent(false);
      if (localStorage.getItem(AGENT_INTENT_KEY) === tokenMint) {
        localStorage.removeItem(AGENT_INTENT_KEY);
        const hash = window.location.hash;
        window.history.replaceState({}, "", window.location.pathname + (hash || ""));
      }
    }
  }, [tokenMint, walletAddress, isEligibleToAddAgent, internalTokenData, fetchData] ); // Add internalTokenData dependency

  // --- Handler for Switching Account ---
  const handleSwitchAccount = async () => {
    if (isDisconnecting || !tokenMint) return;
    setIsDisconnecting(true);
    localStorage.removeItem(STORAGE_KEY);
    setTwitterCredentials(null);
    try {
      localStorage.setItem(AGENT_INTENT_KEY, tokenMint);
      const currentPath = window.location.pathname + window.location.hash;
      localStorage.setItem(OAUTH_REDIRECT_ORIGIN_KEY, currentPath);
      window.location.href = `${API_BASE_URL}/api/share/oauth/request_token`;
    } catch (error) {
      toast.error(`Error starting connection: ${error instanceof Error ? error.message : "Unknown"}`);
      localStorage.removeItem(AGENT_INTENT_KEY);
      localStorage.removeItem(OAUTH_REDIRECT_ORIGIN_KEY);
      setIsDisconnecting(false);
    }
  };
  // ---

  // --- Remove Agent ---
  const removeAgent = async (agentToRemove: TokenAgent) => {
    if (!agentToRemove.id || !tokenMint) return;
    if (walletAddress !== agentToRemove.ownerAddress && !isCreatorProp) {
      toast.error("Permission denied.");
      return;
    }
    try {
      const response = await fetchWithAuth( 
        `${API_BASE_URL}/api/token/${tokenMint}/agents/${agentToRemove.id}`, 
        { 
          method: "DELETE", 
        }, 
      );
      if (!response.ok) { 
        let errorMsg = `Remove failed: ${response.statusText}`;
        try { 
          const body = await response.json(); 
          if (body?.error) errorMsg = body.error; 
        } catch (e) { /* Ignore if body isn't json or already read */ }
        throw new Error(errorMsg); 
      }
      toast.success("Agent removed.");
      setTokenAgents((prev) => prev.filter((a) => a.id !== agentToRemove.id));
    } catch (error) { toast.error(`Failed to remove: ${error instanceof Error ? error.message : "Unknown"}`); }
  };
  // ---

  // --- Process OAuth Callback ---
  useEffect(() => {
       if (!componentMounted || !tokenMint) return;
        const storedIntentMint = localStorage.getItem(AGENT_INTENT_KEY);
        const urlParams = new URLSearchParams(window.location.search);
        const hasAuthParams = urlParams.has("oauth_token") || urlParams.has("code");
        if (storedIntentMint === tokenMint && hasAuthParams) {
            // *** ADD LOG: Log callback detected ***
            console.log("[OAuth Callback] Detected callback for this token.");
            const storedCreds = localStorage.getItem(STORAGE_KEY);
            if (storedCreds) {
                // *** ADD LOG: Log creds found in storage ***
                console.log("[OAuth Callback] Found credentials in storage.");
                try {
                    const parsedCreds = JSON.parse(storedCreds) as TwitterCredentials;
                    if (parsedCreds.expiresAt > Date.now()) {
                        const tryConnect = (retries = 5) => { 
                            // *** ADD LOG: Log wallet check attempt ***
                            console.log(`[OAuth Callback] tryConnect attempt ${6-retries}. Wallet connected:`, !!walletAddress);
                            if (walletAddress) { 
                                // *** ADD LOG: Log calling connectTwitterAgent ***
                                console.log("[OAuth Callback] Wallet connected. Calling connectTwitterAgent...");
                                connectTwitterAgent(parsedCreds); 
                            } else if (retries > 0) { 
                                setTimeout(() => tryConnect(retries - 1), 1000); 
                            } else { 
                                toast.warn("Wallet timed out."); setIsConnectingAgent(false); 
                            } 
                        };
                        tryConnect();
                    } else { toast.error("X creds expired."); localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(AGENT_INTENT_KEY); }
                } catch (error) { toast.error("Failed processing creds."); localStorage.removeItem(AGENT_INTENT_KEY); }
            } else { 
                 // *** ADD LOG: Log creds NOT found ***
                 console.warn("[OAuth Callback] Credentials NOT found in storage. Callback handler issue?");
            }
        } else if (storedIntentMint && storedIntentMint !== tokenMint) { toast.warning("X auth for different token."); localStorage.removeItem(AGENT_INTENT_KEY); }
   }, [componentMounted, tokenMint, walletAddress, connectTwitterAgent]);
  // ---

  // --- Sorting & Display Logic ---
  const sortedAgents = [...tokenAgents].sort((a, b) => {
    const aIsOfficial = internalTokenData && a.ownerAddress === tokenCreatorAddress;
    const bIsOfficial = internalTokenData && b.ownerAddress === tokenCreatorAddress;
    if (aIsOfficial && !bIsOfficial) return -1;
    if (!aIsOfficial && bIsOfficial) return 1;
    return (a.twitterUserName || "").localeCompare(b.twitterUserName || "");
  });

  const isCurrentUserAgent = tokenAgents.some(
    (agent) => agent.twitterUserId === twitterCredentials?.userId
  );
  // ---

  // --- Render ---
  return (
    <div className="w-full flex-shrink-0 h-fit p-4 flex flex-col md:flex-row gap-6">

      {/* --- Left Column: Agent List --- */}
      <div className="flex flex-col gap-3 md:w-2/3">
        <h3 className="text-lg font-semibold text-autofun-text-primary mb-2"> Registered Agents </h3>
        {/* Loading / Error States */}
        {isAgentsLoading && ( <div className="text-center py-4 text-neutral-400">Loading data...</div> )}
        {agentsError && !isAgentsLoading && ( <div className="text-center py-4 text-red-500">Error: {agentsError}</div> )}
        {/* Empty state checks internalTokenData existence indirectly via agentsError */}
        {!isAgentsLoading && !agentsError && sortedAgents.length === 0 && ( <div className="text-center py-4 text-neutral-400">No agents registered yet.</div> )}

        {/* Agent List Mapping */}
        {!isAgentsLoading && !agentsError && internalTokenData && sortedAgents.length > 0 && (
          <div className="overflow-y-auto max-h-[50vh] md:max-h-[70vh] flex flex-col gap-4 pr-2">
            {sortedAgents.map((agent) => {
              const agentIsOfficial = internalTokenData && agent.ownerAddress === tokenCreatorAddress;
              const canRemove = walletAddress === agent.ownerAddress || isCreatorProp;
              const creatorDisplayName = creatorProfiles[agent.ownerAddress]?.displayName || shortenAddress(agent.ownerAddress);
              return (
                <div key={agent.id} className={`flex items-start gap-4 p-4 rounded ${ agentIsOfficial ? "bg-purple-900/20" : "bg-neutral-800/30" }`} >
                  <img src={agent.twitterImageUrl || "/default-avatar.png"} alt={`${agent.twitterUserName} avatar`} className="w-16 h-16 flex-shrink-0" />
                  <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-semibold text-lg text-white break-words"> {agent.twitterUserName} </span>
                      {canRemove && ( <button onClick={() => removeAgent(agent)} title="Remove agent" className="cursor-pointer text-red-500 hover:text-red-400 p-1 flex-shrink-0" > <Trash2 size={16} /> </button> )}
                    </div>
                    <p className="text-sm text-neutral-300 break-words">{agent.twitterDescription || "(No bio provided)"}</p>
                    <div className="text-xs text-neutral-400 mt-1">
                      Created by{" "}
                      <Link to={`/profiles/${agent.ownerAddress}`} className="hover:underline hover:text-purple-400 font-medium" title={`View profile`} >
                        {creatorDisplayName}
                      </Link>
                      {isFetchingProfiles && !creatorProfiles[agent.ownerAddress] && ' (Loading...)'}
                      {agentIsOfficial && <span className="text-purple-400 font-medium"> (Dev)</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* --- Right Column: Connection Management --- */}
      <div className="md:w-1/3 flex flex-col gap-3">
        <h3 className="text-lg font-semibold text-autofun-text-primary mb-2"> Add Agents </h3>

        {/* Wallet Disconnected View */}
        {!walletAddress && ( <p className="text-sm text-center text-neutral-400bg-neutral-800/30"> Connect wallet... </p> )}

        {/* Wallet Connected View */}
        {walletAddress && (
          <div className="flex flex-col gap-3 bg-neutral-800/30 rounded">
            {twitterCredentials ? (
              // Logged In to Twitter View
              <div className="flex flex-col gap-3">
                {/* User Info */}
                <div className="flex flex-col gap-1 text-sm text-neutral-200 overflow-hidden mb-2">
                  <span className="text-xs text-neutral-400">Currently connected as:</span>
                  <div className="flex items-center gap-2 mt-1">
                    {twitterCredentials.profileImageUrl && ( <img src={twitterCredentials.profileImageUrl} alt="" className="w-6 h-6 rounded-full flex-shrink-0" />)}
                    <span className="truncate font-medium"> {twitterCredentials.username || "Loading..."} </span>
                  </div>
                </div>
                {/* Action Buttons */}
                <div className="flex flex-col gap-2 mt-1">
                  {/* Check if internalTokenData is loaded */}
                  {!internalTokenData ? (<p className="text-xs text-center text-neutral-400 py-2">Loading...</p>)
                  : isCurrentUserAgent ? (
                    // Current Twitter is ALREADY an agent -> Offer switch/add
                    <Button onClick={handleSwitchAccount} disabled={isDisconnecting} variant="primary" className="bg-autofun-accent hover:bg-autofun-accent/90 text-black font-bold" >
                      {isDisconnecting ? 'PREPARING...' : 'SWITCH X ACCOUNT'}
                    </Button>
                  ) : !isEligibleToAddAgent ? (
                    // Cannot add current Twitter account (ineligible)
                    <p className="text-sm text-center text-yellow-500 mt-1"> Must hold 100,000+ {tokenTicker} or be creator to add agent. </p>
                  ) : (
                    // Can add current Twitter account (Connect button removed, switch is primary action)
                    <p className="text-xs text-center text-neutral-400 mt-1">(Use Switch Account to connect)</p>
                  )}
                  {/* Always show Disconnect */}
                  <Button onClick={disconnectTwitter} disabled={isDisconnecting} variant="outline" className="border-autofun-accent text-autofun-accent hover:bg-autofun-accent/10" size="default" >
                    {isDisconnecting ? "DISCONNECTING..." : "DISCONNECT"}
                  </Button>
                </div>
              </div>
            ) : (
              // Logged Out of Twitter View
              <div className="flex flex-col gap-2 items-center">
                {/* Check if internalTokenData is loaded */}
                {!internalTokenData ? (<p className="text-xs text-center text-neutral-400">Loading...</p>)
                : !isEligibleToAddAgent ? (
                  <p className="text-sm text-center text-yellow-500"> Must hold 100,000+ {tokenTicker} or be creator to connect X account. </p>
                ) : (
                  <Button onClick={connectTwitterFlow} disabled={isConnectingAgent || isAgentsLoading} className="w-full bg-autofun-accent p-4 bg-[#03FF24] text-black font-bold" variant="primary" >
                    {isConnectingAgent ? "CONNECTING..." : "CONNECT X ACCOUNT"}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Fleek Button - Moved to right column */}
        <div className="mt-4">
          <Link to="https://fleek.xyz/?referral=autofun" aria-label="fleek url" target="_blank" >
            <Button onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)} className={`flex flex-col items-center gap-2 w-full mx-auto border-[#03FF24] border-2 h-fit hover:bg-[#03FF24] hover:font-bold ${ isHovered ? "text-black" : "" }`} style={{ transition: "color 0.3s ease" }} variant="outline" >
              Create an Eliza agent on
              <div className="relative h-6">
                <img src="/fleek-logo.svg" alt="Fleek" className="aspect-auto absolute h-full" style={{ transition: "opacity 0.3s ease", opacity: isHovered ? 0 : 1 }} />
                <img src="/fleek-dark-logo.svg" alt="Fleek Dark" className="aspect-auto h-full" style={{ transition: "opacity 0.3s ease", opacity: isHovered ? 1 : 0 }}/>
              </div>
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
