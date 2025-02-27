import { Token } from "@/utils/tokens";
import { DM_Mono } from 'next/font/google';

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
    <div className="flex flex-col gap-4">
      <div className={`flex items-center w-full h-[20px] ${dmMono.className} text-[14px] leading-5 tracking-[2px] uppercase text-[#A6A6A6]`}>
        <div className="w-[596px]">AI AGENTS</div>
        <div className="flex flex-1 items-center">
          <div className="flex-1 flex items-center gap-1">Market Cap</div>
          <div className="flex-1 flex items-center gap-1">24h Volume</div>
          <div className="flex-1 flex items-center gap-1">Holders Count</div>
          <div className="flex-1 flex items-center gap-1">Bonding curve</div>
          <div className="w-[200px] flex justify-end">Creation time</div>
        </div>
      </div>

      {tokens.map(({
        mint,
        name,
        image,
        marketCapUSD,
        ticker,
        liquidity,
        holderCount,
      }) => (
        <div 
          key={mint}
          onClick={() => onTokenClick(mint)}
          className="flex w-full h-[74px] bg-[#171717] border border-[#262626] rounded-[6px] cursor-pointer hover:border-[#2FD345]/50 transition-colors"
        >
          <div className="flex items-center gap-4 px-4 w-[596px]">
            <div 
              className="w-[50px] h-[50px] rounded-lg bg-cover bg-center"
              style={{ 
                backgroundImage: `url(${image}), url(/Checker.png)`,
                backgroundBlendMode: 'normal, multiply'
              }}
            />
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className={`${dmMono.className} text-base font-medium text-white`}>{name}</span>
                <span className={`${dmMono.className} text-base font-normal text-[#8C8C8C] tracking-[2px] uppercase`}>${ticker}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`${dmMono.className} text-xs text-[#8C8C8C]`}>
                  {mint.slice(0, 6)}...{mint.slice(-4)}
                </span>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(mint);
                  }}
                  className="text-[#8C8C8C] hover:text-white transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M10.5 10.5H13.5V2.5H5.5V5.5M2.5 5.5H10.5V13.5H2.5V5.5Z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-1 items-center px-4">
            <div className="flex-1">
              <span className={`${dmMono.className} text-base text-[#2FD345]`}>
                {Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                  notation: "compact",
                }).format(Number(marketCapUSD))}
              </span>
            </div>
            <div className="flex-1">
              <span className={`${dmMono.className} text-base text-white`}>
                {Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                  notation: "compact",
                }).format(Number(liquidity || 0))}
              </span>
            </div>
            <div className="flex-1">
              <span className={`${dmMono.className} text-base text-white`}>{holderCount || 0}</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div className="relative w-[161px] h-2">
                  <div className="absolute w-full h-2 bg-[#2E2E2E] rounded-full" />
                  <div 
                    className="absolute h-2 bg-gradient-to-r from-[#0F4916] to-[#2FD345] rounded-full"
                    style={{ width: '28%' }}
                  />
                </div>
                <span className={`${dmMono.className} text-sm text-white`}>28%</span>
              </div>
            </div>
            <div className="w-[200px] flex justify-end">
              <span className={`${dmMono.className} text-base text-white`}>16 mins Ago</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
} 