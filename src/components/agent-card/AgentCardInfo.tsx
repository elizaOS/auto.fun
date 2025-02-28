import { BondingCurveProgress } from "@/components/agent-card/BondingCurveProgress";
import Skeleton from "react-loading-skeleton";

interface AgentCardInfoProps {
  name: string;
  ticker: string;
  image: string;
  description: string;
  bondingCurveProgress: number;
  bondingCurveAmount: number;
  targetMarketCap: number;
  isCompleted?: boolean;
  raydiumLink?: string;
  isLoading?: boolean;
}

export function AgentCardInfo({
  name,
  ticker,
  image,
  description,
  bondingCurveProgress,
  bondingCurveAmount,
  targetMarketCap,
  isCompleted,
  raydiumLink,
  isLoading
}: AgentCardInfoProps) {
  if (isLoading) {
    return (
      <div className="w-[587px] h-fit bg-[#171717] rounded-[6px] border border-neutral-800 p-4 flex flex-col gap-6">
        <div className="flex items-start gap-6">
          <div className="w-[120px] h-[120px] rounded-xl overflow-hidden">
            <Skeleton height={120} width={120} baseColor="#262626" highlightColor="#404040" />
          </div>
          <div className="flex flex-col gap-2 flex-1">
            <Skeleton height={24} width={200} baseColor="#262626" highlightColor="#404040" />
            <Skeleton height={60} baseColor="#262626" highlightColor="#404040" />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <Skeleton height={20} width={150} baseColor="#262626" highlightColor="#404040" />
            <Skeleton height={16} width={16} circle baseColor="#262626" highlightColor="#404040" />
          </div>
          <Skeleton height={8} baseColor="#262626" highlightColor="#404040" />
          <Skeleton height={16} baseColor="#262626" highlightColor="#404040" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-[587px] h-fit bg-[#171717] rounded-[6px] border border-neutral-800 p-4 flex flex-col gap-6">
      <div className="flex items-start gap-6">
        <img
          src={image}
          alt={name}
          className="w-[120px] h-[120px] rounded-xl object-cover"
        />
        <div className="flex flex-col gap-2 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-[#22C55E] font-bold text-xl">
              {name} (${ticker})
            </h1>
          </div>
          <p className="text-[#a1a1a1] text-sm break-words line-clamp-3">
            {description}
          </p>
        </div>
      </div>

      <BondingCurveProgress 
        progress={bondingCurveProgress}
        amount={bondingCurveAmount}
        _targetMarketCap={targetMarketCap}
        isCompleted={isCompleted}
        raydiumLink={raydiumLink}
      />
    </div>
  );
} 