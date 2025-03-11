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
import { WalletButton } from "@/components/common/button/WalletButton";
import { RoundedButton } from "@/components/common/button/RoundedButton";
import { useWallet } from "@solana/wallet-adapter-react";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { AgentDetails } from "@/components/forms/AgentDetails";

export default function CreateAgentPage() {
  const { publicKey } = useWallet();
  const params = useParams();
  const router = useRouter();

  const tokenId = params.tokenId as string;

  const agentForm = useForm<AgentDetailsForm>();
  const twitterForm = useForm<TwitterDetailsForm>();

  const [isModalOpen, setIsModalOpen] = useState(false);

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
    setIsModalOpen(true);

    try {
      const { twitterCreds, agentDetails } = await convertFormData();

      if (
        twitterCreds.email &&
        twitterCreds.password &&
        twitterCreds.username
      ) {
        switch (await validateTwitterCredentials(twitterCreds)) {
          case "valid":
            break;
          case "invalid":
            toast.error("Invalid Twitter credentials. Please try again.");
            return;
          case "unknown_error":
            toast.error("Oops! Something went wrong. Please try again.");
            return;
        }
      }

      await createAgent({
        twitter_credentials: twitterCreds,
        agent_metadata: agentDetails,
        tokenId,
      });

      router.push(
        `/success?twitterHandle=${twitterCreds.username}&mintPublicKey=${tokenId}`,
      );
    } catch (e) {
      toast.error("Oops! Something went wrong. Please try again.");
      throw e;
    } finally {
      setIsModalOpen(false);
    }
  }, [convertFormData, createAgent, router, tokenId]);

  return (
    <div className="flex flex-col justify-center h-full relative mt-12">
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Launching agent"
        allowClose={false}
      >
        <div className="flex flex-col items-center p-6 gap-6">
          <Spinner />
          <p className="p-3 bg-[#03FF24] text-black rounded-lg font-bold">
            Launching Agent...
          </p>
        </div>
      </Modal>

      <CenterFormContainer
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
            />
          </form>
        }
        submitButton={
          publicKey ? (
            <div className="flex flex-col items-center gap-6">
              <p>*NOTE* this is your Agent&apos;s login information</p>
              <RoundedButton
                className="px-6 py-3"
                onClick={submitForm}
                disabled={
                  !agentForm.formState.isValid || !twitterForm.formState.isValid
                }
              >
                Launch agent
              </RoundedButton>
            </div>
          ) : (
            <WalletButton />
          )
        }
      />
    </div>
  );
}
