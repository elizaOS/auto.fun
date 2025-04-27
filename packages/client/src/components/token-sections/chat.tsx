// TODO: Rewrite as chat instead of generation

import Button from "@/components/button";
import Loader from "@/components/loader";
import useAuthentication, { fetchWithAuth } from "@/hooks/use-authentication";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { env } from "@/utils/env";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  RefreshCw,
  Send,
  Image as ImageIcon,
  Maximize,
  Minimize,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useInView } from "react-intersection-observer";
import { getSocket } from "@/utils/socket"; // Import WebSocket utility
import { ChatImage } from "../chat/ChatImage";
import { getAuthToken } from "@/utils/auth";
import { toast } from "react-toastify";
import { clsx } from "clsx"; // Import clsx for conditional classes

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
  const [isChatFullscreen, setIsChatFullscreen] = useState(false);

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

  // Handler to detect when user scrolls away from bottom
  useEffect(() => {
    if (!chatContainerRef.current) return;

    const handleScroll = () => {
      if (!chatContainerRef.current) return;

      const { scrollTop, scrollHeight, clientHeight } =
        chatContainerRef.current;
      const isNearBottom = scrollHeight - clientHeight <= scrollTop + 150; // 150px threshold

      setShowScrollButton(!isNearBottom);
    };

    const chatContainer = chatContainerRef.current;
    chatContainer.addEventListener("scroll", handleScroll);

    return () => {
      chatContainer.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // --- WebSocket Instance --- (NEW)
  const socket = getSocket();

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
            setLatestTimestamp(
              sortedMessages[sortedMessages.length - 1].timestamp,
            );
            setOldestTimestamp(sortedMessages[0].timestamp);
            setHasOlderMessages(sortedMessages.length === CHAT_MESSAGE_LIMIT);
          } else {
            const now = new Date().toISOString();
            setLatestTimestamp(now);
            setOldestTimestamp(now);
            setHasOlderMessages(false);
          }
          setTimeout(() => scrollToBottom(true), 100);
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
      scrollToBottom,
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
          // do nothing
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
    fetchChatMessages,
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
          throw new Error(
            `Failed to fetch older messages: ${response.statusText}`,
          );
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

        setChatMessages((prev) => [...prev, ...sortedOlderMessages]);
        setOldestTimestamp(sortedOlderMessages[0].timestamp);
        setHasOlderMessages(sortedOlderMessages.length === CHAT_MESSAGE_LIMIT);

        if (chatDiv) {
          requestAnimationFrame(() => {
            const newScrollHeight = chatDiv.scrollHeight;
            chatDiv.scrollTop =
              newScrollHeight - oldScrollHeight + oldScrollTop;
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
    isAuthenticated,
  ]);

  // Trigger fetchOlderMessages when top sentinel becomes visible
  useEffect(() => {
    if (isTopSentinelInView && hasOlderMessages && !isLoadingOlderMessages) {
      fetchOlderMessages();
    }
  }, [
    isTopSentinelInView,
    hasOlderMessages,
    isLoadingOlderMessages,
    fetchOlderMessages,
  ]);

  // --- WebSocket Subscription --- (NEW)
  useEffect(() => {
    if (
      !socket ||
      !tokenMint ||
      !selectedChatTier ||
      !isAuthenticated ||
      !eligibleChatTiers.includes(selectedChatTier)
    ) {
      return; // Don't subscribe if conditions aren't met
    }

    const subscriptionData = { tokenMint, tier: selectedChatTier };

    socket.emit("subscribeToChat", subscriptionData);

    // Confirmation listener (optional but good for debugging)
    const handleSubscribed = (data: any) => {
      if (data?.room === `chat:${tokenMint}:${selectedChatTier}`) {
        console.log("WS: Successfully subscribed to", data.room);
      }
    };
    socket.on("subscribedToChat", handleSubscribed);

    // Cleanup function
    return () => {
      console.log("WS: Unsubscribing from chat room:", subscriptionData);
      socket.emit("unsubscribeFromChat", subscriptionData);
      socket.off("subscribedToChat", handleSubscribed); // Remove listener
    };
  }, [socket, tokenMint, selectedChatTier, isAuthenticated, eligibleChatTiers]);

  // --- WebSocket Message Listener --- (NEW)
  useEffect(() => {
    if (!socket) return;

    // Define handler with type assertion
    const handleNewChatMessage = (data: unknown) => {
      const newMessage = data as ChatMessage;
      // console.log("WS: Received new message:", newMessage);

      // Basic validation
      if (
        !newMessage ||
        !newMessage.id ||
        !newMessage.tokenMint ||
        !newMessage.tier
      ) {
        console.warn("WS: Received invalid message format.", newMessage);
        return;
      }

      // Check if the message belongs to the current context
      if (
        newMessage.tokenMint !== tokenMint ||
        newMessage.tier !== selectedChatTier
      ) {
        console.log("WS: Ignoring message from different token/tier.");
        return;
      }

      setChatMessages((prevMessages) => {
        // Check if message already exists
        if (prevMessages.some((msg) => msg.id === newMessage.id)) {
          return prevMessages;
        }
        // Add new message and sort by timestamp
        const newMessages = [...prevMessages, newMessage];
        return newMessages.sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
        const isOwnMessage = newMessage.author === publicKey?.toBase58();
        const existingById = prevMessages.find(
          (msg) => msg.id === newMessage.id,
        );

        // If message already exists by real ID, ignore to prevent duplicates.
        if (existingById) {
          console.log(
            "WS: Message already exists by ID, ignoring:",
            newMessage.id,
          );
          return prevMessages;
        }

        // If it's a message from the current user, try to replace the optimistic version
        if (isOwnMessage) {
          const optimisticIndex = prevMessages.findIndex(
            (msg) => msg.isOptimistic && msg.author === newMessage.author,
            // Consider adding content check for robustness if needed: && msg.message === newMessage.message
          );

          if (optimisticIndex !== -1) {
            console.log(
              "WS: Replacing optimistic message with confirmed:",
              newMessage.id,
            );
            const updatedMessages = [...prevMessages];
            // Replace the optimistic message with the confirmed one from WebSocket
            updatedMessages[optimisticIndex] = {
              ...newMessage,
              isOptimistic: false,
            };
            return updatedMessages;
          } else {
            // Own message, but no matching optimistic message found. Add it.
            console.log(
              "WS: Own confirmed message received, but no matching optimistic message found. Adding:",
              newMessage.id,
            );
            return [...prevMessages, { ...newMessage, isOptimistic: false }];
          }
        } else {
          // Message from another user, and it doesn't exist by ID yet. Add it.
          console.log("WS: Adding message from other user:", newMessage.id);
          return [...prevMessages, { ...newMessage, isOptimistic: false }]; // Ensure isOptimistic is false for others
        }
      });

      // Update latest timestamp if this message is newer
      setLatestTimestamp((prevTimestamp) => {
        if (
          !prevTimestamp ||
          new Date(newMessage.timestamp).getTime() >
            new Date(prevTimestamp).getTime()
        ) {
          return newMessage.timestamp;
        }
        return prevTimestamp;
      });

      // Scroll down if near bottom
      setTimeout(() => scrollToBottom(false), 50);
    };

    // Register the handler
    socket.on("newChatMessage", handleNewChatMessage);
    console.log("WS: Registered newChatMessage listener.");

    // Cleanup listener on unmount or socket change
    return () => {
      socket.off("newChatMessage", handleNewChatMessage);
      console.log("WS: Unregistered newChatMessage listener.");
    };
  }, [socket, tokenMint, selectedChatTier, scrollToBottom]);

  // --- Send Chat Message --- *REVISED* (Optimistic update remains, WS handles confirmation)
  const handleSendMessage = async (imageUrl?: string) => {
    if (
      (!chatInput.trim() && !imageUrl) ||
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
      hasLiked: false, // Assuming default
    };

    setChatMessages((prev) => [...prev, optimisticMessage]);
    const messageToSend = chatInput.trim(); // Store message before clearing input
    setChatInput("");

    setTimeout(() => scrollToBottom(true), 50);

    try {
      // Call the API to post the message
      const response = await fetchWithAuth(
        `${API_BASE_URL}/api/chat/${tokenMint}/${selectedChatTier}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: imageUrl || chatInput.trim(),
          }),
        },
      );

      // Handle API response (primarily for errors or immediate feedback)
      if (response.status === 401 || response.status === 403) {
        setChatError(
          `You need ${getTierThreshold(selectedChatTier).toLocaleString()} tokens to post here.`,
        );
        return;
      }

      if (!response.ok) {
        // Attempt to parse error from backend
        let errorMsg = `Failed to send message: ${response.statusText}`;
        try {
          const errorData = await response.json();
          if (errorData.error) errorMsg = errorData.error;
        } catch (_) {
          // do nothing
        }
        throw new Error(errorMsg);
      }

      // Clear input after successful send
      if (!imageUrl) {
        setChatInput("");
      }

      // Immediately refresh messages after successful post
      await fetchChatMessages(selectedChatTier, false);
      setTimeout(() => scrollToBottom(true), 100);
    } catch (error) {
      console.error("Error sending message:", error);
      setChatError(
        error instanceof Error ? error.message : "Could not send message",
      );
    } finally {
      setIsSendingMessage(false);
    }
  };

  // Scroll to bottom on first render and when messages change
  useEffect(() => {
    if (!isChatLoading && chatMessages.length > 0) {
      // Short delay to ensure DOM updates
      setTimeout(() => scrollToBottom(true), 100);
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

  // Function to render the avatar/identity for each message
  const renderMessageAvatar = (authorKey: string) => {
    const shortKey = `${authorKey.substring(0, 4)}...${authorKey.substring(authorKey.length - 4)}`;

    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">{shortKey}</span>
      </div>
    );
  };

  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageCaption, setImageCaption] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      console.log("Please select an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      console.log("Image size should be less than 5MB");
      return;
    }

    setSelectedImage(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const uploadImage = async () => {
    if (!selectedImage) return;

    try {
      const response = await fetchWithAuth(
        `${env.apiUrl}/api/chat/${tokenMint}/${selectedChatTier}/upload-image`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            imageBase64: imagePreview,
            caption: imageCaption,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to upload image");
      }

      const data = await response.json();
      if (data.success && data.message) {
        setChatMessages((prev) => {
          const newMessages = [data.message, ...prev];
          return newMessages.sort(
            (a, b) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
          );
        });
        setImageCaption("");
        setSelectedImage(null);
        setImagePreview(null);
      }
    } catch (error) {
      console.error("Error uploading image:", error);
      toast.error("Failed to upload image");
    }
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
    <div className="flex flex-col h-full">
      <div className="flex flex-col my-2">
        <div
          className={clsx(
            "flex flex-col md:flex-row gap-4",
            isChatFullscreen &&
              "fixed inset-0 z-50 bg-black p-2 flex flex-col z-10000", // Use flex-col for fullscreen container
          )}
        >
          {/* Content Area */}
          <div
            className={clsx(
              "flex flex-col grow w-full",
              isChatFullscreen && "overflow-hidden", // Contain children within fullscreen
            )}
          >
            <div
              className={clsx(
                "flex flex-col border-t-1 border-gray-700",
                isChatFullscreen
                  ? "grow" // Let this inner container grow to fill Content Area
                  : "h-[70vh]", // Original height
              )}
            >
              {/* Tier Selection Header */}
              <div className="flex justify-between items-center p-2 flex-shrink-0">
                {" "}
                {/* Ensure header doesn't grow */}
                <div className="flex gap-2">
                  {CHAT_TIERS.map((tier) => {
                    const isEligible = eligibleChatTiers.includes(tier);
                    const isSelected = selectedChatTier === tier;
                    return (
                      <button
                        key={tier}
                        onClick={() => setSelectedChatTier(tier)}
                        disabled={
                          !isEligible || isChatLoading || isLoadingOlderMessages
                        }
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
                {/* Fullscreen Button - Mobile Only */}
                <button
                  onClick={() => setIsChatFullscreen(!isChatFullscreen)}
                  className="md:hidden p-1 text-gray-400 hover:text-white"
                >
                  {isChatFullscreen ? (
                    <Minimize size={20} />
                  ) : (
                    <Maximize size={20} />
                  )}
                </button>
              </div>

              {/* Message Display Area */}
              <div
                ref={chatContainerRef}
                className="chat-scroll-container flex-grow overflow-y-auto p-2 space-y-3"
              >
                {/* --- Top Sentinel for Upward Pagination --- */}
                <div ref={topSentinelRef} style={{ height: "1px" }} />

                {/* Loading indicator for older messages */}
                {isLoadingOlderMessages && (
                  <div className="flex items-center justify-center py-2">
                    <Loader />
                  </div>
                )}

                {/* No More Older Messages Indicator */}
                {!hasOlderMessages &&
                  chatMessages.length > 0 &&
                  !isLoadingOlderMessages && (
                    <div className="text-center text-gray-500 text-xs py-2">
                      Beginning of chat history
                    </div>
                  )}

                {(isBalanceLoading ||
                  (isChatLoading && chatMessages.length === 0)) &&
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
                  !chatError &&
                  !isLoadingOlderMessages && (
                    <div className="flex flex-col items-center justify-center h-full text-center py-16">
                      <p className="text-gray-500 mb-2">
                        No messages yet in the{" "}
                        {formatTierLabel(selectedChatTier)} chat.
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
                              ? "bg-[#03FF24]/10 border-2 border-[#03FF24]"
                              : "bg-gray-700"
                        }`}
                      >
                        <div className="flex justify-between items-start mb-1">
                          {renderMessageAvatar(msg.author)}{" "}
                          <span className="ml-2 text-xs text-gray-500">
                            {formatTimestamp(msg.timestamp)}
                          </span>
                        </div>

                        {msg.media ? (
                          <div className="flex flex-col gap-2">
                            <div className="relative w-full max-w-[500px] aspect-square border-2 border-[#03FF24] my-2 flex items-center justify-center bg-black">
                              <img
                                src={msg.media}
                                alt="Chat image"
                                className="w-full h-full object-contain"
                              />
                            </div>
                            {msg.message && (
                              <p className="text-sm break-words whitespace-pre-wrap my-1">
                                {msg.message}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm break-words whitespace-pre-wrap my-1">
                            {msg.message}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
              </div>

              {/* Chat input */}
              <div className="p-2 flex-shrink-0">
                {showScrollButton && (
                  <button
                    onClick={() => scrollToBottom(true)}
                    className="fixed bottom-24 right-4 bg-[#03FF24] text-black rounded-full p-3 shadow-lg hover:opacity-90 transition-opacity"
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
                {!canChatInSelectedTier && publicKey && (
                  <p className="text-center text-yellow-500 text-sm mb-2">
                    You need{" "}
                    {getTierThreshold(selectedChatTier).toLocaleString()}+
                    tokens to chat here.
                  </p>
                )}
                {!publicKey && (
                  <p className="text-center text-yellow-500 text-sm mb-2">
                    Connect your wallet to chat.
                  </p>
                )}
                {selectedImage && (
                  <div className="absolute bottom-[80px] left-4 w-full z-10">
                    <div className="relative w-full aspect-square max-w-[400px] border-4 border-[#03FF24] flex items-center justify-center bg-black">
                      <img
                        src={imagePreview || ""}
                        alt="Preview"
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute top-2 right-2 flex gap-2">
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            className="hidden"
                          />
                          <button
                            className="w-8 h-8 bg-black/80 hover:bg-black text-white rounded-full flex items-center justify-center border border-white/20 hover:border-white/40 transition-all"
                            title="Replace image"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                              <polyline points="17 8 12 3 7 8"></polyline>
                              <line x1="12" y1="3" x2="12" y2="15"></line>
                            </svg>
                          </button>
                        </label>
                        <button
                          onClick={() => {
                            setSelectedImage(null);
                            setImagePreview(null);
                            setImageCaption("");
                          }}
                          className="w-8 h-8 bg-black/80 hover:bg-black text-white rounded-full flex items-center justify-center border border-white/20 hover:border-white/40 transition-all"
                          title="Remove image"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex items-center space-x-2">
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
                        !isSendingMessage &&
                        canChatInSelectedTier
                      ) {
                        e.preventDefault();
                        if (selectedImage) {
                          uploadImage();
                        } else {
                          handleSendMessage();
                        }
                      }
                    }}
                    placeholder={
                      !isAuthenticated
                        ? "Connect wallet to chat"
                        : !eligibleChatTiers.includes(selectedChatTier)
                          ? `Need ${getTierThreshold(selectedChatTier).toLocaleString()}+ tokens`
                          : selectedImage
                            ? `Add a message with your image to ${formatTierLabel(selectedChatTier)} chat`
                            : `Message in ${formatTierLabel(selectedChatTier)} chat...`
                    }
                    disabled={!canChatInSelectedTier || isSendingMessage}
                    className="flex-1 h-10 border bg-gray-800 border-gray-600 text-white focus:outline-none focus:border-[#03FF24] focus:ring-1 focus:ring-[#03FF24] px-3 text-sm rounded-md disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  <div className="flex items-center space-x-2">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                      <div className="w-10 h-10 border-2 border-[#03FF24]/30 hover:border-[#03FF24] flex items-center justify-center transition-all">
                        <ImageIcon className="w-5 h-5 text-[#03FF24]" />
                      </div>
                    </label>
                    <button
                      onClick={() =>
                        selectedImage ? uploadImage() : handleSendMessage()
                      }
                      disabled={
                        selectedImage ? isUploadingImage : !chatInput.trim()
                      }
                      className="h-10 px-4 bg-[#03FF24] text-black hover:opacity-80 disabled:opacity-50 transition-all flex items-center justify-center rounded-md"
                    >
                      {isUploadingImage ? (
                        <div className="w-5 h-5 border-2 border-black border-t-transparent animate-spin"></div>
                      ) : (
                        "Post"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
