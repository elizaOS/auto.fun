import Chat from "@/components/chat/index";
import Loader from "@/components/loader";
import SkeletonImage from "@/components/skeleton-image";
import TokenStatus from "@/components/token-status"; // Reuse status component
import Verified from "@/components/verified"; // Reuse verified component
import { fetchWithAuth } from "@/hooks/use-authentication";
import { useSolPriceContext } from "@/providers/use-sol-price-context"; // Import SOL price context
import { IToken } from "@/types"; // Assuming you have this type
import { ProfileToken } from "@/types/profileTypes"; // Keep ProfileToken type
import { resizeImage, shortenAddress } from "@/utils";
import { getToken } from "@/utils/api"; // Reuse API util
import { env } from "@/utils/env";
import { useWallet } from "@solana/wallet-adapter-react";
import { ExternalLink } from "lucide-react"; // Reuse icon
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Tooltip } from "react-tooltip"; // Reuse tooltip

const API_BASE_URL = env.apiUrl || "";

export default function ChatPage() {
  const { publicKey } = useWallet();
  const { mint: selectedMint } = useParams<{ mint: string }>();
  const navigate = useNavigate();
  const { solPrice } = useSolPriceContext(); // Get SOL price

  // --- State for user tokens (fetched from dedicated endpoint) ---
  const [userTokens, setUserTokens] = useState<ProfileToken[] | null>(null);
  const [isLoadingTokens, setIsLoadingTokens] = useState(true);
  const [errorLoadingTokens, setErrorLoadingTokens] = useState<Error | null>(
    null,
  );

  // --- Fetch User's Platform Tokens Effect ---
  useEffect(() => {
    const loadPlatformTokens = async () => {
      if (!publicKey) {
        setUserTokens([]);
        setIsLoadingTokens(false);
        setErrorLoadingTokens(null);
        return;
      }
      setIsLoadingTokens(true);
      setErrorLoadingTokens(null);
      try {
        // TODO: Replace with your ACTUAL backend endpoint
        const response = await fetchWithAuth(
          `${API_BASE_URL}/api/users/platform-tokens`,
        );
        if (!response.ok) {
          throw new Error(
            `Failed to fetch platform tokens: ${response.statusText}`,
          );
        }
        const data = await response.json();
        console.log("data", data);
        if (data.success && Array.isArray(data.tokens)) {
          // Assuming the endpoint returns data compatible with ProfileToken
          setUserTokens(data.tokens);
        } else {
          throw new Error(
            data.error || "Invalid response format for platform tokens",
          );
        }
      } catch (err: any) {
        console.error("Error fetching platform tokens:", err);
        setErrorLoadingTokens(
          err instanceof Error ? err : new Error("Failed to load tokens"),
        );
        setUserTokens([]); // Set empty on error
      } finally {
        setIsLoadingTokens(false);
      }
    };
    loadPlatformTokens();
  }, [publicKey]); // Rerun only when publicKey changes

  // --- State for selected token details ---
  const [selectedTokenDetails, setSelectedTokenDetails] =
    useState<IToken | null>(null);
  const [isLoadingTokenDetails, setIsLoadingTokenDetails] = useState(false);

  // --- Sort Tokens by USD Value ---
  const sortedUserTokens = useMemo(() => {
    console.log("userTokens", userTokens);
    console.log("solPrice", solPrice);
    if (!userTokens || !solPrice) return [];
    return [...userTokens].sort((a, b) => {
      const valueA = (a.solValue || 0) * solPrice;
      const valueB = (b.solValue || 0) * solPrice;
      return valueB - valueA; // Sort descending
    });
  }, [userTokens, solPrice]);

  // --- Effect to navigate to first token if none selected ---
  useEffect(() => {
    if (
      !isLoadingTokens &&
      !selectedMint &&
      userTokens &&
      userTokens.length > 0
    ) {
      navigate(`/chat/${userTokens[0].mint}`, { replace: true });
    }
  }, [isLoadingTokens, selectedMint, userTokens, navigate]);

  // --- Fetch Selected Token Details (Keep this effect) ---
  useEffect(() => {
    const fetchTokenDetails = async () => {
      if (!selectedMint) {
        setSelectedTokenDetails(null);
        return;
      }
      setIsLoadingTokenDetails(true);
      try {
        // Reuse existing getToken function
        const tokenData = await getToken({ address: selectedMint });
        setSelectedTokenDetails(tokenData);
      } catch (error) {
        console.error("Error fetching token details:", error);
        setSelectedTokenDetails(null);
        // Optionally navigate away or show error in chat area
      } finally {
        setIsLoadingTokenDetails(false);
      }
    };

    fetchTokenDetails();
  }, [selectedMint]);

  return (
    <div className="flex h-[calc(100vh-6em)]">
      {/* Left Column: Token List */}
      <div className="w-64 bg-neutral-900 flex-shrink-0 overflow-y-auto p-2 flex flex-col gap-1 border-r border-neutral-700">
        <h2 className="text-sm font-semibold text-neutral-400 px-2 py-1 mb-1 uppercase tracking-wider">
          Your Tokens
        </h2>
        {isLoadingTokens && (
          <div className="flex justify-center py-4">Loading...</div>
        )}
        {errorLoadingTokens && !isLoadingTokens && (
          <div className="text-center text-red-500 text-xs p-2">
            {/* Display error from state */}
            {errorLoadingTokens.message || "Could not load your token list."}
          </div>
        )}
        {!isLoadingTokens &&
          !errorLoadingTokens &&
          (!sortedUserTokens || sortedUserTokens.length === 0) && (
            <div className="text-center text-neutral-500 text-xs p-2">
              {publicKey
                ? "You don't seem to hold any platform tokens."
                : "Connect wallet to see your tokens."}
            </div>
          )}
        {!isLoadingTokens &&
          sortedUserTokens?.map(
            (
              token: ProfileToken, // Iterate over sorted tokens
            ) => (
              <Link
                key={token.mint}
                to={`/chat/${token.mint}`}
                className={`flex items-center gap-3 p-2 hover:bg-neutral-700/50 transition-colors ${
                  selectedMint === token.mint ? "bg-neutral-700" : ""
                }`}
                title={token.name || ""}
              >
                <SkeletonImage
                  src={resizeImage(token.image || "", 40, 40)}
                  alt={token.name ? `${token.name} logo` : "Token logo"}
                  className="w-8 h-8 rounded-full flex-shrink-0 object-cover bg-neutral-700"
                />
                <div className="flex-1 w-full">
                  <div className="text-sm font-medium text-white">
                    {token.name}
                  </div>
                  <div className="text-xs text-white">${token.ticker}</div>
                </div>
              </Link>
            ),
          )}
      </div>

      {/* Right Column: Chat Area */}
      <div className="flex-1 flex flex-col bg-neutral-800 overflow-hidden">
        {!selectedMint ? (
          // Placeholder when no token is selected
          <div className="flex-1 flex items-center justify-center text-neutral-500">
            {isLoadingTokens ? (
              <Loader />
            ) : (
              "Select a token from the left to start chatting."
            )}
          </div>
        ) : isLoadingTokenDetails ? (
          // Loading state for selected token details
          <div className="flex-1 flex items-center justify-center">
            <Loader />
          </div>
        ) : selectedTokenDetails ? (
          // Display chat when token details are loaded
          <>
            {/* Top Bar: Token Info */}
            <div className="flex items-center gap-3 p-3 border-b border-neutral-700 bg-neutral-850 shadow-md flex-shrink-0">
              <SkeletonImage
                src={resizeImage(selectedTokenDetails.image, 60, 60)}
                alt={`${selectedTokenDetails.name} logo`}
                className="w-10 h-10 rounded-full flex-shrink-0 object-cover bg-neutral-700"
              />
              <div className="flex-1 overflow-hidden">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-neutral-100 truncate">
                    {selectedTokenDetails.name}
                  </h3>
                  <Verified
                    isVerified={selectedTokenDetails.verified ? true : false}
                  />
                  <Tooltip
                    anchorSelect={`#chat-view-on-solscan-${selectedTokenDetails.mint}`}
                  >
                    <span>View on Solscan</span>
                  </Tooltip>
                  <Link
                    to={env.getTokenURL(selectedTokenDetails.mint)}
                    target="_blank"
                    id={`#chat-view-on-solscan-${selectedTokenDetails.mint}`}
                  >
                    <ExternalLink className="size-4 text-neutral-400 hover:text-white" />
                  </Link>
                </div>
                <div className="text-sm text-neutral-400 font-dm-mono">
                  ${selectedTokenDetails.ticker}
                </div>
              </div>
              <div className="flex-shrink-0">
                <TokenStatus token={selectedTokenDetails} />
              </div>
            </div>

            {/* Chat Component Takes Remaining Space */}
            <div className="flex-1 overflow-hidden">
              {/* The Chat component uses useParams internally, so it should work */}
              <Chat maxHeight="100%" />
            </div>
          </>
        ) : (
          // Error/Not Found state for selected token
          <div className="flex-1 flex items-center justify-center text-red-500">
            Could not load chat for token: {shortenAddress(selectedMint)}. It
            might not exist or there was an error.
          </div>
        )}
      </div>
    </div>
  );
}
