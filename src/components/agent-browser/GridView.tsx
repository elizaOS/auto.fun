import { AgentCard } from "../agent-card";
import { Token } from "@/utils/tokens";

interface GridViewProps {
  tokens: Token[];
  onTokenClick: (mint: string) => void;
}

export function GridView({ tokens, onTokenClick }: GridViewProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
      {tokens.map(
        ({
          mint,
          name,
          image,
          marketCapUSD,
          ticker,
          curveProgress,
          description,
        }) => (
          <AgentCard
            key={mint}
            name={name}
            image={image}
            ticker={ticker}
            mint={mint}
            marketCapUSD={Number(marketCapUSD)}
            bondingCurveProgress={curveProgress}
            description={description}
            onClick={() => onTokenClick(mint)}
          />
        ),
      )}
    </div>
  );
}
