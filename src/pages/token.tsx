import BondingCurveBar from "@/components/bonding-curve-bar";
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
import { useSolPriceContext } from "@/providers/use-sol-price-context";
import { Tooltip } from "react-tooltip";
import { IToken } from "@/types";
import {
  abbreviateNumber,
  formatNumber,
  formatNumberSubscript,
  fromNow,
  LAMPORTS_PER_SOL,
} from "@/utils";
import { getToken, queryClient } from "@/utils/api";
import { fetchTokenMarketMetrics } from "@/utils/blockchain";
import { getSocket } from "@/utils/socket";
import { useWallet } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Globe, Info as InfoCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "react-toastify";
import { env } from "@/utils/env";

const socket = getSocket();

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
        // Fetch token data from API
        console.log(`Token page: Fetching token data for ${address}`);
        return await getToken({ address });
      } catch (error) {
        console.error(`Token page: Error fetching token data:`, error);
        throw error;
      }
    },
    refetchInterval: 20_000,
  });

  useEffect(() => {
    const socket = getSocket();

    socket.on("updateToken", (token: any) =>
      queryClient.setQueryData(["token", address], token),
    );

    return () => {
      socket.off("updateToken");
    };
  }, []);

  // Fetch token market metrics from blockchain
  const metricsQuery = useQuery({
    queryKey: ["blockchain-metrics", address],
    queryFn: async () => {
      if (!address) throw new Error("No address passed");
      try {
        console.log(`Token page: Fetching blockchain metrics for ${address}`);
        // Add loading toast for better user feedback
        // toast.info("Fetching real-time blockchain data...", {
        //   position: "bottom-right",
        //   autoClose: 3000,
        // });

        const metrics = await fetchTokenMarketMetrics(address);
        console.log(`Token page: Received blockchain metrics:`, metrics);

        // Validate the data - if all values are 0, it might indicate an issue
        const hasValidData =
          metrics.marketCapUSD > 0 ||
          metrics.currentPrice > 0 ||
          metrics.volume24h > 0;

        if (!hasValidData) {
          console.warn(
            `Token page: Blockchain metrics may be invalid - all key values are 0`,
          );
        }

        return metrics;
      } catch (error) {
        console.error(`Token page: Error fetching blockchain metrics:`, error);
        toast.error(
          "Error fetching real-time blockchain data. Using cached values.",
          {
            position: "bottom-right",
            autoClose: 5000,
          },
        );
        return null;
      }
    },
    enabled: !!address,
    refetchInterval: 30_000, // Longer interval for blockchain queries
    staleTime: 60000, // Data stays fresh for 1 minute
  });

  useEffect(() => {
    socket.emit("subscribe", address);

    return () => {
      socket.emit("unsubscribe", address);
    };
  }, [address]);

  const token = tokenQuery?.data as IToken;
  const metrics = metricsQuery?.data;

  // Use real blockchain data if available, otherwise fall back to API data
  const solPriceUSD =
    metrics?.solPriceUSD || contextSolPrice || token?.solPriceUSD || 0;
  const currentPrice = metrics?.currentPrice || token?.currentPrice || 0;
  const tokenPriceUSD = metrics?.tokenPriceUSD || token?.tokenPriceUSD || 0;
  const marketCapUSD = metrics?.marketCapUSD || token?.marketCapUSD || 0;
  const volume24h = token?.volume24h || metrics?.volume24h || 0;
  // const holderCount = metrics?.holderCount || token?.holderCount || 0;

  // For bonding curve calculations, still use token data
  const finalTokenPrice = 0.00000045; // Approximated final value from the bonding curve configuration (This can only be estimated)
  const finalTokenUSDPrice = finalTokenPrice * solPriceUSD;
  const graduationMarketCap = finalTokenUSDPrice * 1_000_000_000;

  // Calculate negative reserve status
  const negativeReserve =
    token && token.reserveLamport - token.virtualReserves < 0
      ? (token.reserveLamport - token.virtualReserves) / LAMPORTS_PER_SOL
      : null;

  // Add debug logging
  console.log("Token data from API:", {
    mint: token?.mint,
    name: token?.name,
    currentPrice: token?.currentPrice,
    tokenPriceUSD: token?.tokenPriceUSD,
    solPriceUSD: token?.solPriceUSD,
    marketCapUSD: token?.marketCapUSD,
    volume24h: token?.volume24h,
    holderCount: token?.holderCount,
    status: token?.status,
    // Add more detailed token data
    reserveAmount: token?.reserveAmount,
    reserveLamport: token?.reserveLamport,
    virtualReserves: token?.virtualReserves,
    curveProgress: token?.curveProgress,
    negativeReserve,
  });

  console.log("Blockchain metrics:", metrics);

  console.log("Using calculated values:", {
    solPriceFromContext: contextSolPrice,
    finalSolPrice: solPriceUSD,
    finalTokenPrice,
    finalTokenUSDPrice,
    graduationMarketCap,
    metricsAvailable: !!metrics,
    metricsLoading: metricsQuery.isLoading,
    metricsError: metricsQuery.isError,
  });

  // If the blockchain fetch failed or returned default values, add a warning
  useEffect(() => {
    if (metricsQuery.isSuccess && metrics) {
      const allZeros =
        !metrics.marketCapUSD && !metrics.currentPrice && !metrics.volume24h;
      if (allZeros) {
        console.warn(
          `WARNING: Blockchain metrics returned all zeros for token ${token?.mint}. This might indicate an error in data retrieval.`,
        );
      }
    }
  }, [metricsQuery.isSuccess, metrics, token?.mint]);

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

  return (
    <div className="flex flex-col gap-3">
      {/* Top Stats Section - Full Width */}
      <div className="w-full py-10 flex flex-wrap justify-between">
        <TopPageItem
          title="Market Cap"
          value={marketCapUSD > 0 ? abbreviateNumber(marketCapUSD) : "-"}
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
      <div className="flex flex-wrap lg:flex-nowrap gap-4">
        {/* Left Column - 25% - Token Info */}
        <div className="w-full lg:w-1/4 flex flex-col gap-3">
          <div className="pt-0 flex flex-col gap-3">
            <div className="relative overflow-hidden">
              <div className="w-full aspect-square">
                <SkeletonImage src={token?.image} alt="image" />
              </div>

              {/* Token name overlapping at top - with drop shadow */}
              <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/50 via-black/25 to-transparent px-3 py-2.5">
                <div className="flex items-center justify-between w-full">
                  <div className="flex flex-row items-center gap-1">
                    <h3 className="capitalize text-white text-2xl font-bold font-satoshi leading-tight truncate pr-2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                      {token?.name}
                    </h3>
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
                  <div className="shrink-0 ml-1">
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
            <div className="flex">
              <div className="size-10 inline-flex border-r shrink-0 bg-autofun-background-action-primary">
                <span className="text-base font-dm-mono m-auto text-autofun-text-secondary">
                  CA
                </span>
              </div>
              <div className="bg-autofun-background-input flex justify-between py-2 px-3 min-w-0 w-full gap-2">
                <span className="w-0 flex-1 min-w-0 block text-base text-autofun-text-secondary truncate">
                  {token?.mint}
                </span>
                <CopyButton text={token?.mint} />
              </div>
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
            {token?.creator === normalizedWallet && <AdminSection />}
          </div>
        </div>

        {/* Middle Column - 50% - Tabs for Chart and AI Create */}
        <div className="w-full lg:w-1/2 flex flex-col gap-3">
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
        <div className="w-full lg:w-1/4 flex flex-col gap-3">
          {/* Trade Component - Now at the top */}
          <Trade token={token} />

          {/* Bonding Curve */}
          {token?.imported === 0 && (
            <div className="flex flex-col gap-3.5">
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
              <div>
                <BondingCurveBar progress={token?.curveProgress} />
              </div>
            {token?.status !== "migrated" ? (
              <p className="font-satoshi text-sm text-autofun-text-secondary whitespace-pre-line break-words mt-2">
                Graduate this coin at {formatNumber(graduationMarketCap, true)}{" "}
                market cap.{"\n"}
                There is{" "}
                {formatNumber(
                  (token?.reserveLamport - token?.virtualReserves) /
                    LAMPORTS_PER_SOL,
                  true,
                  true,
                )}{" "}
                SOL in the bonding curve.
              </p>
            ) : null}
          </div>


          {/* Price Display - Now below bonding curve */}
          <div className="py-4 px-3">
            <div className="flex justify-between">
              <div className="flex flex-col gap-1 items-center">
                <span className="font-dm-mono text-autofun-text-secondary">
                  Price USD
                </span>
                <span className="text-xl font-dm-mono text-autofun-text-primary">
                  {tokenPriceUSD
                    ? formatNumberSubscript(tokenPriceUSD)
                    : "$0.00"}
                </span>
              </div>
              <div className="flex flex-col gap-1 items-center">
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
