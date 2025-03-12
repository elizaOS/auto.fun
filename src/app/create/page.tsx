"use client";

import { useCreateToken } from "@/utils/tokens";
import { toast } from "react-toastify";
import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { TokenMetadata, TokenMetadataForm } from "../../../types/form.type";
import { CenterFormContainer } from "@/components/common/containers/CenterFormContainer";
import { Modal } from "@/components/common/Modal";
import { useForm } from "react-hook-form";
import { TokenCreationForm } from "./TokenCreationForm";
import { AgentCard } from "@/components/agent-card";
import { AgentCardInfo } from "@/components/agent-card/AgentCardInfo";
import Link from "next/link";
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
  const tokenForm = useForm<TokenMetadataForm>({
    defaultValues: { links: {} },
    mode: "onTouched",
  });
  const formValues = tokenForm.watch();
  const creationResponse = useRef<Awaited<ReturnType<typeof createToken>>>();

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

  const { mutateAsync: createToken } = useCreateToken();

  const [tokenStatus, setTokenStatus] = useState<
    "idle" | "creating" | "created"
  >("idle");

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
    setTokenStatus("creating");

    try {
      const { tokenMeta } = await convertFormData();
      creationResponse.current = await createToken(tokenMeta);

      toast.success("Token created");
      setTokenStatus("created");
    } catch (e) {
      toast.error("Oops! Something went wrong. Please try again.");
      setTokenStatus("idle");
      throw e;
    }
  }, [convertFormData, createToken]);

  const AgentCardPreview = useCallback(
    ({
      className,
      showBuy = true,
    }: {
      className?: string;
      showBuy?: boolean;
    }) => {
      return (
        <AgentCard
          name={formValues.name}
          ticker={formValues.symbol}
          placeholderTime="0 Min"
          bondingCurveProgress={0}
          description={formValues.description}
          marketCapUSD={0}
          image={formImageUrl ?? ""}
          mint="0x0000"
          className={`!max-w-none ${className}`}
          showBuy={showBuy}
        />
      );
    },
    [formImageUrl, formValues.description, formValues.name, formValues.symbol],
  );

  return (
    <div className="flex flex-col justify-center h-full relative mt-12 w-fit mx-auto">
      <Modal
        isOpen={tokenStatus === "creating"}
        allowClose={false}
        contentClassName="w-full !p-10"
        className="!max-w-[465px]"
      >
        <Spinner />
        <div className="text-[#2fd345] text-2xl font-medium font-satoshi leading-loose mb-3.5">
          Launching Token...
        </div>
      </Modal>

      <Modal
        isOpen={tokenStatus === "created"}
        allowClose={false}
        contentClassName="w-full"
        className="!max-w-[555px]"
      >
        <div className="flex flex-col items-start self-start w-full">
          <div className="flex items-center gap-2 mb-3">
            <div className="text-[#2fd345] text-[32px] font-medium font-satoshi leading-9">
              Token Created
            </div>
            <Modal.SparkleIcon />
          </div>

          <AgentCardPreview
            className="bg-[#0F0F0F] !border-2 !border-dashed"
            showBuy={false}
          />

          <div className="mt-6 flex gap-3 w-full items-center">
            <Link
              className="py-2.5 bg-[#2e2e2e] rounded-md border border-neutral-800 text-[#2fd345] text-sm font-satoshi leading-tight flex-1 text-center"
              href={`/coin/${creationResponse.current?.mintPublicKey.toBase58()}`}
            >
              View Token
            </Link>
            <div>Or</div>
            <Link
              className="py-2.5 bg-[#2e2e2e] rounded-md border border-neutral-800 text-sm font-satoshi leading-tight flex-1 text-center"
              href={`/create-agent/${creationResponse.current?.mintPublicKey.toBase58()}`}
            >
              Create Agent
            </Link>
          </div>
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

          <AgentCardPreview />

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
