"use client";

import { useForm } from "react-hook-form";
import { createCoin } from "@/utils/wallet";
import { FormInput } from "@/components/common/input/FormInput";
import { WalletButton } from "../components/common/button/WalletButton";
import { RoundedButton } from "@/components/common/button/RoundedButton";
import FormImageInput from "@/components/common/input/FormImageInput";
import { toast } from "react-toastify";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { FormTextArea } from "@/components/common/input/FormTextArea";
import { useState } from "react";
import { LuEye, LuEyeOff } from "react-icons/lu";
import { useEffect } from "react";
import { validateTwitterCredentials } from "@/utils/twitter";

export type TokenMetadata = {
  name: string;
  symbol: string;
  initial_sol: number;
  image_base64: string;
  description: string;
  agent_behavior: string;
};

export type TwitterCredentials = {
  username: string;
  email: string;
  password: string;
};

type TokenMetadataForm = {
  name: string;
  symbol: string;
  initial_sol: string;
  media_base64: File;
  description: string;
  agent_behavior: string;
  twitter_email: string;
  twitter_username: string;
  twitter_password: string;
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
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const { register, handleSubmit, watch, formState, control, trigger } =
    useForm<TokenMetadataForm>();
  const { publicKey } = useWallet();
  const symbol = watch("symbol");
  const description = watch("description");
  const agentBehavior = watch("agent_behavior");
  const file = watch("media_base64");

  useEffect(() => {
    // NOTE: for some reason when file changes initially, the validation
    // is not triggered so trigger here
    trigger("media_base64");
  }, [file, trigger]);

  const convertFormData = async (
    tokenMetadata: TokenMetadataForm,
  ): Promise<{
    tokenMeta: TokenMetadata;
    twitterCreds: TwitterCredentials;
  }> => {
    const media_base64 = tokenMetadata.media_base64;
    console.log(media_base64);

    return {
      tokenMeta: {
        ...tokenMetadata,
        initial_sol: tokenMetadata.initial_sol
          ? parseFloat(tokenMetadata.initial_sol)
          : 0,
        image_base64: await toBase64(media_base64),
      },
      twitterCreds: {
        username: tokenMetadata.twitter_username,
        email: tokenMetadata.twitter_email,
        password: tokenMetadata.twitter_password,
      },
    };
  };

  const submitForm = async (tokenMetadataForm: TokenMetadataForm) => {
    try {
      const { tokenMeta, twitterCreds } =
        await convertFormData(tokenMetadataForm);

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

      await createCoin({
        token_metadata: tokenMeta,
        twitter_credentials: twitterCreds,
      });
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
          <div className="max-h-[calc(100vh-300px)] w-5/6 p-6 rounded-[20px] overflow-scroll mb-6 border-[#03ff24] border gap-[30px] flex flex-col">
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
              rightIndicatorOpacity={symbol?.length >= 8 ? "full" : "low"}
            />

            <FormTextArea
              {...register("description")}
              label="Description"
              rightIndicator={`${description?.length ?? 0}/200`}
              minRows={2}
              maxLength={200}
              rightIndicatorOpacity={
                description?.length >= 200 ? "full" : "low"
              }
            />

            <FormTextArea
              {...register("agent_behavior")}
              label="Agent Behavior"
              rightIndicator={`${agentBehavior?.length ?? 0}/500`}
              minRows={2}
              maxLength={500}
              rightIndicatorOpacity={
                agentBehavior?.length >= 500 ? "full" : "low"
              }
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
              name="media_base64"
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

            <div className="flex gap-3 w-full items-center justify-center">
              <div className="bg-[#002605] h-[2px] flex-1" />
              <p>X/Twitter Integration</p>
              <div className="bg-[#002605] h-[2px] flex-1" />
            </div>

            <FormInput
              {...register("twitter_email", { required: true })}
              type="text"
              label="Email"
            />
            <FormInput
              {...register("twitter_username", { required: true })}
              type="text"
              label="Username"
            />
            <FormInput
              {...register("twitter_password", { required: true })}
              type={showPassword ? "text" : "password"}
              label="Password"
              rightIndicatorOpacity="full"
              rightIndicator={
                <button
                  type="button"
                  onClick={() => {
                    setShowPassword((show) => !show);
                  }}
                >
                  {showPassword ? (
                    <LuEyeOff color="#03FF24" />
                  ) : (
                    <LuEye color="#03FF24" />
                  )}
                </button>
              }
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
