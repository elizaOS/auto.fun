import { Token } from "@/utils/tokens";
import { DM_Mono } from 'next/font/google';
import { Grid } from 'lucide-react';

const dmMono = DM_Mono({
  weight: ['400', '500'],
  subsets: ['latin'],
});

interface TableViewProps {
  tokens: Token[];
  onTokenClick: (mint: string) => void;
}

export function TableView({ tokens, onTokenClick }: TableViewProps) {
  return (
    <div className="flex flex-col gap-4 overflow-x-auto">
      {/* Header */}
      <div className={`flex items-center w-full h-[20px] ${dmMono.className} text-[14px] leading-5 tracking-[2px] uppercase text-[#A6A6A6] px-4`}>
        <div className="w-[300px] md:w-[400px]">AI AGENTS</div>
        <div className="flex flex-1 items-center">
          <div className="w-[150px] md:w-[200px]">Market Cap</div>
          <div className="w-[150px] md:w-[200px] hidden md:block">24h Volume</div>
          <div className="w-[120px] hidden lg:block">Holders</div>
          <div className="w-[200px] hidden xl:block">Bonding curve</div>
          <div className="w-[120px] md:w-[150px] text-right">Created</div>
        </div>
      </div>

      {/* Rows */}
      {tokens.map(({
        mint,
        name,
        image,
        marketCapUSD,
        ticker,
        liquidity,
        holderCount,
        curveProgress = 0,
      }) => {
        const normalizedProgress = Math.min(100, curveProgress);
        
        return (
          <div 
            key={mint}
            onClick={() => onTokenClick(mint)}
            className="flex w-full h-[74px] bg-[#171717] border border-[#262626] rounded-[6px] cursor-pointer hover:border-[#2FD345]/50 transition-colors"
          >
            {/* Agent Info */}
            <div className="flex items-center gap-4 px-4 w-[300px] md:w-[400px]">
              <div className="relative w-[50px] h-[50px] rounded-lg bg-[#262626] overflow-hidden">
                {image ? (
                  <img 
                    src={image} 
                    alt={name} 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Grid className="w-6 h-6 text-[#8C8C8C]" />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`${dmMono.className} text-base font-medium text-white truncate`}>{name}</span>
                  <span className={`${dmMono.className} text-base font-normal text-[#8C8C8C] tracking-[2px] uppercase shrink-0`}>${ticker}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`${dmMono.className} text-xs text-[#8C8C8C] truncate`}>
                    {mint.slice(0, 6)}...{mint.slice(-4)}
                  </span>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(mint);
                    }}
                    className="text-[#8C8C8C] hover:text-white transition-colors shrink-0"
                  >
                    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M10.5 10.5H13.5V2.5H5.5V5.5M2.5 5.5H10.5V13.5H2.5V5.5Z"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="flex flex-1 items-center px-4">
              <div className="w-[150px] md:w-[200px]">
                <span className={`${dmMono.className} text-base text-[#2FD345]`}>
                  {Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    notation: "compact",
                  }).format(Number(marketCapUSD))}
                </span>
              </div>
              <div className="w-[150px] md:w-[200px] hidden md:block">
                <span className={`${dmMono.className} text-base text-white`}>
                  {Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    notation: "compact",
                  }).format(Number(liquidity || 0))}
                </span>
              </div>
              <div className="w-[120px] hidden lg:block">
                <span className={`${dmMono.className} text-base text-white`}>{holderCount || 0}</span>
              </div>
              <div className="w-[200px] hidden xl:block">
                <div className="flex items-center gap-2">
                  <div className="relative w-[120px] h-2">
                    <div className="absolute w-full h-2 bg-[#2E2E2E] rounded-full" />
                    <div 
                      className="absolute h-2 bg-gradient-to-r from-[#0F4916] to-[#2FD345] rounded-full"
                      style={{ width: `${normalizedProgress}%` }}
                    />
                  </div>
                  <span className={`${dmMono.className} text-sm text-white`}>
                    {normalizedProgress}%
                  </span>
                </div>
              </div>
              <div className="w-[120px] md:w-[150px] text-right">
                <span className={`${dmMono.className} text-base text-white truncate`}>16 mins</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
} 