"use client";

import { useCreateToken } from "@/utils/tokens";
import { toast } from "react-toastify";
import { useCallback, useMemo, useState, useEffect } from "react";
import { TokenMetadata, TokenMetadataForm } from "../../../types/form.type";
import { CenterFormContainer } from "@/components/common/containers/CenterFormContainer";
import { Modal } from "@/components/common/Modal";
import { Spinner } from "@/components/common/Spinner";
import { useForm } from "react-hook-form";
import { TokenCreationForm } from "./TokenCreationForm";
import { useRouter } from "next/navigation";
import { AgentCard } from "@/components/agent-card";
import { AgentCardInfo } from "@/components/agent-card/AgentCardInfo";

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
  const formValues = tokenForm.watch();

  const formImageUrl = useMemo(() => {
    if (formValues.media_base64) {
      return URL.createObjectURL(formValues.media_base64);
    }
    return null;
  }, [formValues.media_base64]);

  // Cleanup effect to revoke the object URL (to avoid memory leaks)
  useEffect(() => {
    return () => {
      if (formImageUrl) {
        URL.revokeObjectURL(formImageUrl);
      }
    };
  }, [formImageUrl]);

  const router = useRouter();

  const { mutateAsync: createToken } = useCreateToken();

  const [isModalOpen, setIsModalOpen] = useState(false);

  const convertFormData = useCallback(async (): Promise<{
    tokenMeta: TokenMetadata;
  }> => {
    const tokenMetadata = tokenForm.getValues();
    const media_base64 = tokenMetadata.media_base64;

    if (tokenMetadata.links.agentLink) {
      tokenMetadata.links.agentLink =
        "https://" + tokenMetadata.links.agentLink;
    }

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
    <div className="flex flex-col justify-center h-full relative mt-12 w-fit mx-auto">
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

      <div className="rounded-md border border-neutral-800 overflow-hidden flex">
        <div className="border-r border-r-neutral-800 w-fit">
          <CenterFormContainer
            formComponent={
              <TokenCreationForm form={tokenForm} submit={submitForm} />
            }
            header="Create Token"
            description="Create your token on auto.fun. Set up your token details, add visuals, and connect social channels. You can optionally create or link an existing AI agent to your token. You can also personally allocate a portion of tokens before launch."
            borderless
          />
        </div>

        <div className="p-10">
          <div className="text-white text-xl font-medium leading-7 mb-4">
            Token Card Preview
          </div>

          <AgentCard
            name={formValues.name}
            ticker={formValues.symbol}
            placeholderTime="0 Min"
            bondingCurveProgress={0}
            description={formValues.description}
            marketCapUSD={0}
            image={formImageUrl ?? ""}
            mint="0x0000"
            className="!max-w-none"
          />

          <div className="text-white text-xl font-medium leading-7 mb-4 mt-10">
            Token Page Preview
          </div>

          <AgentCardInfo
            image={formImageUrl ?? ""}
            curveProgress={0}
            mint="0x000000000000"
            description={formValues.description ?? ""}
            name={formValues.name}
            ticker={formValues.symbol}
            reserveLamport={0}
            virtualReserves={0}
            placeholderTargetMarketCap={87_148}
            socialLinks={{
              twitter: formValues.links.twitter,
              discord: formValues.links.discord,
              telegram: formValues.links.telegram,
              website: formValues.links.website,
              agentLink: formValues.links.agentLink,
            }}
            agentName={formValues.links.agentLink ?? undefined}
          />
        </div>
      </div>
    </div>
  );
}
