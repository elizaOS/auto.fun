import BondingCurveBar from "@/components/bonding-curve-bar";
import Button from "@/components/button";
import CopyButton from "@/components/copy-button";
import Loader from "@/components/loader";
import SkeletonImage from "@/components/skeleton-image";
import TokenStatus from "@/components/token-status";
import Trade from "@/components/trade";
import { IToken } from "@/types";
import {
  abbreviateNumber,
  formatNumber,
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
import ShowMoreText from "@/components/show-more-text";

export default function Page() {
  const params = useParams();
  const address = params?.address;

  const query = useQuery({
    queryKey: ["token", address],
    queryFn: async () => {
      if (!address) throw new Error("No address passed");
      return await getToken({ address });
    },
    refetchInterval: 3_000,
  });

  const token = query?.data as IToken;

  const solPriceUSD = token?.solPriceUSD;
  const finalTokenPrice = 0.00000045; // Approximated value from the bonding curve configuration
  const finalTokenUSDPrice = finalTokenPrice * solPriceUSD;
  const graduationMarketCap = finalTokenUSDPrice * 1_000_000_000;

  if (query?.isLoading) {
    return <Loader />;
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {/* Left Section */}
      <div className="col-span-2 flex flex-col gap-3">
        {/* Info */}
        <div className="flex border rounded-md bg-autofun-background-card p-3 items-center justify-between gap-3 divide-x divide-autofun-stroke-primary">
          <div className="flex flex-col gap-2 items-center w-full">
            <span className="text-base font-dm-mono text-autofun-text-secondary">
              Market Cap
            </span>
            <span className="text-xl font-dm-mono text-autofun-text-highlight">
              {token?.marketCapUSD
                ? abbreviateNumber(token?.marketCapUSD)
                : null}
            </span>
          </div>
          <div className="flex flex-col gap-2 items-center w-full">
            <span className="text-base font-dm-mono text-autofun-text-secondary">
              24hr Volume
            </span>
            <span className="text-xl font-dm-mono text-autofun-text-primary">
              {token?.price24hAgo ? abbreviateNumber(token?.volume24h) : null}
            </span>
          </div>
          <div className="flex flex-col gap-2 items-center w-full">
            <span className="text-base font-dm-mono text-autofun-text-secondary">
              Creator
            </span>
            <span className="text-xl font-dm-mono text-autofun-text-primary">
              {token?.creator ? shortenAddress(token?.creator) : null}
            </span>
          </div>
          <div className="flex flex-col gap-2 items-center w-full">
            <span className="text-base font-dm-mono text-autofun-text-secondary">
              Creation Time
            </span>
            <span className="text-xl font-dm-mono text-autofun-text-primary">
              {token?.createdAt ? fromNow(token?.createdAt) : null}
            </span>
          </div>
        </div>
        {/* Chart */}
        <div className="border rounded-md p-3 bg-autofun-background-card">
          Chart
        </div>
        <div className="border rounded-md p-3 bg-autofun-background-card">
          Tables
        </div>
      </div>
      {/* Right Section */}
      <div className="flex flex-col gap-3">
        <div className="border rounded-md p-4 bg-autofun-background-card flex flex-col gap-3">
          <div className="flex gap-3">
            <div className="w-36 shrink-0">
              <SkeletonImage
                src={token.image}
                alt="image"
              />
            </div>
            <div className="flex flex-col gap-3">
              {/* Token Info and Time */}
              <div className="flex items-center w-full min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="capitalize text-autofun-text-primary text-3xl font-medium font-satoshi leading-normal truncate min-w-0">
                    {token.name}
                  </div>
                  <div className="text-autofun-text-secondary text-base font-normal font-dm-mono uppercase leading-normal tracking-widest truncate min-w-0">
                    ${token.ticker}
                  </div>
                </div>
              </div>
              <ShowMoreText
                /* Default options */
                lines={2}
                more="Show more"
                less="Show less"
                className="text-autofun-text-secondary text-xs font-normal font-dm-mono leading-tight min-h-8"
                anchorClass="text-autofun-text-primary hover:text-autofun-text-highlight transition-all duration-200"
                truncatedEndingComponent={" ... "}
              >
                <span className="text-autofun-text-secondary text-xs font-normal font-dm-mono leading-tight">
                  {token.description}
                </span>
              </ShowMoreText>
            </div>
          </div>
          {/* Contractaddress */}
          <div className="flex border rounded-md">
            <div className="size-10 rounded-l-md inline-flex border-r shrink-0 bg-autofun-background-action-primary">
              <span className="text-base font-dm-mono m-auto text-autofun-text-secondary">
                CA
              </span>
            </div>
            <div className="bg-autofun-background-input flex justify-between py-2 px-3 min-w-0 w-full gap-2">
              <span className="text-base text-autofun-text-secondary truncate">
                {token?.mint}
              </span>
              <CopyButton text={token?.mint} />
            </div>
          </div>
          {/* Social Links */}
          <div className="flex items-center justify-between gap-0.5">
            <Link to={token?.website} className="w-full" target="_blank">
              <Button
                className="w-full rounded-none rounded-l-md"
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
                className="w-full rounded-none rounded-r-md px-0"
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
          <div className="flex border rounded-md bg-autofun-background-card py-2 px-3 items-center justify-between gap-3 divide-x divide-autofun-stroke-primary">
            <div className="flex flex-col gap-1 items-center w-full">
              <span className="text-base font-dm-mono text-autofun-text-secondary">
                Price USD
              </span>
              <span className="text-xl font-dm-mono text-autofun-text-highlight">
                {token?.marketCapUSD
                  ? abbreviateNumber(token?.marketCapUSD)
                  : null}
              </span>
            </div>
            <div className="flex flex-col gap-1 items-center w-full">
              <span className="text-base font-dm-mono text-autofun-text-secondary">
                Price
              </span>
              <span className="text-xl font-dm-mono text-autofun-text-primary">
                {token?.price24hAgo ? abbreviateNumber(token?.volume24h) : null}
              </span>
            </div>
          </div>
          {/* Bonding Curve */}
          <div className="flex flex-col gap-3.5">
            <div className="flex justify-between gap-3.5">
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
              <p className="font-satoshi text-base text-autofun-text-secondary whitespace-pre">
                Graduate this coin to Raydium at{" "}
                {formatNumber(graduationMarketCap, true)}
                market cap.{"\n"}
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

            <TokenStatus token={token} />
          </div>
        </div>
        <Trade token={token} />
      </div>
    </div>
  );
}
