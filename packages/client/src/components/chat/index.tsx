// TODO: Rewrite as chat instead of generation

import Button from "@/components/button";
import Loader from "@/components/loader";
import useAuthentication, { fetchWithAuth } from "@/hooks/use-authentication";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { env } from "@/utils/env";
import { getSocket } from "@/utils/socket"; // Import WebSocket utility
import { useWallet } from "@solana/wallet-adapter-react";
import { clsx } from "clsx"; // Import clsx for conditional classes
import {
  Image as ImageIcon,
  RefreshCw,
  Send,
  User as UserIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";
import { Link, useLocation, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { ChatImage } from "./ChatImage";

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
  displayName?: string | null; // Optional: Author's display name
  profileImage?: string | null; // Optional: Author's profile picture URL
  tokenMint: string;
  message: string;
  parentId?: string | null;
  tier: ChatTier;
  replyCount?: number;
  timestamp: string;
  isOptimistic?: boolean; // Flag for optimistically added messages
  media?: string; // Added media field
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

export default function Chat({ maxHeight = "600px" }: { maxHeight?: string }) {
  const { publicKey } = useWallet();
  const { isAuthenticated, isAuthenticating } = useAuthentication();
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [selectedChatTier, setSelectedChatTier] = useState<ChatTier>("1k");
  const [eligibleChatTiers, setEligibleChatTiers] = useState<ChatTier[]>([]);
  const [viewableChatTiers, setViewableChatTiers] = useState<ChatTier[]>([
    "1k",
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [isRefreshingMessages, setIsRefreshingMessages] = useState(false);
  const [isBalanceLoading, setIsBalanceLoading] = useState(true);
  const [latestTimestamp, setLatestTimestamp] = useState<string | null>(null);
  const [isChatFullscreen, setIsChatFullscreen] = useState(false);

  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageCaption, setImageCaption] = useState("");

  // --- Pagination State ---
  const [currentOffset, setCurrentOffset] = useState(0);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const { ref: topSentinelRef, inView: isTopSentinelInView } = useInView({
    threshold: 0,
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

  // Determine if user can chat (POST) in the currently selected tier
  const canChatInSelectedTier =
    isAuthenticated &&
    publicKey != null &&
    eligibleChatTiers.includes(selectedChatTier);

  // Update balance loading state when token balance changes
  useEffect(() => {
    if (tokenBalance !== undefined || !isAuthenticated) {
      setIsBalanceLoading(false);
    }
  }, [tokenBalance, isAuthenticated]);

  // --- Scrolling Helper --- MOVED HERE - AFTER chatContainerRef declaration
  const scrollToBottom = useCallback((forceScroll = false) => {
    if (!chatContainerRef.current) return;

    // Log to debug

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
        }
      }, 10); // Small timeout to ensure DOM updates
    }
  }, []);

  const handleScroll = () => {
    if (!chatContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const isNearBottom = scrollHeight - clientHeight <= scrollTop + 150; // 150px threshold

    setShowScrollButton(!isNearBottom);
  };

  // Handler to detect when user scrolls away from bottom
  useEffect(() => {
    if (!chatContainerRef.current) return;

    const chatContainer = chatContainerRef.current;
    chatContainer.addEventListener("scroll", handleScroll);

    return () => {
      chatContainer.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // --- WebSocket Instance --- (NEW)
  const socket = getSocket();

  // --- Constants ---
  const MESSAGES_PER_PAGE = 50; // Define how many messages to fetch per page

  // --- Fetch Initial Messages ---
  const fetchChatMessages = useCallback(
    async (tier: ChatTier, mint: string, isInitialLoad = false) => {
      if (!mint) return;
      setIsChatLoading(true);
      setChatError(null);
      if (isInitialLoad) {
        setChatMessages([]); // Clear messages on initial load or tier change
        setCurrentOffset(0); // Reset offset
        setHasOlderMessages(true); // Reset pagination status
      }

      const fetchFn = tier === "1k" ? fetch : fetchWithAuth; // Use fetch for 1k, fetchWithAuth otherwise
      const url = `${API_BASE_URL}/api/chat/${mint}/${tier}?limit=${MESSAGES_PER_PAGE}&offset=0`; // Initial fetch uses offset 0
      let response: Response | undefined; // Initialize as potentially undefined
      let data: GetMessagesResponse;
      try {
        response = await fetchFn(url);
        data = await response.json();

        if (!response.ok || !data.success || !data.messages) {
          // Throw an error object that includes the status if possible
          const error: any = new Error(
            data.error ||
              `Failed to fetch messages (Status: ${response.status})`,
          );
          error.status = response.status; // Attach status to the error object
          throw error;
        }

        // Sort messages by timestamp just in case (API should ideally return sorted)
        const sortedMessages = data.messages.sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );

        setChatMessages(sortedMessages);
        setCurrentOffset(sortedMessages.length); // Set offset for the *next* fetch
        setHasOlderMessages(sortedMessages.length === MESSAGES_PER_PAGE); // Assume more if we got a full page

        // Update latest timestamp from the initial batch
        if (sortedMessages.length > 0) {
          setLatestTimestamp(
            sortedMessages[sortedMessages.length - 1].timestamp,
          );
        } else {
          setLatestTimestamp(null);
        }

        // Scroll to bottom only on initial load
        if (isInitialLoad) {
          scrollToBottom(true);
        }

        setChatError(null); // Clear error on success
      } catch (error: any) {
        console.error("Error fetching chat messages:", error);

        // Check if the error object has the status we attached, or check the response variable if it exists
        const status = error?.status ?? response?.status; // Safely get status
        const isPermissionError = status === 401 || status === 403;

        if (isPermissionError) {
          setChatError(
            `You don't have permission to view the ${formatTierLabel(tier)} tier.`,
          );
        } else {
          // Use error.message which might contain the status code now
          setChatError(error?.message || "Could not load chat messages.");
        }
        setChatMessages([]); // Clear messages on error
      } finally {
        setIsChatLoading(false);
        setIsRefreshingMessages(false);
      }
    },
    [API_BASE_URL, fetchWithAuth, scrollToBottom, formatTierLabel],
  ); // Add dependencies

  // --- Fetch Older Messages (Pagination) --- MODIFIED
  const fetchOlderMessages = useCallback(async () => {
    if (isLoadingOlderMessages || !hasOlderMessages || !tokenMint) return;

    setIsLoadingOlderMessages(true);
    setChatError(null);

    const fetchFn = selectedChatTier === "1k" ? fetch : fetchWithAuth;
    // Use currentOffset for pagination
    const url = `${API_BASE_URL}/api/chat/${tokenMint}/${selectedChatTier}?limit=${MESSAGES_PER_PAGE}&offset=${currentOffset}`;

    try {
      const response = await fetchFn(url);
      const data: GetMessagesResponse = await response.json();

      if (!response.ok || !data.success || !data.messages) {
        throw new Error(data.error || "Failed to fetch older messages");
      }

      // Sort older messages (API should ideally return sorted)
      const sortedOlderMessages = data.messages.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      if (sortedOlderMessages.length > 0) {
        // Prepend older messages
        setChatMessages((prev) => [...sortedOlderMessages, ...prev]);
        // Update offset for the next fetch
        setCurrentOffset(
          (prevOffset) => prevOffset + sortedOlderMessages.length,
        );
      }

      // Check if there are likely more messages
      setHasOlderMessages(sortedOlderMessages.length === MESSAGES_PER_PAGE);
    } catch (error: any) {
      console.error("Error fetching older messages:", error);
      setChatError(error.message || "Could not load older messages.");
      setHasOlderMessages(false); // Stop trying if there's an error
    } finally {
      setIsLoadingOlderMessages(false);
    }
  }, [
    tokenMint,
    selectedChatTier,
    isLoadingOlderMessages,
    hasOlderMessages,
    currentOffset, // Add currentOffset dependency
    fetchWithAuth,
    API_BASE_URL,
  ]);

  // --- Effect to Load Older Messages on Scroll ---
  useEffect(() => {
    if (
      isTopSentinelInView &&
      !isChatLoading &&
      !isLoadingOlderMessages &&
      hasOlderMessages
    ) {
      fetchOlderMessages();
    }
  }, [
    isTopSentinelInView,
    isChatLoading,
    isLoadingOlderMessages,
    hasOlderMessages,
    fetchOlderMessages,
  ]);

  // --- Effect for Initial Load and Tier Change ---
  useEffect(() => {
    if (tokenMint) {
      fetchChatMessages(selectedChatTier, tokenMint, true); // Pass true for initial load
    } else {
      // Handle case where tokenMint is not yet available (e.g., clear messages)
      setChatMessages([]);
      setChatError(null);
      setIsChatLoading(false);
      setCurrentOffset(0);
      setHasOlderMessages(true);
    }
    // Reset scroll position when tier changes
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [selectedChatTier, tokenMint, fetchChatMessages]); // fetchChatMessages is now stable

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

  // --- Fetch Chat Eligibility --- *REVISED*
  const fetchChatEligibility = useCallback(async () => {
    setEligibleChatTiers([]);
    setViewableChatTiers(["1k"]);

    if (
      !tokenMint ||
      !API_BASE_URL ||
      isBalanceLoading ||
      !isAuthenticated ||
      !publicKey
    ) {
      if (!isAuthenticated) {
        setIsBalanceLoading(false);
        if (
          selectedChatTier !== "1k" &&
          !["100k", "1M"].some((t) => viewableChatTiers.includes(t as ChatTier))
        ) {
          setSelectedChatTier("1k");
        }
      }
      return;
    }

    setChatError(null);
    try {
      const response = await fetchWithAuth(
        `${API_BASE_URL}/api/chat/${tokenMint}/tiers`,
      );

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          console.warn(
            "Eligibility check failed: Authentication or permission issue.",
          );
        } else {
          throw new Error(
            `Failed to fetch tier eligibility: ${response.statusText}`,
          );
        }
        return;
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Invalid response format: Expected JSON");
      }

      const data: EligibleTiersResponse = await response.json();

      if (data.success && typeof data.balance === "number") {
        const effectiveBalance = data.balance;

        const calculatedEligibleTiers = CHAT_TIERS.filter(
          (tier) => effectiveBalance >= getTierThreshold(tier),
        );
        setEligibleChatTiers(calculatedEligibleTiers);

        const calculatedViewableTiers: ChatTier[] = ["1k"];
        if (effectiveBalance >= getTierThreshold("1k")) {
          calculatedViewableTiers.push("100k");
        }
        if (effectiveBalance >= getTierThreshold("100k")) {
          calculatedViewableTiers.push("1M");
        }
        setViewableChatTiers(calculatedViewableTiers);

        if (!calculatedViewableTiers.includes(selectedChatTier)) {
          setSelectedChatTier(
            calculatedViewableTiers[calculatedViewableTiers.length - 1] || "1k",
          );
        }
      } else {
        console.warn(
          "Eligibility check response missing success or balance data.",
          data,
        );
      }
    } catch (error) {
      console.error("Error fetching chat eligibility:", error);
    }
  }, [
    tokenMint,
    publicKey,
    API_BASE_URL,
    isBalanceLoading,
    isAuthenticated,
    selectedChatTier,
  ]);

  // Fetch eligibility when balance/auth/token changes
  useEffect(() => {
    if (tokenMint && (!isBalanceLoading || !isAuthenticated)) {
      fetchChatEligibility();
    }
    if (!isAuthenticated) {
      setEligibleChatTiers([]);
      setViewableChatTiers(["1k"]);
      if (!["1k"].includes(selectedChatTier)) {
        setSelectedChatTier("1k");
      }
    }
  }, [
    fetchChatEligibility,
    publicKey,
    tokenMint,
    isBalanceLoading,
    isAuthenticated,
    selectedChatTier,
  ]);

  // Effect to reset state and fetch initial messages when context changes
  useEffect(() => {
    setLatestTimestamp(null);
    setChatMessages([]);
    setChatError(null);
    setCurrentOffset(0);
    setHasOlderMessages(true);
    setIsLoadingOlderMessages(false);

    if (tokenMint && viewableChatTiers.includes(selectedChatTier)) {
      fetchChatMessages(selectedChatTier, tokenMint, true);
    } else if (tokenMint && !viewableChatTiers.includes(selectedChatTier)) {
      setIsChatLoading(false);
      setChatError("You no longer have permission to view this tier.");
    }
  }, [tokenMint, selectedChatTier, viewableChatTiers, fetchChatMessages]);

  // --- WebSocket Subscription --- *REVISED*
  useEffect(() => {
    if (
      !socket ||
      !tokenMint ||
      !selectedChatTier ||
      !viewableChatTiers.includes(selectedChatTier)
    ) {
      return;
    }

    if (selectedChatTier !== "1k" && !isAuthenticated) {
      console.log(
        `WS: Authentication required to subscribe to ${selectedChatTier}, skipping.`,
      );
      return;
    }

    const subscriptionData = { tokenMint, tier: selectedChatTier };
    console.log("WS: Attempting to subscribe to chat room:", subscriptionData);
    socket.emit("subscribeToChat", subscriptionData);

    const handleSubscribed = (data: any) => {
      if (data?.room === `chat:${tokenMint}:${selectedChatTier}`) {
        console.log("WS: Successfully subscribed to", data.room);
      }
    };
    socket.on("subscribedToChat", handleSubscribed);

    return () => {
      console.log("WS: Unsubscribing from chat room:", subscriptionData);
      socket.emit("unsubscribeFromChat", subscriptionData);
      socket.off("subscribedToChat", handleSubscribed);
    };
  }, [socket, tokenMint, selectedChatTier, viewableChatTiers, isAuthenticated]);

  // --- WebSocket Message Listener --- (NEW)
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (newMessage: ChatMessage) => {
      // Check if message already exists (optimistic or previous WS message)
      if (!chatMessages.some((msg) => msg.id === newMessage.id)) {
        setChatMessages((prev) => [...prev, newMessage]);
        // Update latest timestamp if needed
        if (newMessage.timestamp > (latestTimestamp || "")) {
          setLatestTimestamp(newMessage.timestamp);
        }
        scrollToBottom(); // Scroll only if user was near bottom
      }
    };

    socket.on("newChatMessage", handleNewMessage as (data: unknown) => void);
    console.log("WS: Registered newChatMessage listener.");

    return () => {
      socket.off("newChatMessage", handleNewMessage as (data: unknown) => void);
      console.log("WS: Unregistered newChatMessage listener.");
    };
  }, [
    socket,
    tokenMint,
    selectedChatTier,
    scrollToBottom,
    latestTimestamp,
    chatMessages,
  ]); // Add chatMessages dependency

  // --- Send Chat Message --- *REVISED* (Check eligibleChatTiers for posting)
  const handleSendMessage = useCallback(async () => {
    if (!publicKey || !tokenMint || !canChatInSelectedTier) return;
    if (isSendingMessage) return; // Prevent double sends

    const messageText = selectedImage ? imageCaption.trim() : chatInput.trim();
    let mediaBase64: string | null = null;

    // Check if there's content to send (either text or an image)
    if (!messageText && !selectedImage) {
      toast.error("Please enter a message or select an image.");
      return;
    }

    setIsSendingMessage(true); // Start loading state

    // --- Handle Image Reading (if selected) ---
    if (selectedImage) {
      try {
        mediaBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = (error) => reject(error);
          reader.readAsDataURL(selectedImage); // Read as base64 data URI
        });
      } catch (error) {
        console.error("Error reading image file:", error);
        toast.error("Failed to read image file.");
        setIsSendingMessage(false); // Stop loading state
        return;
      }
    }

    // --- Prepare Payload ---
    const payload: {
      message: string;
      media?: string | null;
      parentId?: string | null;
    } = {
      message: messageText, // Send caption or text message
      media: mediaBase64, // Send base64 string or null
      // parentId: null, // Add parentId logic here if implementing replies
    };

    // --- Optimistic Update ---
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMessage: ChatMessage = {
      id: optimisticId,
      author: publicKey.toBase58(),
      displayName: "You", // Placeholder
      profileImage: null, // Placeholder
      tokenMint: tokenMint,
      tier: selectedChatTier,
      message: messageText, // Caption or text
      media: imagePreview || undefined, // Use local base64 preview
      timestamp: new Date().toISOString(),
      isOptimistic: true,
    };

    setChatMessages((prev) => [...prev, optimisticMessage]);
    scrollToBottom(true); // Scroll after adding optimistic message

    // Clear inputs immediately after starting send
    setChatInput("");
    setImageCaption("");
    setSelectedImage(null);
    setImagePreview(null);

    // --- API Call ---
    try {
      const response = await fetchWithAuth(
        `${API_BASE_URL}/api/chat/${tokenMint}/${selectedChatTier}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to send message");
      }

      // --- Update UI with confirmed message ---
      // Replace optimistic message with confirmed one from backend
      setChatMessages((prev) =>
        prev.map((msg) =>
          msg.id === optimisticId
            ? { ...result.message, isOptimistic: false }
            : msg,
        ),
      );
      // Update timestamps if needed based on the new message
      if (result.message.timestamp > (latestTimestamp || "")) {
        setLatestTimestamp(result.message.timestamp);
      }
    } catch (error: any) {
      console.error("Error sending message:", error);
      toast.error(`Error: ${error.message || "Could not send message"}`);
      // Remove optimistic message on failure
      setChatMessages((prev) => prev.filter((msg) => msg.id !== optimisticId));
    } finally {
      setIsSendingMessage(false); // End loading state
    }
  }, [
    publicKey,
    tokenMint,
    selectedChatTier,
    chatInput,
    selectedImage,
    imageCaption,
    imagePreview, // Include preview for optimistic update
    fetchWithAuth,
    setChatMessages,
    scrollToBottom,
    canChatInSelectedTier,
    isSendingMessage,
    latestTimestamp,
    API_BASE_URL,
  ]);

  // --- Handle Image Selection ---
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Basic validation (optional: add size/type checks)
      if (!file.type.startsWith("image/")) {
        toast.error("Please select a valid image file.");
        return;
      }
      setSelectedImage(file);
      setImageCaption(""); // Reset caption when new image is selected
      // Create preview URL
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      // Clear text input if user selects an image
      setChatInput("");
      // Reset file input value to allow selecting the same file again
      event.target.value = "";
    }
  };

  // Scroll to bottom on first render and when messages change
  useEffect(() => {
    if (!isChatLoading && chatMessages.length > 0) {
      setTimeout(() => scrollToBottom(true), 100);
    }
  }, [chatMessages, isChatLoading, scrollToBottom]);

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
      return date.toLocaleDateString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    return date.toLocaleDateString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Effect to manage body scroll based on fullscreen state
  useEffect(() => {
    if (isChatFullscreen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    // Cleanup function to reset overflow when component unmounts
    return () => {
      document.body.style.overflow = "";
    };
  }, [isChatFullscreen]);

  return (
    <div
      className={clsx(
        "relative flex flex-col bg-black/80 backdrop-blur-sm border border-gray-700/50 shadow-xl",
        isChatFullscreen ? "fixed inset-0 z-50" : "h-full w-full",
      )}
    >
      <div className="flex justify-center items-center space-x-1 p-2 border-b border-gray-700 flex-shrink-0 bg-black/20">
        {CHAT_TIERS.map((tier) => {
          const isViewable = viewableChatTiers.includes(tier);
          const isSelected = selectedChatTier === tier;
          return (
            <button
              key={tier}
              onClick={() => setSelectedChatTier(tier)}
              disabled={!isViewable || isChatLoading || isLoadingOlderMessages}
              className={`px-3 py-1 text-sm font-medium transition-colors 
                    ${isSelected ? "bg-[#03FF24] text-black" : isViewable ? "text-gray-300 hover:bg-gray-700" : "text-gray-600"}
                    ${!isViewable ? "opacity-50 cursor-not-allowed" : ""}
                    ${isChatLoading && isSelected ? "animate-pulse" : ""}
                  `}
            >
              {formatTierLabel(tier)}
            </button>
          );
        })}
      </div>

      <div
        ref={chatContainerRef}
        className="flex-1 h-full overflow-y-auto scroll-smooth px-3 pb-2 flex flex-col"
        onScroll={handleScroll}
      >
        <div ref={topSentinelRef} style={{ height: "1px" }} />

        {isLoadingOlderMessages && (
          <div className="flex items-center justify-center py-2">
            <Loader />
          </div>
        )}

        {!hasOlderMessages &&
          chatMessages.length > 0 &&
          !isLoadingOlderMessages && (
            <div className="text-center text-gray-500 text-xs py-2">
              Beginning of chat history
            </div>
          )}

        {(isBalanceLoading || (isChatLoading && chatMessages.length === 0)) &&
          !isLoadingOlderMessages && (
            <div className="flex items-center justify-center w-full h-full">
              <Loader />
            </div>
          )}

        {!isBalanceLoading &&
          chatError &&
          !isChatLoading &&
          !isLoadingOlderMessages && (
            <div className="text-center py-8">
              <p className="text-red-500 mb-2">{chatError}</p>
              {(isAuthenticated || selectedChatTier === "1k") &&
                viewableChatTiers.includes(selectedChatTier) && (
                  <Button
                    size="small"
                    variant="outline"
                    onClick={() =>
                      fetchChatMessages(selectedChatTier, tokenMint || "", true)
                    }
                    disabled={isChatLoading || isRefreshingMessages}
                  >
                    {isRefreshingMessages ? (
                      <Loader className="w-32 h-32" />
                    ) : (
                      "Try Again"
                    )}
                  </Button>
                )}
            </div>
          )}

        {!isBalanceLoading &&
          !isChatLoading &&
          chatMessages.length === 0 &&
          !chatError &&
          !isLoadingOlderMessages && (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <p className="text-gray-500 mb-2">
                No messages yet in the {formatTierLabel(selectedChatTier)} chat.
              </p>
              {!isAuthenticated && (
                <p className="text-yellow-500 text-sm">
                  Connect your wallet to chat.
                </p>
              )}
            </div>
          )}

        <div
          className="flex-1 flex flex-col overflow-hidden"
          style={{ maxHeight: maxHeight }}
        >
          {!isBalanceLoading &&
            chatMessages.map((msg) => {
              // Determine display name: Use provided name or fallback to truncated public key
              const displayName =
                msg.displayName ||
                `${msg.author.substring(0, 4)}...${msg.author.substring(msg.author.length - 4)}`;
              // Profile picture URL or null
              const profilePicUrl = msg.profileImage;

              return (
                <div key={msg.id} className={`flex gap-2 py-2`}>
                  {/* Avatar (only for messages from others) */}
                  <Link
                    to={`/profiles/${msg.author}`}
                    className="flex-shrink-0 mt-1"
                  >
                    {profilePicUrl ? (
                      <img
                        src={profilePicUrl}
                        alt={`${displayName}'s avatar`}
                        className="w-8 h-8 rounded-full object-cover border border-neutral-600"
                        onError={(e) => {
                          e.currentTarget.src = "/default-avatar.png";
                          e.currentTarget.onerror = null;
                        }} // Fallback image
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center border border-neutral-600">
                        <UserIcon className="w-4 h-4 text-neutral-400" />
                      </div>
                    )}
                  </Link>

                  {/* Message Bubble */}
                  <div className={`ml-1 max-w-[100%]`}>
                    {/* Author Name and Timestamp */}
                    <div className="flex justify-start items-center mb-1 gap-3">
                      {/* Link author name only if it's not the current user's message */}
                      <Link
                        to={`/profiles/${msg.author}`}
                        className="text-xs font-medium text-neutral-300 hover:text-white hover:underline truncate"
                      >
                        {displayName}
                      </Link>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {formatTimestamp(msg.timestamp)}
                      </span>
                    </div>

                    {/* Media rendering */}
                    {msg.media ? (
                      <div className="flex flex-col gap-1 mt-1">
                        <ChatImage
                          author={msg.author}
                          imageUrl={msg.media}
                          caption={msg.message || undefined}
                          timestamp={msg.timestamp}
                        />
                      </div>
                    ) : (
                      // Text message rendering
                      <p className="text-sm break-words whitespace-pre-wrap my-1">
                        {msg.message}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        {showScrollButton && (
          <button
            onClick={() => scrollToBottom(true)}
            className="absolute bottom-20 right-4 z-10 bg-[#03FF24] text-black rounded-full p-3 shadow-lg hover:opacity-90 transition-opacity"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        )}
      </div>
      <div className="p-2 flex-shrink-0 border-t border-gray-700 bg-black/50">
        {isAuthenticated &&
          !canChatInSelectedTier &&
          viewableChatTiers.includes(selectedChatTier) && (
            <p className="text-center text-yellow-500 text-xs mb-2 px-2">
              You need {getTierThreshold(selectedChatTier).toLocaleString()}+
              tokens to post in the {formatTierLabel(selectedChatTier)} chat.
            </p>
          )}
        {!isAuthenticated && (
          <p className="text-center text-yellow-500 text-xs mb-2 px-2">
            Connect your wallet to post messages.
          </p>
        )}
        {imagePreview && selectedImage && (
          <div className="mb-2 relative max-w-[200px]">
            <img
              src={imagePreview}
              alt="Preview"
              className="w-full h-auto object-contain border border-gray-500"
            />
            <div className="absolute top-1 right-1 flex gap-1">
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={isSendingMessage}
                />
                <button
                  className="w-6 h-6 bg-black/70 hover:bg-black text-white rounded-full flex items-center justify-center border border-white/20 hover:border-white/40 transition-all text-xs"
                  title="Replace image"
                  disabled={isSendingMessage}
                  onClick={(e) => {
                    if (!selectedImage) (e.target as HTMLInputElement).click();
                  }}
                  tabIndex={-1}
                >
                  <RefreshCw size={12} />
                </button>
              </label>
              <button
                onClick={() => {
                  setSelectedImage(null);
                  setImagePreview(null);
                  setImageCaption("");
                }}
                className="w-6 h-6 bg-black/70 hover:bg-black text-white rounded-full flex items-center justify-center border border-white/20 hover:border-white/40 transition-all text-xs"
                title="Remove image"
                disabled={isSendingMessage}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
        )}
        <div className="flex items-center space-x-2">
          <label
            className={`cursor-pointer flex-shrink-0 ${!canChatInSelectedTier ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
              disabled={!canChatInSelectedTier || isSendingMessage}
            />
            <div
              className={`w-10 h-10 border-2 ${canChatInSelectedTier ? "border-[#03FF24]/30 hover:border-[#03FF24]" : "border-gray-600"} flex items-center justify-center transition-all`}
            >
              <ImageIcon
                className={`w-5 h-5 ${canChatInSelectedTier ? "text-[#03FF24]" : "text-gray-500"}`}
              />
            </div>
          </label>
          <input
            type="text"
            value={selectedImage ? imageCaption : chatInput}
            onChange={(e) =>
              selectedImage
                ? setImageCaption(e.target.value)
                : setChatInput(e.target.value)
            }
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                canChatInSelectedTier &&
                !isSendingMessage
              ) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder={
              !isAuthenticated
                ? "Connect wallet to chat"
                : !viewableChatTiers.includes(selectedChatTier)
                  ? "Cannot view this tier"
                  : !canChatInSelectedTier
                    ? `Need ${getTierThreshold(selectedChatTier).toLocaleString()}+ tokens to post`
                    : selectedImage
                      ? `Add a caption (optional)`
                      : `Message in ${formatTierLabel(selectedChatTier)} chat...`
            }
            disabled={!canChatInSelectedTier || isSendingMessage}
            className="flex-1 h-10 border bg-gray-800 border-gray-600 text-white focus:outline-none focus:border-[#03FF24] focus:ring-1 focus:ring-[#03FF24] px-3 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSendMessage}
            disabled={
              !canChatInSelectedTier ||
              isSendingMessage ||
              (!selectedImage && !chatInput.trim())
            }
            className="h-10 px-4 bg-[#03FF24] text-black hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center flex-shrink-0"
          >
            {isSendingMessage ? (
              <Loader className="text-black border-black" />
            ) : (
              <Send size={18} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
