import { AgentSummary } from "../../../types/components/agents/index.type";
import { AgentMedia } from "./AgentMedia";
import Link from "next/link";
import { useRouter } from "next/navigation";
type AgentCardProps = Partial<AgentSummary>;
export const AgentCard = ({
  image_src,
  name,
  description,
  _id,
}: AgentCardProps) => {
  const router = useRouter();
  return (
    <div
      className="flex flex-col bg-[#171717] p-6 rounded-xl gap-6 max-w-[420px] w-full border-solid border-[1px] border-[#03FF24]/15 cursor-pointer hover:border-[#03FF24]/50"
      onClick={() => router.push(`/my-agents/${_id}`)}
    >
      <div className="flex justify-between items-center">
        <div className="flex gap-3 items-center">
          <AgentMedia image_src={image_src} />
          <Link href={`/my-agents/${_id}`}>
            <p className="text-lg">{name}</p>
          </Link>
        </div>
        <div
          className={`bg-[#03FF24]/15 p-1 px-3 rounded-lg border-[1px] border-[#03FF24]/40 text-[#03FF24]`}
        >
          Active
        </div>
      </div>
      <p className="line-clamp-3 opacity-40 text-left ">{description}</p>
    </div>
  );
};
