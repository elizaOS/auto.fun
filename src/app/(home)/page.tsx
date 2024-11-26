"use client";

import { createCoin } from "@/utils/wallet";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useMemo } from "react";
import { validateTwitterCredentials } from "@/utils/twitter";
import { ModalType } from "../../../types/zustand/stores/modalStore.type";
import { useModalStore } from "@/components/providers/ModalProvider";
import { RoundedButton } from "@/components/common/button/RoundedButton";
import { WalletButton } from "@/components/common/button/WalletButton";
import {
  AgentDetailsForm,
  TokenMetadata,
  TwitterCredentials,
} from "../../../types/form.type";
import { useForm } from "./useForm";

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
    advancedDetailsPending,
  } = useForm();

  const { publicKey } = useWallet();

  const changeModal = useModalStore((state) => state.changeModal);
  const setModalOpen = useModalStore((state) => state.setOpen);

  const convertFormData = useCallback(async (): Promise<{
    tokenMeta: TokenMetadata;
    twitterCreds: TwitterCredentials;
    agentDetails: AgentDetailsForm;
  }> => {
    const { agentDetails, tokenMetadata, twitterCredentials } = getFormValues();

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
  }, [getFormValues]);

  const submitForm = useCallback(async () => {
    changeModal(true, ModalType.LAUNCHING_TOKEN, {});

    try {
      const { tokenMeta, twitterCreds, agentDetails } = await convertFormData();

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

      const { mintPublicKey } = await createCoin({
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
      setModalOpen(false);
    }
  }, [changeModal, convertFormData, router, setModalOpen]);

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
    <div className="flex flex-col justify-center h-full relative">
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
      <div className="flex flex-col w-full m-auto gap-7 justify-center">
        <div className="h-full flex flex-col items-center justify-center max-w-4xl mx-auto w-full gap-6">
          <div className="text-left w-5/6 text-2xl">{FormHeader}</div>
          <div className="max-h-[calc(100vh-300px)] w-5/6 rounded-[20px] border-[#03ff24] border gap-[30px] flex flex-col relative overflow-hidden">
            {advancedDetailsPending && (
              <div className="absolute inset-0 backdrop-blur-sm z-10 flex justify-center items-center">
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 40 40"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="animate-spin"
                >
                  <path
                    d="M19.9998 5.00195C17.033 5.00195 14.1329 5.88169 11.6662 7.52991C9.19947 9.17813 7.27688 11.5208 6.14157 14.2617C5.00626 17.0026 4.70921 20.0186 5.28798 22.9283C5.86676 25.838 7.29537 28.5108 9.39316 30.6086C11.4909 32.7063 14.1637 34.135 17.0734 34.7137C19.9831 35.2925 22.9991 34.9955 25.74 33.8601C28.4809 32.7248 30.8236 30.8022 32.4718 28.3355C34.12 25.8688 34.9998 22.9687 34.9998 20.002"
                    stroke="#03FF24"
                    strokeWidth="3.33333"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            )}
            <div className="w-full overflow-scroll p-6">{FormBody}</div>
          </div>

          {publicKey ? <div>{FormButton}</div> : <WalletButton />}
        </div>
      </div>
    </div>
  );
}
