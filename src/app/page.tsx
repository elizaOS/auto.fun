"use client";

import { useForm } from "react-hook-form";
import { createCoin } from "@/utils/wallet";
import { FormInput } from "@/components/common/input/FormInput";
import { WalletButton } from "../components/common/button/WalletButton";
import { RoundedButton } from "@/components/common/button/RoundedButton";
import { Nav } from "@/components/nav";
import FormImageInput from "@/components/common/input/FormImageInput";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";

export type TokenMetadata = {
  name: string;
  symbol: string;
  initial_sol: number;
  image_base64: string;
  description: string;
  agent_behavior: string;
};

type TokenMetadataForm = {
  name: string;
  symbol: string;
  initial_sol: string;
  media_base64: File;
  description: string;
  agent_behavior: string;
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
  const router = useRouter();
  const { register, handleSubmit, watch, formState, control } =
    useForm<TokenMetadataForm>();
  const { publicKey } = useWallet();
  const symbol = watch("symbol");
  const description = watch("description");

  const convertFormData = async (
    tokenMetadata: TokenMetadataForm,
  ): Promise<TokenMetadata> => {
    const media_base64 = tokenMetadata.media_base64;
    console.log(media_base64);

    return {
      ...tokenMetadata,
      initial_sol: tokenMetadata.initial_sol
        ? parseFloat(tokenMetadata.initial_sol)
        : 0,
      image_base64: await toBase64(media_base64),
    };
  };

  const submitForm = async (tokenMetadataForm: TokenMetadataForm) => {
    try {
      const tokenMetadata = await convertFormData(tokenMetadataForm);
      await createCoin(tokenMetadata);
      router.push("/success");
    } catch {
      toast.error("Oops! Something went wrong. Please try again.");
    }
  };

  return (
    <div className="flex flex-col justify-center h-full">
      <form
        onSubmit={handleSubmit(submitForm)}
        className="flex flex-col w-full m-auto gap-7 justify-center"
      >
        <div className="h-full flex flex-col items-center justify-center max-w-4xl mx-auto w-full">
          <div className="max-h-[80%] w-5/6 p-6 rounded-[20px] overflow-scroll mb-6 border-[#03ff24] border gap-[30px] flex flex-col">
            <FormInput
              type="text"
              {...register("name", { required: true })}
              label="Name your AI Agent"
            />

            <FormInput
              type="text"
              {...register("symbol", { required: true })}
              label="Ticker"
              leftIndicator="$"
              maxLength={8}
              rightIndicator={`${symbol?.length ?? 0}/8`}
            />

            <FormInput
              type="text"
              {...register("description")}
              label="Description"
              rightIndicator={`${description?.length ?? 0}/200`}
            />

            <FormInput
              type="text"
              {...register("agent_behavior")}
              label="Agent Behavior"
            />

            <FormInput
              type="number"
              step="any"
              {...register("initial_sol", { required: false })}
              label="Buy Your Coin (optional)"
              rightIndicator="SOL"
            />

            <FormImageInput
              label="Agent Image / Video"
              name="image_base64"
              // @ts-ignore
              control={control}
              rules={{
                required: "Please upload an image",
                validate: {
                  lessThan4MB: (file) =>
                    (file && file.size < 4000000) || "Max file size is 4MB",
                  acceptedFormats: (file) =>
                    (file &&
                      [
                        "image/jpeg",
                        "image/png",
                        "image/gif",
                        "video/mp4",
                      ].includes(file.type)) ||
                    "Only JPEG, PNG, GIF, and MP4 files are accepted",
                },
              }}
            />
          </div>

          {publicKey ? (
            <div>
              <RoundedButton
                className="px-6 py-3"
                disabled={!formState.isValid}
                type="submit"
              >
                Launch token
              </RoundedButton>
            </div>
          ) : (
            <WalletButton />
          )}
        </div>
      </form>
    </div>
  );
}
