import Image from "next/image";
import { AgentData } from "../../../types/components/agents/index.type";

export const AgentCard = ({
  mediaSrc,
  name,
  isActive,
  description,
}: AgentData) => {
  return (
    <div className="flex flex-col bg-[#002605] p-6 rounded-2xl gap-6">
      <div className="flex justify-between items-center">
        <div className="flex gap-3 items-center">
          <Image width={45} height={45} src={mediaSrc} alt="agent media" />
          <p>{name}</p>
        </div>
        <div
          className={`bg-[#003C08] p-2 rounded-lg ${!isActive ? "text-[#FF0000]" : ""}`}
        >
          {isActive ? "Active" : "Inactive"}
        </div>
      </div>
      <p className="line-clamp-3 opacity-40">{description}</p>
    </div>
  );
};
