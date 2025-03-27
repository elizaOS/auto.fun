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
import { useQuery } from "@tanstack/react-query";
import { InfoCircle } from "iconsax-react";
import { Globe } from "lucide-react";
import { Link, useParams } from "react-router";
import { TradingViewChart } from "@/components/trading-view-chart";
import { useEffect, useState } from "react";
import { getSocket } from "@/utils/socket";
import { twMerge } from "tailwind-merge";

const socket = getSocket();

export default function Page() {
  const params = useParams();
  const address = params?.address;

  type ITabs = "Trading" | "Community" | "Admin";
  const [tab, setTab] = useState<ITabs>("Trading");

  const query = useQuery({
    queryKey: ["token", address],
    queryFn: async () => {
      if (!address) throw new Error("No address passed");
      const data = await getToken({ address });
      return data;
    },
    refetchInterval: 20_000,
  });

  useEffect(() => {
    socket.emit("subscribe", address);

    return () => {
      socket.emit("unsubscribe", address);
    };
  }, [address]);

  const token = query?.data as IToken;

  const solPriceUSD = token?.solPriceUSD;
  const finalTokenPrice = 0.00000045; // Approximated value from the bonding curve configuration
  const finalTokenUSDPrice = finalTokenPrice * solPriceUSD;
  const graduationMarketCap = finalTokenUSDPrice * 1_000_000_000;

  if (query?.isLoading) {
    return <Loader />;
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
              >
                <Globe />
              </Button>
            </Link>
            <Link to={token?.twitter} className="w-full" target="_blank">
              <Button
                className="w-full rounded-none"
                disabled={!token?.twitter}
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
            <Link to={token?.website} className="w-full" target="_blank">
              <Button
                className="w-full rounded-none  px-0"
                disabled={!token?.website}
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
          <div className="flex border bg-autofun-background-card py-2 px-3 items-center justify-between gap-3 divide-x divide-autofun-stroke-primary">
            <div className="flex flex-col gap-1 items-center w-full">
              <span className="text-base font-dm-mono text-autofun-text-secondary">
                Price USD
              </span>
              <span className="text-xl font-dm-mono text-autofun-text-primary">
                {token?.tokenPriceUSD
                  ? formatNumberSubscript(token?.tokenPriceUSD)
                  : null}
              </span>
            </div>
            <div className="flex flex-col gap-1 items-center w-full">
              <span className="text-base font-dm-mono text-autofun-text-secondary">
                Price
              </span>
              <span className="text-xl font-dm-mono text-autofun-text-primary">
                {token?.currentPrice
                  ? formatNumberSubscript(token?.currentPrice)
                  : null}
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
                  true
                )}{" "}
                SOL in the bonding curve.
              </p>
            ) : null}
          </div>
        </div>
        <Trade token={token} />
      </div>
      {/* Left Section */}
      <div className="w-full lg:w-fit grow flex flex-col gap-3">
        {/* Info */}
        <div className="flex flex-wrap xl:flex-nowrap border bg-autofun-background-card p-3 items-center justify-between gap-3 xl:divide-x divide-autofun-stroke-primary">
          <div className="flex flex-col gap-2 items-center w-full">
            <span className="text-base font-dm-mono text-autofun-text-secondary">
              Market Cap
            </span>
            <span className="text-xl font-dm-mono text-autofun-text-highlight">
              {token?.marketCapUSD != null
                ? abbreviateNumber(token?.marketCapUSD)
                : "-"}
            </span>
          </div>
          <div className="flex flex-col gap-2 items-center w-full">
            <span className="text-base font-dm-mono text-autofun-text-secondary">
              24hr Volume
            </span>
            <span className="text-xl font-dm-mono text-autofun-text-primary">
              {token?.volume24h != null
                ? abbreviateNumber(token?.volume24h)
                : "-"}
            </span>
          </div>
          <div className="flex flex-col gap-2 items-center w-full">
            <span className="text-base font-dm-mono text-autofun-text-secondary">
              Creator
            </span>
            <span className="text-xl font-dm-mono text-autofun-text-primary">
              {token?.creator ? shortenAddress(token?.creator) : "-"}
            </span>
          </div>
          <div className="flex flex-col gap-2 items-center w-full">
            <span className="text-base font-dm-mono text-autofun-text-secondary">
              Creation Time
            </span>
            <span className="text-xl font-dm-mono text-autofun-text-primary">
              {token?.createdAt ? fromNow(token?.createdAt) : "-"}
            </span>
          </div>
        </div>
        {/* Chart */}
        <div className="flex flex-row ">
          <Button onClick={() => setTab("Trading")} className={twMerge(tab === "Trading" ? "bg-autofun-stroke-highlight/80" : "bg-white/15")}>
            Trading
          </Button>
          <Button onClick={() => setTab("Community")}>Community</Button>
          {admin && <Button onClick={() => setTab("Admin")}>Admin</Button>}
        </div>
        <div className="border bg-autofun-background-card h-[50vh]">
          {tab === "Trading" ? (
            <TradingViewChart name={token.name} token={token.mint} />
          ) : tab === "Community" ? (
            <div>community</div>
          ) : tab === "Admin" ? (
            <div>Admin</div>
          ) : null}
        </div>
        <TransactionsAndHolders token={token} />
      </div>
    </div>
  );
}
