import { useForm } from "react-hook-form";

import { useAgentData } from "@/utils/agent";
import { AgentUpdateFormProps } from "../../../../types/components/agents/AgentUpdateForm.type";
import { AgentDetailsForm } from "../../../../types/form.type";
import { AgentMedia } from "../AgentMedia";
import { RoundedButton } from "@/components/common/button/RoundedButton";
import { CenterFormContainer } from "@/components/common/containers/CenterFormContainer";
import { AgentDetails } from "@/components/forms/AgentDetails";
import { SkeletonForm } from "./SkeletonForm";
import { UpdateFormContainer } from "./UpdateFormContainer";
import { womboApi } from "@/utils/fetch";
import Link from "next/link";
import { useState } from "react";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";

export const AgentUpdateForm = ({
  id,
  name,
  image_src,
  onBack,
  refetchAgents,
  contractAddress,
}: AgentUpdateFormProps) => {
  const router = useRouter();
  const { data: agentData, isLoading } = useAgentData({
    variables: { id },
  });

  const [updating, setUpdating] = useState<boolean>(false);

  const agentForm = useForm<AgentDetailsForm>({
    values:
      agentData && !("unauthenticated" in agentData)
        ? {
            name: agentData.name,
            description: agentData.description || "",
            personalities: agentData.personalities,
            systemPrompt: agentData.systemPrompt ?? undefined,
            bio: agentData.bio?.join("\n") ?? undefined,
            lore: agentData.lore?.join("\n") ?? undefined,
            postExamples: agentData.postExamples?.join("\n") ?? undefined,
            adjectives: agentData.adjectives?.join("\n") ?? undefined,
            style: agentData.styleAll?.join("\n") ?? undefined,
            topics: agentData.topics?.join("\n") ?? undefined,
          }
        : undefined,
  });
  const sideButtonStyles = "p-3 bg-transparent font-medium w-full";

  if (agentData !== undefined && "unauthenticated" in agentData) {
    router.push("/");
    return null;
  }

  const updateAgent = async () => {
    setUpdating(true);
    const {
      name,
      description,
      bio,
      lore,
      postExamples,
      adjectives,
      style,
      topics,
      systemPrompt,
      personalities,
    } = agentForm.getValues();

    try {
      await womboApi.put({
        endpoint: `/agents/${id}`,
        body: {
          name,
          description,
          bio: bio?.split("\n"),
          lore: lore?.split("\n"),
          postExamples: postExamples?.split("\n"),
          adjectives: adjectives?.split("\n"),
          styleAll: style?.split("\n"),
          topics: topics?.split("\n"),
          systemPrompt,
          personalities,
        },
      });
      await refetchAgents();
      toast.success("AI Agent Updated!");
    } catch (err) {
      console.error(err);
      toast.error("Update failed. Please try again");
    } finally {
      setUpdating(false);
    }
  };

  if (isLoading || !agentData) {
    return <SkeletonForm onBack={onBack} />;
  }

  return (
    <UpdateFormContainer onBack={onBack}>
      <div className="inline-block relative">
        <div className="flex flex-col gap-6 absolute top-6 left-[-25%]">
          <div className="p-4 flex bg-[#002605] rounded-xl items-center justify-between">
            <div className="flex gap-3 items-center">
              <AgentMedia image_src={image_src} />
              <p>{name}</p>
            </div>

            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
            >
              <g clipPath="url(#clip0_544_1531)">
                <path
                  d="M10 19.1998C4.92725 19.1998 0.800049 15.0726 0.800049 9.9998C0.800049 4.927 4.92725 0.799805 10 0.799805C15.0728 0.799805 19.2 4.927 19.2 9.9998C19.2 15.0726 15.0728 19.1998 10 19.1998Z"
                  fill="#03FF24"
                />
              </g>
              <defs>
                <clipPath id="clip0_544_1531">
                  <rect width="20" height="20" fill="white" />
                </clipPath>
              </defs>
            </svg>
          </div>
          <div className="flex flex-col gap-4">
            <Link
              href={`https://pump.fun/coin/${contractAddress}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <RoundedButton className={sideButtonStyles} variant="outlined">
                View Token on pump.fun
              </RoundedButton>
            </Link>
            <Link
              href={`https://x.com/${agentData.twitterUsername}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <RoundedButton className={sideButtonStyles} variant="outlined">
                View Agent on X / Twitter
              </RoundedButton>
            </Link>
          </div>
        </div>

        <CenterFormContainer
          formComponent={
            <AgentDetails form={agentForm} mode="update" loading={updating} />
          }
          submitButton={
            <RoundedButton
              className="font-medium p-3"
              onClick={updateAgent}
              disabled={updating}
            >
              Update Agent
            </RoundedButton>
          }
        />
      </div>
    </UpdateFormContainer>
  );
};
