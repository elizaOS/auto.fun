import { useTimeAgo } from "@/app/formatTimeAgo";
import { Copy, Check } from "lucide-react";
import { DM_Mono } from "next/font/google";
import { useState } from "react";
import { PlaceholderImage } from "./common/PlaceholderImage";

const dmMono = DM_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
});

interface AgentCardProps {
  name: string;
  image?: string;
  ticker: string;
  mint: string;
  marketCapUSD: number;
  bondingCurveProgress: number;
  description: string;
  creationDate?: string;
  onClick?: () => void;
  placeholderTime?: string;
  className?: string;
}

export function AgentCard({
  name,
  image,
  ticker,
  mint,
  marketCapUSD,
  bondingCurveProgress = 0,
  description,
  creationDate,
  onClick,
  placeholderTime,
  className,
}: AgentCardProps) {
  const formattedMarketCap = marketCapUSD
    ? Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: "compact",
        maximumFractionDigits: 2,
      }).format(marketCapUSD)
    : "$0.00";

  const timeAgo = useTimeAgo(creationDate ?? "");

  // Cap the progress at 100% and round to the nearest whole number
  const normalizedProgress = Math.round(
    Math.min(100, bondingCurveProgress || 0),
  );

  const [copied, setCopied] = useState(false);

  const handleCopyClick = async (event: React.MouseEvent) => {
    event.stopPropagation();
    await navigator.clipboard.writeText(mint);
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
  };

  return (
    <div
      onClick={onClick}
      className={`flex flex-col gap-3 w-full max-w-[411.5px] min-h-[288px] p-4 bg-[#171717] border border-[#262626] rounded-[8px] cursor-pointer hover:border-[#2FD345]/50 transition-colors ${className}`}
    >
      {/* Top container with image and details */}
      <div className="flex flex-col lg:flex-row gap-3 w-full">
        {/* Image */}
        <div className="relative w-full lg:w-[120px] h-[127.5px] rounded-[4px] bg-[#262626] overflow-hidden">
          {image ? (
            <img
              src={image}
              alt={name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <PlaceholderImage />
            </div>
          )}
        </div>

        {/* Right side content */}
        <div className="flex flex-col gap-3 flex-1 min-w-0">
          {/* Name and time */}
          <div className="flex items-start justify-between w-full gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="font-satoshi text-base font-medium text-white truncate">
                {name}
              </span>
              <span
                className={`${dmMono.className} text-base tracking-[2px] uppercase text-[#8C8C8C] whitespace-nowrap`}
              >
                ${ticker}
              </span>
            </div>
            <div className="flex items-center gap-1 px-2 h-6 border border-[#262626] rounded-[6px] whitespace-nowrap">
              <span className={`${dmMono.className} text-xs text-[#8C8C8C]`}>
                {placeholderTime || timeAgo}
              </span>
            </div>
          </div>

          {/* Market cap */}
          <div className="flex flex-col gap-1 w-full">
            <span className="font-satoshi text-xs font-medium text-[#8C8C8C]">
              Market Cap
            </span>
            <div className="flex items-center justify-between gap-2">
              <span
                className={`${dmMono.className} text-xl text-[#2FD345] truncate`}
              >
                {formattedMarketCap}
              </span>
              <div className="flex items-center gap-[6px] shrink-0">
                <span className={`${dmMono.className} text-xs text-[#8C8C8C]`}>
                  {mint.slice(0, 4)}...{mint.slice(-3)}
                </span>
                {copied ? (
                  <Check className="w-4 h-4 text-[#2FD345]" />
                ) : (
                  <Copy
                    className="w-4 h-4 text-[#8C8C8C] cursor-pointer hover:text-[#2FD345] transition-colors"
                    onClick={handleCopyClick}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Bonding curve */}
          <div className="flex flex-col gap-1 w-full">
            <div className="flex justify-between items-center gap-2">
              <span
                className={`${dmMono.className} text-sm text-[#A6A6A6] tracking-[-0.02em] truncate`}
              >
                Bonding curve progress:
              </span>
              <span
                className={`${dmMono.className} text-sm text-[#2FD345] whitespace-nowrap`}
              >
                {normalizedProgress}%
              </span>
            </div>
            <div className="relative w-full h-2">
              <div className="absolute inset-0 bg-[#262626] rounded-full" />
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#0F4916] to-[#2FD345] rounded-full"
                style={{ width: `${normalizedProgress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="flex flex-col gap-3 w-full">
        <div className="flex flex-col w-full">
          <p
            className={`${dmMono.className} text-xs text-[#8C8C8C] min-h-[40px]`}
          >
            <span className="line-clamp-2">{description}</span>
            {/* TODO: figure out the UX around this, if we expand inline it will shift the entire page's grid around. https://t.me/c/2271804620/289/2765 */}
            <button className="text-white hover:text-[#2FD345] transition-colors inline-block mt-1">
              See More...
            </button>
          </p>
        </div>
        <div className="w-full h-px bg-[#262626]" />
      </div>

      <button className="flex justify-center items-center w-full h-11 px-5 bg-[#2E2E2E] border border-[#262626] rounded-[6px] text-white hover:bg-[#2FD345] hover:text-black transition-colors mt-auto">
        Buy
      </button>
    </div>
  );
}
