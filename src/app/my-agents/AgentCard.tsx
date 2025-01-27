import { AgentSummary } from "../../../types/components/agents/index.type";
import { AgentMedia } from "./AgentMedia";

type AgentCardProps = Partial<AgentSummary>;
export const AgentCard = ({ image_src, name, description }: AgentCardProps) => {
  return (
    <button className="h-full">
      <div className="flex flex-col bg-[#002605] p-6 rounded-2xl gap-6 h-full">
        <div className="flex justify-between items-center">
          <div className="flex gap-3 items-center">
            <AgentMedia image_src={image_src} />
            <p>{name}</p>
          </div>
          <div className={`bg-[#003C08] p-2 rounded-lg`}>Active</div>
        </div>
        <p className="line-clamp-3 opacity-40 text-left">{description}</p>
      </div>
    </button>
  );
};
