import { Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import Button from "../button";
import { twMerge } from "tailwind-merge";
import SkeletonImage from "../skeleton-image";
import { Badge } from "../ui/badge";

export default function CommunityTab() {
  type ICommunityTabs = "Image" | "Audio";
  const [communityTab, setCommunityTab] = useState<ICommunityTabs>("Image");

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="flex flex-row">
        <Button
          variant={communityTab === "Image" ? "tab" : "primary"}
          onClick={() => setCommunityTab("Image")}
        >
          Image
        </Button>
        <Button
          variant={communityTab === "Audio" ? "tab" : "primary"}
          // onClick={() => setCommunityTab("Audio")}
          disabled
        >
          Audio
        </Button>
      </div>
      <div className="flex gap-4">
        {communityTab === "Image" ? (
          <div className="flex flex-col gap-4 w-full">
            <div className="font-dm-mono text-autofun-background-action-highlight text-xl">
              Input
            </div>

            <div className="flex flex-col md:flex-row gap-4 w-full">
              <div className="flex flex-col gap-4 w-full grow">
                <textarea
                  className="w-full font-dm-mono bg-[#0F0F0F] h-[300px] p-3 border border-neutral-800 text-white resize-none"
                  maxLength={200}
                  placeholder="Make me an image that looks like a dog in a wheelchair"
                />
                <div>
                  <Button>Generate Image</Button>
                </div>
              </div>

              {/* <div className="bg-black/20 p-4 space-y-2 w-full md:w-3/6 border h-fit">
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
                    className="bg-[#03FF24] p-3 font-bold border-2 text-black text-[12px] md:text-[15px] hover:bg-[#27b938] transition-colors disabled:opacity-50 disabled:bg-[#333333] disabled:hover:bg-[#333333]"
                  >
                    Connect X account
                  </Link>
                </div>
              </div> */}
            </div>

            <div className="flex flex-col gap-4 border p-4">
              <div className="flex items-center gap-2.5">
                <div className="font-dm-mono text-autofun-background-action-highlight text-xl">
                  Result
                </div>
                <div className="flex items-center gap-2.5">
                  <Badge variant="default">Processing</Badge>
                  <Badge variant="success">Processed</Badge>
                  <Badge variant="destructive">Failed</Badge>
                </div>
              </div>
              <SkeletonImage
                src="/DEMO.png"
                width={1024}
                height={1024}
                alt="generated_image"
                className="xl:w-1/2 mx-auto"
              />
              <div className="w-full flex items-center justify-end">
                <Button size="small">Share on X</Button>
              </div>
            </div>
          </div>
        ) : communityTab === "Audio" ? (
          <div>Audio generator page coming soon!</div>
        ) : null}
      </div>
    </div>
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
