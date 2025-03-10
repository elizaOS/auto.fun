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

export type FormStep = "token" | "agent" | "twitter";

const SparkleIcon = () => {
  return (
    <svg
      width="24"
      height="25"
      viewBox="0 0 24 25"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clipPath="url(#clip0_1903_939)">
        <path
          d="M11.4847 9.87021C11.6497 9.37521 12.3487 9.37521 12.5137 9.87021L13.4812 12.7757C13.6942 13.4144 14.053 13.9947 14.5292 14.4707C15.0054 14.9466 15.5859 15.3051 16.2247 15.5177L19.1287 16.4852C19.6237 16.6502 19.6237 17.3492 19.1287 17.5142L16.2232 18.4817C15.5845 18.6947 15.0042 19.0535 14.5283 19.5297C14.0523 20.0059 13.6938 20.5864 13.4812 21.2252L12.5137 24.1292C12.4782 24.2376 12.4093 24.332 12.3169 24.3989C12.2245 24.4658 12.1133 24.5019 11.9992 24.5019C11.8851 24.5019 11.774 24.4658 11.6816 24.3989C11.5892 24.332 11.5203 24.2376 11.4847 24.1292L10.5172 21.2237C10.3044 20.5852 9.94585 20.005 9.46992 19.529C8.99399 19.0531 8.41377 18.6945 7.77523 18.4817L4.86973 17.5142C4.76134 17.4786 4.66695 17.4097 4.60003 17.3173C4.53311 17.225 4.49708 17.1138 4.49708 16.9997C4.49708 16.8856 4.53311 16.7745 4.60003 16.6821C4.66695 16.5897 4.76134 16.5208 4.86973 16.4852L7.77523 15.5177C8.41377 15.3049 8.99399 14.9463 9.46992 14.4704C9.94585 13.9945 10.3044 13.4142 10.5172 12.7757L11.4847 9.87021ZM5.69023 2.22171C5.71174 2.15675 5.75317 2.10022 5.80864 2.06016C5.86411 2.02009 5.9308 1.99853 5.99923 1.99853C6.06765 1.99853 6.13434 2.02009 6.18981 2.06016C6.24528 2.10022 6.28672 2.15675 6.30823 2.22171L6.88873 3.96471C7.14823 4.74171 7.75723 5.35071 8.53423 5.61021L10.2772 6.19071C10.3422 6.21222 10.3987 6.25365 10.4388 6.30912C10.4788 6.36459 10.5004 6.43128 10.5004 6.49971C10.5004 6.56813 10.4788 6.63482 10.4388 6.69029C10.3987 6.74576 10.3422 6.7872 10.2772 6.80871L8.53423 7.38921C8.15101 7.51688 7.8028 7.73205 7.51719 8.01767C7.23157 8.30329 7.0164 8.6515 6.88873 9.03471L6.30823 10.7777C6.28672 10.8427 6.24528 10.8992 6.18981 10.9393C6.13434 10.9793 6.06765 11.0009 5.99923 11.0009C5.9308 11.0009 5.86411 10.9793 5.80864 10.9393C5.75317 10.8992 5.71174 10.8427 5.69023 10.7777L5.10973 9.03471C4.98205 8.6515 4.76688 8.30329 4.48127 8.01767C4.19565 7.73205 3.84744 7.51688 3.46423 7.38921L1.72123 6.80871C1.65627 6.7872 1.59974 6.74576 1.55968 6.69029C1.51961 6.63482 1.49805 6.56813 1.49805 6.49971C1.49805 6.43128 1.51961 6.36459 1.55968 6.30912C1.59974 6.25365 1.65627 6.21222 1.72123 6.19071L3.46423 5.61021C3.84744 5.48253 4.19565 5.26736 4.48127 4.98175C4.76688 4.69613 4.98205 4.34792 5.10973 3.96471L5.69023 2.22171ZM16.2937 0.648207C16.3085 0.605497 16.3363 0.568461 16.3731 0.542249C16.4099 0.516038 16.454 0.501953 16.4992 0.501953C16.5444 0.501953 16.5885 0.516038 16.6253 0.542249C16.6622 0.568461 16.6899 0.605497 16.7047 0.648207L17.0917 1.80921C17.2642 2.32821 17.6707 2.73471 18.1897 2.90721L19.3507 3.29421C19.3934 3.30901 19.4305 3.33676 19.4567 3.37359C19.4829 3.41042 19.497 3.4545 19.497 3.49971C19.497 3.54491 19.4829 3.58899 19.4567 3.62582C19.4305 3.66265 19.3934 3.6904 19.3507 3.70521L18.1897 4.09221C17.934 4.17729 17.7015 4.32083 17.511 4.51143C17.3203 4.70203 17.1768 4.93444 17.0917 5.19021L16.7047 6.35121C16.6899 6.39392 16.6622 6.43095 16.6253 6.45717C16.5885 6.48338 16.5444 6.49746 16.4992 6.49746C16.454 6.49746 16.4099 6.48338 16.3731 6.45717C16.3363 6.43095 16.3085 6.39392 16.2937 6.35121L15.9067 5.19021C15.8216 4.93444 15.6781 4.70203 15.4875 4.51143C15.2969 4.32083 15.0645 4.17729 14.8087 4.09221L13.6492 3.70521C13.6065 3.6904 13.5695 3.66265 13.5433 3.62582C13.5171 3.58899 13.503 3.54491 13.503 3.49971C13.503 3.4545 13.5171 3.41042 13.5433 3.37359C13.5695 3.33676 13.6065 3.30901 13.6492 3.29421L14.8102 2.90721C15.3292 2.73471 15.7357 2.32821 15.9082 1.80921L16.2937 0.649707V0.648207Z"
          fill="#2FD345"
        />
      </g>
      <defs>
        <clipPath id="clip0_1903_939">
          <rect
            width="24"
            height="24"
            fill="white"
            transform="translate(0 0.5)"
          />
        </clipPath>
      </defs>
    </svg>
  );
};

const LoadingIcon = () => {
  return (
    <svg
      width="101"
      height="101"
      viewBox="0 0 101 101"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="animate-spin mb-10"
    >
      <circle
        opacity="0.25"
        cx="50.5"
        cy="50.502"
        r="42.5926"
        stroke="#262626"
        strokeWidth="14.8148"
      />
      <path
        d="M93.0934 50.5018C93.0934 74.025 74.024 93.0944 50.5008 93.0944C26.9776 93.0944 7.9082 74.025 7.9082 50.5018C7.9082 26.9785 26.9776 7.90918 50.5008 7.90918"
        stroke="url(#paint0_linear_2573_3488)"
        strokeWidth="14.8148"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient
          id="paint0_linear_2573_3488"
          x1="50.5008"
          y1="7.90918"
          x2="93.0934"
          y2="31.9832"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#2FD345" />
          <stop offset="0.518595" stop-color="#666666" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
};

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
        <LoadingIcon />
        <div className="text-[#2fd345] text-2xl font-medium font-satoshi leading-loose mb-3.5">
          Launching Token...
        </div>
        <div className="text-center text-[#8c8c8c] font-satoshi leading-normal">
          Forem ipsum dolor sit amet, consectetur adipiscing elit. Nunc
          vulputate libero et
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
              Agent Created
            </div>
            <SparkleIcon />
          </div>
          <div className="text-[#8c8c8c] text-2xl font-normal font-satoshi leading-7 mb-6">
            Token launch takes 1-3 minutes. Agent takes ~10 minutes to tweet
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
