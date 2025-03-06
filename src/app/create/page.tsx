"use client";

import { useCreateToken } from "@/utils/tokens";
import { toast } from "react-toastify";
import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useState } from "react";
import { RoundedButton } from "@/components/common/button/RoundedButton";
import { WalletButton } from "@/components/common/button/WalletButton";
import { TokenMetadata, TokenMetadataForm } from "../../../types/form.type";
import { CenterFormContainer } from "@/components/common/containers/CenterFormContainer";
import { Modal } from "@/components/common/Modal";
import { Spinner } from "@/components/common/Spinner";
import { useForm } from "react-hook-form";
import { TokenCreationForm } from "./TokenCreationForm";
import { useRouter } from "next/navigation";

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
  const tokenForm = useForm<TokenMetadataForm>({
    defaultValues: { links: {} },
    mode: "onTouched",
  });
  const router = useRouter();

  const { mutateAsync: createToken } = useCreateToken();

  const { publicKey } = useWallet();

  const [isModalOpen, setIsModalOpen] = useState(false);

  const convertFormData = useCallback(async (): Promise<{
    tokenMeta: TokenMetadata;
  }> => {
    const tokenMetadata = tokenForm.getValues();
    const media_base64 = tokenMetadata.media_base64;

    return {
      tokenMeta: {
        ...tokenMetadata,
        initial_sol: tokenMetadata.initial_sol
          ? parseFloat(tokenMetadata.initial_sol)
          : 0,
        image_base64: await toBase64(media_base64),
      },
    };
  }, [tokenForm]);

  const submitForm = useCallback(async () => {
    setIsModalOpen(true);

    try {
      const { tokenMeta } = await convertFormData();
      await createToken(tokenMeta);

      toast.success("Token created");
      router.push("/");
    } catch (e) {
      toast.error("Oops! Something went wrong. Please try again.");
      throw e;
    } finally {
      setIsModalOpen(false);
    }
  }, [convertFormData, createToken, router]);

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

      <CenterFormContainer
        formComponent={<TokenCreationForm form={tokenForm} />}
        header="Create token"
        description="Create your token on auto.fun. Set up your token details, add visuals, and connect social channels. You can optionally create or link an existing AI agent to your token. You can also personally allocate a portion of tokens before launch."
        submitButton={
          publicKey ? (
            <RoundedButton
              className="px-6 py-3"
              disabled={!tokenForm.formState.isValid}
              onClick={submitForm}
            >
              Launch token
            </RoundedButton>
          ) : (
            <WalletButton />
          )
        }
      />
    </div>
  );
}
