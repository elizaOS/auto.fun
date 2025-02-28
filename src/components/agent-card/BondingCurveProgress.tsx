import Link from "next/link";
import { InfoIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface BondingCurveProgressProps {
  progress: number;
  amount: number;
  _targetMarketCap: number;
  isCompleted?: boolean;
  raydiumLink?: string;
}

export function BondingCurveProgress({
  progress,
  amount,
  _targetMarketCap,
  isCompleted,
  raydiumLink
}: BondingCurveProgressProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <span className="text-[#22C55E] text-sm">
          {isCompleted ? "Completed" : `Bonding curve progress: ${progress}%`}
        </span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="hover:bg-neutral-800 p-1 rounded-lg transition-colors">
                <InfoIcon className="w-4 h-4 text-gray-400" />
              </button>
            </TooltipTrigger>
            <TooltipContent 
              side="left"
              align="start"
              className="w-[447px] min-h-[104px] p-4 bg-[#171717] border border-neutral-800"
            >
              <div className="flex flex-col gap-4">
                <p className="text-sm text-white leading-relaxed">
                  When the market cap reaches $100,000 liquidity will transition to Raydium.
                  <br />
                  Trading fees are distributed to token owners rather than being burned.
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      
      <div className="w-full bg-[#333] rounded-full h-2">
        <div
          className="bg-[#22C55E] h-2 rounded-full transition-all duration-300"
          style={{ width: `${isCompleted ? 100 : progress}%` }}
        />
      </div>

      <div className="text-xs text-gray-400">
        {isCompleted ? (
          <p>
            Raydium pool has been seeded.{" "}
            {raydiumLink && (
              <Link 
                href={raydiumLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#22C55E] hover:underline"
              >
                View on Raydium here
              </Link>
            )}
          </p>
        ) : (
          <p>
            Token graduates to Raydium at $10,000 market cap. 
            There is {amount.toFixed(2)} SOL in the bonding curve.
          </p>
        )}
      </div>
    </div>
  );
} 