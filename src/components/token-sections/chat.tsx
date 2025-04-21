// TODO: Rewrite as chat instead of generation

import Button from "@/components/button";
import Loader from "@/components/loader";
import useAuthentication, { fetchWithAuth } from "@/hooks/use-authentication";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { env } from "@/utils/env";
import { useWallet } from "@solana/wallet-adapter-react";
import { RefreshCw, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";

// --- API Base URL ---
const API_BASE_URL = env.apiUrl || ""; // Ensure fallback

// --- Constants for Chat ---
const CHAT_TIERS = ["1k", "100k", "1M"] as const;
type ChatTier = (typeof CHAT_TIERS)[number];

// Helper functions for chat tiers
const getTierThreshold = (tier: ChatTier): number => {
  switch (tier) {
    case "1k":
      return 1000;
    case "100k":
      return 100000;
    case "1M":
      return 1000000;
    default:
      return Infinity;
  }
};

const formatTierLabel = (tier: ChatTier): string => {
  switch (tier) {
    case "1k":
      return "1k+";
    case "100k":
      return "100k+";
    case "1M":
      return "1M+";
    default:
      return "";
  }
};

// --- Chat Types ---
// Chat Message Type (matches backend structure)
interface ChatMessage {
  id: string;
  author: string; // User's public key
  tokenMint: string;
  message: string;
  parentId?: string | null;
  tier: ChatTier;
  replyCount?: number;
  timestamp: string;
  isOptimistic?: boolean; // Flag for optimistically added messages
  hasLiked?: boolean; // Add hasLiked field
}

// API Response Types for Chat
interface EligibleTiersResponse {
  success: boolean;
  tiers?: ChatTier[];
  balance?: number;
  error?: string;
}

interface GetMessagesResponse {
  success: boolean;
  messages?: ChatMessage[];
  error?: string;
}

interface PostMessageResponse {
  success: boolean;
  message?: ChatMessage;
  error?: string;
}

export default function ChatSection() {
  const { publicKey } = useWallet();
  const { isAuthenticated, isAuthenticating } = useAuthentication();
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [selectedChatTier, setSelectedChatTier] = useState<ChatTier>("1k");
  const [eligibleChatTiers, setEligibleChatTiers] = useState<ChatTier[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [isRefreshingMessages, setIsRefreshingMessages] = useState(false);
  const [isBalanceLoading, setIsBalanceLoading] = useState(true);
  const [latestTimestamp, setLatestTimestamp] = useState<string | null>(null); // State for polling

  // Get token mint from URL params with better fallback logic
  const { mint: urlTokenMint } = useParams<{ mint: string }>();
  const location = useLocation();

  // Extract token mint from URL if not found in params
  const [detectedTokenMint, setDetectedTokenMint] = useState<string | null>(
    null,
  );

  // Use detected token mint instead of directly from params
  const tokenMint = detectedTokenMint;

  // Add token balance hook after tokenMint is set
  const { tokenBalance } = useTokenBalance({ tokenId: tokenMint || "" });

  // Update balance loading state when token balance changes
  useEffect(() => {
    if (tokenBalance !== undefined) {
      setIsBalanceLoading(false);
    }
  }, [tokenBalance]);

  // --- Fetch Initial Chat Messages --- *MODIFIED*
  const fetchChatMessages = useCallback(
    async (tier: ChatTier, showLoading = true) => {
      if (
        !tokenMint ||
        !publicKey ||
        !API_BASE_URL ||
        !eligibleChatTiers.includes(tier) ||
        !isAuthenticated ||
        isBalanceLoading ||
        isAuthenticating
      ) {
        setChatMessages([]);
        setLatestTimestamp(null); // Reset timestamp if prerequisites fail
        return;
      }

      if (showLoading) {
        setIsChatLoading(true);
      } else {
        setIsRefreshingMessages(true);
      }

      setChatError(null);
      try {
        // NOTE: Using the original endpoint for initial fetch
        // Consider adapting if the backend consolidated endpoints
        const response = await fetchWithAuth(
          `${API_BASE_URL}/api/chat/${tokenMint}/${tier}?limit=100`, // Assuming this path is correct for fetching initial messages
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

        if (response.status === 401 || response.status === 403) {
          setChatError(
            `You need ${getTierThreshold(tier).toLocaleString()} tokens to view this chat.`,
          );
          setChatMessages([]);
          setLatestTimestamp(null); // Reset timestamp on auth error
          return;
        }

        if (!response.ok) {
          throw new Error(`Failed to fetch messages: ${response.statusText}`);
        }

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          throw new Error("Invalid response format: Expected JSON");
        }

        const data: GetMessagesResponse = await response.json();

        if (data.success && data.messages) {
          // Sort messages by timestamp, oldest first
          const sortedMessages = data.messages.sort(
            (a, b) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
          );
          setChatMessages(sortedMessages);
          // Set latest timestamp for polling
          if (sortedMessages.length > 0) {
            setLatestTimestamp(
              sortedMessages[sortedMessages.length - 1].timestamp,
            );
          } else {
            // If no messages, start polling from now
            setLatestTimestamp(new Date().toISOString());
          }
        } else {
          // Set timestamp to now even on error to potentially start polling
          setLatestTimestamp(new Date().toISOString());
          throw new Error(data.error || "Failed to fetch messages");
        }
      } catch (error) {
        console.error("Error fetching chat messages:", error);
        setChatError(
          error instanceof Error ? error.message : "Could not load messages",
        );
        setChatMessages([]);
        // Set timestamp to now even on error to potentially start polling
        setLatestTimestamp(new Date().toISOString());
      } finally {
        setIsChatLoading(false);
        setIsRefreshingMessages(false);
      }
    },
    [
      tokenMint,
      publicKey,
      eligibleChatTiers,
      isAuthenticated,
      isBalanceLoading,
      isAuthenticating,
      // Removed fetchChatMessages from deps as it causes infinite loops
    ],
  );

  // Effect to detect token mint from various sources
  useEffect(() => {
    // First try from URL params (most reliable)
    if (urlTokenMint) {
      setDetectedTokenMint(urlTokenMint);
      return;
    }

    // If not in params, try to extract from pathname
    const pathMatch = location.pathname.match(/\/token\/([A-Za-z0-9]{32,44})/);
    if (pathMatch && pathMatch[1]) {
      setDetectedTokenMint(pathMatch[1]);
      return;
    }
  }, [urlTokenMint, location.pathname]);

  // --- Fetch Chat Eligibility --- *NEW*
  const fetchChatEligibility = useCallback(async () => {
    if (!tokenMint || !publicKey || !API_BASE_URL || isBalanceLoading) {
      setEligibleChatTiers([]);
      return;
    }

    // Don't show loading indicator just for eligibility check if messages are already loading
    // setIsChatLoading(true);
    setChatError(null);
    try {
      // NOTE: Using the eligibility endpoint
      const response = await fetchWithAuth(
        `${API_BASE_URL}/api/chat/${tokenMint}/tiers`, // Assuming this path is correct
      );

      if (response.status === 401 || response.status === 403) {
        setChatError("Authentication required or insufficient permissions");
        setEligibleChatTiers([]);
        return;
      }

      if (!response.ok) {
        throw new Error(
          `Failed to fetch tier eligibility: ${response.statusText}`,
        );
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Invalid response format: Expected JSON");
      }

      const data: EligibleTiersResponse = await response.json();

      if (data.success && data.tiers) {
        // Use blockchain balance directly
        const effectiveBalance = tokenBalance || 0;

        // Calculate eligible tiers based on blockchain balance
        const eligibleTiers = CHAT_TIERS.filter(
          (tier) => effectiveBalance >= getTierThreshold(tier),
        );

        setEligibleChatTiers(eligibleTiers);

        // If current selected tier is no longer eligible, switch to the highest eligible one
        if (
          !eligibleTiers.includes(selectedChatTier) &&
          eligibleTiers.length > 0
        ) {
          setSelectedChatTier(eligibleTiers[eligibleTiers.length - 1]);
        } else if (eligibleTiers.length === 0) {
          // If not eligible for any tier, maybe default to '1k' display but disable?
          // setSelectedChatTier("1k"); // Keep selected tier, buttons will be disabled
        }
      } else {
        throw new Error(data.error || "Failed to fetch eligible tiers");
      }
    } catch (error) {
      console.error("Error fetching chat eligibility:", error);
      setChatError(
        error instanceof Error ? error.message : "Could not check eligibility",
      );
      setEligibleChatTiers([]);
    } finally {
      // setIsChatLoading(false);
    }
  }, [tokenMint, publicKey, selectedChatTier, tokenBalance, isBalanceLoading]);

  // Fetch eligibility when balance/auth/token changes
  useEffect(() => {
    if (publicKey && tokenMint && !isBalanceLoading && isAuthenticated) {
      fetchChatEligibility();
    }
  }, [
    fetchChatEligibility,
    publicKey,
    tokenMint,
    isBalanceLoading,
    isAuthenticated,
  ]);

  // Effect to reset state and fetch initial messages when context changes
  useEffect(() => {
    setLatestTimestamp(null); // Reset timestamp
    setChatMessages([]); // Clear old messages
    setChatError(null); // Clear old errors
    if (
      tokenMint &&
      eligibleChatTiers.includes(selectedChatTier) &&
      !isBalanceLoading &&
      isAuthenticated
    ) {
      setIsChatLoading(true); // Show loading spinner for initial fetch
      fetchChatMessages(selectedChatTier);
    }
  }, [
    tokenMint,
    selectedChatTier,
    fetchChatMessages,
    isBalanceLoading,
    isAuthenticated,
    eligibleChatTiers,
  ]); // Added deps

  // --- Poll for New Messages --- *NEW*
  const pollForNewMessages = useCallback(async () => {
    // Ensure all conditions are met before polling
    if (
      !tokenMint ||
      !publicKey ||
      !selectedChatTier ||
      !latestTimestamp ||
      !isAuthenticated ||
      isSendingMessage ||
      isChatLoading ||
      isRefreshingMessages
    ) {
      return;
    }

    try {
      // Use the new backend update route
      const response = await fetchWithAuth(
        // IMPORTANT: Adjust this path if your backend router setup differs
        `${API_BASE_URL}/api/messages/${tokenMint}/${selectedChatTier}/updates?since=${latestTimestamp}`,
      );

      if (!response.ok) {
        // Log polling errors quietly
        console.warn(
          `Polling failed (${response.status}): ${response.statusText}`,
        );
        if (response.status === 401 || response.status === 403) {
          // Handle auth errors during polling - maybe stop polling?
          // For now, just log and let the interval continue/be cleared elsewhere
          console.error("Polling auth failed. Stopping?");
        }
        return;
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.warn("Polling received non-JSON response");
        return;
      }

      const data: GetMessagesResponse = await response.json();

      if (data.success && data.messages && data.messages.length > 0) {
        // Sort new messages (API guarantees ascending order, but sort just in case)
        const newMessages = data.messages.sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );

        // Filter out potential duplicates (e.g., optimistic messages confirmed by poll)
        const currentMessageIds = new Set(chatMessages.map((m) => m.id));
        const uniqueNewMessages = newMessages.filter(
          (nm) => !currentMessageIds.has(nm.id),
        );

        if (uniqueNewMessages.length > 0) {
          setChatMessages((prev) => [...prev, ...uniqueNewMessages]);
          setLatestTimestamp(
            uniqueNewMessages[uniqueNewMessages.length - 1].timestamp,
          );

          // Scroll to bottom only if new messages were added and user is near bottom
          if (chatContainerRef.current) {
            const scrollThreshold = 100; // Pixels from bottom
            const isNearBottom =
              chatContainerRef.current.scrollHeight -
                chatContainerRef.current.clientHeight <=
              chatContainerRef.current.scrollTop + scrollThreshold;
            if (isNearBottom) {
              // Use setTimeout to ensure scroll happens after DOM update
              setTimeout(() => {
                if (chatContainerRef.current) {
                  chatContainerRef.current.scrollTop =
                    chatContainerRef.current.scrollHeight;
                }
              }, 0);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error polling for messages:", error);
      // Avoid showing polling errors prominently
    }
  }, [
    tokenMint,
    publicKey,
    selectedChatTier,
    latestTimestamp,
    isAuthenticated,
    isSendingMessage,
    isChatLoading,
    isRefreshingMessages,
    chatMessages, // Needed for duplicate check
    // API_BASE_URL is stable
  ]);

  // Setup polling interval
  useEffect(() => {
    // Only poll if authenticated, have necessary info, and a timestamp to poll from
    if (
      isAuthenticated &&
      tokenMint &&
      selectedChatTier &&
      latestTimestamp &&
      eligibleChatTiers.includes(selectedChatTier)
    ) {
      const intervalId = setInterval(pollForNewMessages, 5000); // Poll every 5 seconds
      console.log(
        `Polling started for ${tokenMint} / ${selectedChatTier} since ${latestTimestamp}`,
      );

      return () => {
        clearInterval(intervalId); // Cleanup interval
        console.log(`Polling stopped for ${tokenMint} / ${selectedChatTier}`);
      };
    }
  }, [
    isAuthenticated,
    tokenMint,
    selectedChatTier,
    latestTimestamp,
    eligibleChatTiers,
    pollForNewMessages,
  ]);

  // --- Send Chat Message --- *MODIFIED*
  const handleSendMessage = async () => {
    if (
      !chatInput.trim() ||
      !tokenMint ||
      !publicKey ||
      !eligibleChatTiers.includes(selectedChatTier)
    ) {
      return;
    }

    setIsSendingMessage(true);
    setChatError(null);
    const tempId = `temp-${Date.now()}`; // Use timestamp for temp ID
    const optimisticMessage: ChatMessage = {
      id: tempId,
      author: publicKey.toBase58(),
      tokenMint: tokenMint,
      message: chatInput.trim(),
      tier: selectedChatTier,
      timestamp: new Date().toISOString(),
      isOptimistic: true,
      hasLiked: false, // Optimistic messages haven't been liked
    };

    // Optimistic UI update
    setChatMessages((prev) => [...prev, optimisticMessage]);
    setChatInput("");

    // Scroll to bottom after optimistic update
    if (chatContainerRef.current) {
      setTimeout(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop =
            chatContainerRef.current.scrollHeight;
        }
      }, 0);
    }

    try {
      // Use the existing POST endpoint (assuming it's correct)
      const response = await fetchWithAuth(
        `${API_BASE_URL}/api/chat/${tokenMint}/${selectedChatTier}`, // Assuming this path is correct
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: chatInput.trim(),
            // No parentId specified here, assumes root message
          }),
        },
      );

      if (response.status === 401 || response.status === 403) {
        setChatError(
          `You need ${getTierThreshold(selectedChatTier).toLocaleString()} tokens to post here.`,
        );
        // Remove optimistic message
        setChatMessages((prev) => prev.filter((msg) => msg.id !== tempId));
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Invalid response format: Expected JSON");
      }

      const data: PostMessageResponse = await response.json();

      if (data.success && data.message) {
        // Remove the optimistic message and add the real one
        setChatMessages((prev) => {
          const filtered = prev.filter((msg) => msg.id !== tempId);
          // Make sure the real message isn't already added by polling
          if (!filtered.some((m) => m.id === data.message!.id)) {
            return [...filtered, data.message!];
          }
          return filtered;
        });
        // Update latest timestamp if this new message is the latest
        if (
          !latestTimestamp ||
          new Date(data.message.timestamp).getTime() >
            new Date(latestTimestamp).getTime()
        ) {
          setLatestTimestamp(data.message.timestamp);
        }
      } else {
        throw new Error(data.error || "Failed to send message");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setChatError(
        error instanceof Error ? error.message : "Could not send message",
      );
      // Remove optimistic message on error
      setChatMessages((prev) => prev.filter((msg) => msg.id !== tempId));
    } finally {
      setIsSendingMessage(false);
    }
  };

  // Scroll to bottom of chat when messages initially load
  // Polling handles its own scrolling logic
  useEffect(() => {
    if (chatContainerRef.current && !isChatLoading && chatMessages.length > 0) {
      // Only scroll fully down on initial load or refresh
      if (!latestTimestamp) {
        // Rough check if it's initial load
        chatContainerRef.current.scrollTop =
          chatContainerRef.current.scrollHeight;
      }
    }
  }, [chatMessages, isChatLoading]); // Removed latestTimestamp dependency

  // Determine if user can chat in the currently selected tier
  const canChatInSelectedTier =
    publicKey &&
    eligibleChatTiers.includes(selectedChatTier) &&
    isAuthenticated;

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();

    // If today, just show time
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    // If this year, show date without year
    if (date.getFullYear() === now.getFullYear()) {
      return (
        date.toLocaleDateString([], { month: "short", day: "numeric" }) +
        " " +
        date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
    }

    // Otherwise show full date
    return (
      date.toLocaleDateString([], {
        year: "numeric",
        month: "short",
        day: "numeric",
      }) +
      " " +
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
  };

  // Function to render the avatar/identity for each message
  const renderMessageAvatar = (authorKey: string) => {
    // Get first 4 and last 4 chars of public key for display
    const shortKey = `${authorKey.substring(0, 4)}...${authorKey.substring(authorKey.length - 4)}`;

    return (
      <div className="flex items-center gap-2">
        {/* <div 
          className="flex items-center justify-center w-8 h-8 rounded-full text-black font-semibold text-xs"
          style={{ backgroundColor: bgColor }}
        >
          {authorKey.substring(0, 2).toUpperCase()}
        </div> */}
        <span className="text-xs text-gray-400">{shortKey}</span>
      </div>
    );
  };

  return (
    <div className="flex flex-col my-2">
      <div className="flex flex-col md:flex-row gap-4">
        {/* Content Area */}
        <div className="flex flex-col grow w-full">
          <div className="flex flex-col h-[70vh] bg-black border-t-1 border-gray-700">
            {/* Tier Selection Header */}
            <div className="flex justify-between items-center p-2">
              <div className="flex gap-2">
                {CHAT_TIERS.map((tier) => {
                  const isEligible = eligibleChatTiers.includes(tier);
                  const isSelected = selectedChatTier === tier;
                  return (
                    <button
                      key={tier}
                      // Clear messages and timestamp on tier change handled by useEffect
                      onClick={() => setSelectedChatTier(tier)}
                      disabled={!isEligible || isChatLoading} // Disable while loading initial messages
                      className={`px-3 py-1 text-sm font-medium transition-colors
                          ${isSelected ? "bg-[#03FF24] text-black" : "text-gray-300"}
                          ${!isEligible ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-700"}
                          ${isChatLoading && isSelected ? "animate-pulse" : ""} // Indicate loading on selected tab
                        `}
                    >
                      {formatTierLabel(tier)}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="small"
                  variant="outline"
                  // Refresh fetches all messages again, resetting the timestamp
                  onClick={() => {
                    setLatestTimestamp(null);
                    fetchChatMessages(selectedChatTier, false);
                  }}
                  disabled={isRefreshingMessages || isChatLoading}
                  className="p-1"
                >
                  <RefreshCw
                    size={16}
                    className={
                      isRefreshingMessages ||
                      (isChatLoading && !isRefreshingMessages)
                        ? "animate-spin"
                        : ""
                    } // Spin if initial loading too
                  />
                </Button>
              </div>
            </div>

            {/* Message Display Area */}
            <div
              ref={chatContainerRef}
              className="flex-grow overflow-y-auto p-2 space-y-3 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800"
            >
              {(isBalanceLoading ||
                (isChatLoading && chatMessages.length === 0)) && (
                <div className="flex items-center justify-center w-full h-full">
                  <Loader />
                </div>
              )}

              {!isBalanceLoading && chatError && !isChatLoading && (
                <div className="text-center py-8">
                  <p className="text-red-500 mb-2">{chatError}</p>
                  <Button
                    size="small"
                    variant="outline"
                    // Try again fetches initial messages
                    onClick={() => fetchChatMessages(selectedChatTier)}
                    disabled={isChatLoading}
                  >
                    Try Again
                  </Button>
                </div>
              )}

              {!isBalanceLoading &&
                !isChatLoading &&
                chatMessages.length === 0 &&
                !chatError && (
                  <div className="flex flex-col items-center justify-center h-full text-center py-16">
                    <p className="text-gray-500 mb-2">
                      No messages yet in the {formatTierLabel(selectedChatTier)}{" "}
                      chat.
                    </p>
                    {!canChatInSelectedTier && publicKey && (
                      <p className="text-yellow-500 text-sm">
                        You need{" "}
                        {getTierThreshold(selectedChatTier).toLocaleString()}+
                        tokens to chat here.
                      </p>
                    )}
                    {!publicKey && (
                      <p className="text-yellow-500 text-sm">
                        Connect your wallet to chat.
                      </p>
                    )}
                  </div>
                )}

              {!isBalanceLoading &&
                chatMessages.map((msg) => (
                  <div
                    key={msg.id} // Use message ID as key
                    className={`flex ${msg.author === publicKey?.toBase58() ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`p-3 max-w-[95%] rounded-lg shadow-md ${
                        // Added rounded corners and shadow
                        msg.isOptimistic
                          ? "bg-gray-700/50 animate-pulse"
                          : msg.author === publicKey?.toBase58()
                            ? "bg-[#03FF24]/10 border border-[#03FF24]/30"
                            : "bg-gray-700"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        {renderMessageAvatar(msg.author)}{" "}
                        <span className="ml-2 text-xs text-gray-500">
                          {formatTimestamp(msg.timestamp)}
                        </span>
                      </div>

                      <p className="text-sm break-words whitespace-pre-wrap my-1">
                        {msg.message}
                      </p>
                    </div>
                  </div>
                ))}
            </div>

            {/* Message Input Area */}
            <div className="p-2 border-t border-gray-700">
              {" "}
              {/* Added border */}
              {!canChatInSelectedTier && publicKey && (
                <p className="text-center text-yellow-500 text-sm mb-2">
                  You need {getTierThreshold(selectedChatTier).toLocaleString()}
                  + tokens to chat here.
                </p>
              )}
              {!publicKey && (
                <p className="text-center text-yellow-500 text-sm mb-2">
                  Connect your wallet to chat.
                </p>
              )}
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey && // Allow shift+enter for newlines if needed in future
                      !isSendingMessage &&
                      canChatInSelectedTier
                    ) {
                      e.preventDefault(); // Prevent default newline on enter
                      handleSendMessage();
                    }
                  }}
                  placeholder={
                    !isAuthenticated
                      ? "Connect wallet to chat"
                      : !eligibleChatTiers.includes(selectedChatTier)
                        ? `Need ${getTierThreshold(selectedChatTier).toLocaleString()}+ tokens`
                        : `Message in ${formatTierLabel(selectedChatTier)} chat...`
                  }
                  disabled={!canChatInSelectedTier || isSendingMessage}
                  className="flex-1 h-10 border bg-gray-800 border-gray-600 text-white focus:outline-none focus:border-[#03FF24] focus:ring-1 focus:ring-[#03FF24] px-3 text-sm rounded-md disabled:opacity-60 disabled:cursor-not-allowed" // Added rounded corners, adjusted colors
                />
                <button
                  onClick={handleSendMessage}
                  disabled={
                    !canChatInSelectedTier ||
                    isSendingMessage ||
                    !chatInput.trim()
                  }
                  className="p-2 bg-[#03FF24] text-black hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed transition-all rounded-md flex items-center justify-center w-10 h-10" // Adjusted styles
                >
                  {isSendingMessage ? (
                    <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Send size={20} />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
