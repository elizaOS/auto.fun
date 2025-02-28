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
      className="flex flex-col gap-3 w-full max-w-[411.5px] min-h-[288px] p-4 bg-[#171717] border border-[#262626] rounded-[8px] cursor-pointer hover:border-[#2FD345]/50 transition-colors"
    >
      {/* Top container with image and details */}
      <div className="flex flex-col lg:flex-row gap-3 w-full">
        {/* Image */}
        <div 
          className="w-full lg:w-[120px] h-[127.5px] rounded-[4px] bg-cover bg-center shrink-0" 
          style={{
            backgroundImage: `url(${image}), url(/checker.png)`,
            backgroundBlendMode: 'normal, multiply'
          }}
        />
        
        {/* Right side content */}
        <div className="flex flex-col gap-3 flex-1 min-w-0">
          {/* Name and time */}
          <div className="flex items-start justify-between w-full gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="font-satoshi text-base font-medium text-white truncate">{name}</span>
              <span className={`${dmMono.className} text-base tracking-[2px] uppercase text-[#8C8C8C] whitespace-nowrap`}>
                ${ticker}
              </span>
            </div>
            <div className="flex items-center gap-1 px-2 h-6 border border-[#262626] rounded-[6px] whitespace-nowrap">
              <span className={`${dmMono.className} text-xs text-[#8C8C8C]`}>17</span>
              <span className={`${dmMono.className} text-xs text-[#8C8C8C]`}>Min</span>
            </div>
          </div>
    
          {/* Market cap */}
          <div className="flex flex-col gap-1 w-full">
            <span className="font-satoshi text-xs font-medium text-[#8C8C8C]">Market Cap</span>
            <div className="flex items-center justify-between gap-2">
              <span className={`${dmMono.className} text-xl text-[#2FD345] truncate`}>
                {formattedMarketCap}
              </span>
              <div className="flex items-center gap-[6px] shrink-0">
                <span className={`${dmMono.className} text-xs text-[#8C8C8C]`}>{mint.slice(0, 4)}...{mint.slice(-3)}</span>
                <Copy className="w-4 h-4 text-[#8C8C8C] cursor-pointer hover:text-[#2FD345] transition-colors" />
              </div>
            </div>
          </div>
    
          {/* Bonding curve */}
          <div className="flex flex-col gap-1 w-full">
            <div className="flex justify-between items-center gap-2">
              <span className={`${dmMono.className} text-sm text-[#A6A6A6] tracking-[-0.02em] truncate`}>
                Bonding curve progress:
              </span>
              <span className={`${dmMono.className} text-sm text-[#2FD345] whitespace-nowrap`}>28%</span>
            </div>
            <div className="relative w-full h-2">
              <div className="absolute inset-0 bg-[#262626] rounded-full" />
              <div 
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#0F4916] to-[#2FD345] rounded-full"
                style={{ width: '28%' }}
              />
            </div>
          </div>
        </div>
      </div>
    
      {/* Description */}
      <div className="flex flex-col gap-3 w-full">
        <p className={`${dmMono.className} text-xs text-[#8C8C8C] min-h-[40px] line-clamp-2`}>
          Rorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc vulputate libero et
          <span className="text-white cursor-pointer hover:text-[#2FD345] transition-colors"> See More...</span>
        </p>
        <div className="w-full h-px bg-[#262626]" />
      </div>
    
      <button className="flex justify-center items-center w-full h-11 px-5 bg-[#2E2E2E] border border-[#262626] rounded-[6px] text-white hover:bg-[#2FD345] hover:text-black transition-colors mt-auto">
        Buy
      </button>
    </div>
  );
} 