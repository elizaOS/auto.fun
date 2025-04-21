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
import { useInView } from 'react-intersection-observer';

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

const CHAT_MESSAGE_LIMIT = 50; // Define limit constant

// --- Chat Types ---
// ... existing code ...

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
  const [latestTimestamp, setLatestTimestamp] = useState<string | null>(null);

  // --- Pagination State ---
  const [oldestTimestamp, setOldestTimestamp] = useState<string | null>(null);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const { ref: topSentinelRef, inView: isTopSentinelInView } = useInView({
    threshold: 0, // Trigger as soon as it enters viewport
  });

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

  // --- Scrolling Helper --- MOVED HERE - AFTER chatContainerRef declaration
  const scrollToBottom = useCallback((forceScroll = false) => {
    if (!chatContainerRef.current) return;

    // Log to debug
    console.log("Attempting to scroll to bottom, forceScroll:", forceScroll);

    const scrollThreshold = 100; // Pixels from bottom
    const isNearBottom =
      chatContainerRef.current.scrollHeight -
        chatContainerRef.current.clientHeight <=
      chatContainerRef.current.scrollTop + scrollThreshold;

    if (forceScroll || isNearBottom) {
      // Use setTimeout to ensure scroll happens after DOM update
      setTimeout(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop =
            chatContainerRef.current.scrollHeight;
          console.log("Scrolled to bottom");
        }
      }, 10); // Small timeout to ensure DOM updates
    }
  }, []);

  // Handler to detect when user scrolls away from bottom
  useEffect(() => {
    if (!chatContainerRef.current) return;

    const handleScroll = () => {
      if (!chatContainerRef.current) return;
      
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      const isNearBottom = scrollHeight - clientHeight <= scrollTop + 150; // 150px threshold
      
      setShowScrollButton(!isNearBottom);
    };

    const chatContainer = chatContainerRef.current;
    chatContainer.addEventListener('scroll', handleScroll);
    
    return () => {
      chatContainer.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // --- Fetch Initial Chat Messages --- *REVISED*
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
        setLatestTimestamp(null);
        setOldestTimestamp(null);
        setHasOlderMessages(true);
        return;
      }

      if (showLoading) {
        setIsChatLoading(true);
      } else {
        setIsRefreshingMessages(true);
      }

      setChatError(null);
      setHasOlderMessages(true);
      try {
        const response = await fetchWithAuth(
          `${API_BASE_URL}/api/chat/${tokenMint}/${tier}?limit=${CHAT_MESSAGE_LIMIT}`,
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
          setLatestTimestamp(null);
          setOldestTimestamp(null);
          setHasOlderMessages(false);
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
          const sortedMessages = data.messages.sort(
            (a, b) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
          );
          setChatMessages(sortedMessages);

          if (sortedMessages.length > 0) {
            setLatestTimestamp(sortedMessages[sortedMessages.length - 1].timestamp);
            setOldestTimestamp(sortedMessages[0].timestamp);
            setHasOlderMessages(sortedMessages.length === CHAT_MESSAGE_LIMIT);
          } else {
            const now = new Date().toISOString();
            setLatestTimestamp(now);
            setOldestTimestamp(now);
            setHasOlderMessages(false);
          }
          setTimeout(() => scrollToBottom(true), 100);
          console.log("Initial messages loaded, should scroll to bottom");
        } else {
          const now = new Date().toISOString();
          setLatestTimestamp(now);
          setOldestTimestamp(now);
          setHasOlderMessages(false);
          throw new Error(data.error || "Failed to fetch messages");
        }
      } catch (error) {
        console.error("Error fetching chat messages:", error);
        setChatError(
          error instanceof Error ? error.message : "Could not load messages",
        );
        setChatMessages([]);
        const now = new Date().toISOString();
        setLatestTimestamp(now);
        setOldestTimestamp(now);
        setHasOlderMessages(false);
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
      scrollToBottom
    ],
  );

  // Effect to detect token mint from various sources
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
  }, [urlTokenMint, location.pathname]);

  // --- Fetch Chat Eligibility --- *NEW*
  const fetchChatEligibility = useCallback(async () => {
    if (!tokenMint || !publicKey || !API_BASE_URL || isBalanceLoading) {
      setEligibleChatTiers([]);
      return;
    }

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
        const effectiveBalance = tokenBalance || 0;

        const eligibleTiers = CHAT_TIERS.filter(
          (tier) => effectiveBalance >= getTierThreshold(tier),
        );

        setEligibleChatTiers(eligibleTiers);

        if (
          !eligibleTiers.includes(selectedChatTier) &&
          eligibleTiers.length > 0
        ) {
          setSelectedChatTier(eligibleTiers[eligibleTiers.length - 1]);
        } else if (eligibleTiers.length === 0) {
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
    setLatestTimestamp(null);
    setChatMessages([]);
    setChatError(null);
    setOldestTimestamp(null);
    setHasOlderMessages(true);
    setIsLoadingOlderMessages(false);

    if (
      tokenMint &&
      eligibleChatTiers.includes(selectedChatTier) &&
      !isBalanceLoading &&
      isAuthenticated
    ) {
      setIsChatLoading(true);
      fetchChatMessages(selectedChatTier);
    }
  }, [
    tokenMint,
    selectedChatTier,
    isBalanceLoading,
    isAuthenticated,
    eligibleChatTiers,
  ]);

  // --- Fetch Older Messages (Upwards Pagination) --- *NEW*
  const fetchOlderMessages = useCallback(async () => {
    if (
      !tokenMint ||
      !publicKey ||
      !selectedChatTier ||
      !oldestTimestamp ||
      !hasOlderMessages ||
      isLoadingOlderMessages ||
      isChatLoading
    ) {
      return;
    }

    setIsLoadingOlderMessages(true);
    setChatError(null);

    try {
      const response = await fetchWithAuth(
        `${API_BASE_URL}/api/chat/${tokenMint}/${selectedChatTier}/history?before=${oldestTimestamp}&limit=${CHAT_MESSAGE_LIMIT}`,
      );

      if (!response.ok) {
        if (response.status === 404) {
          setHasOlderMessages(false);
        } else {
          throw new Error(`Failed to fetch older messages: ${response.statusText}`);
        }
        return;
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Invalid response format: Expected JSON");
      }

      const data: GetMessagesResponse = await response.json();

      if (data.success && data.messages && data.messages.length > 0) {
        const chatDiv = chatContainerRef.current;
        const oldScrollHeight = chatDiv?.scrollHeight || 0;
        const oldScrollTop = chatDiv?.scrollTop || 0;

        const sortedOlderMessages = data.messages.sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );

        setChatMessages((prev) => [...sortedOlderMessages, ...prev]);
        setOldestTimestamp(sortedOlderMessages[0].timestamp);
        setHasOlderMessages(sortedOlderMessages.length === CHAT_MESSAGE_LIMIT);

        if (chatDiv) {
          requestAnimationFrame(() => {
            const newScrollHeight = chatDiv.scrollHeight;
            chatDiv.scrollTop = newScrollHeight - oldScrollHeight + oldScrollTop;
          });
        }
      } else {
        setHasOlderMessages(false);
        if (data.error) {
          console.warn("Error fetching older messages (backend):", data.error);
        }
      }
    } catch (error) {
      console.error("Error fetching older messages:", error);
    } finally {
      setIsLoadingOlderMessages(false);
    }
  }, [
    tokenMint,
    publicKey,
    selectedChatTier,
    oldestTimestamp,
    hasOlderMessages,
    isLoadingOlderMessages,
    isChatLoading,
    isAuthenticated
  ]);

  // Trigger fetchOlderMessages when top sentinel becomes visible
  useEffect(() => {
    if (isTopSentinelInView && hasOlderMessages && !isLoadingOlderMessages) {
      fetchOlderMessages();
    }
  }, [isTopSentinelInView, hasOlderMessages, isLoadingOlderMessages, fetchOlderMessages]);

  // --- Poll for New Messages --- *REVISED*
  const pollForNewMessages = useCallback(async () => {
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
      const response = await fetchWithAuth(
        `${API_BASE_URL}/api/messages/${tokenMint}/${selectedChatTier}/updates?since=${latestTimestamp}`,
      );

      if (!response.ok) {
        console.warn(
          `Polling failed (${response.status}): ${response.statusText}`,
        );
        if (response.status === 401 || response.status === 403) {
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
        const newMessages = data.messages.sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );

        const currentMessageIds = new Set(chatMessages.map((m) => m.id));
        const uniqueNewMessages = newMessages.filter(
          (nm) => !currentMessageIds.has(nm.id),
        );

        if (uniqueNewMessages.length > 0) {
          setChatMessages((prev) => [...prev, ...uniqueNewMessages]);
          setLatestTimestamp(
            uniqueNewMessages[uniqueNewMessages.length - 1].timestamp,
          );

          setTimeout(() => scrollToBottom(false), 50);
        }
      }
    } catch (error) {
      console.error("Error polling for messages:", error);
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
    chatMessages,
    scrollToBottom
  ]);

  // Setup polling interval
  useEffect(() => {
    if (
      isAuthenticated &&
      tokenMint &&
      selectedChatTier &&
      latestTimestamp &&
      eligibleChatTiers.includes(selectedChatTier)
    ) {
      const intervalId = setInterval(pollForNewMessages, 5000);
      console.log(
        `Polling started for ${tokenMint} / ${selectedChatTier} since ${latestTimestamp}`,
      );

      return () => {
        clearInterval(intervalId);
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

  // --- Send Chat Message --- *REVISED*
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
      hasLiked: false,
    };

    setChatMessages((prev) => [...prev, optimisticMessage]);
    setChatInput("");

    setTimeout(() => scrollToBottom(true), 50);

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
        setChatMessages((prev) => {
          const filtered = prev.filter((msg) => msg.id !== tempId);
          if (!filtered.some((m) => m.id === data.message!.id)) {
            return [...filtered, data.message!];
          }
          return filtered;
        });
        if (
          !latestTimestamp ||
          new Date(data.message.timestamp).getTime() >
            new Date(latestTimestamp).getTime()
        ) {
          setLatestTimestamp(data.message.timestamp);
        }
        setTimeout(() => scrollToBottom(true), 50);
      } else {
        throw new Error(data.error || "Failed to send message");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setChatError(
        error instanceof Error ? error.message : "Could not send message",
      );
      setChatMessages((prev) => prev.filter((msg) => msg.id !== tempId));
    } finally {
      setIsSendingMessage(false);
    }
  };

  // Scroll to bottom on first render and when messages change
  useEffect(() => {
    if (!isChatLoading && chatMessages.length > 0) {
      // Short delay to ensure DOM updates
      setTimeout(() => scrollToBottom(true), 100);
      console.log("Messages changed, scrolling to bottom");
    }
  }, [chatMessages, isChatLoading, scrollToBottom]);

  // Determine if user can chat in the currently selected tier
  const canChatInSelectedTier =
    publicKey &&
    eligibleChatTiers.includes(selectedChatTier) &&
    isAuthenticated;

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();

    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    if (date.getFullYear() === now.getFullYear()) {
      return (
        date.toLocaleDateString([], { month: "short", day: "numeric" }) +
        " " +
        date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
    }

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
    const shortKey = `${authorKey.substring(0, 4)}...${authorKey.substring(authorKey.length - 4)}`;

    return (
      <div className="flex items-center gap-2">
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
                      disabled={!isEligible || isChatLoading || isLoadingOlderMessages}
                      className={`px-3 py-1 text-sm font-medium transition-colors
                          ${isSelected ? "bg-[#03FF24] text-black" : "text-gray-300"}
                          ${!isEligible ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-700"}
                          ${isChatLoading && isSelected ? "animate-pulse" : ""}
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
                  onClick={() => {
                    setOldestTimestamp(null);
                    setHasOlderMessages(true);
                    fetchChatMessages(selectedChatTier, false);
                  }}
                  disabled={isRefreshingMessages || isChatLoading || isLoadingOlderMessages}
                  className="p-1"
                >
                  <RefreshCw
                    size={16}
                    className={
                      isRefreshingMessages ||
                      (isChatLoading && !isRefreshingMessages)
                        ? "animate-spin"
                        : ""
                    }
                  />
                </Button>
              </div>
            </div>

            {/* Message Display Area */}
            <div
              ref={chatContainerRef}
              className="flex-grow overflow-y-auto p-2 space-y-3 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800"
            >
              {/* --- Top Sentinel for Upward Pagination --- */}
              <div ref={topSentinelRef} style={{ height: '1px' }} />

              {/* Loading indicator for older messages */}
              {isLoadingOlderMessages && (
                <div className="flex items-center justify-center py-2">
                  <Loader />
                </div>
              )}

              {/* No More Older Messages Indicator */}
              {!hasOlderMessages && chatMessages.length > 0 && !isLoadingOlderMessages && (
                 <div className="text-center text-gray-500 text-xs py-2">
                   Beginning of chat history
                 </div>
               )}

              {(isBalanceLoading ||
                (isChatLoading && chatMessages.length === 0)) && !isLoadingOlderMessages && (
                <div className="flex items-center justify-center w-full h-full">
                  <Loader />
                </div>
              )}

              {!isBalanceLoading && chatError && !isChatLoading && !isLoadingOlderMessages && (
                <div className="text-center py-8">
                  <p className="text-red-500 mb-2">{chatError}</p>
                  <Button
                    size="small"
                    variant="outline"
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
                !chatError && !isLoadingOlderMessages && (
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
                    key={msg.id}
                    className={`flex ${msg.author === publicKey?.toBase58() ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`p-3 max-w-[95%] rounded-lg shadow-md ${
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
              {/* Scroll to bottom button */}
              {showScrollButton && (
                <button
                  onClick={() => scrollToBottom(true)}
                  className="fixed bottom-24 right-4 bg-[#03FF24] text-black rounded-full p-3 shadow-lg hover:opacity-90 transition-opacity"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
              )}
              
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
                      !e.shiftKey &&
                      !isSendingMessage &&
                      canChatInSelectedTier
                    ) {
                      e.preventDefault();
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
                  className="flex-1 h-10 border bg-gray-800 border-gray-600 text-white focus:outline-none focus:border-[#03FF24] focus:ring-1 focus:ring-[#03FF24] px-3 text-sm rounded-md disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={
                    !canChatInSelectedTier ||
                    isSendingMessage ||
                    !chatInput.trim()
                  }
                  className="p-2 bg-[#03FF24] text-black hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed transition-all rounded-md flex items-center justify-center w-10 h-10"
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
