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
const CHAT_TIERS = ["1k", "10k", "100k", "1M"] as const;
type ChatTier = (typeof CHAT_TIERS)[number];

// Helper functions for chat tiers
const getTierThreshold = (tier: ChatTier): number => {
  switch (tier) {
    case "1k":
      return 1000;
    case "10k":
      return 10000;
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
    case "10k":
      return "10k+";
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

  // --- Fetch Chat Messages --- *NEW*
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
        return;
      }

      if (showLoading) {
        setIsChatLoading(true);
      } else {
        setIsRefreshingMessages(true);
      }

      setChatError(null);
      try {
        const response = await fetchWithAuth(
          `${API_BASE_URL}/api/chat/${tokenMint}/${tier}?limit=100`,
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
        } else {
          throw new Error(data.error || "Failed to fetch messages");
        }
      } catch (error) {
        console.error("Error fetching chat messages:", error);
        setChatError(
          error instanceof Error ? error.message : "Could not load messages",
        );
        setChatMessages([]);
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

    setIsChatLoading(true);
    setChatError(null);
    try {
      const response = await fetchWithAuth(
        `${API_BASE_URL}/api/chat/${tokenMint}/tiers`,
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
      setIsChatLoading(false);
    }
  }, [tokenMint, publicKey, selectedChatTier, tokenBalance, isBalanceLoading]);

  useEffect(() => {
    if (publicKey && tokenMint && !isBalanceLoading) {
      fetchChatEligibility();
    }
  }, [fetchChatEligibility, publicKey, tokenMint, isBalanceLoading]);

  // Fetch messages when selected tier or eligibility changes
  useEffect(() => {
    if (selectedChatTier && !isBalanceLoading) {
      fetchChatMessages(selectedChatTier);
    }
  }, [
    selectedChatTier,
    eligibleChatTiers,
    fetchChatMessages,
    isBalanceLoading,
  ]);

  // --- Send Chat Message --- *NEW*
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
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: ChatMessage = {
      id: tempId,
      author: publicKey.toBase58(),
      tokenMint: tokenMint,
      message: chatInput.trim(),
      tier: selectedChatTier,
      timestamp: new Date().toISOString(),
      isOptimistic: true,
    };

    // Optimistic UI update
    setChatMessages((prev) => [...prev, optimisticMessage]);
    setChatInput("");

    try {
      const response = await fetchWithAuth(
        `${API_BASE_URL}/api/chat/${tokenMint}/${selectedChatTier}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: chatInput.trim(),
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
          return [...filtered, data.message!];
        });
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

  // Scroll to bottom of chat when messages update
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Determine if user can chat in the currently selected tier
  const canChatInSelectedTier =
    publicKey && eligibleChatTiers.includes(selectedChatTier);

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
                      onClick={() => setSelectedChatTier(tier)}
                      disabled={!isEligible}
                      className={`px-3 py-1 text-sm font-medium transition-colors
                          ${isSelected ? "bg-[#03FF24] text-black" : "text-gray-300"}
                          ${!isEligible ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-700"}
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
                  onClick={() => fetchChatMessages(selectedChatTier, false)}
                  disabled={isRefreshingMessages}
                  className="p-1"
                >
                  <RefreshCw
                    size={16}
                    className={isRefreshingMessages ? "animate-spin" : ""}
                  />
                </Button>
              </div>
            </div>

            {/* Message Display Area */}
            <div
              ref={chatContainerRef}
              className="flex-grow overflow-y-auto p-2 space-y-3 scrollbar-thin"
            >
              {isBalanceLoading && (
                <div className="flex items-center justify-center w-full h-full">
                  <Loader />
                </div>
              )}

              {!isBalanceLoading && isChatLoading && (
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
                    onClick={() => fetchChatMessages(selectedChatTier)}
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
                    <p className="text-gray-400 text-sm mb-4">
                      Be the first to start the conversation!
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
                    key={msg.id}
                    className={`flex ${msg.author === publicKey?.toBase58() ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`p-3 max-w-[95%] ${
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
            <div className="p-2 ">
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
                      !isSendingMessage &&
                      canChatInSelectedTier
                    )
                      handleSendMessage();
                  }}
                  placeholder={
                    canChatInSelectedTier
                      ? `Message in ${formatTierLabel(selectedChatTier)} chat...`
                      : "Connect wallet or hold more tokens"
                  }
                  disabled={!canChatInSelectedTier || isSendingMessage}
                  className="flex-1 h-10 border text-white focus:outline-none focus:border-[#03FF24] focus:ring-1 focus:ring-[#03FF24] px-3 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={
                    !canChatInSelectedTier ||
                    isSendingMessage ||
                    !chatInput.trim()
                  }
                  className="p-2 bg-[#03FF24] text-black hover:opacity-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
