import BondingCurveBar from "@/components/bonding-curve-bar";
import Button from "@/components/button";
import CopyButton from "@/components/copy-button";
import Loader from "@/components/loader";
import SkeletonImage from "@/components/skeleton-image";
import TokenStatus from "@/components/token-status";
import Trade from "@/components/trade";
import TransactionsAndHolders from "@/components/txs-and-holders";
import { IToken } from "@/types";
import {
  abbreviateNumber,
  formatNumber,
  formatNumberSubscript,
  fromNow,
  LAMPORTS_PER_SOL,
  normalizedProgress,
  shortenAddress,
} from "@/utils";
import { getToken } from "@/utils/api";
import { fetchTokenMarketMetrics } from "@/utils/blockchain";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Info as InfoCircle } from "lucide-react";
import { Globe } from "lucide-react";
import { Link, useParams } from "react-router";
import { TradingViewChart } from "@/components/trading-view-chart";
import { useEffect, useState } from "react";
import { getSocket } from "@/utils/socket";
import GenerationSection from "@/components/token-sections/generation";
import AdminSection from "@/components/token-sections/admin";
import AgentsSection from "@/components/token-sections/agents";
import { useSolPriceContext } from "@/providers/use-sol-price-context";
import { toast } from "react-toastify";

const socket = getSocket();

