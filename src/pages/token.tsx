import Button from "@/components/button";
import CopyButton from "@/components/copy-button";
import Loader from "@/components/loader";
import SkeletonImage from "@/components/skeleton-image";
import AdminSection from "@/components/token-sections/admin";
import AgentsSection from "@/components/token-sections/agents";
import GenerationSection from "@/components/token-sections/generation";
import TokenStatus from "@/components/token-status";
import Trade from "@/components/trade";
import { TradingViewChart } from "@/components/trading-view-chart";
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
} from "@/utils";
import { getToken, queryClient } from "@/utils/api";
import { env } from "@/utils/env";
import { getSocket } from "@/utils/socket";
import { useWallet } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Globe, Info as InfoCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "react-toastify";
import { Tooltip } from "react-tooltip";
import { twMerge } from "tailwind-merge";

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

const socket = getSocket();

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
    <div ref={elementRef} className="font-dm-mono text-center" title={text}>
      {showFull ? text : `${prefix}...${suffix}`}
    </div>
  );
}

export default function Page() {
  const params = useParams();
  const address = params?.address;
  const { publicKey } = useWallet();
  const normalizedWallet = publicKey?.toString();
  const { solPrice: contextSolPrice } = useSolPriceContext();

  // Load active tab from localStorage or default to "chart"
  const [activeTab, setActiveTab] = useState<"chart" | "ai">(() => {
    if (typeof window !== "undefined") {
      const savedTab = localStorage.getItem(`token-tab-${address}`);
      return savedTab === "chart" || savedTab === "ai" ? savedTab : "chart";
    }
    return "chart";
  });

  const [signature, setSignature] = useState<string | undefined>(undefined);

  const onSwapCompleted = (signature: string) => {
    setSignature(signature);
    queryClient.invalidateQueries({ queryKey: ["token", address] });
    setTimeout(() => {
      setSignature(undefined);
    }, 1000);
  };

  // Save active tab to localStorage when it changes
  useEffect(() => {
    if (address) {
      localStorage.setItem(`token-tab-${address}`, activeTab);
    }
  }, [activeTab, address]);

  // Fetch token details from API
  const tokenQuery = useQuery({
    queryKey: ["token", address],
    queryFn: async () => {
      if (!address) throw new Error("No address passed");
      try {
        return await getToken({ address, signature });
      } catch (error) {
        console.error(`Token page: Error fetching token data:`, error);
        throw error;
      }
    },
    refetchInterval: 20_000,
  });

  useEffect(() => {
    const socket = getSocket();

    // Create a handler function that checks if the token matches the current address
    const handleTokenUpdate = (token: any) => {
      // Only update if the token address matches the current page
      if (token.mint === address) {
        queryClient.setQueryData(["token", address], token);
      }
    };

    // Add the event listener with our filtered handler
    socket.on("updateToken", handleTokenUpdate);

    return () => {
      // Remove the specific handler when cleaning up
      socket.off("updateToken", handleTokenUpdate);
    };
  }, [address]);

  useEffect(() => {
    socket.emit("subscribe", address);

    return () => {
      socket.emit("unsubscribe", address);
    };
  }, [address]);

  const token = tokenQuery?.data as IToken;

  const solPriceUSD = contextSolPrice || token?.solPriceUSD || 0;
  const currentPrice = token?.currentPrice || 0;
  const tokenPriceUSD = token?.tokenPriceUSD || 0;
  const volume24h = token?.volume24h || 0;
  const finalTokenPrice = Number(env.finalTokenPrice ?? 0.000000451);
  const finalTokenUSDPrice = finalTokenPrice * solPriceUSD;
  const graduationMarketCap = finalTokenUSDPrice * 1_000_000_000;

  const { tokenBalance } = useTokenBalance({
    tokenId: token?.mint || (params?.address as string),
  });
  const solanaPrice = contextSolPrice || token?.solPriceUSD || 0;

  const handleClaimFees = async () => {
    if (!token?.mint || token?.creator !== normalizedWallet) {
      toast.error("No token found");
      return;
    }

    try {
      const response = await fetch(`${env.apiUrl}/api/claimFees`, {
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ tokenMint: token?.mint }),
      });

      if (!response.ok) {
        throw new Error("Failed to claim fees");
      }

      toast.success("Fees claimed successfully");
    } catch (error) {
      console.error("Error claiming fees:", error);
      toast.error("Failed to claim fees");
    }
  };

  if (tokenQuery?.isLoading) {
    return <Loader />;
  }

  if (tokenQuery?.isError) {
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

  // this is for testing purpose only, untill we have implemented partner tokens
  const parntnerMintList = [
    "B6t4KWk4MTGadFwzwTorAv5fmxw7v2bS7J74dRkw8FUN",
    "78c5zQY31XJ38U1TdH6WWEaa4AgxDPXq5fJr2q5rgFUN",
  ];
  const isPartner = parntnerMintList.includes(address as string);

  return (
    <div className="flex flex-col gap-3">
      {/* Top Stats Section - Full Width */}
      <div className="w-full py-10 flex flex-wrap justify-between">
        <TopPageItem
          title="Market Cap"
          value={
            tokenPriceUSD * token?.tokenSupplyUiAmount > 0
              ? abbreviateNumber(tokenPriceUSD * token?.tokenSupplyUiAmount)
              : "-"
          }
        />
        <TopPageItem
          title="24hr Volume"
          value={volume24h > 0 ? abbreviateNumber(volume24h) : "0"}
        />
        <TopPageItem
          title="Age"
          value={
            token?.createdAt
              ? fromNow(token?.createdAt, true).includes("a few")
                ? "NOW"
                : fromNow(token?.createdAt, true).includes("a minute")
                  ? "1m"
                  : fromNow(token?.createdAt, true).includes("an hour")
                    ? "1h"
                    : fromNow(token?.createdAt, true).includes("a day")
                      ? "1d"
                      : fromNow(token?.createdAt, true)
                          .replace("ago", "")
                          .replace(" days", "d")
                          .replace(" hours", "h")
                          .replace(" minutes", "m")
                          .replace("seconds", "s")
                          .replace(" day", "d")
                          .replace("hour", "hr")
                          .replace(" minute", "m")
                          .replace("second", "s")
                          .trim()
                          .trim()
              : "-"
          }
        />
      </div>

      {/* Three Column Layout */}
      <div className="flex flex-col lg:flex-row lg:flex-nowrap gap-4">
        {/* Left Column - 25% - Token Info */}
        <div className="w-full lg:w-1/4 flex flex-col gap-3 order-1 lg:order-1">
          <div className="pt-0 flex flex-col gap-3">
            <div className="relative overflow-hidden">
              <div className="w-full aspect-square">
                <SkeletonImage src={token?.image} alt="image" />
              </div>

              {/* Token name overlapping at top - with drop shadow */}
              <div
                className={twMerge(
                  isPartner
                    ? "from-autofun-background-action-highlight/10 via-autofun-background-action-highlight/10"
                    : "from-black/50 via-black/25",
                  "absolute top-0 left-0 right-0 bg-gradient-to-b to-transparent px-3 py-2.5",
                )}
              >
                <div className="flex flex-wrap items-center justify-start w-full gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="capitalize text-white text-xl sm:text-2xl font-bold font-satoshi leading-tight truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] max-w-[180px] sm:max-w-none">
                      {token?.name}
                    </h3>
                    <Verified isVerified={token?.verified ? true : false} />
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
                  ${token?.ticker}
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
              <div className="flex">
                <div className="size-10 inline-flex border-r shrink-0 bg-autofun-background-action-primary">
                  <span className="text-base font-dm-mono m-auto text-autofun-text-secondary">
                    CA
                  </span>
                </div>
                <div className="bg-autofun-background-input flex justify-between py-2 px-3 min-w-0 w-full gap-2">
                  <span className="mx-auto w-0 flex-1 min-w-0 block text-base text-autofun-text-secondary">
                    <MiddleEllipsis text={token?.mint} />
                  </span>
                  <CopyButton text={token?.mint} />
                </div>
              </div>
              {token?.creator === normalizedWallet && !token?.imported && (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleClaimFees}
                    className="cursor-pointer text-white text-center bg-transparent gap-x-3 border-2 hover:bg-autofun-background-action-highlight hover:text-black border-autofun-background-action-highlight flex px-8 py-1 mt-2 flex-row w-full items-center justify-center"
                  >
                    <span className="w-full text-center">Claim Fees</span>
                  </button>
                </div>
              )}
            </div>

            {/* Agents Section */}
            <AgentsSection isCreator={token?.creator === normalizedWallet} />

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

                const availableLinks = socialLinks.filter((link) => !!link.url);

                if (availableLinks.length === 0) {
                  return null; // Don't render the container if no links are available
                }

                return (
                  <div className="flex items-stretch gap-0.5">
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
            {token?.creator === normalizedWallet && !token?.imported && (
              <AdminSection />
            )}
          </div>
        </div>

        {/* Middle Column - 50% - Tabs for Chart and AI Create */}
        <div className="w-full lg:w-1/2 flex flex-col gap-3 order-3 lg:order-2">
          <div className="overflow-hidden relative">
            <div className="flex flex-col">
              {/* Green stroke above tab section */}
              <div className="h-2 w-full bg-autofun-text-highlight z-10"></div>

              {/* Tabs Header with Title and Right-aligned Tabs - removed border-b as it's on the parent */}
              <div className="flex items-center justify-between pr-2">
                <div className="flex">
                  <button
                    className={`px-4 py-3 text-autofun-text-primary font-medium cursor-pointer ${
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
                    className={`px-4 py-3 text-autofun-text-primary font-medium cursor-pointer ${
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
                        activeTab === "chart"
                          ? "/token/createon.svg"
                          : "/token/createoff.svg"
                      }
                      className={`size-4 inline-block ml-1.5 ${
                        activeTab === "chart" ? "text-black" : ""
                      }`}
                      alt="chart icon"
                    />
                  </button>
                </div>
                {activeTab === "chart" ? null : (
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
                  <div className="w-full h-[50vh] bg-autofun-background-primary">
                    <TradingViewChart name={token.name} token={token.mint} />
                  </div>

                  <TransactionsAndHolders token={token} />
                </>
              )}
              {activeTab === "ai" && (
                <div id="generation" className="scroll-mt-16">
                  <GenerationSection />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - 25% - Trading and Bonding Curve */}
        <div className="w-full lg:w-1/4 flex flex-col md:flex-row lg:flex-col gap-3 order-2 lg:order-3">
          {/* Trade Component - Now at the top */}
          <Trade token={token} onSwapCompleted={onSwapCompleted} />
          <div className="flex flex-col gap-3 md:min-w-[400px] lg:min-w-[0]">
            {/* Balance and Value */}
            <div className={`flex flex-col gap-4 my-4 mx-2`}>
              <div className="flex justify-between items-center">
                <span className="text-sm font-dm-mono text-autofun-text-secondary">
                  Balance:
                </span>
                <span className="text-sm font-dm-mono text-autofun-text-secondary">
                  {formatNumber(tokenBalance, false, true)} {token?.ticker}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-dm-mono text-autofun-text-secondary">
                  Value:
                </span>
                <span className="text-sm font-dm-mono text-autofun-text-secondary">
                  {formatNumber(tokenBalance * currentPrice, false, true)} SOL /{" "}
                  {formatNumber(
                    tokenBalance * currentPrice * solanaPrice,
                    true,
                    false,
                  )}
                </span>
              </div>
            </div>

            {/* Bonding Curve */}
            {token?.imported === 0 && (
              <div className="flex flex-col gap-3.5 p-2">
                <div className="flex justify-between gap-3.5 items-center">
                  <p className="font-medium font-satoshi">Progress</p>
                  <Tooltip anchorSelect="#tooltip">
                    <span>
                      When the market cap reaches the graduation threshold, the
                      coin's liquidity will transition to Raydium.
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
                      {(token?.curveProgress || 0).toFixed(0)}%
                    </span>
                  </div>
                </div>
                {token?.status !== "migrated" ? (
                  <p className="font-satoshi text-sm text-autofun-text-secondary whitespace-pre-line break-words mt-2">
                    Graduate this coin at{" "}
                    {formatNumber(graduationMarketCap, true)} market cap.{"\n"}
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
              <div className="flex justify-between flex-row md:flex-col lg:flex-row">
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
                    {currentPrice
                      ? formatNumberSubscript(currentPrice)
                      : "0.00000000"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const TopPageItem = ({ title, value }: { title: any; value: any }) => {
  return (
    <div className="flex-1 flex flex-col items-center">
      <span className="text-2xl md:text-4xl xl:text-6xl font-extrabold font-dm-mono text-autofun-text-highlight">
        {value}
      </span>
      <span className="text-base md:text-lg font-dm-mono text-autofun-text-secondary mt-3">
        {title}
      </span>
    </div>
  );
};
