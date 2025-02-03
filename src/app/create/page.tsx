"use client";

import { useCreateAgent } from "@/utils/agent";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useMemo, useState } from "react";
import { validateTwitterCredentials } from "../../utils/twitter";
import { RoundedButton } from "@/components/common/button/RoundedButton";
import { WalletButton } from "@/components/common/button/WalletButton";
import {
  AgentDetails,
  TokenMetadata,
  TwitterCredentials,
} from "../../../types/form.type";
import { useForm } from "./useForm";
import { useGenerateAgentDetails } from "@/utils/agent";
import { CenterFormContainer } from "@/components/common/containers/CenterFormContainer";
import { Modal } from "@/components/common/Modal";
import { Spinner } from "@/components/common/Spinner";

export type FormStep = "token" | "agent" | "twitter";

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = (error) => reject(error);
  });
}

export default function TransactionSignPage() {
  const router = useRouter();

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

  const { mutateAsync: generateAgentDetails } = useGenerateAgentDetails();
  const createAgent = useCreateAgent();
  const { publicKey } = useWallet();

  const [isModalOpen, setIsModalOpen] = useState(false);

  const convertFormData = useCallback(async (): Promise<{
    tokenMeta: TokenMetadata;
    twitterCreds: TwitterCredentials;
    agentDetails: AgentDetails;
  }> => {
    let { agentDetails, tokenMetadata, twitterCredentials } = getFormValues();

    if (Object.keys(agentDetails).length) {
      const filledAgentDetails = await generateAgentDetails({
        inputs: agentForm.getValues(),
      });
      agentForm.reset(filledAgentDetails);
      ({ agentDetails, tokenMetadata, twitterCredentials } = getFormValues());
    }

    const media_base64 = tokenMetadata.media_base64;

    return {
      tokenMeta: {
        ...tokenMetadata,
        initial_sol: tokenMetadata.initial_sol
          ? parseFloat(tokenMetadata.initial_sol)
          : 0,
        image_base64: await toBase64(media_base64),
      },
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
      const { tokenMeta, twitterCreds, agentDetails } = await convertFormData();

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

      const { mintPublicKey } = await createAgent({
        token_metadata: tokenMeta,
        twitter_credentials: twitterCreds,
        agentDetails,
      });

      router.push(
        `/success?twitterHandle=${twitterCreds.username}&mintPublicKey=${mintPublicKey}`,
      );
    } catch {
      toast.error("Oops! Something went wrong. Please try again.");
    } finally {
      setIsModalOpen(false);
    }
  }, [convertFormData, createAgent, router]);

  const FormHeader = useMemo(() => {
    switch (currentStep) {
      case "token":
        return <h1>Step 1. Enter Token Details</h1>;
      case "agent":
        return <h1>Step 2. Enter Agent Details</h1>;
      case "twitter":
        return <h1>Step 3. Connect Agent&apos;s Twitter Account</h1>;
    }
  }, [currentStep]);

  const FormButton = useMemo(() => {
    switch (currentStep) {
      case "token":
        return (
          <>
            <div className="flex items-center gap-6">
              <RoundedButton
                className="px-6 py-3"
                disabled={!canGoNext}
                onClick={submitForm}
              >
                Launch token
              </RoundedButton>
              <RoundedButton
                className="px-6 py-3"
                onClick={next}
                disabled={!canGoNext}
              >
                Add agent
              </RoundedButton>
            </div>
          </>
        );
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
            <p>*NOTE* this is your Agent’s login information</p>
            <RoundedButton
              className="px-6 py-3"
              disabled={!canGoNext}
              onClick={submitForm}
            >
              Launch token
            </RoundedButton>
          </div>
        );
    }
  }, [canGoNext, currentStep, next, submitForm]);

  return (
    <div className="flex flex-col justify-center h-full relative mt-12">
      {/* TODO: update UI */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Launching token"
        allowClose={false}
      >
        <div className="flex flex-col items-center p-6 gap-6">
          <Spinner />
          <p className="p-3 bg-[#03FF24] text-black rounded-lg font-bold">
            Launching Token...
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