export default function Page() {
  const params = useParams();
  const address = params?.address;
  const { solPrice: contextSolPrice } = useSolPriceContext();

  type ITabs = "Trading" | "Community" | "Admin";
  const [tab, setTab] = useState<ITabs>("Trading");

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

  // Fetch token market metrics from blockchain
  const metricsQuery = useQuery({
    queryKey: ["blockchain-metrics", address],
    queryFn: async () => {
      if (!address) throw new Error("No address passed");
      try {
        console.log(`Token page: Fetching blockchain metrics for ${address}`);
        // Add loading toast for better user feedback
        toast.info("Fetching real-time blockchain data...", {
          position: "bottom-right",
          autoClose: 3000,
        });

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
          toast.warning(
            "Unable to fetch real-time data from blockchain. Using cached values.",
            {
              position: "bottom-right",
              autoClose: 5000,
            },
          );
        } else {
          toast.success("Real-time blockchain data loaded successfully!", {
            position: "bottom-right",
            autoClose: 3000,
          });
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
  const volume24h = metrics?.volume24h || token?.volume24h || 0;
  // const holderCount = metrics?.holderCount || token?.holderCount || 0;

  // For bonding curve calculations, still use token data
  const finalTokenPrice = currentPrice || 0;
  const finalTokenUSDPrice = tokenPriceUSD || finalTokenPrice * solPriceUSD;
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
          <Link to={`https://solscan.io/token/${address}`} target="_blank">
            <Button variant="secondary">View on Solscan</Button>
          </Link>
        </div>
      </div>
    );
  }

  const admin = true;

  return (
    <div className="flex flex-wrap gap-3">
      {/* Right Section */}
      <div className="w-full lg:max-w-[450px] flex flex-col gap-3">
        <div className="border p-4 bg-autofun-background-card flex flex-col gap-3">
          <div className="w-full">
            <SkeletonImage src={token?.image} alt="image" />
          </div>
          <div className="flex flex-col gap-3">
            {/* Token Info and Time */}
            <div className="flex items-center w-full min-w-0">
              <div className="flex items-start md:items-center justify-between w-full min-w-0">
                <div className="capitalize text-autofun-text-primary text-3xl font-medium font-satoshi leading-normal truncate min-w-0">
                  {token?.name}
                </div>
                <div>
                  <TokenStatus token={token} />
                </div>
              </div>
            </div>
            <div className="text-autofun-text-highlight text-base font-normal font-dm-mono uppercase leading-normal tracking-widest truncate min-w-0">
              ${token?.ticker}
            </div>
            <span className="text-autofun-text-secondary text-xs font-normal font-dm-mono leading-tight">
              {token?.description}
            </span>
            <div className="flex justify-end">
              <Link
                to={`https://solscan.io/token/${token?.mint}`}
                target="_blank"
              >
                <Button size="small" variant="ghost">
                  View on Solscan <ExternalLink className="size-4 ml-1" />
                </Button>
              </Link>
            </div>
          </div>
          {/* Contractaddress */}
          <div className="flex border">
            <div className="size-10  inline-flex border-r shrink-0 bg-autofun-background-action-primary">
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
          {/* Social Links */}
          <div className="flex items-center justify-between gap-0.5">
            <Link to={token?.website} className="w-full" target="_blank">
              <Button
                className="w-full rounded-none "
                disabled={!token?.website}
                aria-label="website"
              >
                <Globe />
              </Button>
            </Link>
            <Link to={token?.twitter} className="w-full" target="_blank">
              <Button
                className="w-full rounded-none"
                disabled={!token?.twitter}
                aria-label="twitter"
              >
                <SkeletonImage
                  src="/x.svg"
                  height={24}
                  width={24}
                  alt="twitter_icon"
                  className="w-6 m-auto"
                />
              </Button>
            </Link>
            <Link to={token?.telegram} className="w-full" target="_blank">
              <Button
                className="w-full rounded-none py-0 flex"
                disabled={!token?.telegram}
                aria-label="telegram"
              >
                <SkeletonImage
                  src="/telegram.svg"
                  height={24}
                  width={24}
                  alt="telegram_icon"
                  className="size-6 object-contain m-auto h-full"
                />
              </Button>
            </Link>
            <Link to={token?.discord} className="w-full" target="_blank">
              <Button
                className="w-full rounded-none  px-0"
                disabled={!token?.discord}
                aria-label="discord"
              >
                <SkeletonImage
                  src="/discord.svg"
                  height={24}
                  width={24}
                  alt="discord_icon"
                  className="w-auto m-auto"
                />
              </Button>
            </Link>
          </div>
          {/* USD Price & Solana Price */}
          <div className="flex border bg-autofun-background-card py-2 px-3 items-center justify-between divide-x divide-autofun-stroke-primary">
            <div className="flex flex-col gap-1 items-center w-full">
              <span className="text-base font-dm-mono text-autofun-text-secondary">
                Price USD
              </span>
              <span className="text-xl font-dm-mono text-autofun-text-primary">
                {tokenPriceUSD ? formatNumberSubscript(tokenPriceUSD) : "$0.00"}
                {metricsQuery.isLoading && (
                  <span className="text-xs text-autofun-text-secondary ml-1">
                    loading...
                  </span>
                )}
              </span>
            </div>
            <div className="flex flex-col gap-1 items-center w-full">
              <span className="text-base font-dm-mono text-autofun-text-secondary">
                Price
              </span>
              <span className="text-xl font-dm-mono text-autofun-text-primary">
                {currentPrice
                  ? formatNumberSubscript(currentPrice)
                  : "0.00000000"}
                {metricsQuery.isLoading && (
                  <span className="text-xs text-autofun-text-secondary ml-1">
                    loading...
                  </span>
                )}
              </span>
            </div>
          </div>
          {/* Bonding Curve */}
          <div className="flex flex-col gap-3.5">
            <div className="flex justify-between gap-3.5 items-center">
              <p className="font-medium font-satoshi">
                Bonding Curve Progress:{" "}
                <span className="text-autofun-text-highlight">
                  {normalizedProgress(token?.curveProgress) === 100
                    ? "Completed"
                    : `${normalizedProgress(token?.curveProgress)}%`}
                </span>
              </p>
              <InfoCircle className="size-5 text-autofun-text-secondary" />
            </div>
            <BondingCurveBar progress={token?.curveProgress} />
            {token?.status !== "migrated" ? (
              <p className="font-satoshi text-sm text-autofun-text-secondary whitespace-pre-line break-words">
                Graduate this coin to Raydium at{" "}
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
            ) : null}
          </div>
        </div>
        <Trade token={token} />
      </div>
      {/* Left Section */}
      <div className="grow flex flex-col gap-3 w-full md:w-auto">
        {/* Info */}
        <div className="flex py-2 flex-wrap lg:flex-nowrap border bg-autofun-background-card items-center justify-between gap-3 lg:divide-x divide-autofun-stroke-primary">
          <div className="flex flex-col gap-2 items-center w-full">
            <span className="text-base font-dm-mono text-autofun-text-secondary">
              <span className="lg:hidden">MCap</span>
              <span className="hidden lg:inline">Market Cap</span>
            </span>
            <span className="text-xl font-dm-mono text-autofun-text-highlight">
              {marketCapUSD > 0 ? abbreviateNumber(marketCapUSD) : "-"}
              {metricsQuery.isLoading && (
                <span className="text-xs text-autofun-text-secondary ml-1">
                  loading...
                </span>
              )}
              {!marketCapUSD && !metricsQuery.isLoading && (
                <span className="text-xs text-autofun-text-secondary ml-1">
                  <Link
                    to={`https://solscan.io/token/${token?.mint}`}
                    target="_blank"
                    className="hover:underline"
                  >
                    View on Solscan
                  </Link>
                </span>
              )}
            </span>
          </div>
          <div className="flex flex-col gap-2 items-center w-full">
            <span className="text-base font-dm-mono text-autofun-text-secondary">
              <span className="lg:hidden">24hr</span>
              <span className="hidden lg:inline">24hr Volume</span>
            </span>
            <span className="text-xl font-dm-mono text-autofun-text-primary">
              {volume24h > 0 ? abbreviateNumber(volume24h) : "-"}
              {metricsQuery.isLoading && (
                <span className="text-xs text-autofun-text-secondary ml-1">
                  loading...
                </span>
              )}
              {!volume24h && !metricsQuery.isLoading && (
                <span className="text-xs text-autofun-text-secondary ml-1">
                  <Link
                    to={`https://solscan.io/token/${token?.mint}#trade`}
                    target="_blank"
                    className="hover:underline"
                  >
                    View trades
                  </Link>
                </span>
              )}
            </span>
          </div>
          <div className="flex flex-col gap-2 items-center w-full">
            <span className="text-base font-dm-mono text-autofun-text-secondary">
              Creator
            </span>
            <span className="text-xl font-dm-mono text-autofun-text-primary">
              {token?.creator ? (
                <Link
                  to={`https://solscan.io/account/${token?.creator}`}
                  target="_blank"
                  className="hover:text-autofun-text-highlight"
                >
                  {shortenAddress(token?.creator)}
                </Link>
              ) : (
                "-"
              )}
            </span>
          </div>
          <div className="flex flex-col gap-2 items-center w-full">
            <span className="text-base font-dm-mono text-autofun-text-secondary">
              Time
            </span>
            <span className="text-lg lg:text-xl font-dm-mono text-autofun-text-primary">
              {token?.createdAt
                ? fromNow(token?.createdAt).replace("ago", "").trim()
                : "-"}
            </span>
          </div>
        </div>
        <div className="border bg-autofun-background-card">
          <TradingViewChart name={token.name} token={token.mint} />
        </div>
        <TransactionsAndHolders token={token} />
        <div className="border bg-autofun-background-card">
          <AgentsSection />
        </div>
        <div className="border bg-autofun-background-card">
          <GenerationSection />
        </div>
        <div className="border bg-autofun-background-card">
          <AdminSection />
        </div>
      </div>
    </div>
  );
}
