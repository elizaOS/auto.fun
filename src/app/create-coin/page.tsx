"use client";

import { useForm } from "react-hook-form";
import { createCoin } from "@/utils/wallet";
import { FormInput } from "@/components/common/input/FormInput";
import { useWallet, WalletButton } from "./WalletButton";
import { RoundedButton } from "@/components/common/button/RoundedButton";

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
  image_base64: FileList;
  description: string;
  agent_behavior: string;
};

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result !== "string") return reject();
      resolve(reader.result.split(",")[1]);
    }; // Remove the Data URL prefix
    reader.onerror = (error) => reject(error);
  });
}

export default function TransactionSignPage() {
  const { register, handleSubmit, watch, formState } =
    useForm<TokenMetadataForm>();
  const { publicKey } = useWallet();
  const symbol = watch("symbol");
  const description = watch("description");

  const convertFormData = async (
    tokenMetadata: TokenMetadataForm,
  ): Promise<TokenMetadata> => {
    const image_base64 = tokenMetadata.image_base64[0];
    console.log(image_base64);

    return {
      ...tokenMetadata,
      initial_sol: parseFloat(tokenMetadata.initial_sol),
      image_base64: `data:image/jpeg;base64,${await toBase64(image_base64)}`,
    };
  };

  const submitForm = async (tokenMetadataForm: TokenMetadataForm) => {
    console.log(tokenMetadataForm);
    await createCoin(await convertFormData(tokenMetadataForm));
  };

  return (
    <div className="p-4 h-full flex flex-col items-center justify-center">
      <WalletButton />
      <div className="max-h-[80%] w-5/6 bg-white p-6 rounded-[20px] overflow-scroll mb-6">
        <form
          onSubmit={handleSubmit(submitForm)}
          className="flex flex-col w-full m-auto gap-7 justify-center"
        >
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

          <input
            type="file"
            placeholder="Image URL"
            {...register("image_base64", { required: true })}
            className="border border-white rounded px-4 py-2"
          />
        </form>
      </div>

      {publicKey ? (
        <div>
          <RoundedButton className="px-6 py-3" disabled={!formState.isValid}>
            Launch token
          </RoundedButton>
        </div>
      ) : (
        <WalletButton />
      )}
    </div>
  );
}
