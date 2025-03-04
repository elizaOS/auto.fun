import { Copy } from "lucide-react";
import { Icon } from "@iconify/react";
import { useState } from "react";
import { DM_Mono } from "next/font/google";

const dmMono = DM_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
});

interface AgentCardInfoProps {
  name: string;
  ticker: string;
  image: string;
  description: string;
  bondingCurveProgress?: number;
  bondingCurveAmount?: number;
  targetMarketCap?: number;
  contractAddress: string;
  priceUSD?: number;
  priceSOL?: number;
  socialLinks?: {
    website?: string;
    twitter?: string;
    telegram?: string;
    discord?: string;
  };
}

export function AgentCardInfo({
  name,
  ticker,
  image,
  bondingCurveProgress = 0,
  bondingCurveAmount = 0,
  targetMarketCap = 0,
  contractAddress,
  priceUSD = 0,
  priceSOL = 0,
  socialLinks,
  description = "This AI agent is designed to process complex data and provide intelli..This AI agent is designed to process complex data and provide intelli.complex data and provide intelli...",
}: AgentCardInfoProps) {
  const [copied, setCopied] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const formatNumber = (num: number, decimals: number) => {
    return isNaN(num) ? "0" : num.toFixed(decimals);
  };

  const truncateDescription = (text: string) => {
    if (text.length <= 100) return text;
    return showFullDescription ? text : text.split("...")[0] + "...";
  };

  return (
    <div className="flex flex-col justify-center items-start p-4 gap-6 w-[587px] bg-[#171717] border border-[#262626] rounded-[6px]">
      {/* Product Info */}
      <div className="flex flex-row items-start gap-5 w-full">
        {/* Product Image */}
        <div className="flex flex-col justify-center items-start w-[144px] h-[144px]">
          <img
            src={image}
            alt={name}
            className="w-[144px] h-[144px] rounded-[4px] border border-[#262626] object-cover"
          />
        </div>

        {/* Product Details */}
        <div className="flex flex-col items-start gap-4 flex-1">
          {/* Title Section */}
          <div className="flex flex-col items-start gap-2 w-full">
            <div className="flex flex-row items-center gap-2">
              <h1 className="font-satoshi text-[32px] leading-9 tracking-[-0.014em] text-white font-medium">
                {name}
              </h1>
              <span
                className={`${dmMono.className} text-[18px] leading-6 tracking-[2px] uppercase text-[#8C8C8C]`}
              >
                ${ticker}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-row items-start gap-1">
                <span
                  className={`${dmMono.className} text-xs leading-4 tracking-[2px] uppercase text-white`}
                >
                  AGENT:
                </span>
                <span
                  className={`${dmMono.className} text-xs leading-4 tracking-[2px] uppercase text-[#2FD345] underline`}
                >
                  AGENT NAME
                </span>
              </div>
              {/* Description */}
              <div className="font-satoshi text-base leading-6 tracking-[-0.4px] text-[#8C8C8C] mt-2">
                <p>{truncateDescription(description)}</p>
                {description.length > 100 && (
                  <button
                    onClick={() => setShowFullDescription(!showFullDescription)}
                    className="text-[#2FD345] hover:text-[#2FD345]/80 transition-colors ml-1"
                  >
                    {showFullDescription ? "See Less" : "See More"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contract Address */}
      <div className="flex w-full h-10 border border-[#262626] rounded-[6px]">
        <div className="flex items-center px-3 h-10 bg-[#2E2E2E] border-r border-[#262626] rounded-l-[6px]">
          <span
            className={`${dmMono.className} text-base leading-6 tracking-[2px] uppercase text-[#8C8C8C]`}
          >
            CA
          </span>
        </div>
        <div className="flex flex-1 items-center justify-between px-3 h-10 bg-[#212121] rounded-r-[6px]">
          <span
            className={`${dmMono.className} text-base leading-6 text-[#8C8C8C]`}
          >
            {contractAddress}
          </span>
          <button
            onClick={() => handleCopy(contractAddress)}
            className="text-[#8C8C8C] hover:text-white transition-colors"
          >
            {copied ? (
              <span className="text-[#2FD345]">Copied!</span>
            ) : (
              <Copy className="w-[18px] h-[18px]" />
            )}
          </button>
        </div>
      </div>

      {/* Social Links */}
      <div className="flex w-full h-10 gap-0.5">
        {[
          {
            icon: <Icon icon="mingcute:globe-line" width="24" height="24" />,
            link: socialLinks?.website || "#",
          },
          {
            icon: <Icon icon="ri:twitter-x-fill" width="24" height="24" />,
            link: socialLinks?.twitter || "#",
          },
          {
            icon: <Icon icon="ic:baseline-telegram" width="24" height="24" />,
            link: socialLinks?.telegram || "#",
          },
          {
            icon: <Icon icon="ic:baseline-discord" width="24" height="24" />,
            link: socialLinks?.discord || "#",
          },
        ].map((item, index, arr) => (
          <a
            key={index}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex justify-center items-center h-10 bg-[#212121] border border-[#262626] flex-1
              ${index === 0 ? "rounded-l-[6px]" : ""} 
              ${index === arr.length - 1 ? "rounded-r-[6px]" : ""}
              ${item.link === "#" ? "opacity-50 cursor-not-allowed" : "hover:bg-[#2FD345] hover:text-black"}
              text-white transition-colors`}
            onClick={item.link === "#" ? (e) => e.preventDefault() : undefined}
          >
            {item.icon}
          </a>
        ))}
      </div>

      {/* Price Information */}
      <div className="flex w-full h-[72px] gap-0.5">
        <div className="flex-1 flex flex-col justify-center items-center gap-2 p-4 bg-[#212121] border border-[#262626] rounded-l-[6px]">
          <span
            className={`${dmMono.className} text-base leading-6 text-[#8C8C8C]`}
          >
            Price USD
          </span>
          <span
            className={`${dmMono.className} text-xl leading-6 tracking-[2px] uppercase text-white`}
          >
            ${formatNumber(priceUSD, 8)}
          </span>
        </div>
        <div className="flex-1 flex flex-col justify-center items-center gap-2 p-4 bg-[#212121] border border-[#262626] rounded-r-[6px]">
          <span
            className={`${dmMono.className} text-base leading-6 text-[#8C8C8C]`}
          >
            Price
          </span>
          <span
            className={`${dmMono.className} text-xl leading-6 tracking-[2px] uppercase text-white`}
          >
            {formatNumber(priceSOL, 6)} SOL
          </span>
        </div>
      </div>

      {/* Bonding Curve Progress */}
      <div className="flex flex-col gap-3.5 w-full">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <span className="font-satoshi text-xl leading-7 tracking-[-0.014em] text-white font-medium">
              Bonding curve progress:
            </span>
            <span className="font-geist text-xl leading-7 text-[#2FD345]">
              {bondingCurveProgress >= 100
                ? "Complete"
                : `${Math.min(100, bondingCurveProgress)}%`}
            </span>
          </div>
          <div className="relative group">
            <Icon
              icon="mingcute:information-line"
              className="w-5 h-5 text-[#8C8C8C] hover:text-white transition-colors"
            />
            <div className="absolute bottom-full right-0 mb-2 w-[300px] px-4 py-3 bg-[#262626] rounded-lg text-sm text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-[#404040]">
              When the market cap reaches $100,000 liquidity will transition to
              Raydium. Trading fees are distributed to token owners rather than
              being burned.
            </div>
          </div>
        </div>
        <div className="relative w-full h-2">
          <div className="absolute w-full h-full bg-[#262626] rounded-[999px]" />
          <div
            className="absolute h-full bg-gradient-to-r from-[#0F4916] to-[#2FD345] rounded-[999px]"
            style={{ width: `${Math.min(100, bondingCurveProgress)}%` }}
          />
        </div>
        <p className="font-satoshi text-base leading-5 text-[#8C8C8C]">
          {bondingCurveProgress >= 100 ? (
            <>
              Raydium pool has been seeded. View on Raydium{" "}
              <a href="#" className="text-[#2FD345] hover:underline">
                here
              </a>
            </>
          ) : (
            <>
              Graduate this coin to raydium at $
              {targetMarketCap.toLocaleString()} market cap. there is{" "}
              {formatNumber(bondingCurveAmount, 3)} SOL in the bonding curve.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
