import { Plus } from "lucide-react";
import { Link } from "react-router";

export default function CommunityTab() {
  return (
    <div className="grid grid-cols-3 p-6 gap-4">
        <div className="grid col-span-3">
            Image prompt
        </div>
      <div className="grid col-span-3 bg-red-500 md:col-span-2">
        <textarea
          className="w-full bg-[#0F0F0F]  h-full p-3 border border-neutral-800 text-white resize-none"
          maxLength={200}
        />
      </div>
      <div className="grid  col-span-1">
        <div className="space-y-2">
            <h1 className="mb-4 text-xl text-autofun-background-action-highlight font-dm-mono">Agents</h1>
          {Array(4)
            .fill(null)
            .map((_, index) => (
              <AgentProfile
                name={"@elizawakesup"}
                image="/degen.jpg"
                key={index}
              />
            ))}
          <div className="items-center flex flex-row gap-x-1 text-white mt-4 text-base cursor-pointer">
            <Plus size={20} />
            Add Agent
          </div>
          <div className="place-items-center flex flex-row gap-x-1 text-white mt-4 text-base cursor-pointer">
                <Link
                to={"/"}
                className="bg-[#2fd345] p-3 font-bold border-2 text-black text-[9px] md:text-[15px] hover:bg-[#27b938] transition-colors disabled:opacity-50 disabled:bg-[#333333] disabled:hover:bg-[#333333]"
                >
                Connect X account
                </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentProfile({ image, name }: { image: string; name: string }) {
  return (
    <div className="flex cursor-pointer hover:bg-white/15 hover:text-[#FFF200] flex-row space-x-3">
      <img
        src={image}
        alt="agent-profile-image"
        className="h-[28px] w-[28px]"
      />
      <h1 className="">{name}</h1>
    </div>
  );
}
