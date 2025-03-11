"use client";

import { useCreateAgent, useGenerateAgentDetails } from "@/utils/agent";
import { useCallback, useState } from "react";
import {
  AgentDetailsForm,
  TwitterCredentials,
  TwitterDetailsForm,
  AgentDetails as AgentDetailsType,
} from "@/../types/form.type";
import { validateTwitterCredentials } from "@/utils/twitter";
import { toast } from "react-toastify";
import { Modal } from "@/components/common/Modal";
import { Spinner } from "@/components/common/Spinner";
import { CenterFormContainer } from "@/components/common/containers/CenterFormContainer";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { AgentDetails } from "@/components/forms/AgentDetails";
import Link from "next/link";
import { AgentCard } from "@/components/agent-card";
import { useToken } from "@/utils/tokens";

const AgentCreatedModal = ({
  isOpen,
  tokenId,
  twitterUsername,
}: {
  isOpen: boolean;
  tokenId: string;
  twitterUsername: string;
}) => {
  const { data: token } = useToken({ variables: tokenId });

  return (
    <Modal
      isOpen={isOpen}
      allowClose={false}
      contentClassName="w-full"
      className="!max-w-[555px]"
    >
      {token ? (
        <div className="flex flex-col items-start self-start w-full">
          <div className="flex items-center gap-2 mb-3">
            <div className="text-[#2fd345] text-[32px] font-medium font-satoshi leading-9">
              Agent Created
            </div>
            <Modal.SparkleIcon />
          </div>

          <AgentCard
            name={token.name}
            ticker={token.ticker}
            creationDate={token.createdAt}
            bondingCurveProgress={token.curveProgress}
            description={token.description}
            marketCapUSD={token.marketCapUSD}
            image={token.image}
            mint={token.mint}
            className={`!max-w-none !bg-[#0f0f0f] !border-2 !border-dashed`}
            showBuy={false}
          />

          <div className="mt-6 flex flex-col gap-2.5 w-full">
            <Link
              className="py-2.5 bg-[#2e2e2e] rounded-md border border-neutral-800 text-[#2fd345] text-sm font-satoshi leading-tight flex-1 text-center"
              href={`/coin/${token.mint}`}
            >
              View Token
            </Link>
            <a
              className="py-2.5 rounded-md border border-neutral-800 text-sm font-satoshi leading-tight flex-1 text-center flex justify-center gap-2 text-[#8c8c8c]"
              href={`https://x.com/${twitterUsername}`}
              target="_blank"
            >
              View AI Agent on Twitter{" "}
              <svg
                width="19"
                height="17"
                viewBox="0 0 19 17"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M14.6761 0H17.4362L11.4061 7.20103L18.5 17H12.9456L8.59512 11.057L3.61723 17H0.855444L7.30517 9.29769L0.5 0H6.19545L10.1279 5.43215L14.6761 0ZM13.7073 15.2738H15.2368L5.36441 1.63549H3.7232L13.7073 15.2738Z"
                  fill="#8C8C8C"
                />
              </svg>
            </a>
          </div>
        </div>
      ) : (
        <Spinner />
      )}
    </Modal>
  );
};

export default function CreateAgentPage() {
  const params = useParams();

  const tokenId = params.tokenId as string;

  const agentForm = useForm<AgentDetailsForm>();
  const twitterForm = useForm<TwitterDetailsForm>();
  const twitterUsername = twitterForm.watch("twitter_username");

  const [agentStatus, setAgentStatus] = useState<
    "idle" | "creating" | "created"
  >("idle");

  const { mutateAsync: generateAgentDetails } = useGenerateAgentDetails();
  const { mutateAsync: createAgent } = useCreateAgent();

  const getFormValues = useCallback(() => {
    const twitterCredentials = twitterForm.getValues();
    const agentDetails = agentForm.getValues();

    return { twitterCredentials, agentDetails };
  }, [agentForm, twitterForm]);

  const convertFormData = useCallback(async (): Promise<{
    twitterCreds: TwitterCredentials;
    agentDetails: AgentDetailsType;
  }> => {
    let { agentDetails, twitterCredentials } = getFormValues();

    if (Object.keys(agentDetails).length) {
      const filledAgentDetails = await generateAgentDetails({
        inputs: agentForm.getValues(),
      });
      agentForm.reset(filledAgentDetails);
      ({ agentDetails, twitterCredentials } = getFormValues());
    }

    return {
      twitterCreds: {
        username: twitterCredentials.twitter_username,
        email: twitterCredentials.twitter_email,
        password: twitterCredentials.twitter_password,
      },
      agentDetails,
    };
  }, [agentForm, generateAgentDetails, getFormValues]);

  const submitForm = useCallback(async () => {
    setAgentStatus("creating");
    const {
      twitter_email: email,
      twitter_password: password,
      twitter_username: username,
    } = getFormValues().twitterCredentials;

    if (email && password && username) {
      const invalidCredentials =
        "Invalid Twitter credentials. Please try again.";
      const unknownError = "Oops! Something went wrong. Please try again.";

      switch (
        await validateTwitterCredentials({
          email,
          password,
          username,
        })
      ) {
        case "valid":
          break;
        case "invalid":
          toast.error(invalidCredentials);
          setAgentStatus("idle");
          return;
        case "unknown_error":
          toast.error(unknownError);
          setAgentStatus("idle");
          return;
      }

      try {
        const { twitterCreds, agentDetails } = await convertFormData();
        await createAgent({
          twitter_credentials: twitterCreds,
          agent_metadata: agentDetails,
          tokenId,
        });

        setAgentStatus("created");
      } catch {
        toast.error("Oops! Something went wrong. Please try again.");
        setAgentStatus("idle");
      }
    }
  }, [convertFormData, createAgent, getFormValues, tokenId]);

  return (
    <div className="flex flex-col justify-center h-full relative mt-12">
      <Modal
        isOpen={agentStatus === "creating"}
        allowClose={false}
        contentClassName="w-full !p-10"
        className="!max-w-[465px]"
      >
        <Spinner />
        <div className="text-[#2fd345] text-2xl font-medium font-satoshi leading-loose mb-3.5">
          Launching Agent...
        </div>
      </Modal>

      <AgentCreatedModal
        isOpen={agentStatus === "created"}
        tokenId={tokenId}
        twitterUsername={twitterUsername}
      />

      <CenterFormContainer
        className="max-w-[830px]"
        formComponent={
          <form>
            <div className="text-[#2fd345] text-[32px] font-medium mb-3.5">
              Create Agent
            </div>
            <div className="text-[#8c8c8c] mb-6">
              Create your AI agent to represent your token across the platform.
              Connect the agent to X. Define its personality, behavior, and
              communication style.
            </div>
            <AgentDetails
              form={agentForm}
              twitterForm={twitterForm}
              mode="create"
              submit={submitForm}
              disabled={
                !agentForm.formState.isValid || !twitterForm.formState.isValid
              }
            />
          </form>
        }
      />
    </div>
  );
}
