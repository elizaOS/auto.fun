import { Copy } from "lucide-react";
import { DM_Mono } from 'next/font/google';

const dmMono = DM_Mono({
  weight: ['400', '500'],
  subsets: ['latin'],
});

interface AgentCardProps {
  name: string;
  image: string;
  ticker: string;
  mint: string;
  marketCapUSD: number;
  onClick?: () => void;
}

export function AgentCard({ name, image, ticker, mint, marketCapUSD, onClick }: AgentCardProps) {
  const formattedMarketCap = Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2
  }).format(marketCapUSD);

  return (
    <div 
      onClick={onClick}
      className="flex flex-col gap-[12px] w-[411.5px] h-[288px] p-[16px_12px] bg-[#171717] border border-[#262626] rounded-[8px] cursor-pointer hover:border-[#2FD345]/50 transition-colors"
    >
      {/* Top container with image and details */}
      <div className="flex gap-[12px] w-full h-[136px]">
        {/* Image */}
        <div 
          className="w-[120px] h-[127.5px] rounded-[4px] bg-cover bg-center flex-none" 
          style={{
            backgroundImage: `url(${image}), url(/checker.png)`,
            backgroundBlendMode: 'normal, multiply'
          }}
        />
        
        {/* Right side content */}
        <div className="flex flex-col gap-[12px] flex-1 min-w-0">
          {/* Name and time */}
          <div className="flex justify-between items-start w-full h-[24px]">
            <div className="flex items-center gap-[8px] h-[24px] min-w-0">
              <span className="font-satoshi text-base font-medium text-white truncate">{name}</span>
              <span className={`${dmMono.className} text-base tracking-[2px] uppercase text-[#8C8C8C] flex-shrink-0`}>
                ${ticker}
              </span>
            </div>
            <div className="flex items-center gap-[4px] px-[8px] h-[24px] border border-[#262626] rounded-[6px]">
              <span className={`${dmMono.className} text-xs text-[#8C8C8C]`}>17</span>
              <span className={`${dmMono.className} text-xs text-[#8C8C8C]`}>Min</span>
            </div>
          </div>
    
          {/* Market cap */}
          <div className="flex flex-col gap-[4px] w-full h-[48px]">
            <span className="font-satoshi text-xs font-medium text-[#8C8C8C]">Market Cap</span>
            <div className="flex items-center justify-between">
              <span className={`${dmMono.className} text-xl text-[#2FD345]`}>
                {formattedMarketCap}
              </span>
              <div className="flex items-center gap-[6px]">
                <span className={`${dmMono.className} text-xs text-[#8C8C8C]`}>{mint.slice(0, 4)}...{mint.slice(-3)}</span>
                <Copy className="w-4 h-4 text-[#8C8C8C] cursor-pointer" />
              </div>
            </div>
          </div>
    
          {/* Bonding curve */}
          <div className="flex flex-col gap-[4px] w-full h-[40px] justify-center">
            <div className="flex justify-between items-center">
              <span className={`${dmMono.className} text-sm text-[#A6A6A6] tracking-[-0.02em]`}>
                Bonding curve progress:
              </span>
              <span className={`${dmMono.className} text-sm text-[#2FD345]`}>28%</span>
            </div>
            <div className="relative w-full h-[8px]">
              <div className="absolute w-full h-[8px] bg-[#262626] rounded-[999px]" />
              <div 
                className="absolute h-[8px] bg-gradient-to-r from-[#0F4916] to-[#2FD345] rounded-[999px]"
                style={{ width: '28%' }}
              />
            </div>
          </div>
        </div>
      </div>
    
      {/* Description */}
      <div className="flex flex-col gap-[12px] w-full h-[52px]">
        <p className={`${dmMono.className} text-xs text-[#8C8C8C] h-[40px] line-clamp-2`}>
          Rorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc vulputate libero et
          <span className="text-white cursor-pointer"> See More...</span>
        </p>
        <div className="w-full h-[1px] bg-[#262626]" />
      </div>
    
      {/* Buy button */}
      <button className="flex justify-center items-center w-full h-[44px] px-5 bg-[#2E2E2E] border border-[#262626] rounded-[6px] text-white">
        Buy
      </button>
    </div>
  );
} 