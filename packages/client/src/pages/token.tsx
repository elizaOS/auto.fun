import Button from "@/components/button";
import Chart from "@/components/chart";
import Chat from "@/components/chat";
import CopyButton from "@/components/copy-button";
import Loader from "@/components/loader";
import SkeletonImage from "@/components/skeleton-image";
import AdminSection from "@/components/token-sections/admin";
import AgentsSection from "@/components/token-sections/agents";
import ClaimFees from "@/components/token-sections/claimFees";
import GenerationSection from "@/components/token-sections/generation";
import TokenStatus from "@/components/token-status";
import Scam from "@/components/token/scam-flag";
import ScamNotice from "@/components/token/scam-notice";
import Trade from "@/components/trade";
import TransactionsAndHolders from "@/components/txs-and-holders";
import Verified from "@/components/verified";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { useSolPriceContext } from "@/providers/use-sol-price-context";
import { IToken } from "@/types";
import {
  abbreviateNumber,
  formatNumber,
  formatNumberSubscript,
  fromNow,
  LAMPORTS_PER_SOL,
  resizeImage,
  sanitizeCheckmark,
  shortenAddress,
  useCodex,
} from "@/utils";
import { getToken, queryClient } from "@/utils/api";
import { env } from "@/utils/env";
import { getSocket } from "@/utils/socket";
import { Codex } from "@codex-data/sdk";
import { useWallet } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Globe, Info as InfoCircle } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useParams, useSearchParams } from "react-router";
import { Tooltip } from "react-tooltip";

// Use admin addresses from environment
const { adminAddresses } = env;

// Remove CSS styles
// const styles = `
//   .token-ellipsis:before {
//     float: right;
//     content: attr(data-tail);
//   }
//
//   .token-ellipsis {
//     white-space: nowrap;
//     text-overflow: ellipsis;
//     overflow: hidden;
//   }
// `;

// Add a custom component for middle ellipsis
function MiddleEllipsis({ text }: { text?: string; suffix?: string }) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [showFull, setShowFull] = useState(false);

  useEffect(() => {
    if (!elementRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setShowFull(entry.contentRect.width > 420);
      }
    });

    observer.observe(elementRef.current);
    return () => observer.disconnect();
  }, []);

  if (!text) return null;

  const prefix = text.substring(0, 8);
  const suffix = text.substring(text.length - 8);

  return (
    <div
      ref={elementRef}
      className="font-dm-mono text-center overflow-hidden"
      title={text}
    >
      {showFull ? text : `${prefix}...${suffix}`}
    </div>
  );
}

const LAST_TOKEN_TABS_KEY = "lastTokenTabs";

