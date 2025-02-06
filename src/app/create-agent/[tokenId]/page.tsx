"use client";

import { useForm } from "@/app/create-agent/[tokenId]/useForm";
import { useCreateAgent, useGenerateAgentDetails } from "@/utils/agent";
import { useCallback, useMemo, useState } from "react";
import { AgentDetails, TwitterCredentials } from "@/../types/form.type";
import { validateTwitterCredentials } from "@/utils/twitter";
import { toast } from "react-toastify";
import { Modal } from "@/components/common/Modal";
import { Spinner } from "@/components/common/Spinner";
import { CenterFormContainer } from "@/components/common/containers/CenterFormContainer";
import { WalletButton } from "@/components/common/button/WalletButton";
import { RoundedButton } from "@/components/common/button/RoundedButton";
import { useWallet } from "@solana/wallet-adapter-react";
import { useParams } from "next/navigation";

export default function CreateAgentPage() {
  const { publicKey } = useWallet();
  const params = useParams();

  const tokenId = params.tokenId as string;

  const {
    currentStep,
    back,
    next,
    FormBody,
    getFormValues,
    canGoNext,
    canGoBack,
    agentForm,
  } = useForm();

  const [isModalOpen, setIsModalOpen] = useState(false);

  const { mutateAsync: generateAgentDetails } = useGenerateAgentDetails();
  const { mutateAsync: createAgent } = useCreateAgent();

  const convertFormData = useCallback(async (): Promise<{
    twitterCreds: TwitterCredentials;
    agentDetails: AgentDetails;
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

      //   TODO: handle success
      //   router.push(
      //     `/success?twitterHandle=${twitterCreds.username}&mintPublicKey=${mintPublicKey}`,
      //   );
    } catch {
      toast.error("Oops! Something went wrong. Please try again.");
    } finally {
      setIsModalOpen(false);
    }
  }, [convertFormData, createAgent, tokenId]);

  const FormButton = useMemo(() => {
    switch (currentStep) {
      case "agent":
        return (
          <RoundedButton
            className="px-6 py-3"
            onClick={next}
            disabled={!canGoNext}
          >
            Next
          </RoundedButton>
        );
      case "twitter":
        return (
          <div className="flex flex-col items-center gap-6">
            <p>*NOTE* this is your Agent&apos;s login information</p>
            <RoundedButton
              className="px-6 py-3"
              disabled={!canGoNext}
              onClick={submitForm}
            >
              Launch agent
            </RoundedButton>
          </div>
        );
    }
  }, [canGoNext, currentStep, next, submitForm]);

  const FormHeader = useMemo(() => {
    switch (currentStep) {
      case "agent":
        return <h1>Step 1. Enter Agent Details</h1>;
      case "twitter":
        return <h1>Step 2. Connect Agent&apos;s Twitter Account</h1>;
    }
  }, [currentStep]);

  return (
    <div className="flex flex-col justify-center h-full relative mt-12">
      {/* TODO: update UI */}
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

      {canGoBack && (
        <button className="absolute top-4 left-[5%]" onClick={back}>
          <svg
            width="44"
            height="44"
            viewBox="0 0 44 44"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect
              x="0.5"
              y="0.5"
              width="43"
              height="43"
              rx="11.5"
              stroke="#03FF24"
            />
            <path
              d="M16.1665 21.9993H27.8332M16.1665 21.9993L19.4998 25.3327M16.1665 21.9993L19.4998 18.666"
              stroke="#03FF24"
              strokeWidth="1.66667"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      <CenterFormContainer
        formComponent={FormBody}
        header={FormHeader}
        submitButton={publicKey ? <div>{FormButton}</div> : <WalletButton />}
      />
    </div>
  );
}
