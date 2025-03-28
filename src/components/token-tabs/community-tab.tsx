import { Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import Button from "../button";
import { twMerge } from "tailwind-merge";

export default function CommunityTab() {
  type ICommunityTabs = "Image" | "Audio";
  const [communityTab, setCommunityTab] = useState<ICommunityTabs>("Image");

  return (
    <>
      <div className="flex flex-row">
        <Button
          onClick={() => setCommunityTab("Image")}
          className={twMerge(
            communityTab === "Image"
              ? "bg-autofun-stroke-highlight/80"
              : "bg-white/15"
          )}
        >
          Image generator
        </Button>
        <Button
          onClick={() => setCommunityTab("Audio")}
          className={twMerge(
            communityTab === "Audio"
              ? "bg-autofun-stroke-highlight/80"
              : "bg-white/15"
          )}
        >
          Audio generator
        </Button>
      </div>
      <div className="grid grid-cols-3 p-6 gap-4">
        {communityTab === "Image" ? (
          <>
            <div className="grid col-span-3 font-dm-mono text-autofun-background-action-highlight text-xl">Create a token community image by using the prompt</div>
            <div className="grid col-span-3 md:col-span-2">
              <textarea
                className="w-full font-dm-mono bg-[#0F0F0F] h-[300px] p-3 border border-neutral-800 text-white resize-none"
                maxLength={200}
                placeholder="Make me an image that looks like a dog in a wheelchair"
              />
                 <button
                    className="bg-[#2fd345] cursor-pointer p-3 font-bold border-2 text-black text-[9px] md:text-[15px] hover:bg-[#27b938] transition-colors disabled:opacity-50 disabled:bg-[#333333] disabled:hover:bg-[#333333]"
                  >
                    Generate Image
                  </button>
            </div>
            <div className="grid col-span-3 md:col-span-1">
              <div className="bg-black/20 p-4 space-y-2">
                <h1 className="mb-4 text-xl text-autofun-background-action-highlight font-dm-mono">
                  Agents
                </h1>
                {Array(4)
                  .fill(null)
                  .map((_, index) => (
                    <AgentProfile
                      name="@elizawakesup"
                      image="/degen.jpg"
                      key={index}
                    />
                  ))}
                <div className="items-center w-fit hover:text-autofun-background-action-highlight flex flex-row gap-x-1 text-white mt-4 text-base cursor-pointer">
                  <Plus size={20} />
                  Add Agent
                </div>
                <div className="place-items-center flex flex-row gap-x-1 text-white mt-4 text-base cursor-pointer">
                  <Link
                    to="/"
                    className="bg-[#2fd345] p-3 font-bold border-2 text-black text-[9px] md:text-[15px] hover:bg-[#27b938] transition-colors disabled:opacity-50 disabled:bg-[#333333] disabled:hover:bg-[#333333]"
                  >
                    Connect X account
                  </Link>
                </div>
              </div>
            </div>
          </>
        ) : communityTab === "Audio" ? (
          <div>Audio generator page coming soon!</div>
        ) : null}
      </div>
    </>
  );
}

function AgentProfile({ image, name }: { image: string; name: string }) {
  return (
    <div className="flex cursor-pointer hover:bg-white/15 hover:text-[#FFF200] flex-row space-x-3 transition-colors duration-200 ease-in-out">
      <img
        src={image}
        alt="agent-profile-image"
        className="h-[28px] w-[28px] transition-transform duration-300 ease-in-out hover:scale-110"
      />
      <h1 className="transition-colors duration-300 ease-in-out">{name}</h1>
    </div>
  );
}