// Helper to safely get tabs object from localStorage
const getLastTabs = (): Record<string, string> => {
  try {
    const stored = localStorage.getItem(LAST_TOKEN_TABS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (e) {
    console.error("Error reading last tabs from localStorage:", e);
    return {};
  }
};

// Helper to safely set tabs object in localStorage
const setLastTab = (address: string, tab: string) => {
  if (!address) return;
  try {
    const currentTabs = getLastTabs();
    currentTabs[address] = tab;
    localStorage.setItem(LAST_TOKEN_TABS_KEY, JSON.stringify(currentTabs));
  } catch (e) {
    console.error("Error writing last tab to localStorage:", e);
  }
};

const codex = new Codex(import.meta.env.VITE_CODEX_API_KEY);

export default function Page() {
  const { address } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("chart");
  const [isInitialMount, setIsInitialMount] = useState(true);
  const { publicKey } = useWallet();
  const normalizedWallet = publicKey?.toString();
  const { solPrice: contextSolPrice } = useSolPriceContext();

  // ---- Moderator Check using environment variables ----
  const isModerator = publicKey
    ? adminAddresses.includes(publicKey.toString())
    : false;
  // ---- End Moderator Check ----

  // Effect to set initial tab from query param or localStorage
  useEffect(() => {
    if (!address) return;

    const tab = searchParams.get("tab");
    if (tab && ["chart", "ai", "agents", "chat"].includes(tab)) {
      setActiveTab(tab);
    } else {
      const lastTab = getLastTabs()[address];
      if (lastTab) {
        setActiveTab(lastTab);
      } else {
        setActiveTab("chart"); // Explicitly set to chart if no saved tab
      }
    }
  }, [address, searchParams]);

  // Effect to update URL and localStorage when tab changes
  useEffect(() => {
    if (!address || isInitialMount) {
      setIsInitialMount(false);
      return;
    }

    // Update localStorage
    setLastTab(address, activeTab);

    const params = new URLSearchParams(searchParams);
    
    // If switching to chart tab, clear all query parameters
    if (activeTab === "chart") {
      setSearchParams(new URLSearchParams());
      return;
    }
    
    // If switching to a non-chat tab, remove the tier parameter
    if (activeTab !== "chat") {
      params.delete("tier");
    }
    
    // Update the tab parameter
    params.set("tab", activeTab);

    // Only update URL if there are actual changes
    if (params.toString() !== searchParams.toString()) {
      setSearchParams(params);
    }
  }, [activeTab, address, searchParams, setSearchParams, isInitialMount]);

  // Fetch token details from API
  const tokenQuery = useQuery({
    queryKey: ["token", address],
    queryFn: async () => {
      if (!address) throw new Error("No address passed");
      try {
        return await getToken({ address });
      } catch (error) {
        console.error(`Token page: Error fetching token data:`, error);
        throw error;
      }
    },
    refetchInterval: 20000,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const socket = getSocket();

    const handleTokenUpdate = (data: unknown) => {
      const token = data as IToken;
      if (token.mint === address) {
        const queryKey = ["token", address];
        const current =
          queryClient.getQueryData<IToken>(queryKey) || ({} as IToken);
        const newData = {
          ...current,
          ...token,
        };

        queryClient.setQueryData(queryKey, newData);
      }
    };

    socket.on("updateToken", handleTokenUpdate);

    return () => {
      socket.off("updateToken", handleTokenUpdate);
    };
  }, [address]);

  useEffect(() => {
    const socket = getSocket();
    socket.emit("subscribe", address);

    return () => {
      socket.emit("unsubscribe", address);
    };
  }, [address]);

  const token = tokenQuery?.data as IToken;
  const isCodex = useCodex(token);

  const codexQuery = useQuery({
    queryKey: ["token", address, "codex", isCodex],
    queryFn: async () => {
      if (!address) return;
      const data = await codex.queries.filterTokens({
        tokens: [address],
      });

      return data?.filterTokens?.results?.[0];
    },
    enabled: isCodex,
    refetchInterval: 20000,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  const isTokenOwner = publicKey?.toString() === token?.creator;

  const codexData = codexQuery?.data;
  const tokenPriceUSD = isCodex
    ? Number(codexData?.priceUSD || 0)
    : token?.marketCapUSD / token?.tokenSupplyUiAmount;
  const marketCapUSD = isCodex
    ? Number(codexData?.marketCap || 0)
    : token?.marketCapUSD || 0;
  const volume24h = isCodex
    ? Number(codexData?.volume24 || 0)
    : token?.volume24h || 0;
  const priceSOL = isCodex
    ? Number(tokenPriceUSD || 0) / Number(contextSolPrice || 0)
    : Number(tokenPriceUSD) / token?.solPriceUSD;

  const { tokenBalance } = useTokenBalance({
    tokenId: token?.mint || (address as string),
  });
  const solanaPrice = contextSolPrice || token?.solPriceUSD || 0;

  if (tokenQuery?.isLoading) {
    return <Loader isFullscreen />;
  }

  if (!tokenQuery?.data && tokenQuery?.isError) {
    return (
      <div className="flex flex-col gap-4 items-center justify-center h-[50vh]">
        <h2 className="text-2xl font-bold text-autofun-text-primary">
          Error Loading Token
        </h2>
        <p className="text-autofun-text-secondary">
          The token data could not be loaded.
        </p>
        <div className="flex gap-2">
          <Link to="/">
            <Button>Back to Home</Button>
          </Link>
          {/* <Link to={`https://solscan.io/token/${address}`} target="_blank">
            <Button variant="secondary">View on Solscan</Button>
          </Link> */}
        </div>
      </div>
    );
  }

  // token?.reserveLamport - token?.virtualReserves) /
  //                         LAMPORTS_PER_SOL,

  // log for debug

  const queryLoading = isCodex
    ? tokenQuery?.isPending || codexQuery?.isPending
    : tokenQuery?.isPending;

  return (
    <Fragment>
      <Helmet>
        <title>
          {`${sanitizeCheckmark(token?.name)} (${sanitizeCheckmark(token?.ticker)})`}{" "}
          - auto.fun
        </title>
      </Helmet>
      <div className="flex flex-col gap-3">
        {/* Top Stats Section - Full Width */}
        <div className="w-full py-10 flex flex-wrap justify-between">
          <TopPageItem
            isLoading={queryLoading}
            title="Market Cap"
            value={marketCapUSD > 0 ? abbreviateNumber(marketCapUSD) : "-"}
          />
          <TopPageItem
            isLoading={queryLoading}
            title="24hr Volume"
            value={volume24h > 0 ? abbreviateNumber(volume24h) : "0"}
          />
          <TopPageItem
            isLoading={queryLoading}
            title="Age"
            value={token?.createdAt ? fromNow(token?.createdAt, true) : "-"}
          />
        </div>
        <ScamNotice isHidden={token?.hidden ? true : false} />

        {/* Three Column Layout */}
        <div className="flex flex-col lg:flex-row lg:flex-nowrap gap-4">
          {/* Left Column - 25% - Token Info */}
          <div className="w-full lg:w-1/4 flex flex-col gap-3 order-1 lg:order-1">
            <div className="pt-0 flex flex-col gap-3">
              <div className="relative overflow-hidden">
                <div className="w-full aspect-square">
                  <SkeletonImage
                    src={resizeImage(token?.image, 475, 475)}
                    alt="image"
                    className="aspect-square"
                  />
                </div>

                {/* Token name overlapping at top - with drop shadow */}
                <div
                  className={
                    "from-black/50 via-black/25 absolute top-0 left-0 right-0 bg-gradient-to-b to-transparent px-3 py-2.5"
                  }
                >
                  <div className="flex flex-wrap items-center justify-start w-full gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="capitalize text-white text-xl sm:text-2xl font-bold font-satoshi leading-tight truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] max-w-[180px] sm:max-w-none">
                        {sanitizeCheckmark(token?.name)}
                      </h3>
                      <Verified isVerified={token?.verified ? true : false} />
                      <Scam isHidden={token?.hidden ? true : false} />
                      <Tooltip anchorSelect="#view-on-solscan">
                        <span>View on Solscan</span>
                      </Tooltip>
                      <Link
                        to={env.getTokenURL(token?.mint)}
                        target="_blank"
                        id="view-on-solscan"
                      >
                        <ExternalLink className="size-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
                      </Link>
                    </div>
                    <div className="shrink-0 ml-auto">
                      <TokenStatus token={token} />
                    </div>
                  </div>
                </div>

                {/* Ticker overlapping at bottom - with drop shadow */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 via-black/25 to-transparent px-3 py-2.5">
                  <div className="text-autofun-text-highlight text-xl font-bold font-dm-mono uppercase tracking-widest drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    ${sanitizeCheckmark(token?.ticker)}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <span className="text-autofun-text-secondary text-xs font-normal font-dm-mono leading-tight">
                  {token?.description}
                </span>
              </div>

              {/* Contract address */}
              <div className="flex flex-col gap-2">
                <div className="flex relative">
                  <div className="size-10 inline-flex border-r shrink-0 bg-autofun-background-action-primary">
                    <span className="text-base font-dm-mono m-auto text-autofun-text-secondary">
                      CA
                    </span>
                  </div>
                  <div className="bg-autofun-background-input flex justify-between py-2 px-3 min-w-0 w-full gap-2 relative">
                    <span className="mx-auto w-0 flex-1 min-w-0 block text-base text-autofun-text-secondary">
                      <MiddleEllipsis text={token?.mint} />
                    </span>
                  </div>
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 bg-autofun-background-input">
                    <CopyButton text={token?.mint} />
                  </div>
                </div>
                {token?.creator === normalizedWallet && !token?.imported && (
                  <ClaimFees tokenMint={token?.mint} />
                )}
              </div>

              {/* Creator Profile Section - at the bottom of the left column */}
              {/* Only show if NOT imported AND creator profile exists */}
              {token?.imported === 0 && token.creatorProfile && (
                <div className="mt-3 overflow-hidden">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      {/* Display creator's name if available, otherwise the shortened address */}
                      <div className="text-autofun-text-secondary text-sm font-dm-mono truncate">
                        Created by{" "}
                        <Link
                          to={`/profiles/${token.creator}`}
                          className="text-center py-2 font-medium"
                        >
                          <span className="text-bold text-white hover:text-[#03FF24]">
                            {token.creatorProfile.displayName ||
                              shortenAddress(token.creator || "")}
                          </span>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Social Links */}
              {token?.creator !== normalizedWallet &&
                (() => {
                  const socialLinks = [
                    {
                      url: token?.website,
                      icon: <Globe />,
                      label: "website",
                      key: "website",
                    },
                    {
                      url: token?.twitter,
                      icon: "/x.svg",
                      label: "twitter",
                      key: "twitter",
                    },
                    {
                      url: token?.telegram,
                      icon: "/telegram.svg",
                      label: "telegram",
                      key: "telegram",
                    },
                    {
                      url: token?.discord,
                      icon: "/discord.svg",
                      label: "discord",
                      key: "discord",
                    },
                  ];

                  const availableLinks = socialLinks.filter(
                    (link) => !!link.url,
                  );

                  if (availableLinks.length === 0) {
                    return null; // Don't render the container if no links are available
                  }

                  return (
                    <div className="flex items-stretch gap-4">
                      {/* Use flex and items-stretch */}
                      {availableLinks.map((link) => (
                        <Link
                          key={link.key}
                          to={link.url}
                          className="flex-1"
                          target="_blank"
                        >
                          <Button
                            className="w-full h-full rounded-none py-2 flex items-center justify-center"
                            aria-label={link.label}
                          >
                            {typeof link.icon === "string" ? (
                              <SkeletonImage
                                src={link.icon}
                                height={24}
                                width={24}
                                alt={`${link.label}_icon`}
                                className="size-6 object-contain m-auto"
                              />
                            ) : (
                              link.icon
                            )}
                          </Button>
                        </Link>
                      ))}
                    </div>
                  );
                })()}
              {/* Render AdminSection only for moderators or token owners */}
              {(isModerator || isTokenOwner) && <AdminSection />}
            </div>
          </div>

          {/* Middle Column - 50% - Tabs for Chart and AI Create */}
          <div className="w-full lg:w-1/2 flex flex-col gap-3 order-3 lg:order-2">
            <div className="overflow-hidden relative">
              <div className="flex flex-col flex-1">
                {/* Green stroke above tab section */}
                <div className="h-2 w-full bg-autofun-text-highlight z-10"></div>

                {/* Tabs Header with Title and Right-aligned Tabs - removed border-b as it's on the parent */}
                <div className="flex items-center justify-between pr-2">
                  <div className="flex">
                    <button
                      className={`px-4 py-3 text-autofun-text-primary font-medium cursor-pointer transition-colors duration-200 ${
                        activeTab === "chart"
                          ? "bg-autofun-background-highlight text-black"
                          : "text-autofun-text-secondary hover:text-autofun-text-primary bg-autofun-background-input"
                      }`}
                      onClick={() => setActiveTab("chart")}
                      style={{ marginTop: "-2px", paddingTop: "14px" }}
                    >
                      Chart
                      <img
                        src={
                          activeTab === "chart"
                            ? "/token/charton.svg"
                            : "/token/chartoff.svg"
                        }
                        className={`size-4 inline-block ml-1.5 ${
                          activeTab === "chart" ? "text-black" : ""
                        }`}
                        alt="chart icon"
                      />
                    </button>
                    <button
                      className={`px-4 py-3 mx-1 text-autofun-text-primary font-medium cursor-pointer transition-colors duration-200 ${
                        activeTab === "ai"
                          ? "bg-autofun-background-highlight text-black"
                          : "text-autofun-text-secondary hover:text-autofun-text-primary bg-autofun-background-input"
                      }`}
                      onClick={() => setActiveTab("ai")}
                      style={{ marginTop: "-2px", paddingTop: "14px" }}
                    >
                      AI Create
                      <img
                        src={
                          activeTab === "ai"
                            ? "/token/createoff.svg"
                            : "/token/createon.svg"
                        }
                        className={`size-4 inline-block ml-1.5 ${
                          activeTab === "ai" ? "text-black" : "text-white"
                        }`}
                        alt="chart icon"
                      />
                    </button>
                    <button
                      className={`px-4 py-3 mr-1 text-autofun-text-primary font-medium cursor-pointer transition-colors duration-200 ${
                        activeTab === "chat"
                          ? "bg-autofun-background-highlight text-black"
                          : "text-autofun-text-secondary hover:text-autofun-text-primary bg-autofun-background-input"
                      }`}
                      onClick={() => setActiveTab("chat")}
                      style={{ marginTop: "-2px", paddingTop: "14px" }}
                    >
                      Chat
                      <img
                        src={
                          activeTab === "chat"
                            ? "/token/chatoff.svg"
                            : "/token/chaton.svg"
                        }
                        className={`size-4 inline-block ml-1.5 ${
                          activeTab === "chat" ? "text-black" : ""
                        }`}
                        alt="chat icon"
                      />
                    </button>
                    <button
                      className={`px-4 py-3 mr-1 text-autofun-text-primary font-medium cursor-pointer transition-colors duration-200 ${
                        activeTab === "agents"
                          ? "bg-autofun-background-highlight text-black"
                          : "text-autofun-text-secondary hover:text-autofun-text-primary bg-autofun-background-input"
                      }`}
                      onClick={() => setActiveTab("agents")}
                      style={{ marginTop: "-2px", paddingTop: "14px" }}
                    >
                      Agents
                      <img
                        src={
                          activeTab === "agents"
                            ? "/token/agentson.svg"
                            : "/token/agentsoff.svg"
                        }
                        className={`size-4 inline-block ml-1.5 ${
                          activeTab === "agents" ? "text-black" : "text-white"
                        }`}
                        alt="agents icon"
                      />
                    </button>
                  </div>
                  {activeTab === "chart" || activeTab === "agents" ? null : (
                    <div
                      id="media-selector-container"
                      className="flex space-x-2 items-center"
                    >
                      {/* Media type buttons will be moved here by the generation component */}
                    </div>
                  )}
                </div>

                {/* Tab Content */}
                {activeTab === "chart" && (
                  <>
                    <Chart token={token} />

                    <TransactionsAndHolders token={token} />
                  </>
                )}
                {activeTab === "ai" && (
                  <div id="generation" className="scroll-mt-16">
                    <GenerationSection />
                  </div>
                )}
                {activeTab === "agents" && (
                  <div id="agents" className="scroll-mt-16">
                    <AgentsSection isCreator={isTokenOwner} />
                  </div>
                )}
                {activeTab === "chat" && (
                  <div id="chat" className="mt-2 flex flex-col gap-2">
                    {/* Link to standalone chat page */}
                    <div className="px-3 py-1 text-right">
                      <Link
                        to={`/chat/${token?.mint}`}
                        className="text-xs text-autofun-text-secondary hover:text-autofun-text-highlight hover:underline"
                      >
                        Open Full Chat Page ↗
                      </Link>
                    </div>
                    <Chat />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - 25% - Trading and Bonding Curve */}
          <div className="w-full lg:w-1/4 flex flex-col md:flex-row lg:flex-col gap-3 order-2 lg:order-3">
            {/* Trade Component - Now at the top */}
            <Trade token={token} />
            <div className="flex flex-col gap-3 md:min-w-[400px] lg:min-w-[0]">
              {/* Balance and Value */}
              <div className={`flex flex-col gap-4 my-4 mx-2`}>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-dm-mono text-autofun-text-secondary">
                    Balance:
                  </span>
                  <span className="text-sm font-dm-mono text-autofun-text-secondary">
                    {formatNumber(tokenBalance, false, true)}{" "}
                    {sanitizeCheckmark(token?.ticker)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-dm-mono text-autofun-text-secondary">
                    Value:
                  </span>
                  <span className="text-sm font-dm-mono text-autofun-text-secondary">
                    {formatNumber(tokenBalance * priceSOL, false, true)} SOL /{" "}
                    {formatNumber(
                      tokenBalance * priceSOL * solanaPrice,
                      true,
                      false,
                    )}
                  </span>
                </div>
              </div>

              {/* Bonding Curve */}
              {token?.imported === 0 && token?.curveProgress < 100 && (
                <div className="flex flex-col gap-3.5 p-2">
                  <div className="flex justify-between gap-3.5 items-center">
                    <p className="font-medium font-satoshi">Progress</p>
                    <Tooltip anchorSelect="#tooltip">
                      <span>
                        When the market cap reaches the graduation threshold,
                        the coin's liquidity will transition to Raydium.
                      </span>
                    </Tooltip>
                    <InfoCircle
                      className="size-5 text-autofun-text-secondary"
                      id="tooltip"
                    />
                  </div>
                  <div className="relative w-full h-8 overflow-hidden">
                    {/* Background layer */}
                    <img
                      src="/token/progressunder.svg"
                      alt="Progress bar background"
                      className="absolute left-0 top-0 w-full h-full object-cover blur-xs"
                    />
                    {/* Progress layer with dynamic width */}
                    <div
                      className="absolute left-0 top-0 h-full"
                      style={{
                        width: `${Math.min(100, token?.curveProgress || 0)}%`,
                      }}
                    >
                      <img
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                        src="/token/progress.svg"
                        alt="Progress indicator"
                      />
                    </div>
                    {/* Percentage text */}
                    <div className="absolute right-2 top-0 h-full flex items-center">
                      <span className="text-autofun-text-secondary font-bold font-dm-mono text-[16px]">
                        {Math.floor((token?.curveProgress || 0) * 10) / 10}%
                      </span>
                    </div>
                  </div>
                  {token?.status !== "migrated" &&
                  token?.curveProgress !== 100 ? (
                    <p className="font-satoshi text-sm text-autofun-text-secondary whitespace-pre-line break-words mt-2">
                      {/* Graduate this coin at{" "}
                    {formatNumber(graduationMarketCap, true)} market cap.{"\n"} */}
                      There is{" "}
                      {formatNumber(
                        (token?.reserveLamport - token?.virtualReserves) /
                          LAMPORTS_PER_SOL,
                        true,
                        true,
                      )}{" "}
                      SOL in the bonding curve.
                    </p>
                  ) : (
                    env.solanaNetwork !== "devnet" && (
                      <Link
                        to={env.getRaydiumURL(token?.mint)}
                        target="_blank"
                        className="text-autofun-text-secondary hover:text-autofun-text-primary"
                      >
                        View on Raydium
                      </Link>
                    )
                  )}
                </div>
              )}

              {/* Price Display - Now below bonding curve */}
              <div className="py-4 px-3">
                <div className="flex justify-between flex-col">
                  <div className="flex flex-col gap-1 items-center py-4">
                    <span className="font-dm-mono text-autofun-text-secondary">
                      Total Supply
                    </span>
                    <span className="text-xl font-dm-mono text-autofun-text-primary">
                      {token?.tokenSupplyUiAmount?.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 items-center py-4">
                    <span className="font-dm-mono text-autofun-text-secondary">
                      Price USD
                    </span>
                    <span className="text-xl font-dm-mono text-autofun-text-primary">
                      {tokenPriceUSD
                        ? formatNumberSubscript(tokenPriceUSD)
                        : "$0.00"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 items-center py-4">
                    <span className="font-dm-mono text-autofun-text-secondary">
                      Price SOL
                    </span>
                    <span className="text-xl font-dm-mono text-autofun-text-primary">
                      {priceSOL
                        ? formatNumberSubscript(priceSOL)
                        : "0.00000000"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Fragment>
  );
}

const TopPageItem = ({
  title,
  value,
  isLoading,
}: {
  title: any;
  value: any;
  isLoading?: boolean;
}) => {
  return (
    <div className="flex-1 flex flex-col items-center">
      {isLoading ? (
        <img
          className="h-[60px] w-auto select-none animate-wiggle animate-infinite animate-duration-[400ms] animate-ease-linear"
          alt="logo"
          src="/dice.svg"
        />
      ) : (
        <span className="text-2xl md:text-4xl xl:text-6xl font-extrabold font-dm-mono text-autofun-text-highlight">
          {value}
        </span>
      )}

      <span className="text-base md:text-lg font-dm-mono text-autofun-text-secondary mt-3">
        {title}
      </span>
    </div>
  );
};
